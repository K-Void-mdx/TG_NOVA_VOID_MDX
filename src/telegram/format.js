/**
 * WhatsApp-style → Telegram HTML conversion.
 *
 * NOVA_VOID's shared reply renderer produces WhatsApp markup
 *   *bold*   _italic_   `mono`   *_bold italic_*
 * plus Unicode small-caps, box-drawing, and emoji. Telegram renders HTML via
 * parse_mode, so styled text is converted; RAW code parts are deliberately
 * NEVER passed through this function (they ship as plain no-parse-mode text).
 */

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Matches one WhatsApp span: code, bold (may contain an inner _italic_ label),
// or italic. Inner bold/italic tokens never nest deeper than this in the
// shared renderer, and code wins over the rest via alternation order.
const SPAN = /(`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

/** Renders one matched span to its Telegram HTML counterpart. */
function renderSpan(token) {
  const first = token[0];
  const inner = token.slice(1, -1);
  if (first === '`') return `<code>${escapeHtml(inner)}</code>`;
  const content = escapeHtml(inner);
  if (first === '_') return `<i>${content}</i>`;
  // bold — an italic-wrapped label (*_TITLE_*) becomes bold-italic
  const italic = /^_([^_]*)_$/.exec(inner);
  if (italic) return `<b><i>${escapeHtml(italic[1])}</i></b>`;
  return `<b>${content}</b>`;
}

/**
 * Converts a WhatsApp-styled string into valid Telegram parse_mode HTML.
 * Always produces well-formed HTML (all entities escaped) so the API never
 * rejects a message for malformed markup.
 */
export function waToTelegramHtml(text = '') {
  return String(text)
    .split(SPAN)
    .map((segment) => (SEGMENT_PATTERN.test(segment) ? renderSpan(segment) : escapeHtml(segment)))
    .join('');
}

const SEGMENT_PATTERN = /^(`[^`\n]+`$|\*[^*\n]+\*$|_[^_\n]+_$)/;

/** Splits a reply into { format } hints — raw stays untouched, styled converts. */
export function telegramTextPayload(text = '', format = 'wa-style') {
  if (format === 'raw') return { text: String(text) };
  return { text: waToTelegramHtml(String(text)), parse_mode: 'HTML' };
}

/** Creates the t.me link for a chat username ("@nova_void_updates77"). */
export function telegramChatUrl(username = '') {
  const clean = String(username ?? '').trim().replace(/^@/, '');
  return clean ? `https://t.me/${clean}` : '';
}

/** Inline keyboard for the membership gate welcome card. */
export function gateKeyboard({ channelUrl, groupUrl, ownerUrl }) {
  return {
    inline_keyboard: [
      [
        { text: 'ᴊᴏɪɴ ᴄʜᴀɴɴᴇʟ', url: channelUrl },
        { text: 'ᴊᴏɪɴ ɢʀᴏᴜᴘ', url: groupUrl },
      ],
      [{ text: '✓ ᴄʜᴇᴄᴋ ᴍᴇᴍʙᴇʀꜱʜɪᴘ', callback_data: 'verify' }],
      ...(ownerUrl ? [[{ text: 'ᴏᴡɴᴇʀ', url: ownerUrl }]] : []),
    ],
  };
}

/** Inline URL keyboard attached to .menu / .help replies on Telegram. */
export function menuKeyboard({ channelUrl, groupUrl, ownerUrl }) {
  return {
    inline_keyboard: [
      [
        { text: '📣 ᴄʜᴀɴɴᴇʟ', url: channelUrl },
        { text: '💬 ɢʀᴏᴜᴘ', url: groupUrl },
      ],
      ...(ownerUrl ? [[{ text: '👑 ᴏᴡɴᴇʀ', url: ownerUrl }]] : []),
    ],
  };
}

/** The /start welcome card — small-caps bars, never in italic. */
export function welcomeCard({ botName = 'NOVA_VOID MDX' } = {}) {
  return [
    `<b>ᴡᴇʟᴄᴏᴍᴇ ᴛᴏ ${escapeHtml(botName)}</b> 🚀`,
    '',
    'ᴊᴏɪɴ ᴛʜᴇ ᴄʜᴀɴɴᴇʟ ᴀɴᴅ ɢʀᴏᴜᴘ, ᴛʜᴇɴ ᴘʀᴇꜱꜱ ✓ ᴄʜᴇᴄᴋ ᴍᴇᴍʙᴇʀꜱʜɪᴘ ᴛᴏ ᴜɴʟᴏᴄᴋ ᴄᴏᴍᴍᴀɴᴅꜱ.',
    '',
    'ꜱᴇɴᴅ /help ꜰᴏʀ ᴛʜᴇ ꜰᴜʟʟ ᴄᴏᴍᴍᴀɴᴅ ʟɪꜱᴛ.',
  ].join('\n');
}

/** Verified card — shown after a successful membership re-check. */
export function verifiedCard() {
  return '✅ <b>ᴠᴇʀɪꜰɪᴇᴅ — ᴄᴏᴍᴍᴀɴᴅꜱ ᴜɴʟᴏᴄᴋᴇᴅ</b>';
}

/** Command menu card — what a verified user sees. Lists every Telegram command. */
export function menuPanelCard({ botName = 'NOVA_VOID MDX', commands = [] } = {}) {
  const lines = [
    `<b>⚡ ${escapeHtml(botName)}</b> ᴄᴏɴᴛʀᴏʟ ᴘᴀɴᴇʟ`,
    '',
    '✅ ᴠᴇʀɪꜰɪᴇᴅ — ᴄᴏᴍᴍᴀɴᴅꜱ ᴜɴʟᴏᴄᴋᴇᴅ',
    '',
  ];
  for (const command of commands) {
    lines.push(`┊ <code>${escapeHtml(command)}</code>`);
  }
  lines.push('', 'ᴛᴀᴘ ᴀ ᴄᴏᴍᴍᴀɴᴅ ᴏʀ ᴜꜱᴇ /help ꜰᴏʀ ᴅᴇᴛᴀɪʟꜱ.');
  return lines.join('\n');
}

/** Missing-target card — honest about exactly what is still required. */
export function missingTargetsCard(missing = []) {
  const targets = [...new Set(missing)].map((t) => escapeHtml(String(t))).join(', ');
  return [
    '🚫 <b>ɴᴏᴛ ᴠᴇʀɪꜰɪᴇᴅ ʏᴇᴛ</b>',
    '',
    'ꜱᴛɪʟʟ ʀᴇǫᴜɪʀᴇᴅ:',
    targets || '—',
    '',
    'ᴊᴏɪɴ ᴛʜᴇ ᴄʜᴀɴɴᴇʟ/ɢʀᴏᴜᴘ, ᴛʜᴇɴ ᴘʀᴇꜱꜱ ✓ ᴄʜᴇᴄᴋ ᴍᴇᴍʙᴇʀꜱʜɪᴘ.',
  ].join('\n');
}
