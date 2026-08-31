import { welcomeCard, menuPanelCard, gateKeyboard, menuKeyboard, telegramChatUrl } from '../../telegram/format.js';

/** The Telegram command panel shown once a user is verified. */
const TELEGRAM_COMMANDS = [
  '/start', '/menu', '/help', '/ping', '/status', '/pair', '/pairs', '/unpair',
];

/** /start — gate-exempt. Unverified users get the welcome + gate buttons;
 *  already-verified users go straight to the command menu (no second /start). */
export function createStartCommand({ env }) {
  return {
    name: 'start',
    role: 'user',
    usage: '/start',
    description: 'Welcome card, membership gate, and the command menu.',
    async execute(ctx) {
      const channelUrl = telegramChatUrl(env.telegramChannel);
      const groupUrl = telegramChatUrl(env.telegramGroup);
      const ownerUrl = env.telegramOwnerLink || '';

      // Owner is always exempt. Any other user must pass the membership gate;
      // if they are already verified, jump straight to the menu.
      let verified = true;
      if (ctx.userId && !ctx.gate?.isOwner?.(ctx.userId)) {
        try {
          const result = await ctx.gate.verify(ctx.userId);
          verified = Boolean(result?.ok);
        } catch {
          verified = false;
        }
      }

      if (verified) {
        return ctx.replyHtml(menuPanelCard({ botName: env.botName, commands: TELEGRAM_COMMANDS }), {
          markup: menuKeyboard({ channelUrl, groupUrl, ownerUrl }),
        });
      }

      return ctx.replyHtml(welcomeCard({ botName: env.botName }), {
        markup: gateKeyboard({ channelUrl, groupUrl, ownerUrl }),
      });
    },
  };
}