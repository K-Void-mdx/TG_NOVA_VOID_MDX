import * as wa from '../../ui/wa-style.js';

/**
 * `.chatbot on|off` — toggles AI chatbot mode globally (all chats). One clean
 * small-caps card per state; no redundant messages.
 */
export function createChatbotCommand({ state }) {
  return {
    name: 'chatbot',
    category: 'ai',
    role: 'owner',
    usage: '.chatbot on|off',
    description: 'Toggle AI chatbot mode globally (all chats).',
    async execute(ctx) {
      const mode = String(ctx.args?.[0] ?? '').toLowerCase();
      if (!['on', 'off'].includes(mode)) {
        return ctx.reply(['⚠️ *_USAGE_*', '', '`.' + wa.smallCaps('chatbot') + ' on|off`', '', wa.footer()].join('\n'));
      }
      state.setGlobal(mode === 'on');
      const status = mode === 'on' ? wa.smallCaps('on') : wa.smallCaps('off');
      return ctx.reply(
        [
          `╭─❒「 *${wa.smallCaps('chatbot')}* 」`,
          `├─❒ ꜱᴛᴀᴛᴜꜱ : *${status}*`,
          '├─❒ ᴍᴏᴅᴇ : *ɢʟᴏʙᴀʟ*',
          `╰─❒ *${wa.BOT}*`,
        ].join('\n')
      );
    },
  };
}