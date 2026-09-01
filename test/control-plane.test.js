import assert from 'node:assert/strict';
import test from 'node:test';

import { startControlPlane } from '../src/telegram/control.js';

function fakeTelegramClient({ memberStatus = 'member' } = {}) {
  const calls = { sent: [], edited: [], answered: [], members: [] };
  let nextMessageId = 1;
  const client = {
    calls,
    pollCb: null,
    me: { id: 111, username: 'nova_void_mdx_bot' },
    async getMe() {
      return { id: 111, username: 'nova_void_mdx_bot' };
    },
    async sendMessage(chatId, payload) {
      calls.sent.push({ chatId, ...payload });
      return { key: { id: String(nextMessageId++) } };
    },
    getMe: async () => client.me,
    async sendPhoto(chatId, buffer, { caption = '', reply_markup } = {}) {
      calls.sent.push({ chatId, text: caption, reply_markup, photo: true });
      return { key: { id: String(nextMessageId++) } };
    },
    async sendContact() {
      return { key: { id: String(nextMessageId++) } };
    },
    async getChatMember(chatId, userId) {
      calls.members.push({ chatId, userId });
      return { status: memberStatus };
    },
    async answerCallbackQuery(cbqId, { text = '' } = {}) {
      calls.answered.push({ cbqId, text });
      return { ok: true };
    },
    async editMessageText(chatId, messageId, payload) {
      calls.edited.push({ chatId, messageId, ...payload });
      return { ok: true };
    },
    async editMessageReplyMarkup() {
      return { ok: true };
    },
    lastMessageId() {
      return null;
    },
    async poll({ onUpdate, onError }) {
      client.pollCb = onUpdate;
    },
    stop() {
      client.stopped = true;
    },
  };
  return { client };
}

function fakeSessions() {
  const attempts = new Map();
  return {
    attempts,
    isGlobalOwner(userId) {
      return String(userId) === '8845366023';
    },
    pair(phone, { userId, userName } = {}) {
      const attempt = {
        phone,
        userId,
        userName,
        state: 'pending',
        code: null,
        ui: {},
        session: { codeSecondsLeft: () => 42 },
      };
      attempts.set(phone, attempt);
      return attempt;
    },
    pairStatus(phone, { userId } = {}) {
      const attempt = attempts.get(phone);
      if (attempt) return { kind: 'pairing', phone, state: attempt.state, code: attempt.code, secondsLeft: attempt.session.codeSecondsLeft() };
      return null;
    },
    cancel(phone, { userId } = {}) {
      const attempt = attempts.get(phone);
      if (!attempt) return { ok: false, reason: 'no-pending-attempt' };
      attempts.delete(phone);
      return { ok: true };
    },
    unpair: async () => ({ ok: true }),
    list: () => [],
  };
}

const ENV = {
  telegramBotToken: 'TEST-TOKEN',
  telegramOwnerId: '8845366023',
  telegramChannel: '@nova_void_updates77',
  telegramGroup: '@nova_void_mdx_com77',
  telegramOwnerLink: '',
  botName: 'NOVA_VOID MDX',
};

async function bootPlane({ sessions = fakeSessions(), memberStatus = 'member', client } = {}) {
  const chosen = client ?? fakeTelegramClient({ memberStatus }).client;
  const clientFactory = ({ token } = {}) => chosen;
  const logger = { log() {}, error() {}, debug() {} };
  const plane = startControlPlane({ env: ENV, sessions, logger, clientFactory });
  await plane.start();
  const pollCb = plane.client.pollCb;
  assert.ok(pollCb, 'poll captured the update callback');
  const send = (update) => pollCb(update);
  return { plane, client: plane.client, sessions, send };
}

const OWNER = '8845366023';
const REGULAR = '221234567';

test('/start is reachable even for an unverified user (welcome + gate buttons)', async () => {
  const { client, send } = await bootPlane({ memberStatus: 'left' });
  await send({ message: { chat: { id: 1, type: 'private' }, from: { id: REGULAR, first_name: 'Ali' }, text: '/start' } });
  const sent = client.calls.sent.find((m) => m.chatId === 1);
  assert.ok(sent, 'a welcome message was sent despite the gate');
  assert.match(sent.text, /NOVA_VOID MDX/i);
  assert.ok(sent.reply_markup?.inline_keyboard, 'gate buttons present');
});

test('/start reveals the command menu directly for an already-verified user (no second /start)', async () => {
  const { client, send } = await bootPlane({ memberStatus: 'member' });
  await send({ message: { chat: { id: 20, type: 'private' }, from: { id: REGULAR, first_name: 'Ali' }, text: '/start' } });
  const sent = client.calls.sent.find((m) => m.chatId === 20);
  assert.ok(sent, 'a reply was sent');
  assert.match(sent.text, /ᴠᴇʀɪꜰɪᴇᴅ|verified/i, 'shows the verified state');
  assert.match(sent.text, /\/pair/, 'the command menu is revealed, not the gate again');
  assert.match(sent.text, /\/pairs/);
  assert.ok(sent.reply_markup?.inline_keyboard, 'menu buttons are attached');
});

test('non-start command from an unverified user returns the membership gate card', async () => {
  const { client, send } = await bootPlane({ memberStatus: 'left' });
  await send({ message: { chat: { id: 2, type: 'private' }, from: { id: REGULAR }, text: '/menu' } });
  const sent = client.calls.sent.find((m) => m.chatId === 2);
  assert.ok(sent, 'gate card sent');
  assert.match(sent.text, /nov_void_mdx_com77|nov_void_updates77|@nova_void/i);
  client.calls.sent.length = 0;
});

test('verified member can run a normal command', async () => {
  const { client, send } = await bootPlane({ memberStatus: 'member' });
  await send({ message: { chat: { id: 3, type: 'private' }, from: { id: REGULAR }, text: '/ping' } });
  // /ping is gate-required and role user — must produce a reply.
  const sent = client.calls.sent.find((m) => m.chatId === 3);
  assert.ok(sent);
  assert.doesNotMatch(sent.text, /ᴜɴᴋɴᴏᴡɴ/i);
});

test('/status is rejected for non-owners even when verified', async () => {
  const { client, send } = await bootPlane({ memberStatus: 'member' });
  await send({ message: { chat: { id: 4, type: 'private' }, from: { id: REGULAR }, text: '/status' } });
  const sent = client.calls.sent.find((m) => m.chatId === 4);
  assert.match(sent.text, /ᴀᴄᴄᴇꜱꜱ ʀᴇꜱᴛʀɪᴄᴛᴇᴅ/);
});

test('owner may run /status', async () => {
  const { client, send } = await bootPlane();
  await send({ message: { chat: { id: 5, type: 'private' }, from: { id: OWNER }, text: '/status' } });
  const sent = client.calls.sent.find((m) => m.chatId === 5);
  assert.ok(sent);
  assert.doesNotMatch(sent.text, /ᴀᴄᴄᴇꜱꜱ ʀᴇꜱᴛʀɪᴄᴛᴇᴅ/);
  assert.match(sent.text, /WHATSAPP SESSIONS|ᴛᴇʟᴇɢʀᴀᴍ ᴄᴏɴᴛʀᴏʟ ᴘʟᴀɴᴇ/);
});

test('unknown commands get the unknown card', async () => {
  const { client, send } = await bootPlane();
  await send({ message: { chat: { id: 6, type: 'private' }, from: { id: OWNER }, text: '/frobnicate x' } });
  const sent = client.calls.sent.find((m) => m.chatId === 6);
  assert.match(sent.text, /ᴜɴᴋɴᴏᴡɴ ᴄᴏᴍᴍᴀɴᴅ/);
});

test('group chatter is ignored by the control plane (commands only in private chat)', async () => {
  const { client, send } = await bootPlane();
  await send({ message: { chat: { id: -100, type: 'group' }, from: { id: OWNER }, text: '/ping' } });
  assert.equal(client.calls.sent.length, 0);
});

test('plain non-command text in private chat is ignored', async () => {
  const { client, send } = await bootPlane();
  await send({ message: { chat: { id: 7, type: 'private' }, from: { id: OWNER }, text: 'hey there' } });
  assert.equal(client.calls.sent.length, 0);
});

test('/pair drives the placeholder card and records UI callbacks for live edits', async () => {
  const { client, send, sessions } = await bootPlane();
  await send({ message: { chat: { id: 8, type: 'private' }, from: { id: OWNER }, text: '/pair 2347046855205' } });
  const placeholders = client.calls.sent.filter((m) => m.chatId === 8);
  assert.ok(placeholders.length >= 1, 'a placeholder pairing card was sent');
  assert.match(placeholders.at(-1).text, /ᴘᴀɪʀ ʀᴇǫᴜᴇꜱᴛ|ᴘᴀɪʀ ʀᴇǫᴜᴇsᴛ|ᴘᴀɪʀ/i);
  const attempt = sessions.attempts.get('2347046855205');
  assert.ok(attempt, 'attempt registered');
  assert.equal(attempt.userId, String(OWNER));
  assert.equal(typeof attempt.ui.onCode, 'function');
  assert.equal(typeof attempt.ui.onOpen, 'function');
  attempt.ui.onCode({ code: 'ABCD-EF12', ttlMs: 120000 });
  assert.match(client.calls.edited.at(-1).text, /ABCD-EF12/);
});

test('/pair without a number returns usage, not a crash', async () => {
  const { client, send } = await bootPlane();
  await send({ message: { chat: { id: 9, type: 'private' }, from: { id: OWNER }, text: '/pair' } });
  const sent = client.calls.sent.find((m) => m.chatId === 9);
  assert.match(sent.text, /ᴘᴀɪʀ ᴜꜱᴀɢᴇ/);
});

test('copy callback echoes the code; strangers are refused', async () => {
  const { client, send, sessions } = await bootPlane();
  const attempt = sessions.pair('2347046855205', { userId: REGULAR });
  attempt.code = 'ABCD-EF12';
  // Owner may copy another user's code:
  await send({ callback_query: { id: 'C1', from: { id: OWNER }, data: 'pair:2347046855205:copy', message: { chat: { id: 10, type: 'private' }, message_id: 100 } } });
  assert.ok(client.calls.answered.some((a) => /ABCD-EF12/.test(a.text)));
  // Stranger cannot:
  await send({ callback_query: { id: 'C2', from: { id: '666' }, data: 'pair:2347046855205:copy', message: { chat: { id: 10, type: 'private' }, message_id: 100 } } });
  assert.ok(client.calls.answered.some((a) => a.cbqId === 'C2' && /not belong/i.test(a.text)));
});

test('status callback for a live attempt refreshes the card with seconds left', async () => {
  const { client, send, sessions } = await bootPlane();
  const attempt = sessions.pair('2347046855205', { userId: REGULAR });
  attempt.state = 'awaiting';
  attempt.code = 'ABCD-EF12';
  await send({ callback_query: { id: 'S1', from: { id: REGULAR }, data: 'pair:2347046855205:status', message: { chat: { id: 11, type: 'private' }, message_id: 101 } } });
  assert.ok(client.calls.answered.some((a) => a.cbqId === 'S1' && /ABCD-EF12/.test(a.text)));
  const edit = client.calls.edited.find((m) => m.messageId === 101);
  assert.match(edit.text, /ABCD-EF12/);
});

test('cancel callback removes a pending attempt and toasts the result', async () => {
  const { client, send, sessions } = await bootPlane();
  sessions.pair('2347046855205', { userId: REGULAR });
  await send({ callback_query: { id: 'X1', from: { id: REGULAR }, data: 'pair:2347046855205:cancel', message: { chat: { id: 12, type: 'private' }, message_id: 102 } } });
  assert.ok(client.calls.answered.some((a) => a.cbqId === 'X1' && /cancelled/i.test(a.text)));
  assert.equal(sessions.attempts.has('2347046855205'), false);
});

test('verify callback bypasses the cache, then reveals the command menu', async () => {
  const { client, send } = await bootPlane({ memberStatus: 'member' });
  await send({ callback_query: { id: 'V1', from: { id: REGULAR }, data: 'verify', message: { chat: { id: 13, type: 'private' }, message_id: 103 } } });
  assert.ok(client.calls.answered.some((a) => a.cbqId === 'V1' && /verified/i.test(a.text)));
  const edit = client.calls.edited.find((m) => m.messageId === 103);
  assert.match(edit.text, /ᴠᴇʀɪꜰɪᴇᴅ|verified/i);
  assert.match(edit.text, /menu/, 'the menu is revealed immediately after verifying');
  assert.ok(edit.reply_markup?.inline_keyboard, 'menu buttons are attached');
});

test('/unpair refuses a number that was never paired', async () => {
  const { client, send, sessions } = await bootPlane();
  sessions.unpair = async () => {
    throw new Error('No session is stored for this number.');
  };
  await send({ message: { chat: { id: 14, type: 'private' }, from: { id: OWNER }, text: '/unpair 2347046855205' } });
  const sent = client.calls.sent.find((m) => m.chatId === 14);
  assert.match(sent.text, /No session/i);
});