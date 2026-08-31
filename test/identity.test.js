import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSystemPrompt, describeProviders } from '../src/ai/identity.js';
import { AIRouter } from '../src/ai/router.js';
import { AIService } from '../src/ai/ai-service.js';

test('buildSystemPrompt keeps bot identity and provider identity separate', () => {
  const prompt = buildSystemPrompt({
    botName: 'NOVA_VOID MDX',
    providers: [{ name: 'gemini', model: 'gemini-3.6-flash' }],
  });
  assert.ok(prompt.includes('NOVA_VOID MDX'), 'names the bot');
  assert.match(prompt, /underlying AI model provider/);
  assert.match(prompt, /gemini-3\.6-flash/, 'names the actual configured model');
  assert.match(prompt, /NEVER claim that Google/, 'explicitly forbids claiming Google created it');
  assert.match(prompt, /does NOT own, create, or sponsor this bot project/);
  assert.match(prompt, /your AI capability is currently gemini \(gemini-3\.6-flash\)/);
});

test('buildSystemPrompt with no providers is honest and never invents a creator', () => {
  const prompt = buildSystemPrompt({ botName: 'NOVA_VOID MDX' });
  assert.match(prompt, /no external AI provider is currently configured/);
  assert.match(prompt, /Do not invent/);
  assert.match(prompt, /NEVER claim that Google/);
});

test('buildSystemPrompt explicitly teaches the correct answer for "who made you"', () => {
  const prompt = buildSystemPrompt({ botName: 'NOVA_VOID MDX', providers: [] });
  assert.match(prompt, /owner\/developer/i);
  assert.match(prompt, /NEVER claim that Google/);
});

test('describeProviders formats names and models, is honest when empty', () => {
  assert.equal(describeProviders([]), 'no external AI provider is currently configured');
  assert.equal(describeProviders([{ name: 'groq', model: 'openai/gpt-oss-120b' }]), 'groq (openai/gpt-oss-120b)');
});

test('router.describe exposes only registered provider objects', () => {
  const router = new AIRouter();
  router.register({ name: 'a', model: 'm1', generateText: async () => 'x' });
  router.register({ name: 'b', model: 'm2', generateText: async () => 'y' });
  assert.deepEqual(router.describe().map((p) => p.name).sort(), ['a', 'b']);
  assert.deepEqual(router.describe().map((p) => p.model).sort(), ['m1', 'm2']);
});

const stubSession = { ensure: () => ({ messages: [] }), append: () => {} };
const stubMemory = { listAll: () => [], list: () => [] };

test('AIService injects the identity system prompt from live router state', async () => {
  const router = new AIRouter();
  let captured;
  router.register({
    name: 'fake-provider',
    model: 'fake-model',
    async generateText(request) { captured = request; return 'hello'; },
  });
  const ai = new AIService({ router, sessions: stubSession, memory: stubMemory, botName: 'NOVA_VOID MDX' });
  const answer = await ai.chat({ userJid: 'u@x', prompt: 'who are you' });
  assert.equal(answer, 'hello');
  const system = captured.messages[0];
  assert.equal(system.role, 'system');
  assert.match(system.content, /NOVA_VOID MDX/);
  assert.match(system.content, /fake-provider \(fake-model\)/);
  assert.match(system.content, /NEVER claim that Google/);
});

test('explicit systemPrompt override replaces the identity prompt', async () => {
  const router = new AIRouter();
  let captured;
  router.register({ name: 'p', async generateText(request) { captured = request; return 'x'; } });
  const ai = new AIService({ router, sessions: stubSession, memory: stubMemory });
  await ai.chat({ userJid: 'u@x', prompt: 'hi', systemPrompt: 'A very custom SYSTEM instruction.' });
  assert.match(captured.messages[0].content, /A very custom SYSTEM instruction/);
});

test('personality override still wins when provided (backwards compatible)', async () => {
  const router = new AIRouter();
  let captured;
  router.register({ name: 'p', async generateText(request) { captured = request; return 'x'; } });
  const ai = new AIService({ router, sessions: stubSession, memory: stubMemory, personality: 'Legacy personality text' });
  await ai.chat({ userJid: 'u@x', prompt: 'hi' });
  assert.match(captured.messages[0].content, /Legacy personality text/);
  assert.doesNotMatch(captured.messages[0].content, /fake-provider/);
});