import { listCommands } from '../../core/commands/registry.js';
import { getProviderStatus } from '../../ai/providers/index.js';
import { getBrandImage } from '../../core/brand-image.js';
import * as wa from '../../ui/wa-style.js';

// Defined display order — the menu is stable, never alphabetical.
const CATEGORY_ORDER = ['ai', 'general', 'fun', 'tools', 'media', 'search', 'group', 'core'];
const CATEGORY_LABELS = {
  ai: 'AI SYSTEM',
  general: 'GENERAL',
  fun: 'FUN',
  tools: 'TOOLS',
  media: 'MEDIA',
  search: 'SEARCH',
  group: 'GROUP ADMIN',
  core: 'SYSTEM',
};

function parseUsageArgs(usage = '') {
  // `.ai <question>` → `<question>`; plain `.ping` → ''
  return String(usage ?? '').replace(/^\.[a-z0-9_-]+/i, '').trim();
}

/**
 * Renders the command menu (Cypher-X panel) for the CURRENT prefix.
 * Category items are grouped below a small-caps brand header.
 */
function renderMenu(botName, prefix) {
  const commands = listCommands();
  const byCategory = new Map();
  for (const command of commands) {
    const category = command.category ?? 'misc';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(command);
  }
  const lines = [wa.menuTop(`${botName} ${wa.BOT_VERSION}`), ''];
  for (const category of CATEGORY_ORDER) {
    const items = byCategory.get(category);
    if (!items?.length) continue;
    lines.push(wa.menuCategory(CATEGORY_LABELS[category] ?? category.toUpperCase()));
    for (const item of items) {
      if (item.hidden) continue;
      const arg = parseUsageArgs(item.usage);
      const label = `${prefix}${wa.smallCaps(item.name)}${arg ? ` ${arg}` : ''}`;
      lines.push(wa.menuItem(`\`${label}\``));
    }
    lines.push('');
  }
  lines.push(wa.menuBottom(`*Prefix:* \`${prefix}\``));
  return lines.join('\n');
}

/** Sends image+text together when a brand image is available, else text only. */
async function replyWithBrandImage(ctx, caption) {
  const image = await getBrandImage();
  if (image && typeof ctx.sendMedia === 'function') {
    try {
      return ctx.sendMedia({ type: 'image', buffer: image, caption });
    } catch {
      return ctx.reply(caption);
    }
  }
  return ctx.reply(caption);
}

export function createCoreCommands({ app, botName = 'NOVA_VOID MDX', prefix = '.', env = {} }) {
  const effPrefix = () => (app?.settings?.prefix ?? prefix) || prefix;

  return [
    {
      name: 'ping',
      category: 'general',
      usage: '.ping',
      description: 'Quick alive/uptime check (brand image).',
      hidden: false,
      async execute(ctx) {
        const card = [
          wa.header(botName),
          '',
          '🟢 *_SYSTEM RESPONSE_*',
          '',
          `*_${botName}_* is *_alive_*.`,
          '',
          wa.section('STATUS'),
          wa.row('Uptime', formatUptime(process.uptime())),
          wa.row('Connection', 'ONLINE'),
          wa.row('Prefix', effPrefix()),
          wa.sectionEnd(),
          '',
          '⚡ `PONG`',
        ].join('\n');
        // .ping = brand image + the short status card ONLY (never the menu —
        // the menu has its own command).
        return replyWithBrandImage(ctx, card);
      },
    },
    {
      name: 'status',
      category: 'core',
      role: 'sudo',
      usage: '.status',
      description: 'Bot runtime status (owner/trusted).',
      async execute(ctx) {
        const chatbotOn = app.chatbot.isGlobal() || app.chatbot.list().length > 0 ? 'ON' : 'OFF';
        const lines = [
          wa.header(botName),
          '',
          '📡 *_SYSTEM STATUS_*',
          '',
          wa.section(botName),
          wa.row('Status', 'ONLINE'),
          wa.row('Owner', 'OWNER'),
          wa.row('Prefix', effPrefix()),
          wa.row('Commands', String(listCommands().length)),
          wa.row('Uptime', formatUptime(process.uptime())),
          wa.row('Chatbot', chatbotOn),
          wa.row('Memory', `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`),
          wa.sectionEnd(),
          '',
          wa.footer(botName),
        ];
        return replyWithBrandImage(ctx, lines.join('\n'));
      },
    },
    {
      name: 'menu',
      category: 'general',
      usage: '.menu',
      description: 'Brand image + full command list.',
      async execute(ctx) {
        return replyWithBrandImage(ctx, renderMenu(botName, effPrefix()));
      },
    },
    {
      name: 'about',
      category: 'general',
      usage: '.about',
      description: 'About NOVA_VOID MDX (version, creator, uptime).',
      async execute(ctx) {
        const lines = [
          wa.header(botName),
          '',
          'ℹ️ *_ABOUT_*',
          '',
          wa.section(botName),
          wa.row('Version', wa.BOT_VERSION),
          wa.row('Creator', env.ownerName ?? 'King Val'),
          wa.row('Uptime', formatUptime(process.uptime())),
          wa.row('Runtime', process.version),
          wa.sectionEnd(),
          '',
          '_Lightweight WhatsApp automation & AI system._',
          '',
          wa.footer(botName),
        ];
        return replyWithBrandImage(ctx, lines.join('\n'));
      },
    },
    {
      name: 'providers',
      aliases: ['ai-status'],
      category: 'core',
      role: 'owner',
      usage: '.providers',
      description: 'Check AI provider configuration and status.',
      async execute(ctx) {
        const status = getProviderStatus(env);
        const lines = [
          wa.header(botName),
          '',
          '🤖 *_AI PROVIDERS_*',
          '',
          wa.section('CONFIGURATION'),
        ];
        for (const [name, info] of Object.entries(status)) {
          const icon = info.configured ? '🟢' : '🔴';
          lines.push(wa.row(`${icon} ${name}`, info.configured ? 'ACTIVE' : 'NOT SET'));
        }
        lines.push(wa.sectionEnd());
        lines.push('');
        lines.push(wa.section('FAILOVER'));
        lines.push(wa.row('Order', 'Gemini → Groq → Zen → OpenRouter'));
        lines.push(wa.sectionEnd());
        lines.push('');
        lines.push(wa.footer(botName));
        return ctx.reply(lines.join('\n'));
      },
    },
  ];
}

function formatUptime(seconds) {
  const total = Math.floor(Number(seconds) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}