import * as wa from '../../ui/wa-style.js';
import { getProviderStatus } from '../../ai/providers/index.js';

function formatUptime(seconds) {
  const total = Math.floor(Number(seconds) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** /status — runtime + WhatsApp session overview. Owner-only. */
export function createStatusCommand({ env, sessions }) {
  return {
    name: 'status',
    role: 'owner',
    usage: '/status',
    description: 'Bot runtime + session overview (owner only).',
    async execute(ctx) {
      const rows = sessions ? sessions.list({ userId: ctx.userId }) : [];
      const online = rows.filter((r) => r.status === 'online').length;
      const pairing = rows.filter((r) => r.status === 'pairing').length;

      const lines = [
        wa.header(env.botName),
        '',
        '📡 <b>ᴛᴇʟᴇɢʀᴀᴍ ᴄᴏɴᴛʀᴏʟ ᴘʟᴀɴᴇ</b>',
        '',
        wa.section('RUNTIME'),
        wa.row('Status', 'ONLINE'),
        wa.row('Uptime', formatUptime(process.uptime())),
        wa.row('Memory', `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`),
        wa.row('Node', process.version),
        wa.sectionEnd(),
        '',
        wa.section('WHATSAPP SESSIONS'),
        wa.row('Total', String(rows.length)),
        wa.row('Online', String(online)),
        wa.row('Pairing', String(pairing)),
        wa.sectionEnd(),
      ];

      const providers = getProviderStatus(env);
      const configured = Object.values(providers).filter((p) => p.configured).length;
      lines.push(
        '',
        wa.section('AI PROVIDERS'),
        wa.row('Configured', `${configured} / ${Object.keys(providers).length}`),
        wa.sectionEnd()
      );
      lines.push('', wa.footer(env.botName));
      if (typeof ctx.sendPhoto === 'function') return ctx.sendPhoto(lines.join('\n'));
      return ctx.reply(lines.join('\n'));
    },
  };
}