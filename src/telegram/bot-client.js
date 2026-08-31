/**
 * Minimal fetch-based Telegram Bot API client. NO third-party dependency:
 * Node's global fetch covers the whole surface this bot needs (long polling,
 * text/photo/contact send, membership checks, inline callbacks).
 */

const API_BASE = 'https://api.telegram.org';

export class TelegramApiError extends Error {
  constructor(method, payload, response) {
    const detail = response?.description ?? response?.error_code ?? 'unknown error';
    super(`Telegram ${method} failed (${response?.error_code ?? '?'}): ${detail}`);
    this.name = 'TelegramApiError';
    this.method = method;
    this.code = response?.error_code;
    this.response = response;
    this.payload = payload;
  }
}

// Telegram hard-caps a single message at 4096 bytes. Long code blocks are
// split on newline boundaries so nothing is ever truncated or uncopyable.
export function splitText(text = '', maxLength = 4000) {
  const source = String(text ?? '');
  if (!source) return [];
  if (source.length <= maxLength) return [source];
  const chunks = [];
  let buffer = '';
  for (const line of source.split('\n')) {
    if (buffer && buffer.length + line.length + 1 > maxLength) {
      chunks.push(buffer);
      buffer = line;
    } else {
      buffer = buffer ? `${buffer}\n${line}` : line;
    }
    while (buffer.length > maxLength) {
      chunks.push(buffer.slice(0, maxLength));
      buffer = buffer.slice(maxLength);
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

export function createTelegramClient({
  token,
  baseUrl = API_BASE,
  fetchImpl = fetch,
}) {
  const me = { id: null, username: null };
  const lastByChat = new Map();
  // Long-poll in-flight request is abortable so SIGINT never hangs the loop.
  let stopping = false;
  let inFlightController = null;

  const apiUrl = (method) => `${baseUrl}/bot${encodeURIComponent(token)}/${method}`;

  async function api(method, { signal, ...init } = {}) {
    const response = await fetchImpl(apiUrl(method), { signal, ...init });
    let body = null;
    try {
      body = await response.json();
    } catch {
      /* non-JSON body (network error page) — reported below */
    }
    if (!response.ok || body?.ok !== true) {
      const err = new TelegramApiError(method, init, {
        error_code: response.status,
        description: body?.description ?? body?.detail ?? (body ? JSON.stringify(body).slice(0, 200) : 'non-JSON response'),
      });
      err.httpStatus = response.status;
      throw err;
    }
    return body;
  }

  const json = (method, payload) => api(method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  async function getMe() {
    const res = await json('getMe', {});
    me.id = res.result?.id ?? null;
    me.username = res.result?.username ?? null;
    return res.result;
  }

  function rememberMessage(chatId, messageId) {
    lastByChat.set(String(chatId), messageId);
  }

  async function sendMessage(chatId, { text, parse_mode, reply_markup, reply_to_message_id, disable_web_page_preview } = {}) {
    const chunks = splitText(text);
    if (!chunks.length) return { key: {} };
    let sent = { key: {} };
    for (let index = 0; index < chunks.length; index += 1) {
      const first = index === 0;
      const body = { chat_id: chatId, text: chunks[index] };
      if (first) {
        if (parse_mode != null) body.parse_mode = parse_mode;
        if (disable_web_page_preview != null) body.disable_web_page_preview = Boolean(disable_web_page_preview);
        if (reply_to_message_id != null) body.reply_to_message_id = reply_to_message_id;
        if (reply_markup !== undefined) body.reply_markup = reply_markup;
      }
      const res = await json('sendMessage', body);
      sent = { key: { id: res.result?.message_id } };
      rememberMessage(chatId, res.result?.message_id);
    }
    return sent;
  }

  async function sendPhoto(chatId, buffer, { caption, reply_to_message_id } = {}) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('photo', new Blob([buffer]), 'nova-void-image');
    if (caption) form.append('caption', caption);
    if (reply_to_message_id != null) form.append('reply_to_message_id', String(reply_to_message_id));
    const res = await api('sendPhoto', { method: 'POST', body: form });
    rememberMessage(chatId, res.result?.message_id);
    return { key: { id: res.result?.message_id } };
  }

  async function sendContact(chatId, { phoneNumber, firstName = '', lastName = '', reply_to_message_id } = {}) {
    const body = { chat_id: chatId, phone_number: String(phoneNumber), first_name: String(firstName || '—') };
    if (lastName) body.last_name = String(lastName);
    if (reply_to_message_id != null) body.reply_to_message_id = reply_to_message_id;
    const res = await json('sendContact', body);
    rememberMessage(chatId, res.result?.message_id);
    return { key: { id: res.result?.message_id } };
  }

  async function getChatMember(chatId, userId) {
    const res = await json('getChatMember', { chat_id: chatId, user_id: Number(userId) });
    return res.result;
  }

  async function answerCallbackQuery(callbackQueryId, { text } = {}) {
    return json('answerCallbackQuery', {
      callback_query_id: String(callbackQueryId),
      ...(text ? { text } : {}),
    });
  }

  async function editMessageText(chatId, messageId, { text, parse_mode = 'HTML', reply_markup } = {}) {
    const body = { chat_id: chatId, message_id: messageId, text, ...(parse_mode ? { parse_mode } : {}) };
    if (reply_markup !== undefined) body.reply_markup = reply_markup;
    return json('editMessageText', body);
  }

  async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
    return json('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
    });
  }

  function lastMessageId(chatJid) {
    const chatId = String(chatJid ?? '').replace(/^tg:/, '');
    return lastByChat.get(chatId) ?? null;
  }

  /** Long-polling loop: getUpdates with a network timeout, safe shutdown. */
  async function poll({ onUpdate, onError, timeoutSeconds = 25, offset = 0 } = {}) {
    let nextOffset = offset;
    while (!stopping) {
      const controller = new AbortController();
      inFlightController = controller;
      const timer = setTimeout(() => controller.abort(), (timeoutSeconds + 5) * 1000);
      try {
        const res = await api('getUpdates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            offset: nextOffset,
            timeout: timeoutSeconds,
            allowed_updates: ['message', 'callback_query'],
          }),
          signal: controller.signal,
        });
        for (const update of res.result ?? []) {
          const id = Number(update.update_id);
          if (id >= nextOffset) nextOffset = id + 1;
          try {
            await onUpdate(update);
          } catch (error) {
            try { onError('update', error); } catch { /* ignore reporting failure */ }
          }
        }
      } catch (error) {
        if (stopping) break;
        if (error?.httpStatus === 409) {
          try { onError('conflict', error); } catch { /* ignore */ }
          break; // another polling instance owns this token
        }
        if (error?.code === 401) {
          try { onError('unauthorized', error); } catch { /* ignore */ }
          break; // bad token — do not spin
        }
        try { onError('poll', error); } catch { /* ignore */ }
        // Back off before retrying so an outage does not hammer api.telegram.org.
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } finally {
        clearTimeout(timer);
        if (inFlightController === controller) inFlightController = null;
      }
    }
  }

  function stop() {
    stopping = true;
    try { inFlightController?.abort(); } catch { /* ignore */ }
  }

  return {
    get me() {
      return me;
    },
    getMe,
    api,
    sendMessage,
    sendPhoto,
    sendContact,
    getChatMember,
    answerCallbackQuery,
    editMessageText,
    editMessageReplyMarkup,
    lastMessageId,
    poll,
    stop,
  };
}