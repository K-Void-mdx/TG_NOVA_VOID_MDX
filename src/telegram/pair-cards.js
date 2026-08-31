import { smallCaps } from '../ui/wa-style.js';

/** Small-caps "PAIR" brand used in every pairing card. */
export const PAIR_TITLE = smallCaps('Pair Request');
export const PAIR_SUCCESS = smallCaps('Pairing Successful');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const RULE = '• • • • • • • • • • • • • • • • • • • • • • • •';

/**
 * Inline keyboard of a live pairing attempt. copy/status/cancel are all
 * Telegram-native; the raw code is also always rendered in an HTML <code>
 * block above the buttons so it is selectable/copyable regardless of client.
 */
export function pairingKeyboard(phone) {
  return {
    inline_keyboard: [
      [{ text: '📋 ᴄᴏᴘʏ ᴘᴀɪʀ ᴄᴏᴅᴇ', callback_data: `pair:${phone}:copy` }],
      [
        { text: '🔄 ᴄʜᴇᴄᴋ ꜱᴛᴀᴛᴜꜱ', callback_data: `pair:${phone}:status` },
        { text: '❌ ᴄᴀɴᴄᴇʟ', callback_data: `pair:${phone}:cancel` },
      ],
    ],
  };
}

/**
 * Builds the pairing card for a view state.
 *   { state: 'pending' }             → requesting the code
 *   { state: 'awaiting', code }      → code ready (2-minute window)
 *   { state: 'paired' }              → success
 *   { state: 'expired'|'cancelled'|'failed', reason? } → terminal states
 */
export function pairingCard({ phone, state = 'pending', code = null, secondsLeft = 0, reason = null, note = null } = {}) {
  const number = `<b>${escapeHtml(phone)}</b>`;

  if (state === 'paired') {
    return [
      `✅ <b>${PAIR_SUCCESS}</b>`,
      '',
      '📱 Number: ' + number,
      '🟢 ᴛᴇʟᴇɢʀᴀᴍ ʟɪɴᴋ ᴇꜱᴛᴀʙʟɪꜱʜᴇᴅ — ᴛʜɪꜱ ɴᴜᴍʙᴇʀ ɪꜱ ɴᴏᴡ ᴀ ɴᴏᴠᴀ_ᴠᴏɪᴅ ᴍᴅx ᴡʜᴀᴛꜱᴀᴘᴘ ꜱᴇꜱꜱɪᴏɴ.',
      '',
      'ꜱᴇᴇ ɪᴛ ᴡɪᴛʜ /pairs.',
    ].join('\n');
  }

  if (state === 'expired') {
    return [
      `⏱ <b>${smallCaps('Pairing Expired')}</b>`,
      '',
      '📱 Number: ' + number,
      '⚪ ᴛʜᴇ ᴄᴏᴅᴇ ᴡᴀꜱɴᴛ ᴇɴᴛᴇʀᴇᴅ ᴡɪᴛʜɪɴ ᴛʜᴇ 2-ᴍɪɴᴜᴛᴇ ᴡɪɴᴅᴏᴡ.',
      'ꜱɪᴍᴘʟʏ ᴜꜱᴇ /pair ᴀɢᴀɪɴ ᴡɪᴛʜ ᴛʜɪꜱ ɴᴜᴍʙᴇʀ ᴛᴏ ɢᴇᴛ ᴀ ꜰʀᴇꜱʜ ᴄᴏᴅᴇ.',
    ].join('\n');
  }

  if (state === 'cancelled') {
    return [
      `🚫 <b>${smallCaps('Pairing Cancelled')}</b>`,
      '',
      '📱 Number: ' + number,
      '⚪ ᴛʜᴇ ᴀᴛᴛᴇᴍᴘᴛ ᴡᴀꜱ ᴄᴀɴᴄᴇʟʟᴇᴅ. ɴᴏ ꜱᴇꜱꜱɪᴏɴ ᴡᴀꜱ ᴄʀᴇᴀᴛᴇᴅ.',
    ].join('\n');
  }

  if (state === 'failed') {
    return [
      `🔴 <b>${smallCaps('Pairing Failed')}</b>`,
      '',
      '📱 Number: ' + number,
      '⚪ ᴛʜᴇ ᴄᴏɴɴᴇᴄᴛɪᴏɴ ᴅʀᴏᴘᴘᴇᴅ ʙᴇꜰᴏʀᴇ ᴘᴀɪʀɪɴɢ ᴄᴏᴍᴘʟᴇᴛᴇᴅ.',
      ...(reason ? [`ꜰᴀɪʟᴜʀᴇ: <i>${escapeHtml(reason)}</i>`] : []),
      'ɴᴏ ᴀᴄᴄᴏᴜɴᴛ ᴡᴀꜱ ʟɪɴᴋᴇᴅ. ᴘʟᴇᴀꜱᴇ ᴛʀʏ /pair ᴀɢᴀɪɴ.',
    ].join('\n');
  }

  const body = [
    `⚡ <b>${PAIR_TITLE}</b>`,
    RULE,
    '',
    '📱 Number: ' + number,
  ];

  if (state === 'awaiting' && code) {
    body.push(
      '',
      `🟢 <b>${smallCaps('Pairing Code Ready')}</b>`,
      '',
      'ᴏᴘᴇɴ ᴡʜᴀᴛꜱᴀᴘᴘ → ꜱᴇᴛᴛɪɴɢꜱ → ʟɪɴᴋᴇᴅ ᴅᴇᴠɪᴄᴇꜱ → ʟɪɴᴋ ᴀ ᴅᴇᴠɪᴄᴇ → ' +
        'ʟɪɴᴋ ᴡɪᴛʜ ᴘʜᴏɴᴇ ɴᴜᴍʙᴇʀ ɪɴꜱᴛᴇᴀᴅ.',
      '',
      `<code>${escapeHtml(code)}</code>`,
      '',
      `⏱ ᴛʜɪꜱ ᴄᴏᴅᴇ ᴇxᴘɪʀᴇꜱ ɪɴ 2 ᴍɪɴᴜᴛᴇꜱ${secondsLeft ? ` (${secondsLeft}s)` : ''}.`,
      'ᴛʜɪꜱ ᴄᴀʀᴅ ᴜᴘᴅᴀᴛᴇꜱ ᴀᴜᴛᴏᴍᴀᴛɪᴄᴀʟʟʏ ᴏɴᴄᴇ ᴛʜᴇ ᴘʜᴏɴᴇ ʟɪɴᴋꜱ.',
    );
  } else {
    body.push(
      '',
      '🟡 ᴡᴀɪᴛɪɴɢ ᴛᴏ ᴇꜱᴛᴀʙʟɪꜱʜ ᴛʜᴇ ᴡʜᴀᴛꜱᴀᴘᴘ ᴄᴏɴɴᴇᴄᴛɪᴏɴ…',
      ...(note ? [escapeHtml(note)] : []),
      '',
      'ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ ᴡɪʟʟ ᴀᴘᴘᴇᴀʀ ʜᴇʀᴇ ɪɴ ᴀ ᴍᴏᴍᴇɴᴛ.',
    );
  }

  return body.join('\n');
}

/** Short toast for the CHECK STATUS button. */
export function pairingStatusToast(snapshot) {
  if (!snapshot) return 'No pairing or session found for this number.';
  if (snapshot.kind === 'open') return `${snapshot.phone}: online ✅`;
  if (snapshot.kind === 'pairing') {
    if (snapshot.code) {
      return `${snapshot.phone}: code ${snapshot.code} — ${snapshot.secondsLeft}s left`;
    }
    return `${snapshot.phone}: still requesting a code…`;
  }
  return `${snapshot.phone}: stored (${snapshot.state})`;
}