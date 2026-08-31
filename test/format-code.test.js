import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnswerParts, applyAiProseStyle } from '../src/ai/format-code.js';

test('splits prose and fenced code into ordered parts', () => {
  const parts = buildAnswerParts('Here is a script:\n\n```python\nprint("hi")\n```\n\nEnjoy!');
  assert.equal(parts.length, 3);
  assert.equal(parts[0].type, 'text');
  assert.equal(parts[1].type, 'code');
  assert.equal(parts[2].type, 'text');
});

test('prose parts are styled: small-caps + WhatsApp italic', () => {
  const parts = buildAnswerParts('Hello there, friend!');
  assert.equal(parts.length, 1);
  assert.match(parts[0].content, /_ʜᴇʟʟᴏ ᴛʜᴇʀᴇ, ꜰʀɪᴇɴᴅ!_/);
});

test('code parts are PLAIN raw text — no fences, no backticks, no dividers', () => {
  const parts = buildAnswerParts('```py\nprint("hi")\n```');
  const code = parts.find((p) => p.type === 'code').content;
  assert.equal(code, 'print("hi")');
  assert.doesNotMatch(code, /```/, 'no fence markers');
  assert.doesNotMatch(code, /`/, 'no backtick mono-wrapping');
  assert.doesNotMatch(code, /─/, 'no box divider lines');
  assert.doesNotMatch(code, /_/, 'no italic styling inside code');
});

test('code content is preserved exactly: indentation, tabs, quotes, comments, blanks', () => {
  const fence = '```';
  const body = [
    'function greet(name) {',
    '\tconsole.log(`hi ${name}`); // template literal survives',
    '',
    '    return "done";   // indented, quoted, commented',
    '}',
  ].join('\n');
  const parts = buildAnswerParts(`${fence}js\n${body}\n${fence}`);
  const code = parts.find((p) => p.type === 'code').content;
  assert.ok(code.includes('\tconsole.log(`hi ${name}`); // template literal survives'), 'tab+backticks+comment exact');
  assert.ok(code.includes('    return "done";   // indented, quoted, commented'), 'spaces+quotes+comment exact');
  assert.ok(code.includes('\n\n'), 'blank line inside a block survives');
  assert.equal(code.split('\n')[0], 'function greet(name) {');
  assert.equal(code.split('\n').at(-1), '}');
});

test('adjacent prose paragraphs merge into one text part', () => {
  const parts = buildAnswerParts('First paragraph.\n\nSecond paragraph.\n\n```python\nx = 1\n```\n\nTrailing note.');
  const texts = parts.filter((p) => p.type === 'text');
  assert.equal(texts.length, 2, 'prose before is one merged part; prose after is another');
  assert.match(texts[0].content, /_ꜰɪʀꜱᴛ ᴘᴀʀᴀɢʀᴀᴘʜ\./);
  assert.match(texts[0].content, /_ꜱᴇᴄᴏɴᴅ ᴘᴀʀᴀɢʀᴀᴘʜ\./);
});

test('tilde fences are handled like triple backticks', () => {
  const parts = buildAnswerParts('~~~javascript\nlet a = 1;\n~~~');
  const code = parts.find((p) => p.type === 'code').content;
  assert.equal(code, 'let a = 1;');
});

test('multiple code blocks ship as ordered text/code/text/code parts', () => {
  const parts = buildAnswerParts('Two:\n\n```py\ndef go():\n    return 1\n```\n\nand JS:\n\n```js\nconst who = `world`;\nconsole.log(who);\n```');
  assert.deepEqual(parts.map((p) => p.type), ['text', 'code', 'text', 'code']);
  assert.ok(parts[3].content.includes('const who = `world`;'), 'backticks inside JS preserved');
});

test('no fences means the whole answer is prose', () => {
  const parts = buildAnswerParts('Just a plain answer, no code here.');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, 'text');
});

test('empty or whitespace-only input renders nothing', () => {
  assert.deepEqual(buildAnswerParts(''), []);
  assert.deepEqual(buildAnswerParts('   \n  '), []);
  assert.deepEqual(buildAnswerParts('```\n```'), []);
});

test('applyAiProseStyle skips italic wrap on lines already carrying markdown', () => {
  assert.equal(applyAiProseStyle('Use *bold* here').includes('_Use'), false);
  assert.equal(applyAiProseStyle('This line has an _underscore_'), 'ᴛʜɪꜱ ʟɪɴᴇ ʜᴀꜱ ᴀɴ _ᴜɴᴅᴇʀꜱᴄᴏʀᴇ_');
});

test('URLs stay byte-identical inside styled prose', () => {
  const styled = applyAiProseStyle('Visit https://example.com/road?q=1&v=2 now');
  assert.ok(styled.includes('https://example.com/road?q=1&v=2'), 'URL untouched (no small-caps)');
  assert.match(styled, /ᴠɪꜱɪᴛ /);
  assert.equal(styled.slice(0, 6), '_ᴠɪꜱɪᴛ');
});

test('inline backtick spans stay byte-identical inside styled prose', () => {
  const styled = applyAiProseStyle('Run `npm test` to check');
  assert.ok(styled.includes('`npm test`'), 'mono span kept verbatim');
  assert.match(styled, /ʀᴜɴ /);
});