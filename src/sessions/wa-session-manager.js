import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadJson, saveJson } from '../core/storage/json-store.js';
import { normalizePhone } from '../core/phone.js';
import { WaSession, hasStoredSession } from './wa-session.js';

export class PairingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PairingError';
    this.code = code;
  }
}

/**
 * One in-flight pairing attempt, addressable by the Telegram layer for
 * live card updates. `ui` is a plain mutable object of callbacks
 * ({ onCode, onStatus, onOpen, onExpired, onCancelled, onClosed, onPairError })
 * that the control plane fills in to drive the pairing card.
 */
export class PairAttempt {
  constructor({ phone, userId, userName, session }) {
    this.phone = phone;
    this.userId = String(userId);
    this.userName = String(userName ?? '');
    this.session = session;
    this.state = 'pending'; // pending → awaiting → paired | expired | cancelled | failed
    this.code = null;
    this.ui = {};
    this.startedAt = Date.now();
  }
}

/**
 * Multi-session WhatsApp manager — the control plane's session store.
 *
 * One independent Baileys session per paired number, persisted under
 * `<sessionsDir>/<phone>/` (auth files) plus an `index.json` mapping each
 * number to the Telegram user who owns it.
 *
 * Ownership model:
 *   - the configured TELEGRAM_OWNER_ID may administer every session;
 *   - any other Telegram user may pair, inspect and unpair ONLY the numbers
 *     they paired themselves.
 *
 * `appFactory({ session, sock })` builds the WhatsApp NovaApplication (the
 * command dispatcher) for a freshly opened socket; tests inject a stub.
 */
export class WaSessionManager {
  #sessionsDir;
  #ownerUserIds;
  #socketFactory;
  #appFactory;
  #timers;
  #ownerNotify;
  #log;
  #index;

  constructor({
    sessionsDir,
    ownerUserIds = [],
    socketFactory,
    appFactory = () => null,
    timers = { set: setTimeout, clear: clearTimeout },
    ownerNotify = () => {},
    log = console.error,
  }) {
    if (!sessionsDir) throw new Error('WaSessionManager requires sessionsDir');
    if (!socketFactory) throw new Error('WaSessionManager requires socketFactory');
    this.#sessionsDir = sessionsDir;
    this.#ownerUserIds = new Set(ownerUserIds.map((id) => String(id)));
    this.#socketFactory = socketFactory;
    this.#appFactory = appFactory;
    this.#timers = timers;
    this.#ownerNotify = ownerNotify;
    this.#log = log;
    this.sessions = new Map();   // phone → live WaSession
    this.attempts = new Map();   // phone → PairAttempt
    this.#index = loadJson(join(sessionsDir, 'index.json'), { version: 1, sessions: {} });
    if (!this.#index || typeof this.#index !== 'object' || !this.#index.sessions) {
      this.#index = { version: 1, sessions: {} };
    }
  }

  // ── Authority ────────────────────────────────────────────────────────────

  isGlobalOwner(userId) {
    return this.#ownerUserIds.has(String(userId));
  }

  #canAdminister(phone, userId) {
    if (this.isGlobalOwner(userId)) return true;
    const attempt = this.attempts.get(phone);
    const entry = this.#index.sessions[phone];
    const ownerId = attempt?.userId || entry?.ownerUserId;
    if (!ownerId) return true; // unclaimed — whoever pairs first owns it
    return String(ownerId) === String(userId);
  }

  // ── Pairing ──────────────────────────────────────────────────────────────

  /**
   * Starts a pairing attempt for a Telegram user. Validates synchronously and
   * throws PairingError for invalid numbers / duplicate / owned numbers.
   * Returns the PairAttempt; the socket is brought up in the background.
   */
  pair(rawPhone, { userId, userName } = {}) {
    const parsed = normalizePhone(rawPhone);
    if (!parsed.ok) throw new PairingError('INVALID', parsed.error);
    const phone = parsed.phone;

    if (this.attempts.has(phone)) {
      throw new PairingError('ALREADY_PENDING', 'A pairing attempt for this number is already active. Check its status or cancel it first.');
    }

    const entry = this.#index.sessions[phone];
    if (entry) {
      if (!this.#canAdminister(phone, userId)) {
        throw new PairingError('OWNED', 'This number is linked to another Telegram user. You may only manage numbers you paired.');
      }
      throw new PairingError('ALREADY_PAIRED', 'This number is already linked as a WhatsApp session. Use /unpair first, then /pair again.');
    }

    // A stored session with no index entry (manual cleanup) is still taken:
    // removing creds requires an explicit unpair, never a silent re-pair.
    if (hasStoredSession(this.#sessionsDir, phone)) {
      throw new PairingError('ALREADY_PAIRED', 'A WhatsApp session is already stored for this number. Use /unpair first.');
    }

    const authDir = join(this.#sessionsDir, phone);
    const session = new WaSession({
      phone,
      authDir,
      socketFactory: this.#socketFactory,
      timers: this.#timers,
      subscribe: (event, payload) => this.#onSessionEvent(phone, event, payload),
    });

    const attempt = new PairAttempt({ phone, userId, userName, session });
    this.attempts.set(phone, attempt);
    session.start().catch((error) => this.#log(`[ SESSION ] ${phone} start failed: ${error?.message ?? error}`));
    return attempt;
  }

  pairStatus(phone, { userId } = {}) {
    if (!this.#canAdminister(phone, userId)) {
      throw new PairingError('OWNED', 'This number is linked to another Telegram user.');
    }
    const attempt = this.attempts.get(phone);
    if (attempt) {
      return {
        kind: 'pairing',
        phone,
        state: attempt.state,
        code: attempt.code,
        secondsLeft: attempt.session.codeSecondsLeft(),
      };
    }
    const live = this.sessions.get(phone);
    if (live?.isOpen) return { kind: 'open', phone, state: 'online' };
    const entry = this.#index.sessions[phone];
    if (entry) return { kind: 'stored', phone, state: entry.status ?? 'offline', pairedAt: entry.pairedAt };
    return null;
  }

  cancel(phone, { userId } = {}) {
    if (!this.#canAdminister(phone, userId)) {
      throw new PairingError('OWNED', 'This number is linked to another Telegram user.');
    }
    const attempt = this.attempts.get(phone);
    if (!attempt) return { ok: false, reason: 'no-pending-attempt' };
    // cancel() emits 'cancelled' synchronously; #onSessionEvent cleans up.
    const did = attempt.session.cancel();
    return { ok: did };
  }

  /** Stops a session, wipes its stored auth files and index entry. */
  async unpair(phone, { userId } = {}) {
    if (!this.#canAdminister(phone, userId)) {
      throw new PairingError('OWNED', 'This number is linked to another Telegram user.');
    }
    const attempt = this.attempts.get(phone);
    if (attempt) attempt.session.cancel();
    const live = this.sessions.get(phone);
    if (live) live.stop();
    this.attempts.delete(phone);
    this.sessions.delete(phone);
    delete this.#index.sessions[phone];
    this.#persistIndex();
    const dir = join(this.#sessionsDir, phone);
    return rm(dir, { recursive: true, force: true }).then(() => ({ ok: true }));
  }

  list({ userId } = {}) {
    const all = this.isGlobalOwner(userId);
    const rows = [];
    for (const [phone, entry] of Object.entries(this.#index.sessions)) {
      if (!all && String(entry.ownerUserId) !== String(userId)) continue;
      const attempt = this.attempts.get(phone);
      const live = this.sessions.get(phone);
      rows.push({
        phone,
        ownerUserId: entry.ownerUserId,
        ownerUserName: entry.ownerUserName,
        pairedAt: entry.pairedAt,
        status: attempt ? 'pairing' : live?.isOpen ? 'online' : (entry.status ?? 'offline'),
      });
    }
    // Pending attempts on numbers not yet in the index also show up.
    for (const attempt of this.attempts.values()) {
      if (this.#index.sessions[attempt.phone]) continue;
      if (!all && String(attempt.userId) !== String(userId)) continue;
      rows.push({
        phone: attempt.phone,
        ownerUserId: attempt.userId,
        ownerUserName: attempt.userName,
        pairedAt: null,
        status: 'pairing',
      });
    }
    return rows;
  }

  // ── Restore on boot ──────────────────────────────────────────────────────

  /** Brings every stored authenticated session back online in the background. */
  async restoreAll() {
    let entries = [];
    try {
      entries = await readdir(this.#sessionsDir);
    } catch {
      return; // no sessions directory yet — nothing to restore
    }
    for (const name of entries) {
      if (name.startsWith('.') || name === 'index.json') continue;
      const dir = join(this.#sessionsDir, name);
      if (!hasStoredSession(this.#sessionsDir, name)) continue;
      if (this.sessions.has(name) || this.attempts.has(name)) continue;
      const entry = this.#index.sessions[name];
      const session = new WaSession({
        phone: name,
        authDir: dir,
        socketFactory: this.#socketFactory,
        timers: this.#timers,
        subscribe: (event, payload) => this.#onSessionEvent(name, event, payload),
      });
      this.sessions.set(name, session);
      session.start().catch((error) => this.#log(`[ SESSION ] restore of ${name} failed: ${error?.message ?? error}`));
    }
  }

  /** Graceful shutdown of every live session. */
  async stopAll() {
    for (const [phone, session] of [...this.sessions]) {
      session.stop();
      this.#log(`[ SESSION ] ${phone} stopped`);
    }
    this.sessions.clear();
  }

  // ── Events from sessions ─────────────────────────────────────────────────

  #onSessionEvent(phone, event, payload) {
    try {
      if (event === 'message') return this.#onMessage(phone, payload);
      if (event === 'open') return this.#onOpen(phone, payload);
      if (event === 'closed') return this.#onClosed(phone, payload);
      if (event === 'expired') return this.#onExpired(phone, payload);
      if (event === 'cancelled') return this.#onCancelled(phone, payload);
      if (event === 'code') return this.#onCode(phone, payload);
      if (event === 'status') return this.#onStatus(phone, payload);
      if (event === 'error') {
        this.#log(`[ SESSION ] ${phone} error: ${payload?.error?.message ?? 'unknown'}`);
        return;
      }
      if (event === 'pairing-error') {
        const attempt = this.attempts.get(phone);
        attempt?.ui?.onPairError?.({ error: payload?.error });
        return;
      }
    } catch (error) {
      this.#log(`[ SESSION ] ${phone} event handling failed: ${error?.message ?? error}`);
    }
  }

  #onCode(phone, { code, ttlMs }) {
    const attempt = this.attempts.get(phone);
    if (!attempt) return;
    attempt.state = 'awaiting';
    attempt.code = code;
    attempt.ui?.onCode?.({ code, ttlMs });
  }

  #onStatus(phone, payload) {
    const attempt = this.attempts.get(phone);
    attempt?.ui?.onStatus?.(payload);
  }

  #onOpen(phone, payload) {
    const attempt = this.attempts.get(phone);
    const entry = this.#index.sessions[phone];
    const ownerId = attempt?.userId || entry?.ownerUserId || '';
    const userName = attempt?.userName || entry?.ownerUserName || '';
    this.#index.sessions[phone] = {
      ownerUserId: String(ownerId),
      ownerUserName: userName,
      pairedAt: entry?.pairedAt ?? new Date().toISOString(),
      status: 'online',
    };
    this.#persistIndex();

    const session = this.sessions.get(phone) ?? this.attempts.get(phone)?.session;
    if (session && !this.sessions.has(phone)) this.sessions.set(phone, session);
    if (session) session.app = this.#appFactory({ session, sock: session.sock });
    this.#log(`[ SESSION ] ${phone} is online`);

    const attempt2 = this.attempts.get(phone);
    if (attempt2) {
      attempt2.state = 'paired';
      attempt2.ui?.onOpen?.({ user: payload?.user });
    } else {
      this.#ownerNotify(`✅ WhatsApp session for ${phone} is online.`);
    }
  }

  #onClosed(phone, payload) {
    const attempt = this.attempts.get(phone);
    const session = this.sessions.get(phone);

    if (attempt) {
      // A pairing attempt ended without success.
      this.attempts.delete(phone);
      if (!payload?.reason?.startsWith('restore-')) {
        // Attempt never produced a live session — its dir only holds empty
        // creds; remove it so the number can be /pair'ed again cleanly.
        this.#removeSessionDir(phone);
      }
      attempt.state = 'failed';
      attempt.ui?.onClosed?.({ reason: payload?.reason });
      return;
    }

    if (session) {
      this.sessions.delete(phone);
      const entry = this.#index.sessions[phone];
      if (entry) {
        entry.status = 'offline';
        this.#persistIndex();
      }
      this.#ownerNotify(`⚠️ WhatsApp session for ${phone} went offline (${payload?.reason}). Use /unpair then /pair to re-link it.`);
      return;
    }

    this.#log(`[ SESSION ] ${phone} closed (${payload?.reason}) with no active bookkeeping.`);
  }

  #onExpired(phone, payload) {
    const attempt = this.attempts.get(phone);
    this.attempts.delete(phone);
    if (attempt) attempt.state = 'expired';
    this.#removeSessionDir(phone);
    attempt?.ui?.onExpired?.({ code: payload?.code });
  }

  #onCancelled(phone) {
    const attempt = this.attempts.get(phone);
    this.attempts.delete(phone);
    if (attempt) attempt.state = 'cancelled';
    this.#removeSessionDir(phone);
    attempt?.ui?.onCancelled?.();
  }

  #onMessage(phone, { raw }) {
    const session = this.sessions.get(phone);
    if (!session?.app) return; // still pairing — nothing to dispatch yet
    session.app.handle(raw).catch((error) => {
      this.#log(`[ SESSION ] ${phone} message handling failed: ${error?.message ?? error}`);
    });
  }

  #removeSessionDir(phone) {
    const dir = join(this.#sessionsDir, phone);
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  #persistIndex() {
    saveJson(join(this.#sessionsDir, 'index.json'), this.#index);
  }
}