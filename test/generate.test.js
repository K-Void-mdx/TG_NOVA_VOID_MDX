import assert from 'node:assert/strict';
import test from 'node:test';

import { createGenerateCommand } from '../src/commands/whatsapp/generate.js';
import { AIProviderError } from '../src/ai/provider.js';

function run({ generation, withMedia = true }) {
  const sent = [];
  const cmd = createGenerateCommand({ generation });
  const ctx = { argsText: 'a black book', reply: async (text) => sent.push({ text }) };
  if (withMedia) {
    ctx.sendMedia = (media) => { sent.push({ media }); return Promise.resolve(); };
  }
  return { cmd, ctx, sent };
}

test('.generate without a prompt shows usage, not an error', async () => {
  const { cmd, ctx, sent } = run({ generation: null });
  ctx.argsText = '';
  await cmd.execute(ctx);
  assert.match(sent.at(-1).text, /USAGE/);
  assert.match(sent.at(-1).text, /\.ɢᴇɴᴇʀᴀᴛᴇ <image prompt>/);
});

test('.generate with no provider → honest NOT CONFIGURED card', async () => {
  const { cmd, ctx, sent } = run({
    generation: { image: async () => { throw new Error('No image generation provider is configured'); } },
  });
  await cmd.execute(ctx);
  const last = sent.at(-1).text;
  assert.match(last, /IMAGE AI NOT CONFIGURED/);
  assert.match(last, /UNAVAILABLE/);
  assert.doesNotMatch(last, /try again/, 'no generic retry text');
});

test('.generate quota exhausted → PRECISE 429 card, not generic', async () => {
  const { cmd, ctx, sent } = run({
    generation: { image: async () => { throw new AIProviderError('Gemini image HTTP 429: quota exceeded', { provider: 'gemini-image' }); } },
  });
  await cmd.execute(ctx);
  const last = sent.at(-1).text;
  assert.match(last, /QUOTA EXCEEDED/);
  assert.match(last, /429/);
  assert.match(last, /gemini-image/);
  assert.doesNotMatch(last, /try again/);
});

test('.generate auth failure → INVALID CREDENTIALS card', async () => {
  const { cmd, ctx, sent } = run({
    generation: { image: async () => { throw new AIProviderError('Gemini image HTTP 403: denied', { provider: 'gemini-image' }); } },
  });
  await cmd.execute(ctx);
  const last = sent.at(-1).text;
  assert.match(last, /AUTH FAILED/);
  assert.match(last, /INVALID CREDENTIALS/);
});

test('.generate model missing → MODEL NOT FOUND card', async () => {
  const { cmd, ctx, sent } = run({
    generation: { image: async () => { throw new AIProviderError('Gemini image HTTP 404: model gone', { provider: 'gemini-image' }); } },
  });
  await cmd.execute(ctx);
  const last = sent.at(-1).text;
  assert.match(last, /MODEL UNAVAILABLE/);
  assert.match(last, /MODEL NOT FOUND/);
});

test('.generate provider 5xx → HTTP ERROR card', async () => {
  const { cmd, ctx, sent } = run({
    generation: { image: async () => { throw new AIProviderError('Gemini image HTTP 503: down', { provider: 'gemini-image' }); } },
  });
  await cmd.execute(ctx);
  assert.match(sent.at(-1).text, /HTTP ERROR/);
});

test('.generate unknown failure → GENERATION FAILED card (still honest)', async () => {
  const { cmd, ctx, sent } = run({
    generation: { image: async () => { throw new Error('fetch failed (ENETUNREACH)'); } },
  });
  await cmd.execute(ctx);
  assert.match(sent.at(-1).text, /GENERATION FAILED/);
});

test('.generate success sends the image via sendMedia', async () => {
  const { cmd, ctx, sent } = run({
    generation: { image: async () => ({ buffer: Buffer.from('PNGBYTES'), mimeType: 'image/png', caption: 'made for you' }) },
  });
  await cmd.execute(ctx);
  const last = sent.at(-1);
  assert.equal(last.media.type, 'image');
  assert.equal(last.media.buffer.toString(), 'PNGBYTES');
  assert.equal(last.media.caption, 'made for you');
});

test('.generate URL result replies with the link', async () => {
  const { cmd, ctx, sent } = run({
    generation: { image: async () => ({ url: 'https://example.com/art.png' }) },
  });
  await cmd.execute(ctx);
  assert.match(sent.at(-1).text, /example\.com/);
});

test('.generate provider returning nothing self-reports GENERATION INCOMPLETE', async () => {
  const { cmd, ctx, sent } = run({ generation: { image: async () => ({}) } });
  await cmd.execute(ctx);
  assert.match(sent.at(-1).text, /GENERATION INCOMPLETE/);
});

test('.generate media send failure bubbles up for honest dispatch handling', async () => {
  const { cmd, ctx } = run({
    generation: { image: async () => ({ buffer: Buffer.from('X') }) },
  });
  ctx.sendMedia = async () => { throw new Error('media send exploded'); };
  await assert.rejects(() => cmd.execute(ctx), /media send exploded/);
});