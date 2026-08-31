import { createTelegramClient } from './bot-client.js';
import { createMembershipGate } from './membership-gate.js';
import { telegramTextPayload, verifiedCard, missingTargetsCard, gateKeyboard, telegramChatUrl } from './format.js';
import { pairingCard, pairingKeyboard, pairingStatusToast } from './pair-cards.js';
import { createStartCommand } from '../commands/telegram/start.js';
import { createMenuCommand } from '../commands/telegram/menu.js';
import { createHelpCommand } from '../commands/telegram/help.js';
import { createPingCommand } from '../commands/telegram/ping.js';
import { createStatusCommand } from '../commands/telegram/status.js';
import { createPairCommand } from '../commands/telegram/pair.js';
import { createPairsCommand } from '../commands/telegram/pairs.js';
import { createUnpairCommand } from '../commands/telegram/unpair.js';

const COMMAND_FACTORIES = [
  createStartCommand,
  createMenuCommand,
  createHelpCommand,
  createPingCommand,
  createStatusCommand,
  createPairCommand,
  createPairsCommand,
  createUnpairCommand,
];

function parseTelegramCommand(text = '') {
  const match = /^\/([a-z0-9_]+)(?:\s+([\s\S]*))?$/i.exec(String(text).trim());
  if (!match) return null;
  const argsText = (match[2] ?? '').trim();
  return {
    name: match[1].toLowerCase(),
    args: argsText ? argsText.split(/\s+/) : [],
    argsText,
  };
}

/**
 * Telegram control plane — the command surface of NOVA_VOID MDX.
 *
 * Telegram is the CONTROL plane: the owner (and delegated users) run /pair,
 * /pairs and /unpair to manage real WhatsApp sessions. WhatsApp is the DATA
 * plane (Baileys). Every Telegram user must pass the membership gate first.
 */
export function startControlPlane({ env, sessions, logger = console, clientFactory = createTelegramClient }) {
  const client = clientFactory({ token: env.telegramBotToken });
  const gate = createMembershipGate({
    client,
    ownerIds: [env.telegramOwnerId].filter(Boolean),
    channelChat: env.telegramChannel,
    groupChat: env.telegramGroup,
  });

  const deps = { client, gate, sessions, env, logger };
  const commands = new Map();
  for (const factory of COMMAND_FACTORIES) {
    const command = factory(deps);
    commands.set(command.name, command);
    for (const alias of command.aliases ?? []) commands.set(alias, command);
  }

  // ── Low-level send helpers ───────────────────────────────────────────────

  /** WhatsApp-styled text → Telegram HTML (shared renderer). */
  function sendStyled(chatId, waText, { markup } = {}) {
    const payload = telegramTextPayload(waText, 'wa-style');
    return client.sendMessage(chatId, { ...payload, ...(markup ? { reply_markup: markup } : {}) });
  }

  /** Already-HTML text, sent verbatim. */
  function sendHtml(chatId, html, { markup } = {}) {
    return client.sendMessage(chatId, { text: html, parse_mode: 'HTML', ...(markup ? { reply_markup: markup } : {}) });
  }

  function gateUrls() {
    return {
      channelUrl: telegramChatUrl(env.telegramChannel),
      groupUrl: telegramChatUrl(env.telegramGroup),
      ownerUrl: env.telegramOwnerLink || '',
    };
  }

  function sendGateCard(chatId, result) {
    return sendHtml(chatId, missingTargetsCard(result.missing), { markup: gateKeyboard(gateUrls()) });
  }

  /** Message for the bot owner (background session events). */
  function sendOwner(text, { parse_mode = 'HTML' } = {}) {
    if (!env.telegramOwnerId) return Promise.resolve();
    return client.sendMessage(env.telegramOwnerId, { text, parse_mode }).catch((error) => {
      logger.error(`[ TELEGRAM ] owner notification failed: ${error?.message ?? error}`);
    });
  }

  // ── Update handlers ──────────────────────────────────────────────────────

  async function handleMessage(msg) {
    // The control plane only reacts to private-chat commands. Groups are for
    // the membership gate to verify, never for command spam.
    if (msg.chat?.type !== 'private') return;
    const chatId = msg.chat?.id;
    if (chatId == null) return;
    const userId = String(msg.from?.id ?? '');
    if (!userId) return;
    const firstName = msg.from?.first_name ?? '';
    const lastName = msg.from?.last_name ?? '';
    const userName = `${firstName}${lastName ? ` ${lastName}` : ''}`.trim() || userId;

    const text = String(msg.text ?? '').trim();
    if (!text) return;
    const parsed = parseTelegramCommand(text);
    if (!parsed) return;

    const command = commands.get(parsed.name);
    if (!command) {
      return sendHtml(
        chatId,
        [`❓ <b>ᴜɴᴋɴᴏᴡɴ ᴄᴏᴍᴍᴀɴᴅ</b>`, '', `\`/${parsed.name}\` is not a Telegram command.`, '', 'Use /help for the full list.'].join('\n')
      );
    }

    if (command.name !== 'start') {
      const result = await gate.verify(userId);
      if (!result.ok) return sendGateCard(chatId, result);
    }

    if (command.role === 'owner' && !gate.isOwner(userId)) {
      return sendHtml(chatId, `🚫 <b>ᴀᴄᴄᴇꜱꜱ ʀᴇꜱᴛʀɪᴄᴛᴇᴅ</b> — \`/${command.name}\` ɪꜱ ᴏᴡɴᴇʀ-ᴏɴʟʏ.`);
    }

    const ctx = {
      ...deps,
      chatId,
      userId,
      userName,
      args: parsed.args,
      argsText: parsed.argsText,
      log: logger,
      reply: (waText, { markup } = {}) => sendStyled(chatId, waText, { markup }),
      replyHtml: (html, { markup } = {}) => sendHtml(chatId, html, { markup }),
      sendCard: (html, { markup } = {}) => sendHtml(chatId, html, { markup }),
      edit: (messageId, html, markup) =>
        client.editMessageText(chatId, messageId, { text: html, parse_mode: 'HTML', ...(markup ? { reply_markup: markup } : {}) }),
    };

    try {
      logger.log(`[ TELEGRAM ] /${command.name} from ${userId}`);
      await command.execute(ctx);
    } catch (error) {
      logger.error(`[ TELEGRAM ] /${command.name} failed: ${error?.message ?? error}`);
      sendHtml(chatId, `🛠️ <b>ᴄᴏᴍᴍᴀɴᴅ ᴇʀʀᴏʀ</b> — \`/${command.name}\` ᴄᴏᴜʟᴅ ɴᴏᴛ ʙᴇ ᴄᴏᴍᴘʟᴇᴛᴇᴅ.`).catch(() => {});
    }
  }

  async function handleCallback(query) {
    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;
    const userId = String(query.from?.id ?? '');
    const data = String(query.data ?? '');
    if (!chatId || !userId) return;
    const answer = (text) => client.answerCallbackQuery(query.id, { text }).catch(() => {});

    if (data === 'verify') {
      const result = await gate.verify(userId, { force: true });
      if (result.ok) {
        await answer('✅ Verified — commands unlocked');
        await client.editMessageText(chatId, messageId, { text: verifiedCard() });
      } else {
        await answer('Membership still missing');
        await client.editMessageText(chatId, messageId, { text: missingTargetsCard(result.missing) });
      }
      return;
    }

    const pairMatch = /^pair:(.+):(copy|status|cancel)$/.exec(data);
    if (pairMatch) {
      const phone = pairMatch[1];
      const action = pairMatch[2];
      const attempt = sessions.attempts.get(phone);
      const ownsAttempt = attempt && (String(attempt.userId) === userId || gate.isOwner(userId));

      if (action === 'copy') {
        if (!ownsAttempt) return answer('This pairing attempt does not belong to you.');
        if (!attempt?.code) return answer('No pair code available yet — press CHECK STATUS in a moment.');
        // Telegram inline keyboards have no true clipboard button, so the code
        // is recalled into the toast so the user can copy it from there.
        return answer(`Pair code for ${phone}: ${attempt.code}`);
      }

      if (action === 'status') {
        if (!ownsAttempt && !gate.isOwner(userId)) return answer('This pairing attempt does not belong to you.');
        try {
          const snapshot = sessions.pairStatus(phone, { userId });
          await answer(pairingStatusToast(snapshot));
          if (snapshot) {
            const view =
              snapshot.kind === 'open'
                ? { phone, state: 'paired' }
                : snapshot.kind === 'pairing'
                  ? { phone, state: snapshot.state === 'awaiting' ? 'awaiting' : 'pending', code: snapshot.code, secondsLeft: snapshot.secondsLeft }
                  : { phone, state: 'pending' };
            await client.editMessageText(chatId, messageId, {
              text: pairingCard(view),
              parse_mode: 'HTML',
              ...(snapshot.kind === 'open'
                ? {}
                : { reply_markup: pairingKeyboard(phone) }),
            });
          }
        } catch (error) {
          await answer(error?.message ?? 'Could not read pairing status.');
        }
        return;
      }

      if (action === 'cancel') {
        if (!ownsAttempt) return answer('This pairing attempt does not belong to you.');
        try {
          sessions.cancel(phone, { userId });
          await answer('Pairing cancelled — no session was created.');
        } catch (error) {
          await answer(error?.message ?? 'Could not cancel pairing.');
        }
        return;
      }
    }

    await answer('Unknown action');
  }

  async function onUpdate(update) {
    if (update?.message) await handleMessage(update.message);
    if (update?.callback_query) await handleCallback(update.callback_query);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /** getMe + begin long polling. Throws if the token is invalid. */
  async function start() {
    const me = await client.getMe();
    const username = me?.username ? `@${me.username}` : String(me?.id ?? 'unknown');
    logger.log(`[ TELEGRAM ] control plane online as ${username}`);
    logger.log(`[ TELEGRAM ] owner ${env.telegramOwnerId} · gate ${env.telegramChannel} + ${env.telegramGroup}`);
    // The loop runs until stop(); do not await it here.
    void client.poll({
      onUpdate,
      onError: (kind, error) => {
        logger.error(`[ TELEGRAM ] poll ${kind}: ${error?.message ?? 'unknown error'}`);
        if (kind === 'conflict') logger.error('[ TELEGRAM ] another polling instance owns this token — stopping.');
        if (kind === 'unauthorized') logger.error('[ TELEGRAM ] token rejected (401). Check TELEGRAM_BOT_TOKEN.');
      },
    });
  }

  function stop() {
    client.stop();
  }

  return { start, stop, sendOwner, client, gate, commands };
}