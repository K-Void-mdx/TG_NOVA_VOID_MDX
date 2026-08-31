import { PairingError } from '../../sessions/wa-session-manager.js';
import { normalizePhone } from '../../core/phone.js';
import { pairingCard, pairingKeyboard } from '../../telegram/pair-cards.js';
import * as wa from '../../ui/wa-style.js';

/**
 * /pair <number> — links a WHATSAPP number so a real NOVA_VOID MDX session
 * comes online on that number. The pair code is delivered in Telegram with a
 * COPY button; the card updates itself as the attempt progresses.
 */
export function createPairCommand({ env, sessions, client }) {
  return {
    name: 'pair',
    aliases: ['link'],
    role: 'user',
    usage: '/pair <number>',
    description: 'Link a WhatsApp number to the bot (country code + digits).',
    async execute(ctx) {
      const parsed = normalizePhone(ctx.argsText);
      if (!parsed.ok) {
        return ctx.reply(
          [
            wa.header(env.botName),
            '',
            '⚠️ <b>ᴘᴀɪʀ ᴜꜱᴀɢᴇ</b>',
            '',
            'Use: `/pair <number>`',
            'Number = country code + digits (8–15), just the numbers.',
            'Example: `/pair 2348012345678`',
            '',
            `Reason: ${parsed.error}`,
          ].join('\n')
        );
      }

      let attempt;
      try {
        attempt = sessions.pair(parsed.phone, { userId: ctx.userId, userName: ctx.userName });
      } catch (error) {
        const code = error instanceof PairingError ? error.code : 'ERROR';
        return ctx.reply(
          [
            wa.header(env.botName),
            '',
            '🚫 <b>ᴘᴀɪʀ ᴅᴇᴄʟɪɴᴇᴅ</b>',
            '',
            `‣ ${code}`,
            `‣ ${error?.message ?? 'Unexpected error.'}`,
            '',
            'If you already have a session, use /pairs then /unpair first.',
          ].join('\n')
        );
      }

      // Room for the live card: a placeholder the attempt then edits.
      let messageId = null;
      try {
        const sent = await ctx.sendCard(
          pairingCard({ phone: parsed.phone, state: 'pending' }),
          { markup: pairingKeyboard(parsed.phone) }
        );
        messageId = sent?.key?.id ?? null;
      } catch (error) {
        // If the placeholder could not be sent there is nothing to edit; the
        // attempt still runs and records state in the manager, so fall back to
        // delivering the code in a fresh message instead.
        ctx.log(`[ PAIR ] placeholder send failed: ${error?.message ?? error}`);
      }

      const render = (view) => {
        if (!messageId) return;
        const terminal = ['paired', 'expired', 'cancelled', 'failed'].includes(view.state);
        ctx
          .edit(messageId, pairingCard(view), terminal ? undefined : pairingKeyboard(parsed.phone))
          .catch(() => {});
      };

      attempt.ui.onCode = ({ code, ttlMs }) =>
        render({ phone: parsed.phone, state: 'awaiting', code, secondsLeft: Math.floor((ttlMs || 0) / 1000) });
      attempt.ui.onStatus = (payload) => {
        if (payload?.state === 'reconnecting') render({ phone: parsed.phone, state: 'pending', note: 'reconnecting…' });
      };
      attempt.ui.onOpen = () => render({ phone: parsed.phone, state: 'paired' });
      attempt.ui.onExpired = () => render({ phone: parsed.phone, state: 'expired' });
      attempt.ui.onCancelled = () => render({ phone: parsed.phone, state: 'cancelled' });
      attempt.ui.onClosed = ({ reason }) => render({ phone: parsed.phone, state: 'failed', reason });
      attempt.ui.onPairError = ({ error }) => render({ phone: parsed.phone, state: 'failed', reason: error?.message });

      return null;
    },
  };
}