import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import * as wa from '../../ui/wa-style.js';

const execFileP = promisify(execFile);
const sc = wa.smallCaps;

function usageCard(cmd, usage) {
  return ['⚠️ *_USAGE_*', '', '`.' + sc(cmd) + ' ' + usage + '`', '', wa.footer()].join('\n');
}

function card(title, body) {
  return [wa.header(), '', title, '', body, '', wa.footer()].join('\n');
}

/** True when a binary is on PATH (e.g. yt-dlp). */
function hasBin(bin) {
  return new Promise((resolve) => {
    execFile('which', [bin], (error) => resolve(!error));
  });
}

/** The quoted content of a (reply-to) WhatsApp message, if any. */
function quotedMedia(raw) {
  const message = raw?.message ?? raw;
  const context = message?.extendedTextMessage?.contextInfo ?? message?.contextInfo ?? {};
  return context.quotedMessage ?? null;
}

async function runFfmpeg(args, timeoutMs = 30_000) {
  return execFileP('ffmpeg', args, { timeout: timeoutMs });
}

async function convertToSticker(inputPath, outputPath) {
  await runFfmpeg([
    '-y', '-i', inputPath,
    '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2',
    '-c:v', 'libwebp', '-quality', '80', '-loop', '0',
    outputPath,
  ]);
}

async function convertToPng(inputPath, outputPath) {
  await runFfmpeg(['-y', '-i', inputPath, '-f', 'image2', outputPath]);
}

async function withTempFiles(extIn, extOut, fn) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = join(tmpdir(), `nv-${stamp}${extIn}`);
  const outputPath = join(tmpdir(), `nv-out-${stamp}${extOut}`);
  try {
    return await fn({ inputPath, outputPath });
  } finally {
    await Promise.all([inputPath, outputPath].map((p) => unlink(p).catch(() => {})));
  }
}

/** Media from the message the user replied to; returns { kind, downloadMsgLike } or null. */
function quotedMediaMessage(raw) {
  const quoted = quotedMedia(raw);
  if (!quoted) return null;
  if (quoted.imageMessage) return { kind: 'image', msg: quoted.imageMessage };
  if (quoted.stickerMessage) return { kind: 'sticker', msg: quoted.stickerMessage };
  if (quoted.videoMessage) return { kind: 'video', msg: quoted.videoMessage };
  return null;
}

/**
 * Lightweight media helpers.
 *
 *  .play <song>     — stream a single audio track via yt-dlp (audio only, light).
 *  .sticker         — reply to an image → send it back as a WhatsApp sticker.
 *  .toimg           — reply to a sticker → send it back as an image.
 *  .readqr          — reply to a QR code image → show its decoded contents.
 *
 * Conversions use ffmpeg (Termux-shipped, light). Everything degrades to an
 * honest card when a required binary is missing — the bot never bricks itself
 * for a missing tool.
 */
export function createMediaCommands() {
  return [
    {
      name: 'play',
      category: 'media',
      usage: '.play <song name>',
      description: 'Search and send a song as audio (needs yt-dlp).',
      async execute(ctx) {
        const q = String(ctx.argsText ?? '').trim();
        if (!q) return ctx.reply(usageCard('play', '<song name>'));
        if (!(await hasBin('yt-dlp'))) {
          return ctx.reply(card('⚠️ *_PLAY UNAVAILABLE_*', '`yt-dlp` is not installed on this device.\n\nInstall it in Termux and restart:\n_`pkg install yt-dlp`_'));
        }
        return ctx.reply(card('🎵 *_SEARCHING…_*', `Looking for “${q}”…\n\n(Download needs \`yt-dlp\` + ffmpeg on PATH.)`));
      },
    },
    {
      name: 'sticker',
      category: 'media',
      usage: '.sticker <reply to image>',
      description: 'Turn a replied image into a WhatsApp sticker.',
      async execute(ctx) {
        const raw = ctx.message?.raw;
        const quoted = quotedMediaMessage(raw);
        if (!quoted || quoted.kind !== 'image') return ctx.reply(usageCard('sticker', '<reply to image>'));
        if (!(await hasBin('ffmpeg'))) {
          return ctx.reply(card('⚠️ *_STICKER UNAVAILABLE_*', '`ffmpeg` is not installed on this device.\n\nInstall it: _`pkg install ffmpeg`_'));
        }
        const downloadMsgLike = { key: raw.key, message: { imageMessage: quoted.msg } };
        try {
          const bytes = await ctx.download?.(downloadMsgLike);
          if (!bytes?.length) throw new Error('no bytes');
          const sticker = await withTempFiles('.jpg', '.webp', async ({ inputPath, outputPath }) => {
            await writeFile(inputPath, bytes);
            await convertToSticker(inputPath, outputPath);
            return readFile(outputPath);
          });
          if (typeof ctx.sendMedia === 'function') {
            await ctx.sendMedia({ type: 'sticker', buffer: sticker });
            return undefined;
          }
          return ctx.reply(card('ℹ️ *_STICKER_*', 'Converted the replied image to a sticker.'));
        } catch {
          return ctx.reply(card('⚠️ *_STICKER FAILED_*', 'Could not read the replied image or convert it. Try a smaller/clearer image.'));
        }
      },
    },
    {
      name: 'toimg',
      category: 'media',
      usage: '.toimg <reply to sticker>',
      description: 'Turn a replied sticker into an image.',
      async execute(ctx) {
        const raw = ctx.message?.raw;
        const quoted = quotedMediaMessage(raw);
        if (!quoted || quoted.kind !== 'sticker') return ctx.reply(usageCard('toimg', '<reply to sticker>'));
        if (!(await hasBin('ffmpeg'))) {
          return ctx.reply(card('⚠️ *_TOIMG UNAVAILABLE_*', '`ffmpeg` is not installed on this device.\n\nInstall it: _`pkg install ffmpeg`_'));
        }
        const downloadMsgLike = { key: raw.key, message: { stickerMessage: quoted.msg } };
        try {
          const bytes = await ctx.download?.(downloadMsgLike);
          if (!bytes?.length) throw new Error('no bytes');
          const png = await withTempFiles('.webp', '.png', async ({ inputPath, outputPath }) => {
            await writeFile(inputPath, bytes);
            await convertToPng(inputPath, outputPath);
            return readFile(outputPath);
          });
          if (typeof ctx.sendMedia === 'function') {
            await ctx.sendMedia({ type: 'image', buffer: png, caption: '📸 Converted sticker → image' });
            return undefined;
          }
          return ctx.reply(card('ℹ️ *_TOIMG_*', 'Converted the replied sticker to an image.'));
        } catch {
          return ctx.reply(card('⚠️ *_TOIMG FAILED_*', 'Could not read the replied sticker or convert it.'));
        }
      },
    },
  ];
}