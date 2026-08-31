import { NovaApplication } from './application.js';
import { AIRouter } from '../ai/router.js';
import { AIService } from '../ai/ai-service.js';
import { AISessionStore } from '../ai/session-store.js';
import { GenerationService } from '../ai/generation.js';
import { ChatbotState } from './state/chatbot-state.js';
import { RateLimiter } from './rate-limit.js';
import { clearCommands } from './commands/registry.js';
import { createAICommands } from '../commands/whatsapp/ai.js';
import { createChatbotCommand } from '../commands/whatsapp/chatbot.js';
import { createGenerateCommand } from '../commands/whatsapp/generate.js';
import { createCoreCommands } from '../commands/whatsapp/core.js';
import { createHelpCommand } from '../commands/whatsapp/help.js';
import { createOwnerCommand } from '../commands/whatsapp/owner.js';
import { registerProviders } from '../ai/providers/index.js';

/**
 * Application factory for ONE WhatsApp session.
 *
 * Authority is EXCLUSIVELY configuration-driven: `ownerJids`/`sudoJids` come
 * from OWNER_JIDS / SUDO_JIDS (and from TELEGRAM_OWNER_ID by explicit wiring
 * in index.js when Telegram is enabled). There is deliberately no implicit,
 * hard-coded permanent owner number in this project.
 */
export function createNovaApplication({
  botJid,
  botLid,
  ownerJids = [],
  sudoJids = [],
  reply,
  sendMedia,
  imageProvider = null,
  videoProvider = null,
  storage = {},
  limiter,
  prefixes = ['.', '/'],
  botName = 'NOVA_VOID MDX',
  maxHistory = 40,
  trace,
  env = {},
}) {
  const sessions = new AISessionStore({
    maxMessages: Math.max(1, Number(maxHistory) || 40),
    dirPath: storage.sessionsDir,
  });
  const router = new AIRouter();
  const ai = new AIService({
    router,
    sessions,
    botName,
    identity: {
      creator: env.ownerName ?? 'King Val',
      ownerName: env.ownerName ?? 'King Val',
    },
  });
  const generation = new GenerationService({ imageProvider, videoProvider });

  if (env && Object.keys(env).length > 0) {
    registerProviders(router, generation, env);
  }

  const chatbot = new ChatbotState({ filePath: storage.chatbotStateFile });
  const app = new NovaApplication({
    botJid,
    botLid,
    ownerJids,
    sudoJids,
    ai,
    sessions,
    chatbot,
    send: reply,
    sendMedia,
    limiter: limiter ?? new RateLimiter({ windowMs: 15_000, max: 4 }),
    prefixes,
    botName,
    trace,
  });

  clearCommands();
  app.register(createCoreCommands({ app, botName, prefix: Array.isArray(prefixes) ? prefixes[0] : '.', env }));
  app.register(createAICommands({ ai, limiter: app.limiter, env }));
  app.register(createChatbotCommand({ state: app.chatbot }));
  app.register(createGenerateCommand({ generation }));
  app.register(createOwnerCommand({ env }));
  app.register(createHelpCommand({ botName, prefix: Array.isArray(prefixes) ? prefixes[0] : '.' }));
  return { app, router, sessions, ai, generation, chatbot };
}