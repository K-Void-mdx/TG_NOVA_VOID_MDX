# API Reference - Message Formatting Functions

This document provides detailed API documentation for all message formatting functions used in NOVA_VOID MDX.

## Table of Contents
1. [Telegram Format Functions](#telegram-format-functions)
2. [WhatsApp Format Functions](#whatsapp-format-functions)
3. [Utility Functions](#utility-functions)
4. [Error Messages](#error-messages)

---

## Telegram Format Functions

### `escapeHtml(value)`

**Description:** Escapes HTML special characters to prevent injection attacks.

**Parameters:**
- `value` (string): The text to escape. Non-strings are converted to string.

**Returns:** (string) HTML-escaped text

**Example:**
```javascript
import { escapeHtml } from './telegram/format.js';

escapeHtml('<script>alert("xss")</script>');
// Returns: &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;

escapeHtml('King & Queen');
// Returns: King &amp; Queen
```

**Security Note:** Always use this function before rendering user input in Telegram HTML.

---

### `waToTelegramHtml(text)`

**Description:** Converts WhatsApp-style markup to Telegram HTML.

**Parameters:**
- `text` (string): Text with WhatsApp formatting (*bold*, _italic_, `code`)

**Returns:** (string) Telegram HTML

**Example:**
```javascript
import { waToTelegramHtml } from './telegram/format.js';

waToTelegramHtml('*bold* _italic_ `code` *_bold italic_*');
// Returns: <b>bold</b> <i>italic</i> <code>code</code> <b><i>bold italic</i></b>

// All special chars are escaped
waToTelegramHtml('Test <tag> & symbol');
// Returns: Test &lt;tag&gt; &amp; symbol
```

**Markup Support:**
- `*text*` → `<b>text</b>`
- `_text_` → `<i>text</i>`
- `` `text` `` → `<code>text</code>`
- `*_text_*` → `<b><i>text</i></b>`

---

### `telegramTextPayload(text, format)`

**Description:** Creates a message payload for Telegram sendMessage API.

**Parameters:**
- `text` (string): The message text
- `format` (string, optional): Either `'wa-style'` (default) or `'raw'`

**Returns:** (object) Payload with `text` and optional `parse_mode`

**Example:**
```javascript
import { telegramTextPayload } from './telegram/format.js';

// WhatsApp-style formatting
const payload1 = telegramTextPayload('*bold* text', 'wa-style');
// Returns: { text: '<b>bold</b> text', parse_mode: 'HTML' }

// Raw (no parsing)
const payload2 = telegramTextPayload('*bold* text', 'raw');
// Returns: { text: '*bold* text' }

// Send to Telegram API
client.sendMessage(chatId, payload1);
```

---

### `telegramChatUrl(username)`

**Description:** Creates a t.me link from a Telegram chat username.

**Parameters:**
- `username` (string): Chat username (with or without @)

**Returns:** (string) t.me URL or empty string if invalid

**Example:**
```javascript
import { telegramChatUrl } from './telegram/format.js';

telegramChatUrl('@nova_void_updates');
// Returns: 'https://t.me/nova_void_updates'

telegramChatUrl('nova_void_updates');
// Returns: 'https://t.me/nova_void_updates'

telegramChatUrl('');
// Returns: ''
```

---

### `gateKeyboard(urls)`

**Description:** Creates inline keyboard for membership gate verification.

**Parameters:**
- `urls` (object):
  - `channelUrl` (string): Link to channel
  - `groupUrl` (string): Link to group
  - `ownerUrl` (string, optional): Link to owner

**Returns:** (object) Telegram inline keyboard

**Example:**
```javascript
import { gateKeyboard } from './telegram/format.js';

const keyboard = gateKeyboard({
  channelUrl: 'https://t.me/nova_void_updates',
  groupUrl: 'https://t.me/nova_void_group',
  ownerUrl: 'https://t.me/kingval'
});

// Returns keyboard with buttons:
// [Join Channel] [Join Group]
// [✓ Check Membership]
// [Owner]
```

---

### `menuKeyboard(urls)`

**Description:** Creates inline keyboard for command menu.

**Parameters:**
- `urls` (object):
  - `channelUrl` (string): Link to channel
  - `groupUrl` (string): Link to group
  - `ownerUrl` (string, optional): Link to owner

**Returns:** (object) Telegram inline keyboard

**Example:**
```javascript
const keyboard = menuKeyboard({
  channelUrl: 'https://t.me/nova_void_updates',
  groupUrl: 'https://t.me/nova_void_group'
});
```

---

### `welcomeCard(options)`

**Description:** Creates /start welcome message card.

**Parameters:**
- `options` (object, optional):
  - `botName` (string): Name of the bot (default: 'NOVA_VOID MDX')

**Returns:** (string) Welcome message

**Example:**
```javascript
import { welcomeCard } from './telegram/format.js';

const msg = welcomeCard({ botName: 'NOVA_VOID MDX' });
// Returns formatted welcome message with instructions
```

---

### `verifiedCard()`

**Description:** Creates verification success message.

**Returns:** (string) Verification confirmation message

**Example:**
```javascript
import { verifiedCard } from './telegram/format.js';

const msg = verifiedCard();
// Returns: ✅ VERIFIED — COMMANDS UNLOCKED
```

---

### `menuPanelCard(options)`

**Description:** Creates main command menu panel.

**Parameters:**
- `options` (object, optional):
  - `botName` (string): Bot name (default: 'NOVA_VOID MDX')
  - `commands` (array): Array of command strings (e.g., ['/pair', '/unpair'])

**Returns:** (string) Menu panel HTML

**Example:**
```javascript
const panel = menuPanelCard({
  botName: 'NOVA_VOID MDX',
  commands: ['/start', '/help', '/pair', '/pairs', '/unpair']
});
```

---

### `missingTargetsCard(missing)`

**Description:** Creates message showing what's required for verification.

**Parameters:**
- `missing` (array): Array of missing targets (e.g., ['channel', 'group'])

**Returns:** (string) Card with requirements

**Example:**
```javascript
import { missingTargetsCard } from './telegram/format.js';

const card = missingTargetsCard(['channel', 'group']);
// Shows: Still required: channel, group
```

---

## WhatsApp Format Functions

### `smallCaps(text)`

**Description:** Converts ASCII text to Unicode small-caps.

**Parameters:**
- `text` (string): Text to convert

**Returns:** (string) Small-caps version

**Example:**
```javascript
import { smallCaps } from './ui/wa-style.js';

smallCaps('hello world');
// Returns: ʜᴇʟʟᴏ ᴡᴏʀʟᴅ

smallCaps('PAIR');
// Returns: ᴘᴀɪʀ
```

**Character Mapping:**
- a→ᴀ, b→ʙ, c→ᴄ, d→ᴅ, e→ᴇ, ... z→ᴢ
- Case-insensitive
- Non-ASCII characters pass through

---

### `header(title)`

**Description:** Creates a box-drawing header with title.

**Parameters:**
- `title` (string, optional): Header title (default: 'NOVA_VOID MDX')

**Returns:** (string) Multi-line box header

**Example:**
```javascript
import { header } from './ui/wa-style.js';

header('NOVA_VOID MDX');
// Returns:
// ╔════════════════════════════════╗
// ║⚡ NOVA_VOID MDX ⚡             ║
// ╚════════════════════════════════╝
```

---

### `section(title)`

**Description:** Creates a section header.

**Parameters:**
- `title` (string): Section title

**Returns:** (string) Section header line

**Example:**
```javascript
import { section } from './ui/wa-style.js';

section('STATUS');
// Returns: ┌─〔 *_STATUS_* 〕
```

---

### `row(label, value)`

**Description:** Creates a labeled row in a section.

**Parameters:**
- `label` (string): Label text
- `value` (string): Value text

**Returns:** (string) Row line

**Example:**
```javascript
import { row } from './ui/wa-style.js';

row('Status', 'ACTIVE');
// Returns: ├ *Status* : `ACTIVE`
```

---

### `sectionEnd()`

**Description:** Creates section closing line.

**Returns:** (string) Closing line

**Example:**
```javascript
import { sectionEnd } from './ui/wa-style.js';

sectionEnd();
// Returns: └──────────
```

---

### `footer(text)`

**Description:** Creates message footer with branding.

**Parameters:**
- `text` (string, optional): Footer text (default: 'NOVA_VOID MDX')

**Returns:** (string) Footer line

**Example:**
```javascript
import { footer } from './ui/wa-style.js';

footer('NOVA_VOID MDX');
// Returns: ⚡ *_NOVA_VOID MDX_*
```

---

### `accessDenied(command, requiredRole)`

**Description:** Creates access denied error card.

**Parameters:**
- `command` (string): Command name that was denied
- `requiredRole` (string, optional): Required role (default: 'OWNER')

**Returns:** (string) Error card

**Example:**
```javascript
import { accessDenied } from './ui/wa-style.js';

const card = accessDenied('pair', 'OWNER');
// Returns formatted error card with small-caps
```

---

### `commandError(command)`

**Description:** Creates command execution error card.

**Parameters:**
- `command` (string): Command name that failed

**Returns:** (string) Error card

**Example:**
```javascript
import { commandError } from './ui/wa-style.js';

const card = commandError('pair');
// Returns error card with recovery instructions
```

---

### `aiNotConfigured()`

**Description:** Creates AI provider configuration error.

**Returns:** (string) Configuration error message

**Example:**
```javascript
import { aiNotConfigured } from './ui/wa-style.js';

const msg = aiNotConfigured();
// Returns message indicating no AI provider is configured
```

---

### `rateLimited()`

**Description:** Creates rate limit warning card.

**Returns:** (string) Rate limit warning

**Example:**
```javascript
import { rateLimited } from './ui/wa-style.js';

const msg = rateLimited();
// Returns warning about message rate limit
```

---

## Utility Functions

### `splitText(text, maxLength)`

**Description:** Splits long text into chunks for Telegram (4096 char limit).

**Parameters:**
- `text` (string): Text to split
- `maxLength` (number, optional): Max chars per chunk (default: 4000)

**Returns:** (array) Array of text chunks

**Example:**
```javascript
import { splitText } from './telegram/bot-client.js';

const longText = 'x'.repeat(5000);
const chunks = splitText(longText);
// Returns: ['x'.repeat(4000), 'x'.repeat(1000)]
```

---

## Error Messages

### Telegram Error Messages

All error messages include:
- ✅ HTML escaping for safety
- ✅ Emoji for visual hierarchy
- ✅ Small-caps for consistency
- ✅ Proper formatting

**Examples:**

```javascript
// Unknown Command
'❓ UNKNOWN COMMAND\n\n/badcmd is not a Telegram command.\n\nUse /help for the full list.'

// Access Denied
'🚫 ACCESS RESTRICTED — /pair is owner-only.'

// Command Error
'🛠️ COMMAND ERROR — /pair could not be completed.'
```

### WhatsApp Error Messages

All error messages include:
- ✅ Box-drawing borders
- ✅ Small-caps formatting
- ✅ Structured sections
- ✅ Footer branding

**Examples:**

```javascript
// Access Denied Card
'⚠️ *_ACCESS RESTRICTED_*\n\nYou do not have permission to use:\n`.pair`\n\n┌─〔 *_ACCESS* 〕\n├ *Required Role* : `OWNER`\n└──────────'

// Command Error Card
'🛠️ *_COMMAND ERROR_*\n\n`.pair` could not be completed.\nPlease try again in a moment.\n\n⚡ *_NOVA_VOID MDX_*'
```

---

## Complete Example

### Telegram Error Response

```javascript
import { escapeHtml } from './telegram/format.js';

function handleUnknownCommand(cmd, ctx) {
  return ctx.replyHtml(
    [
      '❓ <b>ᴜɴᴋɴᴏᴡɴ ᴄᴏᴍᴍᴀɴᴅ</b>',
      '',
      `<code>/${escapeHtml(cmd)}</code> ɪꜱ ɴᴏᴛ ᴀ ᴛᴇʟᴇɢʀᴀᴍ ᴄᴏᴍᴍᴀɴᴅ.`,
      '',
      'ᴜꜱᴇ /help ꜰᴏʀ ᴛʜᴇ ꜰᴜʟʟ ʟɪꜱᴛ.',
    ].join('\n')
  );
}
```

### WhatsApp Error Response

```javascript
import { accessDenied } from './ui/wa-style.js';

function handleAccessDenied(cmd, ctx) {
  const card = accessDenied(cmd, 'OWNER');
  return ctx.reply(card);
}
```

---

## Migration Guide

### From Old Format to New

**Before:**
```javascript
`Command error: ${command} failed`
```

**After:**
```javascript
escapeHtml(`Command error: ${command} failed`)
```

**Benefits:**
- ✅ XSS prevention
- ✅ Consistent formatting
- ✅ Better error messages
- ✅ Security hardening

---

## Integration Examples

### Using in Control Plane

```javascript
import { escapeHtml, telegramTextPayload } from './telegram/format.js';

// In error handler
async function handleError(cmd, error, ctx) {
  const html = `
    🛠️ <b>ᴄᴏᴍᴍᴀɴᴅ ᴇʀʀᴏʀ</b>
    
    <code>/${escapeHtml(cmd)}</code> ᴄᴏᴜʟᴅ ɴᴏᴛ ʙᴇ ᴄᴏᴍᴘʟᴇᴛᴇᴅ.
    
    ᴘʟᴇᴀꜱᴇ ᴛʀʏ ᴀɢᴀɪɴ ɪɴ ᴀ ᴍᴏᴍᴇɴᴛ.
  `;
  
  await ctx.replyHtml(html);
  logger.error(`[ COMMAND ] ${cmd} failed: ${error.message}`);
}
```

### Using in WhatsApp Commands

```javascript
import { commandError, accessDenied } from './ui/wa-style.js';

// In command dispatcher
async function executeCommand(command, ctx) {
  // Check permissions
  if (!hasPermission(ctx.senderJid, command.role)) {
    const msg = accessDenied(command.name, command.role);
    return ctx.reply(msg);
  }
  
  try {
    await command.execute(ctx);
  } catch (error) {
    const msg = commandError(command.name);
    await ctx.reply(msg);
    logger.error(`[ COMMAND ] ${command.name} error:`, error);
  }
}
```

---

## Error Handling Patterns

### Safe Message Rendering

```javascript
// ✅ CORRECT - Always escape user input
const userCommand = getUserInput();
const html = `<code>/${escapeHtml(userCommand)}</code>`;

// ❌ WRONG - Direct interpolation
const html = `<code>/${userCommand}</code>`; // Vulnerable!

// ✅ CORRECT - Use payload functions
const payload = telegramTextPayload(msg, 'wa-style');
client.sendMessage(chatId, payload);

// ❌ WRONG - Manual HTML
const html = msg.replace(/\*/g, '<b>').replace(/\*/g, '</b>');
```

---

**Last Updated:** 2026-09-01
**Version:** 1.0.0
**Status:** Complete ✅
