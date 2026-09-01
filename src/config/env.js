import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Project root = repository root, independent of where the bot is started.
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Loads KEY=VALUE pairs from .env without overriding real environment variables. */
function loadDotEnv(filePath) {
  try {
    if (!existsSync(filePath)) return;
    for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch { /* a broken .env must not stop startup */ }
}

loadDotEnv(process.env.ENV_FILE || join(PROJECT_ROOT, '.env'));

const value = (input, fallback = '') => String(input ?? fallback).trim();
const boolean = (input) => /^(1|true|yes)$/i.test(value(input));

/** Comma-separated list support: "A,B" → ['A', 'B']. */
function csvList(input, legacySingle) {
  const items = String(input ?? '').split(',').map((item) => value(item)).filter(Boolean);
  const single = value(legacySingle);
  if (single && !items.includes(single)) items.push(single);
  return Object.freeze(items);
}

/** Digits-only number, or a full "@" JID, normalized to a WhatsApp JID. */
function toWaJid(raw) {
  const clean = value(raw);
  if (!clean) return '';
  if (clean.includes('@')) return clean.toLowerCase().replace(/:\d+(?=@)/, '');
  const digits = clean.replace(/[^\d]/g, '');
  return digits ? `${digits}@s.whatsapp.net` : '';
}

function resolvePath(input, fallback) {
  const raw = value(input, fallback);
  return resolve(PROJECT_ROOT, raw);
}

export const env = Object.freeze({
  nodeEnv: value(process.env.NODE_ENV, 'development'),
  botName: value(process.env.BOT_NAME, 'NOVA_VOID MDX'),
  botUsername: value(process.env.BOT_USERNAME, '@nova_void_mdx_bot'),
  prefix: value(process.env.PREFIX, '.'),
  debugMessages: boolean(process.env.DEBUG_MESSAGES),

  // Telegram control plane — the token is read from .env / environment and is
  // NEVER printed, logged, or committed. Startup refuses to run without it.
  telegramBotToken: value(process.env.TELEGRAM_BOT_TOKEN),
  telegramBotUsername: value(process.env.TELEGRAM_BOT_USERNAME, 'nova_void_mdx_bot'),
  telegramOwnerId: value(process.env.TELEGRAM_OWNER_ID, '').replace(/^\D+/g, ''),
  telegramChannel: value(process.env.TELEGRAM_CHANNEL, '@nova_void_updates77'),
  telegramGroup: value(process.env.TELEGRAM_GROUP, '@nova_void_mdx_com77'),
  telegramOwnerLink: value(process.env.TELEGRAM_OWNER_LINK),
  telegramEnabled: Boolean(value(process.env.TELEGRAM_BOT_TOKEN)),

  // Operator / public owner card for the WhatsApp `.owner` vCard. OWNER_NUMBER
  // is display-only and grants NO authority; authority comes from OWNER_JIDS
  // and TELEGRAM_OWNER_ID.
  ownerName: value(process.env.OWNER_NAME, 'King Val'),
  ownerNumber: value(process.env.OWNER_NUMBER),
  ownerBio: value(process.env.OWNER_BIO, 'Owner & developer of NOVA_VOID MDX.'),

  // WhatsApp configured authority (explicit); no implicit pinned numbers.
  ownerJids: Object.freeze(csvList(process.env.OWNER_JIDS, process.env.OWNER_JID).map(toWaJid).filter(Boolean)),
  sudoJids: Object.freeze(csvList(process.env.SUDO_JIDS).map(toWaJid).filter(Boolean)),

  aiMaxHistory: Number(value(process.env.AI_MAX_HISTORY, '40')) || 40,

  // AI provider keys — never commit real values.
  geminiApiKey: value(process.env.GEMINI_API_KEY),
  groqApiKey: value(process.env.GROQ_API_KEY),
  openCodeApiKey: value(process.env.OPENCODE_API_KEY),
  openRouterApiKey: value(process.env.OPENROUTER_API_KEY),

  // Storage — all under DATA_DIR (git-ignored). WhatsApp auth files are kept
  // per-number under sessions/<phone>/; the index maps a phone to its owner.
  dataDir: resolvePath(process.env.DATA_DIR, './data'),
  get sessionsDir() {
    return join(this.dataDir, 'sessions');
  },
  get aiStatesDir() {
    return join(this.dataDir, 'ai');
  },
  get waVersionFile() {
    return join(this.dataDir, 'wa-version.json');
  },
  // Brand image for welcome/menu/ping cards (fetched and cached at runtime).
  brandImageUrl: value(process.env.BRAND_IMAGE_URL, 'https://files.catbox.moe/hh1cbl.jpg'),
  get settingsFile() {
    return join(this.dataDir, 'settings.json');
  },
});

export function assertValidEnv() {
  if (!env.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set. Put it in .env (never commit it) before starting.');
  }
  if (!env.telegramOwnerId) {
    throw new Error('TELEGRAM_OWNER_ID is not set (numeric Telegram user id).');
  }
  if (!env.botName) throw new Error('BOT_NAME cannot be empty');
  if (!env.prefix) throw new Error('PREFIX cannot be empty');
}