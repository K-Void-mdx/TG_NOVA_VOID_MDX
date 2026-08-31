import { listCommands } from '../../core/commands/registry.js';
import { getProviderStatus } from '../../ai/providers/index.js';
import * as wa from '../../ui/wa-style.js';

// Defined display order — the menu is stable, never alphabetical.
const CATEGORY_ORDER = ['ai', 'general', 'core'];
const CATEGORY_LABELS = { ai: 'AI SYSTEM', general: 'GENERAL', core: 'SYSTEM' };

function parseUsageArgs(usage = '') {
  // `.ai <question>` → `<question>`; plain `.ping` → ''
  return String(usage ?? '').replace(/^\.[a-z0-9_-]+/i, '').trim();
}

export function createCoreCommands({ app, botName = 'NOVA_VOID MDX', prefix = '.', env = {} }) {
  return [
    {
      name: 'ping',
      category: 'general',
      description: 'Check that the bot is alive.',
      async execute(ctx) {
        const uptime = formatUptime(process.uptime());
        return ctx.reply(
          [
            wa.header(botName),
            '',
            '🟢 *_SYSTEM RESPONSE_*',
            '',
            `*_${botName}_* is *_alive_*.`,
            '',
            wa.section('STATUS'),
            wa.row('Uptime', uptime),
            wa.row('Connection', 'ONLINE'),
            wa.sectionEnd(),
            '',
            '⚡ `PONG`',
          ].join('\n')
        );
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
          wa.row('Prefix', prefix),
          wa.row('Commands', String(listCommands().length)),
          wa.row('Uptime', formatUptime(process.uptime())),
          wa.row('Chatbot', chatbotOn),
          wa.row('Memory', `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`),
          wa.sectionEnd(),
          '',
          wa.footer(botName),
        ];
        return ctx.reply(lines.join('\n'));
      },
    },
    {
      name: 'menu',
      category: 'general',
      description: 'List available commands by category.',
      async execute(ctx) {
        const commands = listCommands();
        const byCategory = new Map();
        for (const command of commands) {
          const category = command.category ?? 'misc';
          if (!byCategory.has(category)) byCategory.set(category, []);
          byCategory.get(category).push(command);
        }
        // Cypher-style menu panel: straight single border, ❒ markers,
        // small-caps command names — NO descriptions (.help carries detail).
        const lines = [wa.menuTop(`${botName} ${wa.BOT_VERSION}`), ''];
        for (const category of CATEGORY_ORDER) {
          const items = byCategory.get(category);
          if (!items?.length) continue;
          lines.push(wa.menuCategory(CATEGORY_LABELS[category] ?? category.toUpperCase()));
          for (const item of items) {
            const arg = parseUsageArgs(item.usage);
            const label = `${prefix}${wa.smallCaps(item.name)}${arg ? ` ${arg}` : ''}`;
            lines.push(wa.menuItem(`\`${label}\``));
          }
          lines.push('');
        }
        lines.push(wa.menuBottom(`*Prefix:* \`${prefix}\``));
        return ctx.reply(lines.join('\n'));
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