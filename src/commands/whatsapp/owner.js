import * as wa from '../../ui/wa-style.js';

/** Builds a minimal valid vCard 3.0 blob for a contact message. */
export function buildVCard({ name = '', number = '', title = 'Owner & Developer' } = {}) {
  const cleanName = String(name).trim() || 'NOVA_VOID MDX Owner';
  const digits = String(number).replace(/\D/g, '').slice(0, 15);
  if (!digits) return null;
  const tokens = cleanName.split(/\s+/);
  const family = tokens.at(-1) ?? '';
  const given = tokens.slice(0, -1).join(' ');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${cleanName}`,
    `N:${family};${given};;;`,
    `TITLE:${title}`,
    `TEL;TYPE=CELL:+${digits}`,
    'END:VCARD',
  ].join('\n');
}

/**
 * `.owner` — publicly shares who owns NOVA_VOID MDX as a REAL WhatsApp
 * contact/vCard message, never a plain text card pretending to be one. The
 * displayed name and number are configured values (OWNER_NAME / OWNER_NUMBER)
 * and are never derived from an authority list or a hard-coded pin. Without a
 * configured number (or a media transport) the command degrades to an honest
 * styled summary card that says exactly what is missing.
 */
export function createOwnerCommand({ env = {} }) {
  const name = String(env.ownerName ?? 'NOVA_VOID MDX Owner');
  const number = String(env.ownerNumber ?? '');
  const bio = String(env.ownerBio ?? 'Owner & developer of NOVA_VOID MDX.');
  return {
    name: 'owner',
    category: 'general',
    role: 'user',
    usage: '.owner',
    description: 'Who owns and develops NOVA_VOID MDX (vCard contact).',
    async execute(ctx) {
      const vcard = buildVCard({ name, number });
      if (vcard && typeof ctx.sendMedia === 'function') {
        const caption = `👑 ${name} — Owner & Developer`;
        if (typeof ctx.reply === 'function') await ctx.reply(caption);
        return ctx.sendMedia({
          type: 'contact',
          displayName: name,
          vcard,
        });
      }
      // Honest text summary (no media transport, or no configured number).
      const lines = [
        wa.header(),
        '',
        '👑 *_BOT OWNER_*',
        '',
        wa.section('OWNER INFO'),
        wa.row('Name', name),
        wa.row('Number', number ? number.replace(/\D/g, '') : 'NOT SET — add OWNER_NUMBER'),
        wa.row('Role', 'Owner & Developer'),
        wa.sectionEnd(),
        '',
        bio,
        '',
        wa.footer(),
      ];
      return ctx.reply(lines.join('\n'));
    },
  };
}