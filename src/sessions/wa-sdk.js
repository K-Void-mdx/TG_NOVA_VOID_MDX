import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { loadWaVersion } from '../core/version-cache.js';
import { createLoggerHook } from '../core/session-healer.js';

/**
 * Production Baileys socket builder for ONE WhatsApp session.
 *
 * Contract consumed by WaSession (the transport adapter):
 *   - resolves { sock } where sock exposes the Baileys socket surface
 *     (sock.ev Events: connection.update / messages.upsert / creds.update;
 *     sock.user; sock.requestPairingCode(phone); sock.sendMessage;
 *     sock.end())
 *   - `authDir` holds the number's multi-file auth state; on first run it is
 *     empty, so the socket waits for the pairing flow instead of auto-auth.
 *   - the WA protocol version is disk-cached (one tiny network check max per
 *     week) — rc13's baked-in version is rejected by WhatsApp with a
 *     protocol <failure reason="405"> before pairing can start.
 *   - each session gets its own pino logger wired to the signal-session
 *     auto-healer scoped to THAT session's authDir.
 */

export function createSessionLogger(level = 'warn') {
  return pino({ level });
}

/** "NOVA_VOID MDX" as the Baileys browser id — keeps device labels clean. */
export const SOCK_BROWSER = ['NOVA_VOID MDX', 'Chrome', '120.0'];

/**
 * @param {object} options
 * @param {string} options.authDir     session dir for the number
 * @param {string} options.versionFile disk cache path for the WA version
 * @param {string} [options.loggerLevel]
 */
export async function createWaSocket({ authDir, versionFile, loggerLevel = 'warn' }) {
  const baseLogger = createSessionLogger(loggerLevel);
  const { logger } = createLoggerHook({ logger: baseLogger, authDir });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await loadWaVersion({
    file: versionFile,
    fetchVersion: fetchLatestBaileysVersion,
  });

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: false,
    browser: SOCK_BROWSER,
  });

  // Persist refreshed credentials for this number whenever they change.
  sock.ev.on('creds.update', saveCreds);

  return { sock };
}