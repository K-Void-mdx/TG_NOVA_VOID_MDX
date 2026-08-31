import { welcomeCard, gateKeyboard, telegramChatUrl } from '../../telegram/format.js';

/** /start — always allowed. Shows the welcome card + membership gate buttons. */
export function createStartCommand({ env }) {
  return {
    name: 'start',
    role: 'user',
    usage: '/start',
    description: 'Welcome card and membership verification.',
    async execute(ctx) {
      const channelUrl = telegramChatUrl(env.telegramChannel);
      const groupUrl = telegramChatUrl(env.telegramGroup);
      return ctx.replyHtml(welcomeCard({ botName: env.botName }), {
        markup: gateKeyboard({ channelUrl, groupUrl, ownerUrl: env.telegramOwnerLink || '' }),
      });
    },
  };
}