import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Captures setTimeout/clearTimeout so tests can fire timers synchronously. */
export function collectableTimers() {
  const pending = new Map();
  let nextId = 1;
  return {
    timers: {
      set(fn) {
        const id = nextId++;
        pending.set(id, fn);
        return id;
      },
      clear(id) {
        pending.delete(id);
      },
    },
    pending,
    count() {
      return pending.size;
    },
    async fireAll() {
      const tasks = [...pending.entries()];
      pending.clear();
      for (const [, fn] of tasks) await fn();
    },
  };
}

/** Minimal Baileys-shaped socket for tests. */
export function makeFakeSocket({ user = { id: '2348000000001@s.whatsapp.net' } } = {}) {
  const handlers = {};
  const sock = {
    user,
    ended: false,
    ev: {
      on(name, fn) {
        handlers[name] = fn;
      },
      emit(name, data) {
        handlers[name]?.(data);
      },
    },
    async requestPairingCode(phone) {
      sock.requestedPhone = phone;
      return 'ABCDEF12';
    },
    async sendMessage(jid, content) {
      sock.sent = sock.sent ?? [];
      sock.sent.push({ jid, content });
      return { key: { id: `fake-${sock.sent.length}` } };
    },
    end() {
      sock.ended = true;
    },
  };
  return { sock, handlers, fireConnection: (update) => sock.ev.emit('connection.update', update) };
}

/** Temp dir that is cleaned up after the test finishes. */
export function tempDir() {
  return mkdtempSync(join(tmpdir(), 'nova-sess-test-'));
}

/** Fake Wi-Fi-free manual clock for pairing TTL tests. */
export function manualClock(now = Date.now()) {
  return {
    now: () => now,
    advance(ms) {
      now += ms;
    },
  };
}