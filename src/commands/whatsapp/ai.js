import { buildAnswerParts } from '../../ai/format-code.js';
import * as wa from '../../ui/wa-style.js';

/**
 * The ONLY AI command: `.ai <question>`. There is no user-facing training or
 * history surface — NOVA_VOID is a pure conversational assistant.
 */
export function createAICommands({ ai, limiter }) {
  return [
    {
      name: 'ai',
      aliases: ['ask'],
      category: 'ai',
      usage: '.ai <question>',
      description: 'Ask NOVA_VOID anything — get an honest AI answer.',
      async execute(ctx) {
        if (!ctx.argsText) {
          return ctx.reply(['⚠️ *_USAGE_*', '', '`.' + wa.smallCaps('ai') + ' <question>`', '', wa.footer()].join('\n'));
        }
        const limitKey = `cmd:ai:${ctx.senderJid}`;
        if (limiter && !limiter.allow(limitKey)) {
          const seconds = Math.ceil(limiter.msUntilAllowed(limitKey) / 1000);
          return ctx.reply(wa.rateLimited().replace('COOLDOWN', `${seconds}s`));
        }
        // Group: reply threaded to the asker; DM: plain reply.
        const send = ctx.replyTo && ctx.message?.isGroup ? ctx.replyTo : ctx.reply;
        // Code blocks ship as RAW text on every platform: the WhatsApp path
        // sends verbatim chat text, the Telegram path skips HTML parsing so
        // the bytes stay exact and copyable.
        const sendRaw = ctx.replyToRaw && ctx.message?.isGroup ? ctx.replyToRaw : ctx.replyRaw;
        try {
          const answer = await ai.chat({ userJid: ctx.senderJid, prompt: ctx.argsText, scope: ctx.chatJid });
          // Shared renderer: styled prose and each code block go out as their
          // own ordinary TEXT messages. Code is always copyable raw text — a
          // document is never created and no interactive button is sent.
          const parts = buildAnswerParts(answer);
          for (const part of parts) {
            if (part.type === 'code') await sendRaw(part.content);
            else await send(part.content);
          }
          return parts.length ? null : send('📭 *_NO OUTPUT_*');
        } catch (error) {
          // Honest failure: no hidden fallback answers exist. The card tells
          // the truth (not configured / quota / provider crash) while the real
          // cause is logged for the operator.
          console.error(`[AI] provider error: ${error?.message ?? error}`);
          if (error?.cause) console.error(`[AI] caused by: ${error.cause?.message ?? error.cause}`);
          return send(wa.aiNotConfigured());
        }
      },
    },
  ];
}