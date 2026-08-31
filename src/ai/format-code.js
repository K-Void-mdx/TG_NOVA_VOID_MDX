/**
 * Shared AI answer renderer for NOVA_VOID MDX.
 *
 * One answer is split into ORDERED, sendable WhatsApp messages:
 *   - prose parts  → styled with Unicode small-caps + WhatsApp italic
 *   - fenced code  → plain RAW text, exactly as written (indentation, quotes,
 *                    tabs, blank lines and comments survive untouched)
 *
 * Smoke policy: a code message is ordinary copyable chat text. It carries NO
 * Markdown fences, NO backtick mono-wrapping, NO box dividers, NO document and
 * NO interactive button — the code is the message, verbatim.
 */

const SMALL_CAPS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
  s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};

/** Letters only (either case) — digits, punctuation and emoji are preserved. */
function toSmallCaps(text = '') {
  return String(text).replace(/[a-z]/gi, (ch) => SMALL_CAPS[ch.toLowerCase()] ?? ch);
}

/**
 * Inline `code` spans and URLs are PROTECTED from styling: small-caps would
 * corrupt URLs and backtick spans must stay byte-identical for WhatsApp mono.
 */
function styleLine(line = '') {
  const protectedSpan = /(https?:\/\/\S+|`[^`\n]+`)/g;
  // split() yields alternating [text, protected, text, protected…]; a segment
  // is kept verbatim when it is a URL or a backtick span.
  return String(line)
    .split(protectedSpan)
    .map((segment) => {
      if (!segment) return '';
      if (segment.startsWith('http') || segment.startsWith('`')) return segment;
      return toSmallCaps(segment);
    })
    .join('');
}

/**
 * Styles one AI prose line: Unicode small-caps plus WhatsApp italic wrapping.
 * Italic is skipped when the line already carries `*`/`_`/backticks, so the
 * model's own bold or inline-code formatting is never corrupted. URLs and
 * backtick spans are left untouched inside the styled text.
 */
export function applyAiProseStyle(text = '') {
  const source = String(text ?? '');
  return source
    .split('\n')
    .map((line) => {
      if (!line.trim()) return '';
      const styled = styleLine(line);
      if (/[*_`]/.test(line)) return styled;
      return `_${styled}_`;
    })
    .join('\n');
}

/** Matches a Markdown/telegram fence opener or closer (```  or ~~~). */
const FENCE = /^\s*(?:```+|~~~+)\s*([^\s]*)\s*$/;

/**
 * Splits a raw AI answer into ordered send-ready parts:
 *   - {@type:'text', content} styled prose (small-caps + italic)
 *   - {@type:'code', content} raw code, trailing whitespace trimmed only
 * Fence markers are consumed and never leak into any message. Adjacent prose
 * is merged. Returns an empty array for empty/unrenderable input.
 */
export function buildAnswerParts(text = '') {
  const source = String(text ?? '');
  const lines = source.split('\n');
  const parts = [];
  let prose = [];
  let inFence = false;
  let buffer = [];

  const flushProse = () => {
    const raw = prose.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    prose = [];
    if (!raw) return;
    const last = parts.at(-1);
    if (last?.type === 'text') {
      // Merge adjacent prose paragraphs into one styled text message.
      const merged = `${last.content}\n\n${applyAiProseStyle(raw)}`;
      parts[parts.length - 1] = { type: 'text', content: merged };
      return;
    }
    parts.push({ type: 'text', content: applyAiProseStyle(raw) });
  };
  const flushCode = () => {
    const code = buffer.join('\n').replace(/\s+$/, '');
    buffer = [];
    if (code.trim()) parts.push({ type: 'code', content: code });
  };

  for (const raw of lines) {
    if (FENCE.test(raw)) {
      if (!inFence) {
        flushProse();
        inFence = true;
        buffer = [];
      } else {
        inFence = false;
        flushCode();
      }
      continue;
    }
    if (inFence) {
      buffer.push(raw);
      continue;
    }
    prose.push(raw);
  }
  flushProse();
  flushCode();

  return parts;
}