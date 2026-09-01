import * as wa from '../../ui/wa-style.js';

const sc = wa.smallCaps;

function usageCard(cmd, usage) {
  return ['⚠️ *_USAGE_*', '', '`.' + sc(cmd) + ' ' + usage + '`', '', wa.footer()].join('\n');
}

function card(title, body) {
  return [wa.header(), '', title, '', body, '', wa.footer()].join('\n');
}

/**
 * Group administration — sudo or the group admin themselves. Every verb
 * requires the bot's OWN account to be a group admin; failures are surfaced
 * honestly. Purely guard-based: a sudo user acts only on chats they belong to.
 */
export function createGroupCommands({ app }) {
  const group = () => app?.group;

  const verbs = {
    promote: { usage: '.promote <@user>', title: 'PROMOTE', run: (g, jid, who) => g.promote(jid, who) },
    demote: { usage: '.demote <@user>', title: 'DEMOTE', run: (g, jid, who) => g.demote(jid, who) },
    kick: { usage: '.kick <@user>', title: 'KICK', run: (g, jid, who) => g.kick(jid, who) },
  };

  return [
    {
      name: 'link',
      category: 'group',
      role: 'sudo',
      usage: '.link',
      description: 'Get the group invite link.',
      async execute(ctx) {
        const g = group();
        if (!g) return ctx.reply(card('⚠️ *_GROUP API UNAVAILABLE_*', 'This command works only on WhatsApp groups.'));
        try {
          const code = await g.link(ctx.chatJid);
          return ctx.reply(card('🔗 *_GROUP LINK_*', `_https://chat.whatsapp.com/${code}_`));
        } catch {
          return ctx.reply(card('⚠️ *_LINK FAILED_*', 'Could not get the invite link (is the bot a group admin?).'));
        }
      },
    },
    {
      name: 'revoke',
      category: 'group',
      role: 'sudo',
      usage: '.revoke',
      description: 'Revoke and regenerate the group invite link.',
      async execute(ctx) {
        const g = group();
        if (!g) return ctx.reply(card('⚠️ *_GROUP API UNAVAILABLE_*', 'This command works only on WhatsApp groups.'));
        try {
          const code = await g.revoke(ctx.chatJid);
          return ctx.reply(card('🔁 *_LINK REVOKED_*', `New link:\n\n_https://chat.whatsapp.com/${code}_`));
        } catch {
          return ctx.reply(card('⚠️ *_REVOKE FAILED_*', 'Could not revoke the link (is the bot a group admin?).'));
        }
      },
    },
    {
      name: 'group',
      category: 'group',
      role: 'sudo',
      usage: '.group open|close',
      description: 'Open or close the group to non-admin chat.',
      async execute(ctx) {
        const mode = String(ctx.args?.[0] ?? '').toLowerCase();
        const g = group();
        if (!g) return ctx.reply(card('⚠️ *_GROUP API UNAVAILABLE_*', 'This command works only on WhatsApp groups.'));
        if (!['open', 'close'].includes(mode)) return ctx.reply(usageCard('group', 'open|close'));
        try {
          await g.setOpen(ctx.chatJid, mode === 'open');
          return ctx.reply(card(mode === 'open' ? '🔓 *_GROUP OPENED_*' : '🔒 *_GROUP CLOSED_*', `Members may ${mode === 'open' ? 'now' : 'no longer'} chat freely.`));
        } catch {
          return ctx.reply(card('⚠️ *_FAILED_*', 'Could not update the group (is the bot a group admin?).'));
        }
      },
    },
    {
      name: 'tagall',
      category: 'group',
      role: 'sudo',
      usage: '.tagall <message>',
      description: 'Mention all group members with a message.',
      async execute(ctx) {
        const g = group();
        if (!g) return ctx.reply(card('⚠️ *_GROUP API UNAVAILABLE_*', 'This command works only on WhatsApp groups.'));
        try {
          const participants = await g.participants(ctx.chatJid);
          const jids = participants.map((p) => p.id).filter(Boolean);
          const text = `👥 ${ctx.argsText || '@everyone'}\n\n${jids.map((j) => `@${j.split('@')[0]}`).join('  ')}`;
          return ctx.reply(`${text}`);
        } catch {
          return ctx.reply(card('⚠️ *_TAGALL FAILED_*', 'Could not fetch group members.'));
        }
      },
    },
    ...Object.entries(verbs).map(([name, spec]) => ({
      name,
      category: 'group',
      role: 'sudo',
      usage: spec.usage,
      description: `${name === 'promote' ? 'Make' : name === 'demote' ? 'Remove as' : 'Remove'} a group admin/user (${name}).`,
      async execute(ctx) {
        const target = String(ctx.args?.[0] ?? '').trim();
        if (!target) return ctx.reply(usageCard(name, spec.usage));
        const g = group();
        if (!g) return ctx.reply(card('⚠️ *_GROUP API UNAVAILABLE_*', 'This command works only on WhatsApp groups.'));
        const who = target.includes('@') ? target : `${target}@s.whatsapp.net`;
        try {
          await spec.run(g, ctx.chatJid, who);
          return ctx.reply(card(`✅ *_${spec.title}_*`, wa.row('User', who)));
        } catch {
          return ctx.reply(card('⚠️ *_FAILED_*', `Could not ${name} that user (is the bot a group admin?).`));
        }
      },
    })),
  ];
}