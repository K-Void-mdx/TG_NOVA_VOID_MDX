import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  classifyDisconnect,
  canTransition,
  nextBackoffMs,
} from '../core/connection-state.js';
import { createReconnectScheduler } from '../core/reconnect-scheduler.js';
import { shouldRequestPairingCode } from '../core/pairing-gate.js';

/** A pairing code is valid for exactly this long after it is issued. */
export const PAIRING_CODE_TTL_MS = 2 * 60 * 1000;
const CODE_CHARS = /[^A-Z0-9]/gi;

/** "ABC12345" / "abcdef" → "ABCD-1234" style code. */
export function formatPairingCode(code = '') {
  const clean = String(code).replace(CODE_CHARS, '').toUpperCase();
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

// Bounded retries so a broken number can never spin loops.
const MAX_CONNECT_ATTEMPTS = 3;       // fresh (unregistered) pairing sockets
const MAX_RECONNECT_ATTEMPTS = 8;     // retries after a live session drops
const RESTORE_FAIL_LIMIT = 3;         // creds accepted once, then give up
const FIXED_RESTART_DELAY_MS = 1500;  // WhatsApp 515 restart requests

/**
 * One WhatsApp connection for ONE number.
 *
 * This class is transport-agnostic by design: the `socketFactory` (injected)
 * supplies the socket adapter whose surface mirrors the Baileys socket used by
 * wa-sdk.js — Events (`connection.update`, `messages.upsert`), `user`,
 * `requestPairingCode(phone)`, `sendMessage`, `end()`. Tests inject a fake
 * factory; production passes createWaSocket.
 *
 * Lifecycle events (single subscriber): 'code', 'open', 'closed', 'expired',
 * 'cancelled', 'message', 'pairing-error', 'error'.
 */
export class WaSession {
  #phone;
  #authDir;
  #socketFactory;
  #timers;
  #emit;
  #state = 'starting';
  #sock = null;
  #registered = false;
  #everOpen = false;
  #pairing = null;
  #generation = 0;
  #connectAttempt = 0;
  #expiryHandle;
  #reconnector;

  constructor({ phone, authDir, socketFactory, timers = { set: setTimeout, clear: clearTimeout }, subscribe }) {
    if (!phone) throw new Error('WaSession requires a phone');
    if (!socketFactory) throw new Error('WaSession requires socketFactory');
    if (typeof subscribe !== 'function') throw new Error('WaSession requires subscribe');
    this.#phone = String(phone);
    this.#authDir = authDir;
    this.#socketFactory = socketFactory;
    this.#timers = timers;
    this.#emit = (event, payload) => {
      try { subscribe(event, payload); } catch { /* a broken subscriber must not kill the socket */ }
    };
    this.#reconnector = createReconnectScheduler({
      timers,
      onFire: () => this.#connect().catch(() => {}),
    });
  }

  get phone() { return this.#phone; }
  get state() { return this.#state; }
  get sock() { return this.#sock; }
  get registered() { return this.#registered; }
  get pairing() { return this.#pairing ? { ...this.#pairing } : null; }
  get isOpen() { return this.#state === 'online'; }

  /** Seconds remaining on an issued pairing code (0 if none/past). */
  codeSecondsLeft() {
    if (!this.#pairing) return 0;
    const ms = this.#pairing.requestedAt + PAIRING_CODE_TTL_MS - Date.now();
    return ms <= 0 ? 0 : Math.floor(ms / 1000);
  }

  async start() {
    if (this.#state === 'stopped') return;
    const internal = await this.#connect();
    return internal;
  }

  /** Aborts a pending pairing attempt and closes this socket for good. */
  cancel() {
    if (this.#state === 'stopped') return false;
    this.#reconnector.cancel();
    this.#clearExpiry();
    this.#pairing = null;
    this.#setState('stopped');
    this.#emit('cancelled', { phone: this.#phone });
    this.#endSocket();
    return true;
  }

  /** Stops a healthy session (used during shutdown, not an error). */
  stop() {
    if (this.#state === 'stopped') return;
    this.#reconnector.cancel();
    this.#clearExpiry();
    this.#pairing = null;
    this.#setState('stopped');
    this.#endSocket();
  }

  #setState(state) {
    if (state === this.#state) return;
    if (!canTransition(this.#state, state)) {
      // Log via subscribe-agnostic channel: the manager hears 'error' events.
      this.#emit('error', { error: new Error(`illegal state transition ${this.#state} → ${state}`), state: this.#state });
      return;
    }
    this.#state = state;
  }

  async #connect() {
    if (this.#state === 'stopped') return;
    this.#connectAttempt += 1;
    this.#setState('connecting');
    const gen = ++this.#generation;
    try {
      const { sock, registered = false } = await this.#socketFactory({ authDir: this.#authDir });
      if (this.#state === 'stopped') {
        try { sock.end?.(); } catch { /* already gone */ }
        return;
      }
      this.#sock = sock;
      this.#registered = registered;
      sock.ev?.on?.('connection.update', (update) => this.#onConnectionUpdate(update, gen));
      sock.ev?.on?.('messages.upsert', (envelope) => this.#onMessages(envelope, gen));
    } catch (error) {
      this.#emit('error', { error, state: this.#state });
      if (this.#everOpen || this.#registered) this.#scheduleRetry('socket-factory-error');
      else this.#failAttempt('socket-factory-error', error);
    }
  }

  #onConnectionUpdate(update, gen) {
    if (gen !== this.#generation) return;

    // A `qr` update proves the WebSocket upgrade AND noise handshake
    // succeeded. That is the only safe moment to request a pairing code —
    // asking earlier causes HTTP 405 upgrade failures.
    if (
      update?.qr &&
      !this.#registered &&
      !this.#pairing &&
      !this.#everOpen &&
      shouldRequestPairingCode(update, { registered: false, hasPhone: true })
    ) {
      this.#requestPairing(gen);
    }

    if (update?.connection === 'open') {
      this.#everOpen = true;
      this.#connectAttempt = 0;
      this.#clearExpiry();
      this.#pairing = null;
      this.#setState('online');
      this.#emit('open', { phone: this.#phone, user: this.#sock?.user ?? null });
    }

    if (update?.connection === 'close') {
      this.#reconnector.cancel();
      this.#onClose(update.lastDisconnect, gen);
    }
  }

  async #requestPairing(gen) {
    this.#setState('awaiting_pair');
    const sockForPair = this.#sock;
    try {
      const rawCode = await sockForPair.requestPairingCode(this.#phone);
      if (gen !== this.#generation || this.#sock !== sockForPair || this.#state === 'stopped') {
        return; // the socket died or was cancelled mid-request — ignore stale result
      }
      this.#pairing = { code: formatPairingCode(rawCode), requestedAt: Date.now() };
      this.#setState('pairing');
      this.#emit('code', { phone: this.#phone, code: this.#pairing.code, ttlMs: PAIRING_CODE_TTL_MS });
      this.#armExpiry(gen);
    } catch (error) {
      console.error(`[ SESSION ] pairing code request failed for ${this.#phone}: ${error?.message ?? error}`);
      this.#emit('pairing-error', { phone: this.#phone, error });
    }
  }

  #armExpiry(gen) {
    this.#clearExpiry();
    this.#expiryHandle = this.#timers.set(() => {
      this.#expiryHandle = undefined;
      if (gen !== this.#generation || this.#state === 'stopped' || !this.#pairing) return;
      if (this.#state === 'online') return;
      // Code not used in time: terminate the attempt and report honestly.
      const wasPairing = this.#pairing;
      this.#pairing = null;
      this.#setState('stopped');
      this.#emit('expired', { phone: this.#phone, code: wasPairing?.code });
      this.#endSocket();
    }, PAIRING_CODE_TTL_MS);
  }

  #clearExpiry() {
    if (this.#expiryHandle === undefined) return;
    this.#timers.clear(this.#expiryHandle);
    this.#expiryHandle = undefined;
  }

  #onClose(lastDisconnect, gen) {
    if (this.#state === 'stopped') return; // we ended this session on purpose
    this.#clearExpiry();
    this.#sock = undefined;

    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const decision = classifyDisconnect(statusCode);

    if (decision.action === 'stop') {
      const reason = decision.reason === 'logged_out' ? 'logged_out' : 'connection_replaced';
      this.#setState(reason === 'logged_out' ? 'logged_out' : 'stopped');
      this.#emit('closed', { phone: this.#phone, reason, permanent: true });
      return;
    }

    if (!this.#everOpen && !this.#registered) {
      // Transmission dropped while we were still trying to pair. A pairing
      // code is single-use per connection, so auto-reconnecting silently is
      // wrong: the user is told and can simply re-run /pair.
      this.#failAttempt('connection-dropped-before-pairing');
      return;
    }

    // Registered session that never opened: server is refusing the stored
    // credentials. Retry a bounded number of times, then report it as dead so
    // the operator can /unpair and re-pair.
    if (!this.#everOpen && this.#registered) {
      if (this.#connectAttempt < RESTORE_FAIL_LIMIT && decision.action === 'retry') {
        this.#scheduleRetry('restore-refused');
      } else if (decision.action === 'restart') {
        this.#scheduleFixedRestart();
      } else {
        this.#emit('closed', { phone: this.#phone, reason: 'restore-failed', permanent: true });
      }
      return;
    }

    // A live session dropped. Transport errors retry with backoff; a permanent
    // refuse (403 repeatedly) also backs off. After the cap, report honestly.
    if (decision.action === 'restart') {
      this.#scheduleFixedRestart();
    } else if (this.#connectAttempt <= MAX_RECONNECT_ATTEMPTS) {
      this.#scheduleRetry(`disconnected:${decision.reason}`);
    } else {
      this.#emit('closed', { phone: this.#phone, reason: 'disconnected', permanent: true });
    }
  }

  #scheduleRetry(reason) {
    const backoff = nextBackoffMs(this.#connectAttempt);
    this.#setState('reconnecting');
    this.#emit('status', { phone: this.#phone, state: 'reconnecting', reason });
    this.#reconnector.schedule(backoff);
  }

  #scheduleFixedRestart() {
    this.#setState('reconnecting');
    this.#emit('status', { phone: this.#phone, state: 'reconnecting', reason: 'restart_required' });
    this.#reconnector.schedule(FIXED_RESTART_DELAY_MS);
  }

  #failAttempt(reason) {
    this.#reconnector.cancel();
    this.#pairing = null;
    this.#setState('stopped');
    this.#emit('closed', { phone: this.#phone, reason, permanent: true });
    this.#endSocket();
  }

  #onMessages(envelope, gen) {
    if (gen !== this.#generation) return;
    const { messages = [], type } = envelope ?? {};
    if (type !== 'notify' || !Array.isArray(messages)) return;
    for (const message of messages) {
      this.#emit('message', { phone: this.#phone, raw: message });
    }
  }

  #endSocket() {
    try { this.#sock?.end?.(); } catch { /* already gone */ }
    this.#sock = undefined;
  }
}

/** True when a number's session dir already holds branded auth files. */
export function hasStoredSession(sessionsDir, phone) {
  const dir = join(sessionsDir, phone);
  return existsSync(join(dir, 'creds.json'));
}