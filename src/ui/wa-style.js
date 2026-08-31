/**
 * Unified NOVA_VOID MDX WhatsApp message style.
 * WhatsApp formatting only (no ANSI): *_bold italic_*, *bold*, `mono`.
 */

export const BOT = 'NOVA_VOID MDX';
export const BOT_VERSION = 'v1.0';

const SMALL_CAPS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
  s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};

/** Converts ascii text to Unicode small-caps (whatsapp-friendly). */
export function smallCaps(text = '') {
  return String(text).replace(/[a-z]/gi, (ch) => SMALL_CAPS[ch.toLowerCase()] ?? ch);
}

/** Widest box rule so every card header has visually complete borders. */
const HEADER_WIDTH = 30;

/** ╔═══…╗ / ║  title  ║ / ╚═══…╝ balanced header block with the brand title. */
export function header(title = BOT) {
  const inner = `⚡ ${title} ⚡`;
  const pad = Math.max(0, HEADER_WIDTH - inner.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return [
    `╔${'═'.repeat(HEADER_WIDTH)}╗`,
    `║${' '.repeat(left)}${inner}${' '.repeat(right)}║`,
    `╚${'═'.repeat(HEADER_WIDTH)}╝`,
  ].join('\n');
}

/** Cypher-X style compact menu panel. */
export function menuTop(title = BOT) {
  return `╭─❒「 *${title}* 」`;
}

export function menuCategory(title) {
  return `├─❒ *${title}*`;
}

export function menuItem(text) {
  return `│  ❒ ${text}`;
}

export function menuBottom(text) {
  return `╰─❒ ${text}`;
}

/** ┌─〔 *_TITLE_* 〕 section opener. */
export function section(title) {
  return `┌─〔 *_${title}_* 〕`;
}

/** ├ *Label* : `value` row. */
export function row(label, value) {
  return `├ *${label}* : \`${value}\``;
}

/** └────────── closer. */
export function sectionEnd() {
  return '└──────────';
}

/** Standard system footer. */
export function footer(text = BOT) {
  return `⚡ *_${text}_*`;
}

/** ⚠️ access-restricted card for genuinely unauthorized users. */
export function accessDenied(command, requiredRole = 'OWNER') {
  return [
    `⚠️ *_ACCESS RESTRICTED_*`,
    '',
    'You do not have permission to use:',
    `\`.${smallCaps(command)}\``,
    '',
    section('ACCESS'),
    row('Required Role', requiredRole.toUpperCase()),
    sectionEnd(),
  ].join('\n');
}

/** 🛠️ clean failure card — never leaks internals to users. */
export function commandError(command) {
  return [
    `🛠️ *_COMMAND ERROR_*`,
    '',
    `\`.${smallCaps(command)}\` could not be completed.`,
    'Please try again in a moment.',
  ].join('\n');
}

/**
 * 🧠 AI-not-configured card (honest offline guidance). There is no hidden
 * knowledge fallback: either a provider answers or the bot says the truth.
 */
export function aiNotConfigured() {
  return [
    `🧠 *_AI NOT CONFIGURED_*`,
    '',
    'No external AI provider is connected yet.',
    'Add a provider key to .env and restart to enable AI replies.',
    '',
    footer(),
  ].join('\n');
}

/** ⚠️ rate-limit notice for chatbot flooding. */
export function rateLimited() {
  return [
    `⚠️ *_SLOW DOWN_*`,
    '',
    'You are messaging NOVA_VOID too quickly.',
    '',
    section('STATUS'),
    row('Status', 'COOLDOWN'),
    sectionEnd(),
  ].join('\n');
}
