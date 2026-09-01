# Testing Guide - Message Formatting & Response Quality

This guide covers testing all message formatting improvements made to NOVA_VOID MDX.

## Quick Start

```bash
# Run all tests
npm test

# Run specific test suite
npm test test/format-code.test.js

# Check syntax
npm run check
```

---

## Test Coverage Areas

### 1. Telegram Message Formatting

#### Test File: `test/format-code.test.js`

**What it tests:**
- ✅ HTML escaping in all format functions
- ✅ Small-caps conversion
- ✅ Command name wrapping in `<code>` tags
- ✅ Special character handling

**Key test cases:**

```javascript
// Test HTML injection prevention
const payload = telegramTextPayload('<script>alert("xss")</script>', 'wa-style');
assert(payload.text.includes('&lt;script&gt;'));
assert(!payload.text.includes('<script>'));

// Test command name escaping
const html = `<code>/${escapeHtml('bad<cmd>')}</code>`;
assert(html.includes('bad&lt;cmd&gt;'));

// Test small-caps consistency
const message = '❓ UNKNOWN COMMAND';
assert(message.includes('ᴜɴᴋɴᴏᴡɴ'));
```

**Run tests:**
```bash
npm test test/format-code.test.js
```

---

### 2. Control Plane Message Handlers

#### Test File: `test/control-plane.test.js`

**What it tests:**
- ✅ Unknown command error handling
- ✅ Access denied message formatting
- ✅ Command error recovery
- ✅ Callback answer consistency

**Key test scenarios:**

```javascript
describe('Unknown Command Handler', () => {
  it('should escape command names in error messages', async () => {
    const ctx = createMockContext();
    const result = await handleUnknownCommand('<script>test</script>', ctx);
    
    assert(result.text.includes('&lt;script&gt;'));
    assert(result.text.includes('ɪꜱ ɴᴏᴛ ᴀ ᴛᴇʟᴇɢʀᴀᴍ ᴄᴏᴍᴍᴀɴᴅ'));
  });

  it('should use code tags for command names', async () => {
    const ctx = createMockContext();
    const result = await handleUnknownCommand('badcmd', ctx);
    
    assert(result.text.includes('<code>/badcmd</code>'));
  });

  it('should maintain small-caps consistency', async () => {
    const ctx = createMockContext();
    const result = await handleUnknownCommand('test', ctx);
    
    // All text should use small-caps
    assert(result.text.includes('ᴜɴᴋɴᴏᴡɴ'));
    assert(result.text.includes('ᴄᴏᴍᴍᴀɴᴅ'));
  });
});

describe('Access Denied Handler', () => {
  it('should escape owner-only command names', async () => {
    const ctx = createMockContext();
    const result = await handleAccessDenied('pair', ctx);
    
    assert(result.text.includes('<code>/pair</code>'));
    assert(result.text.includes('ᴏᴡɴᴇʀ-ᴏɴʟʏ'));
  });

  it('should handle special characters safely', async () => {
    const ctx = createMockContext();
    const result = await handleAccessDenied('test<>&', ctx);
    
    assert(result.text.includes('&lt;'));
    assert(result.text.includes('&gt;'));
    assert(result.text.includes('&amp;'));
  });
});
```

**Run tests:**
```bash
npm test test/control-plane.test.js
```

---

### 3. WhatsApp Message Formatting

#### Test File: `test/generate.test.js`

**What it tests:**
- ✅ Small-caps conversion in all error cards
- ✅ Message structure consistency
- ✅ Footer formatting
- ✅ Section/row layout

**Key test cases:**

```javascript
describe('Error Message Cards', () => {
  it('accessDenied should use full small-caps', () => {
    const msg = accessDenied('testcmd', 'OWNER');
    
    // Verify all text uses small-caps
    assert(msg.includes('ᴀᴄᴄᴇꜱꜱ'));
    assert(msg.includes('ʀᴇꜱᴛʀɪᴄᴛᴇᴅ'));
    assert(msg.includes('ᴘᴇʀᴍɪꜱꜱɪᴏɴ'));
  });

  it('commandError should include footer', () => {
    const msg = commandError('testcmd');
    
    assert(msg.includes('ᴄᴏᴍᴍᴀɴᴅ'));
    assert(msg.includes('ᴇʀʀᴏʀ'));
    assert(msg.includes('ᴛʀʏ ᴀɢᴀɪɴ'));
    assert(msg.includes('⚡')); // footer
  });

  it('aiNotConfigured should use consistent styling', () => {
    const msg = aiNotConfigured();
    
    assert(msg.includes('ᴀɪ'));
    assert(msg.includes('ɴᴏᴛ'));
    assert(msg.includes('ᴄᴏɴꜰɪɢᴜʀᴇᴅ'));
  });

  it('rateLimited should have proper structure', () => {
    const msg = rateLimited();
    
    assert(msg.includes('ꜱʟᴏᴡ'));
    assert(msg.includes('ᴅᴏᴡɴ'));
    assert(msg.includes('ᴍᴇꜱꜱᴀɢɪɴɢ'));
    assert(msg.includes('ꜱᴛᴀᴛᴜꜱ'));
  });
});
```

**Run tests:**
```bash
npm test test/generate.test.js
```

---

### 4. Identity & Phone Handling

#### Test File: `test/identity.test.js`, `test/phone.test.js`

**What it tests:**
- ✅ Command name normalization
- ✅ Phone number validation
- ✅ User input sanitization

**Key test cases:**

```javascript
describe('Command Name Handling', () => {
  it('should handle special characters in command names', () => {
    const result = normalizeCommandName('test<>&"');
    assert(result === 'test');
  });

  it('should preserve valid command names', () => {
    const result = normalizeCommandName('pair');
    assert(result === 'pair');
  });
});
```

**Run tests:**
```bash
npm test test/identity.test.js test/phone.test.js
```

---

## Manual Testing Checklist

### Telegram Platform

#### ✅ Unknown Command Error
- [ ] Send `/nonexistent` to bot
- [ ] Verify message displays with small-caps
- [ ] Verify command name is in `<code>` tags
- [ ] Check HTML renders correctly (no raw tags)
- [ ] Verify emoji is displayed correctly (❓)

**Expected Output:**
```
❓ UNKNOWN COMMAND
/nonexistent is not a Telegram command.

Use /help for the full list.
```

#### ✅ Access Denied Message
- [ ] Try owner-only command as non-owner
- [ ] Verify command name is escaped and in `<code>` tags
- [ ] Check small-caps are consistent
- [ ] Verify emoji displays correctly (🚫)
- [ ] Confirm message structure

**Expected Output:**
```
🚫 ACCESS RESTRICTED — /pair is owner-only.
```

#### ✅ Command Error Message
- [ ] Trigger a command error (simulate via test)
- [ ] Verify error message uses small-caps
- [ ] Check command name is properly escaped
- [ ] Verify emoji displays (🛠️)
- [ ] Confirm no internal error details leak

**Expected Output:**
```
🛠️ COMMAND ERROR — /pair could not be completed.
```

#### ✅ Callback Answers
- [ ] Click "Check membership" button
- [ ] Verify answer toast uses small-caps
- [ ] Test verification success message
- [ ] Test membership still missing message
- [ ] Test pairing callback answers

**Expected Outputs:**
```
✅ Verified — commands unlocked
Membership still missing
This pairing attempt does not belong to you.
```

---

### WhatsApp Platform

#### ✅ Access Denied Card
- [ ] Try owner-only command from regular user
- [ ] Verify full small-caps formatting
- [ ] Check box-drawing characters display correctly
- [ ] Verify section structure
- [ ] Check footer is present

**Expected Output:**
```
⚠️ ACCESS RESTRICTED

You do not have permission to use:
`.pair`

┌─〔 *_ACCESS* 〕
├ *Required Role* : `OWNER`
└──────────

⚡ *_NOVA_VOID MDX_*
```

#### ✅ Command Error Card
- [ ] Trigger command error
- [ ] Verify small-caps in header
- [ ] Check command name styling
- [ ] Verify footer is present
- [ ] Confirm message structure

**Expected Output:**
```
🛠️ COMMAND ERROR

`.pair` could not be completed.
Please try again in a moment.

⚡ *_NOVA_VOID MDX_*
```

#### ✅ AI Not Configured
- [ ] Send `.ai query` without API keys configured
- [ ] Verify small-caps throughout
- [ ] Check emoji displays (🧠)
- [ ] Verify instructions are clear

**Expected Output:**
```
🧠 AI NOT CONFIGURED

No external AI provider is connected yet.
Add a provider key to .env and restart to enable AI replies.

⚡ *_NOVA_VOID MDX_*
```

#### ✅ Rate Limited
- [ ] Send multiple `.chatbot` messages rapidly
- [ ] Verify small-caps formatting
- [ ] Check emoji displays (⚠️)
- [ ] Verify structure and status info

**Expected Output:**
```
⚠️ SLOW DOWN

You are messaging NOVA_VOID too quickly.

┌─〔 *_STATUS* 〕
├ *Status* : `COOLDOWN`
└──────────
```

---

## Security Testing

### HTML Injection Prevention

```javascript
// Test cases to verify security:

// Test 1: Script tag injection
const malicious1 = '<script>alert("xss")</script>';
const result1 = escapeHtml(malicious1);
assert(result1 === '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');

// Test 2: Event handler injection
const malicious2 = '<img src=x onerror=alert("xss")>';
const result2 = escapeHtml(malicious2);
assert(!result2.includes('onerror'));
assert(result2.includes('&lt;'));

// Test 3: HTML entity injection
const malicious3 = '&#x3c;script&#x3e;';
const result3 = escapeHtml(malicious3);
assert(result3.includes('&amp;'));

// Test 4: Unicode escaping
const malicious4 = '\u003cscript\u003e';
const result4 = escapeHtml(malicious4);
assert(result4 === '&lt;script&gt;');
```

**Run security tests:**
```bash
npm test -- --grep "security|injection|escape"
```

---

## Performance Testing

### Message Generation Speed

```javascript
describe('Performance', () => {
  it('should generate 1000 error messages in < 100ms', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      commandError(`cmd${i}`);
    }
    const duration = performance.now() - start;
    assert(duration < 100);
  });

  it('should escape HTML in 1000 strings in < 50ms', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      escapeHtml(`test<script>${i}</script>`);
    }
    const duration = performance.now() - start;
    assert(duration < 50);
  });
});
```

**Run performance tests:**
```bash
npm test -- --grep "performance"
```

---

## Continuous Integration

### GitHub Actions Workflow

The repository should include a `.github/workflows/test.yml` that runs:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [20.x]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
      
      - name: Install dependencies
        run: npm ci
      
      - name: Check syntax
        run: npm run check
      
      - name: Run tests
        run: npm test
      
      - name: Security audit
        run: npm audit --production
```

---

## Edge Cases to Test

### 1. Empty Values
```javascript
// Empty command name
escapeHtml('') → ''

// Empty error message
commandError('') → [message with empty command]

// Null/undefined handling
escapeHtml(null) → 'null'
escapeHtml(undefined) → 'undefined'
```

### 2. Very Long Values
```javascript
// 1000+ character command name
const longCmd = 'a'.repeat(1000);
const result = escapeHtml(longCmd);
assert(result.length === 1000);

// Message truncation in Telegram (4096 char limit)
const longMsg = 'x'.repeat(5000);
const chunks = splitText(longMsg, 4000);
assert(chunks.length === 2);
```

### 3. Unicode & Special Characters
```javascript
// Emoji in command names
escapeHtml('emoji🎉test') → 'emoji🎉test'

// RTL text
escapeHtml('مرحبا') → 'مرحبا'

// Zero-width characters
escapeHtml('test\u200Bcmd') → 'test\u200Bcmd'
```

### 4. Concurrent Access
```javascript
// Multiple simultaneous message generations
Promise.all([
  generateErrorCard('cmd1'),
  generateErrorCard('cmd2'),
  generateErrorCard('cmd3'),
])
.then(results => {
  assert(results.length === 3);
  assert(results.every(r => typeof r === 'string'));
});
```

---

## Debugging Tips

### Enable Debug Mode
```bash
DEBUG_MESSAGES=true npm start
```

### Check Message Output
```javascript
// Add to control.js for debugging
if (env.debugMessages) {
  console.log('Message payload:', JSON.stringify(payload, null, 2));
}
```

### Test Locally
```bash
# Start bot in test mode
TEST_MODE=true npm start

# Send test messages
# Use `/help` to verify formatting
# Use invalid commands to test error messages
```

---

## Success Criteria

✅ All tests pass
✅ No HTML injection vulnerabilities
✅ Consistent small-caps across all platforms
✅ Proper escaping in all user-controlled data
✅ Error messages are clear and helpful
✅ Performance is acceptable (<100ms for batch operations)
✅ Edge cases are handled gracefully

---

## Reporting Issues

If you find a formatting issue:

1. **Create a minimal reproduction**
   ```bash
   npm test -- --grep "specific test"
   ```

2. **Check the error message**
   - Is it properly escaped?
   - Are small-caps consistent?
   - Is the structure correct?

3. **Report with details**
   - What platform (Telegram/WhatsApp)?
   - What command triggered it?
   - Screenshot if possible
   - Expected vs actual output

---

## Additional Resources

- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
- [OWASP: Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html)
- [Node.js Testing Guide](https://nodejs.org/en/docs/guides/testing/)
