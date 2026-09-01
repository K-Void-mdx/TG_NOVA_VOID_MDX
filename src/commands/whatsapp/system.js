import * as wa from '../../ui/wa-style.js';
import { normalizeJid } from '../../core/permissions/roles.js';

const sc = wa.smallCaps;

function usageCard(command, usage) {
  return ['⚠️ *_USAGE_*', '', '`.' + sc(command) + ' ' + usage + '`', '', wa.footer()].join('\n');
}

function okCard(title, lines) {
  return [wa.header(), '', title, '', ...lines, '', wa.footer()].join('\n');
}

/**
 * Runtime system commands: .setprefix, .addsudo/.delsudo/.listsudo, .restart.
 * All are OWNER-only (the operator). .restart re-executes the process so a
 * live phone session never needs a manual Termux restart.
 */
export function createSystemCommands({ app }) {
  return [
    {
      name: 'setprefix',
      category: 'core',
      role: 'owner',
      usage: '.setprefix <symbol>',
      description: 'Change the command prefix (e.g. .  →  !).',
      async execute(ctx) {
        const symbol = String(ctx.args?.[0] ?? '').trim();
        if (!symbol) return ctx.reply(usageCard('setprefix', '<symbol>'));
        if (/[a-z0-9]/i.test(symbol)) {
          return ctx.reply(okCard('⚠️ *_INVALID PREFIX_*', ['Prefix must be a symbol, not a letter or number.', '', wa.row('Swallowed', '❌')]));
        }
        const ok = app.settings?.setPrefix(symbol);
        return ctx.reply(okCard('✅ *_PREFIX UPDATED_*', [wa.row('New Prefix', symbol)]));
      },
    },
    {
      name: 'addsudo',
      category: 'core',
      role: 'owner',
      usage: '.addsudo @user|number',
      description: 'Grant bot-admin (sudo) access to a trusted user.',
      async execute(ctx) {
        const target = String(ctx.args?.[0] ?? '').trim();
        if (!target) return ctx.reply(usageCard('addsudo', '@user|number'));
        const jid = normalizeJid(target);
        app.settings?.addSudo(jid);
        return ctx.reply(okCard('✅ *_SUDO ADDED_*', [wa.row('JID', jid)]));
      },
    },
    {
      name: 'delsudo',
      category: 'core',
      role: 'owner',
      usage: '.delsudo @user|number',
      description: 'Revoke bot-admin (sudo) access from a trusted user.',
      async execute(ctx) {
        const target = String(ctx.args?.[0] ?? '').trim();
        if (!target) return ctx.reply(usageCard('delsudo', '@user|number'));
        const jid = normalizeJid(target);
        app.settings?.delSudo(jid);
        return ctx.reply(okCard('✅ *_SUDO REMOVED_*', [wa.row('JID', jid)]));
      },
    },
    {
      name: 'listsudo',
      category: 'core',
      role: 'owner',
      usage: '.listsudo',
      description: 'List every trusted (sudo) WhatsApp user.',
      async execute(ctx) {
        const staticSudo = app.sudoJids ?? [];
        const dynamic = app.settings?.sudoJids ?? [];
        const all = [...new Set([...staticSudo, ...dynamic])];
        const body = all.length
          ? all.map((jid) => wa.row('JID', jid)).join('\n')
          : '├ ❒ *None yet*';
        return ctx.reply([wa.header(), '', '🔐 *_TRUSTED USERS (SUDO)_*', '', body, wa.sectionEnd(), '', wa.footer()].join('\n'));
      },
    },
    {
      name: 'restart',
      aliases: ['reboot'],
      category: 'core',
      role: 'owner',
      usage: '.restart',
      description: 'Restart the bot process (owner only).',
      async execute(ctx) {
        await ctx.reply(okCard('🔄 *_RESTARTING_*', ['NOVA_VOID MDX is restarting…', '', 'The WhatsApp session will reconnect automatically.']));
        // Give the reply a moment to flush, then re-exec the process.
        setTimeout(() => {
          process.exit(0);
        }, 800);
      },
    },
  ];
}