import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { installLogGuard } from './core/log-guard.js';
installLogGuard();
import { env, assertValidEnv } from './config/env.js';
import { createNovaApplication } from './core/factory.js';
import { WaSessionManager } from './sessions/wa-session-manager.js';
import { createWaSocket } from './sessions/wa-sdk.js';
import { startControlPlane } from './telegram/control.js';
import { maskJid } from './core/jid.js';
import * as ui from './ui/banner.js';

/**
 * NOVA_VOID MDX — Telegram control plane.
 *
 * Boot order deliberately starts Telegram FIRST, then restores every stored
 * WhatsApp session in the background. Nothing ever blocks on terminal input:
 * pairing numbers come exclusively from Telegram (/pair).
 */
export async function startNovaVoid() {
  const bootStartedAt = Date.now();
  assertValidEnv();

  await Promise.all([mkdir(env.sessionsDir, { recursive: true }), mkdir(env.aiStatesDir, { recursive: true })]);

  const log = (line) => console.log(line);
  log('');
  log(ui.novaBanner());
  log(ui.identityBlock());
  log(ui.titleCard());
  log(ui.systemInfo({ mode: 'CONTROL PLANE', nodeVersion: process.version, platform: process.platform, prefix: env.prefix }));
  log('');

  // Lazy owner broadcast — the control plane is constructed below, and the
  // manager may also use it for background session events.
  let broadcast = () => {};

  const trace = (event, payload = {}) => {
    if (event === 'message' && env.debugMessages) log(ui.log.message(maskJid(payload.senderJid), maskJid(payload.chatJid)));
    if (event === 'dispatch') log(ui.log.command(`.${payload.name}`));
    if (event === 'response') log(ui.log.response(true));
    if (event === 'command-error') {
      const stack = payload.error?.stack?.split('\n')[1]?.trim() ?? '';
      log(ui.log.error(`.${payload.command} failed: ${payload.error?.message ?? 'unknown'}${stack ? ` (${stack})` : ''}`));
    }
  };

  const buildApp = (session, sock) => {
    const { app } = createNovaApplication({
      botJid: sock?.user?.id ?? null,
      botLid: sock?.user?.lid ?? null,
      ownerJids: env.ownerJids,
      sudoJids: env.sudoJids,
      botName: env.botName,
      prefixes: [env.prefix],
      maxHistory: env.aiMaxHistory,
      storage: {
        sessionsDir: join(env.aiStatesDir, session.phone, 'history'),
        chatbotStateFile: join(env.aiStatesDir, session.phone, 'chatbot.json'),
      },
      env,
      trace,
      reply: async (chatJid, payload) => {
        const sockNow = session.sock;
        if (!sockNow) throw new Error('WhatsApp transport is not connected');
        const text = typeof payload === 'string' ? payload : String(payload?.text ?? '');
        const quoted = payload?.quoted ?? undefined;
        return quoted ? sockNow.sendMessage(chatJid, { text }, { quoted }) : sockNow.sendMessage(chatJid, { text });
      },
      sendMedia: async (chatJid, media) => {
        const sockNow = session.sock;
        if (!sockNow) throw new Error('WhatsApp transport is not connected');
        if (media?.type === 'image' && media.buffer) {
          return sockNow.sendMessage(chatJid, { image: media.buffer, caption: media.caption ?? '' });
        }
        if (media?.type === 'contact' && media.vcard) {
          return sockNow.sendMessage(chatJid, {
            contacts: { displayName: media.displayName ?? env.botName, contacts: [{ vcard: media.vcard }] },
          });
        }
        throw new Error('Unsupported media payload');
      },
    });
    log(`[ SESSION ] ${session.phone} command dispatcher ready (${env.ownerJids.length || 0} configured WA owner jids)`);
    return app;
  };

  const manager = new WaSessionManager({
    sessionsDir: env.sessionsDir,
    ownerUserIds: [env.telegramOwnerId].filter(Boolean),
    socketFactory: ({ authDir }) => createWaSocket({ authDir, versionFile: env.waVersionFile }),
    appFactory: buildApp,
    ownerNotify: (text) => broadcast(text),
    log,
  });

  const control = startControlPlane({ env, sessions: manager, logger: console });
  broadcast = (text) => control.sendOwner(text);

  // Telegram first — fail fast on a bad token so the operator sees it.
  await control.start();
  log(`[ TELEGRAM ] started in ${((Date.now() - bootStartedAt) / 1000).toFixed(1)}s`);

  // Restore WhatsApp sessions in the background — never blocks Telegram.
  manager.restoreAll().catch((error) => log(ui.log.error(`restore failed: ${error?.message ?? error}`)));

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(ui.shutdownScreen());
    control.stop();
    manager.stopAll().finally(() => {
      log(`[ SIGNAL ] ${signal}`);
      setTimeout(() => process.exit(0), 250);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  log(`[ READY ] Control plane operational. Boot took ${((Date.now() - bootStartedAt) / 1000).toFixed(1)}s.`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  startNovaVoid().catch((error) => {
    console.error('[ FATAL ] NOVA_VOID failed to start:', error?.message ?? error);
    process.exitCode = 1;
  });
}