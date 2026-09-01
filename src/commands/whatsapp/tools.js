import * as wa from '../../ui/wa-style.js';

const sc = wa.smallCaps;

function usageCard(cmd, usage) {
  return ['⚠️ *_USAGE_*', '', '`.' + sc(cmd) + ' ' + usage + '`', '', wa.footer()].join('\n');
}

function card(title, body) {
  return [wa.header(), '', title, '', body, '', wa.footer()].join('\n');
}

/**
 * Lightweight text-only tools. No heavy native deps — everything runs on the
 * standard library (calc), free text APIs (weather/time), or these are honest
 * "needs X" cards for QR/QR-read that depend on optional packages.
 */

// QR generation via the free api.qrserver.com image endpoint — zero deps.
async function qrPng(text) {
  const res = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf?.length ? buf : null;
}

// QR decoding via the free api.qrserver.com read endpoint — zero deps.
async function decodeQr(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  const body = new FormData();
  body.append('file', new Blob([buffer]), 'qr.png');
  const res = await fetch('https://api.qrserver.com/v1/read-qr-code/', { method: 'POST', body });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const raw = json?.[0]?.symbol?.[0]?.data;
  return typeof raw === 'string' && raw ? raw : null;
}

// Zero-dep timezone lookup: IANA zones work natively via Intl, cities map to
// their zone below. No network, no API key, always answers.
const CITY_ZONES = {
  'lagos': 'Africa/Lagos', 'abuja': 'Africa/Lagos', 'benin city': 'Africa/Lagos',
  'port harcourt': 'Africa/Lagos', 'kano': 'Africa/Lagos', 'ibadan': 'Africa/Lagos',
  'accra': 'Africa/Accra', 'nairobi': 'Africa/Nairobi', 'johannesburg': 'Africa/Johannesburg',
  'cairo': 'Africa/Cairo', 'casablanca': 'Africa/Casablanca', 'addis ababa': 'Africa/Addis_Ababa',
  'london': 'Europe/London', 'paris': 'Europe/Paris', 'berlin': 'Europe/Berlin',
  'madrid': 'Europe/Madrid', 'rome': 'Europe/Rome', 'amsterdam': 'Europe/Amsterdam',
  'moscow': 'Europe/Moscow', 'istanbul': 'Europe/Istanbul', 'dubai': 'Asia/Dubai',
  'doha': 'Asia/Qatar', 'riyadh': 'Asia/Riyadh', 'tehran': 'Asia/Tehran',
  'karachi': 'Asia/Karachi', 'delhi': 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata',
  'mumbai': 'Asia/Kolkata', 'dhaka': 'Asia/Dhaka', 'bangkok': 'Asia/Bangkok',
  'jakarta': 'Asia/Jakarta', 'singapore': 'Asia/Singapore', 'hong kong': 'Asia/Hong_Kong',
  'shanghai': 'Asia/Shanghai', 'beijing': 'Asia/Shanghai', 'tokyo': 'Asia/Tokyo',
  'seoul': 'Asia/Seoul', 'manila': 'Asia/Manila', 'sydney': 'Australia/Sydney',
  'melbourne': 'Australia/Melbourne', 'auckland': 'Pacific/Auckland',
  'new york': 'America/New_York', 'washington': 'America/New_York', 'toronto': 'America/Toronto',
  'chicago': 'America/Chicago', 'dallas': 'America/Chicago', 'miami': 'America/New_York',
  'los angeles': 'America/Los_Angeles', 'las vegas': 'America/Los_Angeles',
  'denver': 'America/Denver', 'sao paulo': 'America/Sao_Paulo', 'rio': 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires', 'mexico city': 'America/Mexico_City',
  'lagos island': 'Africa/Lagos',
};

function isValidZone(value) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function resolveZone(place) {
  const key = String(place ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  // 1. Pass through valid full IANA zones (e.g. "Africa/Lagos", "UTC+2" handled below).
  if (key.includes('/')) return isValidZone(key) ? key : null;
  // 2. UTC offsets like "UTC+1", "utc-5", "gmt+3".
  const utc = key.replace(/\s/g, '').match(/^(?:utc|gmt)([+-]?\d{1,2})$/i);
  if (utc) {
    const zone = `Etc/GMT${utc[1].startsWith('-') ? '+' : '-'}${Math.abs(Number(utc[1]))}`;
    return isValidZone(zone) ? zone : null;
  }
  // 3. Exact city/alias hit.
  if (CITY_ZONES[key]) return CITY_ZONES[key];
  // 4. Fuzzy — leading token ("new york" contains "york", "dubai" contains anything of it).
  const entry = Object.entries(CITY_ZONES).find(([city]) => key.includes(city) || city.includes(key));
  return entry ? entry[1] : null;
}

function formatZoneTime(zone) {
  const now = new Date();
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(now);
  const offsetPart = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? '';
  return { time, offset: offsetPart.replace(/GMT/g, 'GMT ') || 'UTC' };
}

export function createToolCommands() {
  return [
    {
      name: 'calc',
      category: 'tools',
      usage: '.calc <expression>',
      description: 'Evaluate a math expression (e.g. .calc 2+2).',
      async execute(ctx) {
        const expression = String(ctx.argsText ?? '').trim();
        if (!expression) return ctx.reply(usageCard('calc', '<expression>'));
        let result;
        try {
          // Safe arithmetic only — reject anything that could inject code.
          if (!/^[\d\s+\-*/().%^,]+$/.test(expression.replace(/\^/g, '**').replace(/,/g, ''))) {
            return ctx.reply(card('⚠️ *_INVALID EXPRESSION_*', 'Only numbers and basic operators ( + - * / % ^ ) are allowed.'));
          }
          // eslint-disable-next-line no-new-func
          result = Function(`'use strict'; return (${expression.replace(/\^/g, '**')})`)();
        } catch {
          return ctx.reply(card('⚠️ *_INVALID EXPRESSION_*', 'Could not evaluate that.'));
        }
        return ctx.reply(card('🧮 *_CALCULATOR_*', wa.row('Expression', expression) + '\n' + wa.row('Result', String(result))));
      },
    },
    {
      name: 'qr',
      category: 'tools',
      usage: '.qr <text>',
      description: 'Generate a QR code from text/link.',
      async execute(ctx) {
        const text = String(ctx.argsText ?? '').trim();
        if (!text) return ctx.reply(usageCard('qr', '<text>'));
        const png = await qrPng(text);
        if (png && typeof ctx.sendMedia === 'function') {
          return ctx.sendMedia({ type: 'image', buffer: png, caption: `${sc('qr')} — ${text}` });
        }
        return ctx.reply(card('⚠️ *_QR UNAVAILABLE_*', 'Could not reach the QR service. Try again later.'));
      },
    },
    {
      name: 'readqr',
      category: 'tools',
      usage: '.readqr <reply to QR image>',
      description: 'Decode a QR code image.',
      async execute(ctx) {
        // The QR lives in the message the user replied to.
        const raw = ctx.message?.raw;
        const message = raw?.message ?? raw;
        const context = message?.extendedTextMessage?.contextInfo ?? message?.contextInfo ?? {};
        const imageMessage = context?.quotedMessage?.imageMessage;
        if (!imageMessage) {
          return ctx.reply(card('⚠️ *_USAGE_*', `*Reply to a QR code image* with \`.${sc('readqr')}\`.`));
        }
        if (typeof ctx.download !== 'function') {
          return ctx.reply(card('⚠️ *_READQR UNAVAILABLE_*', 'Media download is not available on this transport.'));
        }
        try {
          const bytes = await ctx.download({ key: raw.key, message: { imageMessage } });
          if (!bytes?.length) throw new Error('no bytes');
          const decoded = await decodeQr(Buffer.from(bytes));
          if (!decoded) {
            return ctx.reply(card('📭 *_READQR_*', 'No QR code was found in that image — is it a clear QR picture?'));
          }
          return ctx.reply(card('🔎 *_QR CODE_*', wa.row('Content', `\`${decoded}\``)));
        } catch {
          return ctx.reply(card('⚠️ *_READQR FAILED_*', 'Could not read that image. Try a clearer QR photo.'));
        }
      },
    },
    {
      name: 'weather',
      category: 'tools',
      usage: '.weather <city>',
      description: 'Current weather for a city.',
      async execute(ctx) {
        const city = String(ctx.argsText ?? '').trim();
        if (!city) return ctx.reply(usageCard('weather', '<city>'));
        try {
          const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%l:+%t,+%C,+%h++humidity,+wind+%w`, { headers: { 'User-Agent': 'curl' } });
          if (!res.ok) throw new Error('bad status');
          const text = (await res.text()).trim();
          if (!text) throw new Error('empty');
          return ctx.reply(card('🌤️ *_WEATHER_*', wa.row('Report', text)));
        } catch {
          return ctx.reply(card('⚠️ *_WEATHER UNAVAILABLE_*', `Could not fetch weather for “${city}”. Check the spelling or network.`));
        }
      },
    },
    {
      name: 'time',
      category: 'tools',
      usage: '.time <timezone|city>',
      description: 'Current time in a location/timezone.',
      async execute(ctx) {
        const place = String(ctx.argsText ?? '').trim();
        if (!place) return ctx.reply(usageCard('time', '<timezone|city>'));
        const zone = resolveZone(place);
        if (!zone) {
          return ctx.reply(card('⚠️ *_TIME UNAVAILABLE_*', `Could not resolve “${place}”. Try an IANA zone like \`Africa/Lagos\` or a city name.`));
        }
        const { time, offset } = formatZoneTime(zone);
        return ctx.reply(card('🕒 *_WORLD TIME_*', wa.row('Zone', zone) + '\n' + wa.row('Time', time) + '\n' + wa.row('Offset', offset)));
      },
    },
  ];
}