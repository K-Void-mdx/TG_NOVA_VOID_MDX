import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { WaSessionManager, PairingError } from '../src/sessions/wa-session-manager.js';
import { collectableTimers, makeFakeSocket, tempDir } from './helpers.js';

function managerHarness() {
  const dir = tempDir();
  const apps = [];
  const notify = [];
  const wheel = collectableTimers();
  const socketsByDir = new Map();
  const manager = new WaSessionManager({
    sessionsDir: dir,
    ownerUserIds: ['8845366023'],
    socketFactory: async ({ authDir }) => {
      const fake = makeFakeSocket();
      socketsByDir.set(authDir, fake);
      return { sock: fake.sock, registered: false };
    },
    appFactory: ({ session, sock }) => {
      const app = { marker: `app-${session.phone}` };
      apps.push(app);
      return app;
    },
    ownerNotify: (text) => notify.push(text),
    timers: wheel.timers,
    log: () => {},
  });
  return { manager, dir, apps, notify, wheel, socketsByDir };
}

/** Drives a session's socket through qr → paired code → open, then settles. */
async function bringOnline(harness, phone) {
  await Promise.resolve(); // let the session's initial connect settle
  const fake = harness.socketsByDir.get(join(harness.dir, phone));
  fake.sock.ev.emit('connection.update', { qr: 'data:image/png;base64,x' });
  await Promise.resolve();
  await Promise.resolve();
  fake.sock.ev.emit('connection.update', { connection: 'open' });
  await Promise.resolve();
}

const OTHER = '9990000001';
const STRANGER = '5550000001';

test('pair validates synchronously and rejects invalid numbers', () => {
  const { manager } = managerHarness();
  assert.throws(() => manager.pair('bogus', { userId: '8845366023' }), PairingError);
  assert.throws(() => manager.pair('123', { userId: '8845366023' }), PairingError);
});

test('duplicate pending pairing attempt is rejected', () => {
  const { manager } = managerHarness();
  manager.pair('2348012345678', { userId: OTHER });
  assert.throws(() => manager.pair('2348012345678', { userId: '8845366023' }), PairingError);
});

test('pairing rejects a number already linked to another user', async () => {
  const h = managerHarness();
  h.manager.pair('2348012345678', { userId: OTHER });
  await bringOnline(h, '2348012345678');
  // Once a session lives for the number, a second /pair must be rejected
  // (either because the attempt is still tracked or because it is paired).
  assert.throws(() => h.manager.pair('2348012345678', { userId: OTHER }), PairingError);
});

test('ownership isolation: strangers cannot cancel or unpair a number they do not own', async () => {
  const { manager } = managerHarness();
  manager.pair('2348012345678', { userId: OTHER });
  assert.throws(() => manager.cancel('2348012345678', { userId: STRANGER }), PairingError);
  await assert.rejects(() => manager.unpair('2348012345678', { userId: STRANGER }), PairingError);
});

test('the global owner can always administer any session', async () => {
  const { manager } = managerHarness();
  manager.pair('2348012345678', { userId: OTHER });
  const st = manager.pairStatus('2348012345678', { userId: '8845366023' });
  assert.ok(st);
});

test('open marks the index, builds the app and scopes listings per user', async () => {
  const h = managerHarness();
  h.manager.pair('2348012345678', { userId: OTHER, userName: 'Ali' });
  await bringOnline(h, '2348012345678');
  const attempt = h.manager.attempts.get('2348012345678');
  assert.equal(attempt.state, 'paired');
  assert.deepEqual(h.manager.list({ userId: '8845366023' }).map((r) => r.phone), ['2348012345678']);
  assert.equal(h.manager.list({ userId: OTHER }).length, 1);
  assert.equal(h.manager.list({ userId: STRANGER }).length, 0, 'unlinked users see nothing');

  const entry = JSON.parse(readFileSync(join(h.dir, 'index.json'), 'utf8'));
  assert.equal(entry.sessions['2348012345678'].ownerUserId, String(OTHER));
  assert.equal(entry.sessions['2348012345678'].status, 'online');
});

test('unpair wipes the session dir and index entry', async () => {
  const h = managerHarness();
  h.manager.pair('2348012345678', { userId: OTHER });
  await bringOnline(h, '2348012345678');
  const result = await h.manager.unpair('2348012345678', { userId: OTHER });
  assert.equal(result.ok, true);
  assert.equal(existsSync(join(h.dir, '2348012345678')), false);
  assert.equal(h.manager.list({ userId: '8845366023' }).length, 0);
});

test('restoreAll brings stored sessions back and registers their apps', async () => {
  const h = managerHarness();
  mkdirSync(join(h.dir, '2348999999999'), { recursive: true });
  writeFileSync(join(h.dir, '2348999999999', 'creds.json'), '{}');
  writeFileSync(
    join(h.dir, 'index.json'),
    JSON.stringify({ version: 1, sessions: { '2348999999999': { ownerUserId: OTHER, status: 'offline', pairedAt: '2026-01-01T00:00:00.000Z' } } })
  );
  await h.manager.restoreAll();
  await bringOnline(h, '2348999999999');
  assert.ok(h.manager.sessions.has('2348999999999'));
  assert.equal(h.manager.pairStatus('2348999999999', { userId: OTHER }).kind, 'open');
  assert.ok(h.apps.some((a) => a.marker === 'app-2348999999999'));
});

test('stopAll clears every live session', async () => {
  const h = managerHarness();
  for (const phone of ['2348012345678', '2348012345679']) {
    h.manager.pair(phone, { userId: OTHER });
    await bringOnline(h, phone);
  }
  assert.equal(h.manager.sessions.size, 2);
  await h.manager.stopAll();
  assert.equal(h.manager.sessions.size, 0);
});

test('pending pairing directories are cleaned up on cancel so the number can be re-paired', async () => {
  const h = managerHarness();
  h.manager.pair('2348012345678', { userId: OTHER });
  await Promise.resolve();
  h.manager.cancel('2348012345678', { userId: OTHER });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(existsSync(join(h.dir, '2348012345678')), false);
  assert.equal(h.manager.list({ userId: OTHER }).length, 0);
});