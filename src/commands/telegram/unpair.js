import { PairingError } from '../../sessions/wa-session-manager.js';
import { normalizePhone } from '../../core/phone.js';
import * as wa from '../../ui/wa-style.js';

/** /unpair <number> — removes a WhatsApp session the user owns. */
export function createUnpairCommand({ env, sessions }) {
  return {
    name: 'unpair',
    aliases: ['unlink'],
    role: 'user',
    usage: '/unpair <number>',
    description: 'Remove a linked WhatsApp session.',
    async execute(ctx) {
      const parsed = normalizePhone(ctx.argsText);
      if (!parsed.ok) {
        return ctx.reply(
          [
            wa.header(env.botName),
            '',
            '⚠️ <b>ᴜɴᴘᴀɪʀ ᴜꜱᴀɢᴇ</b>',
            '',
            'Use: `/unpair <number>`',
            'Number = country code + digits (8–15).',
            'Example: `/unpair 2348012345678`',
            '',
            `Reason: ${parsed.error}`,
          ].join('\n')
        );
      }

      try {
        await sessions.unpair(parsed.phone, { userId: ctx.userId });
      } catch (error) {
        const code = error instanceof PairingError ? error.code : 'ERROR';
        return ctx.reply(
          [
            wa.header(env.botName),
            '',
            '🚫 <b>ᴜɴᴘᴀɪʀ ᴅᴇᴄʟɪɴᴇᴅ</b>',
            '',
            `‣ ${code}`,
            `‣ ${error?.message ?? 'Unexpected error.'}`,
            '',
            'See /pairs for the numbers you manage.',
          ].join('\n')
        );
      }

      return ctx.reply(
        [
          '🗑 <b>ꜱᴇꜱꜱɪᴏɴ ʀᴇᴍᴏᴠᴇᴅ</b>',
          '',
          `Number: \`${parsed.phone}\``,
          'ᴛʜᴇ ᴡʜᴀᴛꜱᴀᴘᴘ ꜱᴇꜱꜱɪᴏɴ ᴀɴᴅ ɪᴛꜱ ꜱᴛᴏʀᴇᴅ ᴄʀᴇᴅᴇɴᴛɪᴀʟꜱ ᴡᴇʀᴇ ᴅᴇʟᴇᴛᴇᴅ.',
          'ʟɪɴᴋ ɪᴛ ᴀɢᴀɪɴ ᴀɴʏᴛɪᴍᴇ ᴡɪᴛʜ /pair.',
        ].join('\n')
      );
    },
  };
}