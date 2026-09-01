import * as wa from '../../ui/wa-style.js';

const TELEGRAM_COMMANDS = [
  { name: 'start', description: 'Welcome card and membership verification.' },
  { name: 'menu', description: 'List every Telegram command.' },
  { name: 'help', description: 'Detailed usage (use /help <command>).' },
  { name: 'ping', description: 'Check that the control plane is alive.' },
  { name: 'status', description: 'Bot runtime + session overview (owner).' },
  { name: 'pair', description: 'Link a WhatsApp number to the bot.' },
  { name: 'pairs', description: 'List your WhatsApp sessions.' },
  { name: 'unpair', description: 'Remove a linked WhatsApp session.' },
];

/**
 * /menu — the Telegram command panel, rendered as a WhatsApp-styled card
 * converted to Telegram HTML (reuses the shared renderer).
 */
export function createMenuCommand({ env }) {
  return {
    name: 'menu',
    aliases: ['commands'],
    role: 'user',
    usage: '/menu',
    description: 'List every Telegram command.',
    async execute(ctx) {
      const lines = [
        wa.header(env.botName),
        '',
        '⚡ ᴛᴇʟᴇɢʀᴀᴍ ᴄᴏᴍᴍᴀɴᴅʟɪꜱᴛ',
        '',
        wa.menuTop(env.botName),
      ];
      for (const command of TELEGRAM_COMMANDS) {
        lines.push(wa.menuItem(`\`/${wa.smallCaps(command.name)}\``));
      }
      lines.push(wa.menuBottom('ꜱᴇᴇ /help ꜰᴏʀ ᴅᴇᴛᴀɪʟꜱ'));
      // Image + command list together (brand image, text fallback).
      if (typeof ctx.sendPhoto === 'function') return ctx.sendPhoto(lines.join('\n'));
      return ctx.reply(lines.join('\n'));
    },
  };
}