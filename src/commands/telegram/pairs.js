import * as wa from '../../ui/wa-style.js';

const STATUS_ICON = { online: '🟢', pairing: '🟡', offline: '⚪' };
const STATUS_LABEL = { online: 'ONLINE', pairing: 'PAIRING…', offline: 'OFFLINE' };

/** /pairs — list the WhatsApp sessions this user owns (owner sees all). */
export function createPairsCommand({ env, sessions }) {
  return {
    name: 'pairs',
    aliases: ['sessions'],
    role: 'user',
    usage: '/pairs',
    description: 'List your WhatsApp sessions.',
    async execute(ctx) {
      const rows = sessions.list({ userId: ctx.userId });
      const isOwner = sessions.isGlobalOwner(ctx.userId);

      if (!rows.length) {
        return ctx.reply(
          [
            wa.header(env.botName),
            '',
            '🗂 <b>ɴᴏ ꜱᴇꜱꜱɪᴏɴꜱ ʏᴇᴛ</b>',
            '',
            ...(isOwner
              ? ['ɴᴏ ᴡʜᴀᴛꜱᴀᴘᴘ ɴᴜᴍʙᴇʀ ɪꜱ ʟɪɴᴋᴇᴅ. ʟɪɴᴋ ᴏɴᴇ ᴡɪᴛʜ /pair.']
              : ['ʟɪɴᴋ ʏᴏᴜʀ ᴡʜᴀᴛꜱᴀᴘᴘ ɴᴜᴍʙᴇʀ ᴡɪᴛʜ /pair.', 'ʏᴏᴜ ᴄᴀɴ ᴏɴʟʏ ᴍᴀɴᴀɢᴇ ɴᴜᴍʙᴇʀꜱ ʏᴏᴜ ʟɪɴᴋᴇᴅ ʏᴏᴜʀꜱᴇʟꜰ.']),
            '',
            wa.footer(env.botName),
          ].join('\n')
        );
      }

      const lines = [
        wa.header(env.botName),
        '',
        '🗂 <b>ʟɪɴᴋᴇᴅ ᴡʜᴀᴛꜱᴀᴘᴘ ꜱᴇꜱꜱɪᴏɴꜱ</b>',
      ];

      for (const row of rows) {
        lines.push(
          '┌─〔 *_SESSION_* 〕',
          wa.row('Number', row.phone),
          wa.row('Status', `${STATUS_ICON[row.status] ?? '⚪'} ${STATUS_LABEL[row.status] ?? row.status}`),
          wa.row('Paired', row.pairedAt ?? '—'),
          ...(isOwner ? [wa.row('Owner', `${row.ownerUserName || '—'} (${row.ownerUserId})`)] : []),
          '└──────────',
          ''
        );
      }
      lines.push('ʀᴇᴍᴏᴠᴇ ᴏɴᴇ ᴡɪᴛʜ /unpair <number>.');
      lines.push(wa.footer(env.botName));
      return ctx.reply(lines.join('\n'));
    },
  };
}