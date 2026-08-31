import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePhone, maskPhone } from '../src/core/phone.js';
import { normalizeJid } from '../src/core/permissions/roles.js';
import { ownerNotificationTarget } from '../src/core/jid.js';

test('normalizePhone accepts country code + number in common formats', () => {
  for (const input of ['+2348012345678', '2348012345678', '+234 801 234 5678', '234-801-2345678']) {
    const r = normalizePhone(input);
    assert.equal(r.ok, true, input);
    assert.equal(r.phone, '2348012345678', input);
  }
});

test('normalizePhone rejects empty and non-numeric input', () => {
  for (const input of ['', '   ', 'hello', 'abc123']) {
    const r = normalizePhone(input);
    assert.equal(r.ok, false, input);
    assert.ok(r.error, 'an error string is returned');
  }
});

test('normalizePhone rejects too-short and too-long digit runs', () => {
  assert.equal(normalizePhone('12345').ok, false);
  assert.equal(normalizePhone('1').ok, false);
  assert.equal(normalizePhone('23480123456789012345').ok, false);
});

test('normalizePhone enforces 8-15 digits with a non-zero leading digit', () => {
  assert.equal(normalizePhone('234' + '8'.repeat(5)).ok, true);   // 3+5 digits
  assert.equal(normalizePhone('234' + '8'.repeat(12)).ok, true);  // 3+12 digits
  assert.equal(normalizePhone('08012345678').ok, false, 'a leading zero is not a valid international number');
});

test('maskPhone hides everything but the last 4 digits', () => {
  assert.equal(maskPhone('2348012345678'), '*********5678');
  assert.equal(maskPhone('1234'), '****');
  assert.equal(maskPhone('123'), '***');
  assert.equal(maskPhone(''), '');
});

test('normalizeJid maps digits/JID forms to full WA jids', () => {
  assert.equal(normalizeJid('2348012345678'), '2348012345678@s.whatsapp.net');
  assert.equal(normalizeJid('2348012345678@s.whatsapp.net'), '2348012345678@s.whatsapp.net');
  assert.equal(normalizeJid(''), '');
});

test('ownerNotificationTarget picks the first plain WA jid or maps a bare number', () => {
  assert.equal(ownerNotificationTarget(['2348012345678@s.whatsapp.net']), '2348012345678@s.whatsapp.net');
  assert.equal(ownerNotificationTarget(['2348012345678']), '2348012345678@s.whatsapp.net');
  assert.equal(ownerNotificationTarget([]), '');
  assert.equal(ownerNotificationTarget(['']), '');
});