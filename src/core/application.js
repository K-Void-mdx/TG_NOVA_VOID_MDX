import { normalizeMessage } from './message/normalize.js';
import { parseCommand } from './commands/parse.js';
import { getCommand, registerCommand } from './commands/registry.js';
import { ChatbotState } from './state/chatbot-state.js';
import { resolveRole, hasRole } from './permissions/roles.js';
import { handleChatbotMessage } from '../ai/chatbot-service.js';
import { isChatbotTrigger, stripBotMention } from '../ai/chatbot.js';
import { RateLimiter } from './rate-limit.js';
import { normalizeJid } from './permissions/roles.js';
import { isBroadcastChat } from './jid.js';
import * as waStyle from '../ui/wa-style.js';

const OUTBOUND_MEMORY = 500;
const SEEN_MEMORY = 800;

export class NovaApplication {
  constructor({
    botJid,
    botLid,
    ownerJids = [],
    sudoJids = [],
    ai,
    sessions,
    reply,
    sendMedia,
    downloadMedia,
    send,
    chatbot,
    limiter,
    prefixes = ['.'],
    botName = 'NOVA_VOID MDX',
    trace = () => {},
    settings = null,
    group = null,
  }) {
    this.botJid = botJid;
    // WhatsApp may address the linked account through an alternate LID
    // identity; kept for mention-matching only — never for authority.
    this.botLid = botLid;
    this.ownerJids = ownerJids;
    this.sudoJids = sudoJids;
    // Mutable runtime settings (prefix, dynamic sudo). When provided, they
    // OVERRIDE the static config: dynamic sudo merges with env sudo, and a
    // runtime-set prefix wins over the env prefix.
    this.settings = settings;
    // WhatsApp group API (metadata, participant updates, settings, mentions).
    // Null on platforms (Telegram) where group admin verbs do not apply.
    this.group = group;
    this.ai = ai;
    this.sessions = sessions;
    // ONE transport + ONE tracking owner. NovaApplication wraps the raw
    // transport so every outbound message is echo-registered here, never at
    // call sites — a tracking failure must never fail a command.
    this.transportSend = send ?? reply;
    if (typeof this.transportSend !== 'function') {
      throw new Error('NovaApplication requires a send/reply transport');
    }
    this.transportSendMedia = typeof sendMedia === 'function' ? sendMedia : undefined;
    this.sendMedia = this.transportSendMedia
      ? async (chatJid, media) => {
          const sent = await this.transportSendMedia(chatJid, media);
          this.trackOutbound(sent);
          return sent;
        }
      : undefined;
    this.downloadMedia = typeof downloadMedia === 'function' ? downloadMedia : undefined;
    this.chatbot = chatbot ?? new ChatbotState();
    this.limiter = limiter ?? new RateLimiter({ windowMs: 15_000, max: 4 });
    this.prefixes = Array.isArray(prefixes) && prefixes.length ? prefixes : ['.'];
    this.botName = botName;
    this.trace = trace;
    // IDs of messages THIS bot sent, so the companion echo of our own replies
    // is never re-dispatched. Human-typed messages (even fromMe) have fresh
    // ids and pass through for normal configured-role dispatch.
    this.outboundIds = new Set();
    // IDs of INBOUND messages already processed — Baileys can replay the same
    // message after a reconnect, which must never double-fire a command.
    this.seenIds = new Set();
  }

  /** Raw send, wrapped with guaranteed outbound tracking. */
  async reply(chatJid, text, { quoted, format = 'wa-style' } = {}) {
    const sent = await this.transportSend(chatJid, { text, quoted, format });
    this.trackOutbound(sent);
    return sent;
  }

  /**
   * Sends text as a threaded reply (quote) to an inbound WhatsApp message.
   * The `quoted` payload is the original WebMessageInfo, so WhatsApp renders
   * the bot's reply attached to the person who addressed it — making clear
   * exactly who the bot is talking to in a group. Telegram adapter messages
   * carry `replyToId` inside their neutral `raw`, which their transport maps
   * to Telegram's reply_to_message_id for the same threading effect.
   */
  async replyTo(message, text, { format = 'wa-style' } = {}) {
    const quoted = message?.raw && (message.raw.key || message.raw.message || message.raw.replyToId)
      ? message.raw
      : undefined;
    return this.reply(message.chatJid, text, { quoted, format });
  }

  trackOutbound(sent) {
    try {
      const id = sent?.key?.id;
      if (!id) return;
      this.rememberOutbound(id);
    } catch (error) {
      // Bookkeeping must never break message flow.
      try { this.trace('track-error', { error }); } catch { /* ignore */ }
    }
  }

  rememberOutbound(id) {
    if (!id) return;
    this.outboundIds.add(id);
    if (this.outboundIds.size > OUTBOUND_MEMORY) {
      const oldest = this.outboundIds.values().next().value;
      this.outboundIds.delete(oldest);
    }
  }

  /** Command prefixes actually in force — runtime .setprefix wins over env. */
  effectivePrefixes() {
    const dynamic = this.settings?.prefix;
    return dynamic ? [dynamic] : this.prefixes;
  }

  /** Sudo JIDs actually in force — env list merged with runtime .addsudo. */
  effectiveSudoJids() {
    const dynamic = this.settings?.sudoJids ?? [];
    if (!dynamic.length) return this.sudoJids;
    return [...new Set([...this.sudoJids, ...dynamic])];
  }

  register(commands) {
    const list = Array.isArray(commands) ? commands.flat(Infinity) : [commands];
    for (const command of list) {
      if (command) registerCommand(command);
    }
    return this;
  }

  async handle(raw) {
    // Platform adapters (Telegram) supply an already-normalized neutral
    // message tagged `__normalized`; WhatsApp messages go through Baileys'
    // raw shape as before. Both end at the SAME dispatcher.
    const message = raw?.__normalized === true
      ? raw
      : normalizeMessage(raw, { botJid: this.botJid });
    if (!message.id) return { handled: false, reason: 'ignored' };
    if (isBroadcastChat(message.chatJid)) return { handled: false, reason: 'ignored-status' };
    if (message.isProtocol) return { handled: false, reason: 'protocol' };

    // Echo suppression is ID-based, never role-based: only messages THIS bot
    // actually sent are skipped. A human typing on the linked phone produces
    // fresh ids, passes this gate, and is then dispatched strictly by their
    // CONFIGURED role (companion identity grants no authority).
    if (message.fromMe && this.outboundIds.has(message.id)) {
      return { handled: false, reason: 'self-echo' };
    }
    if (this.seenIds.has(message.id)) {
      return { handled: false, reason: 'duplicate' };
    }
    this.seenIds.add(message.id);
    if (this.seenIds.size > SEEN_MEMORY) {
      const oldest = this.seenIds.values().next().value;
      this.seenIds.delete(oldest);
    }
    if (!message.text) {
      // Interactive button presses (from our now-absent quick-reply buttons)
      // carry internal ids without conversation text and can never be commands
      // or prompts — safely ignored.
      return { handled: false, reason: 'no-text' };
    }
    this.trace('message', message);

    const role = resolveRole({
      sender: message.senderJid,
      ownerJids: this.ownerJids,
      sudoJids: this.effectiveSudoJids(),
      isGroupAdmin: Boolean(raw.isGroupAdmin),
    });

    const parsed = parseCommand(message.text, this.effectivePrefixes());
    if (parsed) {
      const command = getCommand(parsed.name);
      if (!command) {
        this.trace('unknown-command', { name: parsed.name });
        return { handled: false, reason: 'unknown-command' };
      }
      const requiredRole = command.role ?? 'user';
      if (!hasRole(role, requiredRole)) {
        await this.reply(message.chatJid, waStyle.accessDenied(parsed.name, requiredRole));
        return { handled: true, type: 'permission-denied', role, requiredRole };
      }

      this.trace('dispatch', { name: parsed.name });
      try {
        await command.execute({
          message,
          senderJid: message.senderJid,
          chatJid: message.chatJid,
          args: parsed.args,
          argsText: parsed.text,
          role,
          reply: (text) => this.reply(message.chatJid, text),
          replyTo: (text) => this.replyTo(message, text),
          // Raw (plain, unformatted) variants carry the payloads that must
          // NEVER be styled or interpreted on any platform — .ai/.chatbot
          // code blocks rely on these to stay byte-identical and copyable.
          replyRaw: (text) => this.reply(message.chatJid, text, { format: 'raw' }),
          replyToRaw: (text) => this.replyTo(message, text, { format: 'raw' }),
          sendMedia: this.sendMedia ? (media) => this.sendMedia(message.chatJid, media) : undefined,
          // Download bytes for a (quoted) media message — .sticker/.toimg/.readqr.
          download: this.downloadMedia
            ? (msgLike) => Promise.resolve(this.downloadMedia(msgLike))
            : undefined,
          // WhatsApp group admin verbs (null on non-WA transports).
          group: this.group,
          prefix: parsed?.prefix ?? (this.effectivePrefixes()[0] ?? '.'),
        });
        this.trace('response', { command: parsed.name });
      } catch (error) {
        // Real details stay in Termux logs; users get a clean card with no
        // internal error text.
        this.trace('command-error', { command: parsed.name, error });
        await this.reply(message.chatJid, waStyle.commandError(parsed.name));
        return { handled: true, type: 'command-error', error };
      }
      return { handled: true, type: 'command', command: parsed.name };
    }

    if (this.chatbot.isEnabled(message.chatJid)) {
      // In DMs with chatbot enabled, every message is a chatbot prompt.
      // In groups, only explicit addressment (@mention, reply to the bot, or a
      // Telegram adapter's own isBotAddressed assertion) may reach the AI
      // layer; ordinary chatter must never consume budget.
      const isDm = !message.isGroup;
      const explicit = message.isBotAddressed === true;
      const mentioned = (message.mentionedJids ?? [])
        .some((jid) => [this.botJid, this.botLid]
          .some((id) => id && normalizeJid(jid) === normalizeJid(id)));
      const prompted = isDm || explicit || isChatbotTrigger(message, this.botJid, this.botLid) || mentioned;
      const prompt = isDm
        ? message.text
        : stripBotMention(message.text, this.botJid, { mentioned: mentioned || explicit });
      if (!prompted || !prompt) {
        return { handled: false, reason: 'no-trigger' };
      }
      const limitKey = `chatbot:${message.chatJid}:${message.senderJid}`;
      if (!this.limiter.allow(limitKey)) {
        // Notify at most once per window so spam cannot turn into echo spam.
        const notifyKey = `notify:${limitKey}`;
        if (this.limiter.allow(notifyKey)) {
          await this.reply(message.chatJid, waStyle.rateLimited());
        }
        return { handled: true, type: 'rate-limited' };
      }
      const replied = await handleChatbotMessage({
        message,
        botJid: this.botJid,
        botLid: this.botLid,
        enabled: true,
        ai: this.ai,
        // DMs: every inbound message is a prompt (no mention required).
        // Telegram groups: the adapter's own explicit addressment assertion is
        // treated as `force` so its replies can never be silently dropped.
        force: !message.isGroup || explicit,
        // In groups the bot quotes the sender's message, so its reply visibly
        // targets the person who addressed it rather than floating in the chat.
        reply: (text, format) => (message.isGroup
          ? this.replyTo(message, text, { format: format === 'raw' ? 'raw' : 'wa-style' })
          : this.reply(message.chatJid, text, { format: format === 'raw' ? 'raw' : 'wa-style' })),
      });
      if (replied) return { handled: true, type: 'chatbot' };
    }

    return { handled: false, reason: 'no-trigger' };
  }
}
