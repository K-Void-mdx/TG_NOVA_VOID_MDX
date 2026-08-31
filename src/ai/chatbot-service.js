import { isChatbotTrigger, stripBotMention } from './chatbot.js';
import { buildAnswerParts } from './format-code.js';

/**
 * Handles one potential chatbot turn.
 * Returns true only when a reply was sent.
 * `force` is set for DMs where every message is a prompt (no mention needed).
 *
 * Code answers use the same shared renderer as .ai: prose is sent as a styled
 * text message and each fenced code block as its own plain RAW text message —
 * no document, no button, no fences leaked.
 */
export async function handleChatbotMessage({ message, botJid, botLid, enabled, ai, reply, force = false }) {
  if (!enabled || message.isFromBot) return false;
  if (!force && !isChatbotTrigger(message, botJid, botLid)) return false;

  const mentioned = (message.mentionedJids ?? []).some((jid) => {
    const norm = String(jid).toLowerCase().replace(/:\d+(?=@)/, '');
    return [botJid, botLid].some((id) => id && norm === String(id).toLowerCase().replace(/:\d+(?=@)/, ''));
  });
  const prompt = stripBotMention(message.text, botJid, { mentioned });
  if (!prompt) return false;

  let answer;
  try {
    answer = await ai.chat({
      userJid: message.senderJid,
      scope: message.chatJid,
      prompt,
    });
  } catch (error) {
    // A CHATBOT turn (ordinary conversation, not an explicit .ai command) fails
    // SILENTLY when no provider can answer: no knowledge fallback exists and
    // no error card is spammed at normal users. The real cause is logged.
    console.error(`[CHATBOT] provider error: ${error?.message ?? error}`);
    if (error?.cause) console.error(`[CHATBOT] caused by: ${error.cause?.message ?? error.cause}`);
    return false;
  }

  // One message per ordered part: styled prose first, then each code block as
  // its own plain raw text message. Ordering and every block are preserved.
  // The `format` hint lets adapters keep code as copyable raw text (Telegram
  // sends it without HTML parsing) while prose gets the platform styling.
  const parts = buildAnswerParts(answer);
  for (const part of parts) await reply(part.content, part.type === 'code' ? 'raw' : 'wa-style');
  return parts.length > 0;
}