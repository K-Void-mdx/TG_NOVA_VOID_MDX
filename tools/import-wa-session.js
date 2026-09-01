// Browser-import helper: link a passkey-gated WhatsApp number by reusing a real
// browser's authenticated WhatsApp Web session, then materialise it as a Baileys
// multi-file auth dir that NOVA_VOID MDX can load directly.
//
// WHY THIS EXISTS
// ---------------
// Since ~June 2026 WhatsApp requires a passkey (WebAuthn) to link a new device.
// Headless Baileys pairing codes are refused server-side (status 428) once an
// account is passkey-gated, so no library swap fixes it. The only self-host path
// is to complete the official WhatsApp Web passkey flow once in a real browser
// and import that authenticated session. This is a port of the WhiskeySockets
// PR #2676 "browser-auth bridge" that runs against the already-installed
// @whiskeysockets/baileys — no fork build required.
//
// USAGE
// -----
//   node tools/import-wa-session.js --phone 234XXXXXXXXXX [--browser /path/to/chromium] [--delete-profile]
//
// The tool opens a visible Chromium, you link the device + complete the passkey
// on web.whatsapp.com, then press ENTER. The session is written to
// <sessions-dir>/<phone>/ and is picked up by the running bot on next pair/start.
//
import fs from 'node:fs';
import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import puppeteer from 'puppeteer-core';
import { writeBrowserAuthToMultiFile } from './browser-auth-bridge.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_SESSIONS_DIR = path.join(ROOT, 'data', 'sessions');
const DEFAULT_PROFILE_DIR = path.join(ROOT, 'data', '.wa-import-profile');
const DEFAULT_BROWSER = '/data/data/com.termux/files/usr/bin/chromium-browser';

const normalizePhone = (value) => value.replace(/[^0-9]/g, '');

// --- vendored browser-side extractor (pure browser JS, runs in the page) ---

// eslint-disable-next-line no-unused-vars
const EXTRACT_FN = String.raw`
  async () => {
    const b64ToBytes = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const bytesToB64 = (value) => {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    };
    const request = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const openDb = (name) => new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onupgradeneeded = () => { req.transaction?.abort(); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB database not found: ' + name));
    });
    const get = async (dbName, storeName, key) => { const db = await openDb(dbName); try { return await request(db.transaction(storeName, 'readonly').objectStore(storeName).get(key)); } finally { db.close(); } };
    const getAll = async (dbName, storeName) => { const db = await openDb(dbName); try { return await request(db.transaction(storeName, 'readonly').objectStore(storeName).getAll()); } finally { db.close(); } };
    const localStorageJson = (key) => { const value = localStorage.getItem(key); if (value === null) throw new Error('WhatsApp Web localStorage is missing ' + key); return JSON.parse(value); };
    const requireString = (value, label) => { if (typeof value !== 'string' || !value.length) throw new Error('WhatsApp Web auth export did not include ' + label); return value; };
    const requireArray = (value, label) => { if (!Array.isArray(value)) throw new Error('WhatsApp Web auth export did not include ' + label); return value; };
    const requireNonEmptyArray = (value, label) => { const values = requireArray(value, label); if (!values.length) throw new Error('WhatsApp Web auth export did not include ' + label); return values; };
    const requireRecord = (value, label) => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('WhatsApp Web auth export did not include ' + label); return value; };
    const requireSafeInteger = (value, label) => { const number = Number(value); if (!Number.isSafeInteger(number)) throw new Error('WhatsApp Web auth export did not include a valid ' + label); return number; };
    const requireEncryptedStaticKey = (value, label) => {
      const record = requireRecord(value, label);
      if (!(record.value instanceof ArrayBuffer) && !ArrayBuffer.isView(record.value)) throw new Error('WhatsApp Web auth export did not include ' + label + ' ciphertext');
      if (!(record.encKey instanceof CryptoKey)) throw new Error('WhatsApp Web auth export did not include ' + label + ' decryption key');
      return record;
    };
    const requireBufferJson = (value, label) => { const record = requireRecord(value, label); if (typeof record.__b64 !== 'string' || !record.__b64.length) throw new Error('WhatsApp Web auth export did not include ' + label); return record; };

    const lastWidMd = requireString(localStorageJson('last-wid-md'), 'last-wid-md');
    const waLid = requireString(localStorageJson('WALid'), 'WALid');
    const salt = b64ToBytes(requireString(localStorageJson('WAWebEncKeySalt'), 'WAWebEncKeySalt'));
    const noiseIvs = requireNonEmptyArray(localStorageJson('WANoiseInfoIv'), 'WANoiseInfoIv').map((iv, index) => requireString(iv, 'WANoiseInfoIv[' + index + ']'));
    const encryptedNoise = requireRecord(localStorageJson('WANoiseInfo'), 'WANoiseInfo');
    for (const field of ['privKey', 'pubKey', 'recoveryToken']) requireString(encryptedNoise[field], 'WANoiseInfo.' + field);

    const encryptedKeyRecord = await get('wawc_db_enc', 'keys', 1);
    if (!(encryptedKeyRecord?.key instanceof CryptoKey)) throw new Error('WhatsApp Web auth export did not include the encrypted storage key');

    const noiseAesKey = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info: new Uint8Array([0]) },
      encryptedKeyRecord.key,
      { name: 'AES-CBC', length: 128 },
      false,
      ['decrypt']
    );
    const decryptNoiseCandidates = async (field) => {
      const encryptedValue = encryptedNoise[field];
      if (!encryptedValue) return [];
      const candidates = [];
      await Promise.all(noiseIvs.map(async (iv, ivIndex) => {
        try {
          const value = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: b64ToBytes(iv) }, noiseAesKey, b64ToBytes(encryptedValue));
          candidates.push({ ivIndex, value: bytesToB64(value) });
        } catch {}
      }));
      return candidates.sort((left, right) => left.ivIndex - right.ivIndex);
    };
    const requireCandidates = async (field) => { const candidates = await decryptNoiseCandidates(field); if (!candidates.length) throw new Error('WhatsApp Web auth export did not include decryptable WANoiseInfo.' + field); return candidates; };

    const privateKeyCandidates = await requireCandidates('privKey');
    const publicKeyCandidates = await requireCandidates('pubKey');
    const recoveryTokenCandidates = await requireCandidates('recoveryToken');

    const signalMetaRows = requireNonEmptyArray(await getAll('signal-storage', 'signal-meta-store'), 'signal meta records');
    const signalMeta = Object.fromEntries(signalMetaRows.map((row) => [row.key, row.value]));
    const decryptStaticKey = async (record) => bytesToB64(await crypto.subtle.decrypt({ name: 'AES-CTR', counter: new Uint8Array(16), length: 64 }, record.encKey, record.value));
    const mapBuffer = (value) => {
      if (value === null || value === undefined) return value;
      if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return { __b64: bytesToB64(value) };
      if (Array.isArray(value)) return value.map(mapBuffer);
      if (typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, child]) => !(child instanceof CryptoKey)).map(([key, child]) => [key, mapBuffer(child)]));
      return value;
    };

    const advSignedIdentity = requireRecord(mapBuffer(signalMeta.adv_signed_identity), 'adv signed identity');
    const preKeys = requireNonEmptyArray((await getAll('signal-storage', 'prekey-store')).map(mapBuffer), 'pre-key records');
    const signedPreKeys = requireNonEmptyArray((await getAll('signal-storage', 'signed-prekey-store')).map(mapBuffer), 'signed pre-key records');
    const lastSignedPreKeyId = signalMeta.signal_last_spk_id === undefined ? undefined : requireSafeInteger(signalMeta.signal_last_spk_id, 'last signed pre-key id');

    return {
      localStorage: { lastWidMd, waLid },
      noise: { privateKeyCandidates, publicKeyCandidates, recoveryTokenCandidates },
      signal: {
        registrationId: requireSafeInteger(signalMeta.signal_reg_id, 'registration id'),
        nextPreKeyId: requireSafeInteger(signalMeta.signal_next_pk_id, 'next pre-key id'),
        firstUnuploadedPreKeyId: requireSafeInteger(signalMeta.signal_first_unupload_pk_id, 'first unuploaded pre-key id'),
        lastSignedPreKeyId,
        signedIdentityKey: {
          private: await decryptStaticKey(requireEncryptedStaticKey(signalMeta.signal_static_privkey, 'static private key')),
          public: await decryptStaticKey(requireEncryptedStaticKey(signalMeta.signal_static_pubkey, 'static public key')),
        },
        advSignedIdentity: {
          details: requireBufferJson(advSignedIdentity.details, 'adv signed identity details'),
          accountSignatureKey: requireBufferJson(advSignedIdentity.accountSignatureKey, 'adv signed identity account signature key'),
          accountSignature: requireBufferJson(advSignedIdentity.accountSignature, 'adv signed identity account signature'),
          deviceSignature: requireBufferJson(advSignedIdentity.deviceSignature, 'adv signed identity device signature'),
        },
        preKeys,
        signedPreKeys,
      },
    };
  }
`;

// --- CLI ---------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    phone: '',
    sessionsDir: DEFAULT_SESSIONS_DIR,
    profileDir: DEFAULT_PROFILE_DIR,
    browserPath: '',
    deleteProfile: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--phone' && next) { options.phone = normalizePhone(next); i += 1; }
    else if (arg === '--sessions-dir' && next) { options.sessionsDir = path.resolve(next); i += 1; }
    else if (arg === '--profile' && next) { options.profileDir = path.resolve(next); i += 1; }
    else if (arg === '--browser' && next) { options.browserPath = path.resolve(next); i += 1; }
    else if (arg === '--delete-profile') { options.deleteProfile = true; }
    else if (arg === '-h' || arg === '--help') { options.help = true; }
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  return options;
}

function findBrowser(explicitPath) {
  const candidates = [explicitPath, process.env.CHROME_PATH, DEFAULT_BROWSER, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/microsoft-edge'].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function ensureNoExistingSession(sessionsDir, phone) {
  const dir = path.join(sessionsDir, phone);
  if (fs.existsSync(path.join(dir, 'creds.json'))) {
    throw new Error(`A stored session already exists for ${phone}: ${dir}\nRemove it first if you intend to re-import.`);
  }
}

function hasCompleteAuthMaterial(creds) {
  return Boolean(
    creds &&
    (creds?.me?.id || creds?.me?.user || creds?.me?.lid) &&
    creds?.noiseKey?.private && creds?.noiseKey?.public &&
    creds?.signedIdentityKey?.private && creds?.signedIdentityKey?.public &&
    creds?.signedPreKey?.keyPair?.private && creds?.signedPreKey?.keyPair?.public &&
    typeof creds?.advSecretKey === 'string' && creds.advSecretKey.length > 0
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`
Browser-import helper for NOVA_VOID MDX (passkey-gated WhatsApp linking)

Usage:
  node tools/import-wa-session.js --phone <number> [options]

Options:
  --phone <number>     E.164 digits for the session, e.g. 234XXXXXXXXXX (required)
  --browser <path>     Chrome/Edge/Chromium executable path
  --profile <dir>      Dedicated browser profile dir (default: data/.wa-import-profile)
  --sessions-dir <dir> Where to write the session (default: data/sessions)
  --delete-profile     Delete the dedicated browser profile after a successful import
  -h, --help           Show this help

Environment:
  CHROME_PATH          Alternative to --browser
`);
    return;
  }

  if (!options.phone || options.phone.length < 8) {
    throw new Error('--phone is required (E.164 digits, >= 8). Use -h for help.');
  }

  const targetDir = path.join(options.sessionsDir, options.phone);
  const executablePath = findBrowser(options.browserPath);
  if (!executablePath) {
    throw new Error('Chrome, Edge, or Chromium was not found. Use --browser <path> or set CHROME_PATH.');
  }
  if (targetDir === options.profileDir) {
    throw new Error('The auth output and browser profile directories must be different.');
  }
  ensureNoExistingSession(options.sessionsDir, options.phone);
  await mkdir(options.sessionsDir, { recursive: true });

  console.log(`Browser:              ${executablePath}`);
  console.log(`Dedicated profile:    ${options.profileDir}`);
  console.log(`Session output:       ${targetDir}`);
  console.log('\nSECURITY: this session dir contains live credentials. Never share it.\n');

  const terminal = readline.createInterface({ input, output });
  let browser;
  let importSucceeded = false;

  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: false,
      userDataDir: options.profileDir,
      defaultViewport: null,
      args: ['--start-maximized', '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-setuid-sandbox'],
    });

    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());
    await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 120_000 });

    console.log('In the browser:');
    console.log('1. Link the device via the official WhatsApp Web flow (scan QR).');
    console.log('2. Complete the passkey/WebAuthn confirmation on your phone/device.');
    console.log('3. Wait until the conversation list is fully visible.');
    console.log('4. Do NOT log out or remove the linked device.\n');

    await terminal.question('When WhatsApp Web is fully authenticated, press ENTER here...');

    if (!page.url().startsWith('https://web.whatsapp.com')) {
      throw new Error(`The active page is not WhatsApp Web: ${page.url()}`);
    }
    await page.waitForFunction(
      () => Boolean(localStorage.getItem('last-wid-md')) && Boolean(localStorage.getItem('WALid')),
      { timeout: 60_000 }
    );

    console.log('Authenticated browser storage found. Extracting auth material...');

    const extracted = await page.evaluate(eval(`(${EXTRACT_FN})`));

    console.log('Writing session into', targetDir, '...');
    await writeBrowserAuthToMultiFile(targetDir, extracted, { name: 'NOVA_VOID MDX Import', platform: 'web' });

    const credsPath = path.join(targetDir, 'creds.json');
    if (!fs.existsSync(credsPath)) throw new Error('The import completed without creating creds.json.');
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    if (!hasCompleteAuthMaterial(creds)) {
      throw new Error('creds.json was created, but the expected auth material is incomplete.');
    }
    await chmod(targetDir, 0o700);

    importSucceeded = true;
    console.log('\nImport completed successfully.');
    console.log('Session dir:', targetDir);
    console.log('The bot will load this number on the next /pair or session start.');
  } finally {
    terminal.close();
    if (browser) {
      console.log('Closing the dedicated browser...');
      await browser.close().catch(() => {});
    }
    if (importSucceeded && options.deleteProfile) {
      await fs.promises.rm(options.profileDir, { recursive: true, force: true });
    } else if (importSucceeded) {
      console.log(`Dedicated browser profile retained at: ${options.profileDir}`);
    }
  }
}

main().catch((error) => {
  console.error('\nImport failed:');
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
