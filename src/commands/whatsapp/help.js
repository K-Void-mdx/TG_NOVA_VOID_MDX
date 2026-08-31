import { getCommand, listCommands } from '../../core/commands/registry.js';
import * as wa from '../../ui/wa-style.js';

const sc = wa.smallCaps;

const CATEGORY_ORDER = ['ai', 'general', 'core'];
const CATEGORY_LABELS = { ai: 'AI SYSTEM', general: 'GENERAL', core: 'SYSTEM' };

/**
 * Real help system — deliberately separate from the command-only menu.
 * `.help` → registry-driven overview (small-caps command + description each);
 * `.help <command>` → detailed usage (aliases resolved).
 */
export function createHelpCommand({ botName = wa.BOT, prefix = '.' } = {}) {
  return {
    name: 'help',
    aliases: ['man'],
    category: 'general',
    usage: '.help [command]',
    description: 'Detailed usage for a command (use .help <command>).',
    async execute(ctx) {
      const target = ctx.args?.[0];
      if (!target) {
        const byCategory = new Map();
        for (const command of listCommands()) {
          const category = command.category ?? 'misc';
          if (!byCategory.has(category)) byCategory.set(category, []);
          byCategory.get(category).push(command);
        }
        const lines = [
          wa.header(botName),
          '',
          '💡 *_HELP SYSTEM_*',
          '',
          `Use \`${prefix}${sc('help')} <command>\` for detailed usage.`,
          '',
          wa.section('COMMANDS'),
        ];
        for (const category of CATEGORY_ORDER) {
          const items = byCategory.get(category);
          if (!items?.length) continue;
          lines.push(`├ *${CATEGORY_LABELS[category] ?? category.toUpperCase()}*`);
          for (const item of items) {
            const name = `${prefix}${sc(item.name)}`;
            lines.push(`│  ❒ ${name} — ${item.description ?? ''}`.trimEnd());
          }
        }
        lines.push(wa.sectionEnd());
        lines.push('');
        lines.push(`Example: \`${prefix}${sc('help')} ${sc('ai')}\``);
        lines.push('');
        lines.push(wa.footer(botName));
        return ctx.reply(lines.join('\n'));
      }

      const command = getCommand(target);
      if (!command) {
        return ctx.reply(
          [
            wa.header(botName),
            '',
            '❓ *_COMMAND NOT FOUND_*',
            '',
            `\`${prefix}${sc(target)}\` is not a registered command.`,
            '',
            wa.section('NEXT STEP'),
            wa.row('Menu', `${prefix}${sc('menu')}`),
            wa.sectionEnd(),
            '',
            wa.footer(botName),
          ].join('\n')
        );
      }

      const aliases = command.aliases?.length ? command.aliases.map(sc).join(', ') : '—';
      const role = (command.role ?? 'user').toUpperCase();
      return ctx.reply(
        [
          wa.header(botName),
          '',
          `🛠️ *_COMMAND_* \`${prefix}${sc(command.name)}\``,
          '',
          wa.section('DETAILS'),
          wa.row('Category', command.category ?? 'misc'),
          wa.row('Usage', command.usage ?? `${prefix}${command.name}`),
          wa.row('Role', role),
          wa.row('Aliases', aliases),
          wa.sectionEnd(),
          '',
          command.description ? `_${command.description}_` : '',
          '',
          wa.footer(botName),
        ].join('\n')
      );
    },
  };
}