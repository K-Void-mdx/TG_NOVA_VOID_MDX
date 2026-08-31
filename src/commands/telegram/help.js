import * as wa from '../../ui/wa-style.js';

const COMMANDS = {
  start: '/start — welcome card and membership gate.',
  menu: '/menu — list every Telegram command.',
  help: '/help [command] — detailed usage.',
  ping: '/ping — check the control plane is alive.',
  status: '/status — runtime + WhatsApp session overview (owner only).',
  pair: '/pair <number> — link a WhatsApp number. Number = country code + digits (8–15), e.g. /pair 2348012345678',
  pairs: '/pairs — list the WhatsApp sessions you own (owner sees all).',
  unpair: '/unpair <number> — remove a WhatsApp session you own.',
};

/** /help — registry-driven overview with per-command detail. */
export function createHelpCommand({ env }) {
  return {
    name: 'help',
    aliases: ['man'],
    role: 'user',
    usage: '/help [command]',
    description: 'Detailed usage for a Telegram command.',
    async execute(ctx) {
      const target = String(ctx.args?.[0] ?? '').toLowerCase().replace(/^\//, '');

      if (!target) {
        const lines = [
          wa.header(env.botName),
          '',
          '💡 <b>ᴛᴇʟᴇɢʀᴀᴍ ʜᴇʟᴘ</b>',
          '',
          wa.section('COMMANDS'),
        ];
        for (const [name, line] of Object.entries(COMMANDS)) {
          lines.push(`├ *${name}*`);
          lines.push(`│  ❒ \`${line}\``);
        }
        lines.push(wa.sectionEnd());
        lines.push('');
        lines.push('Example: `/help pair`');
        lines.push(wa.footer(env.botName));
        return ctx.reply(lines.join('\n'));
      }

      const detail = COMMANDS[target];
      if (!detail) {
        return ctx.reply(
          [
            wa.header(env.botName),
            '',
            '❓ <b>ᴜɴᴋɴᴏᴡɴ ᴄᴏᴍᴍᴀɴᴅ</b>',
            `\`/${target}\` is not a Telegram command.`,
            '',
            'Use `/help` for the full list.',
          ].join('\n')
        );
      }

      return ctx.reply(
        [
          wa.header(env.botName),
          '',
          `🛠️ <b>ᴛᴇʟᴇɢʀᴀᴍ ᴄᴏᴍᴍᴀɴᴅ</b> \`/${target}\``,
          '',
          wa.section('DETAILS'),
          wa.row('Command', `/${target}`),
          wa.row('Usage', detail),
          wa.sectionEnd(),
          '',
          wa.footer(env.botName),
        ].join('\n')
      );
    },
  };
}