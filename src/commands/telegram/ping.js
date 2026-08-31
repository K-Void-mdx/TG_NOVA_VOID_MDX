import * as wa from '../../ui/wa-style.js';

function formatUptime(seconds) {
  const total = Math.floor(Number(seconds) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** /ping — control-plane heartbeat check. */
export function createPingCommand({ env }) {
  return {
    name: 'ping',
    role: 'user',
    usage: '/ping',
    description: 'Check that the control plane is alive.',
    async execute(ctx) {
      const lines = [
        wa.header(env.botName),
        '',
        '🟢 <b>ᴄᴏɴᴛʀᴏʟ ᴘʟᴀɴᴇ ʀᴇꜱᴘᴏɴᴅɪɴɢ</b>',
        '',
        `*_${env.botName}_* is *_alive_*.`,
        '',
        wa.section('STATUS'),
        wa.row('Uptime', formatUptime(process.uptime())),
        wa.row('Connection', 'ONLINE'),
        wa.sectionEnd(),
        '',
        '⚡ `PONG`',
        wa.footer(env.botName),
      ];
      return ctx.reply(lines.join('\n'));
    },
  };
}