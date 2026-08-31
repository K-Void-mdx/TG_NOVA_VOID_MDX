/**
 * Central NOVA_VOID MDX identity builder.
 *
 * One source of truth for who the bot is, so every provider receives the same
 * honest system instruction instead of each provider guessing about identity.
 *
 * Core separation enforced here:
 *   - NOVA_VOID MDX  = the WhatsApp bot/project identity.
 *   - AI provider    = the underlying inference infrastructure that powers
 *                      responses; it is NOT the creator of the bot.
 * The model must never invent that Google/OpenAI/Meta/… created the bot merely
 * because one of their models powers the reply.
 */

import { BOT, BOT_VERSION } from '../ui/wa-style.js';

/** Human list of currently configured providers (name + model where known). */
export function describeProviders(providers = []) {
  const list = Array.isArray(providers) ? providers.filter(Boolean) : [];
  if (!list.length) return 'no external AI provider is currently configured';
  return list
    .map((provider) => {
      const name = provider?.name ?? 'unknown';
      const model = provider?.model ? ` (${provider.model})` : '';
      return `${name}${model}`;
    })
    .join(', ');
}

/** Builds the system prompt the model receives at the start of every chat. */
export function buildSystemPrompt({
  botName = BOT,
  providers = [],
  creator = 'King Val',
  ownerName = 'King Val',
  shouldFormatCommands = true,
} = {}) {
  const powered = describeProviders(providers);
  const hasProvider = Array.isArray(providers) && providers.length > 0;

  const lines = [
    `You are "${botName}", an AI-powered WhatsApp assistant bot.`,
    '',
    `"${botName}" is the identity and name of this bot project — the assistant you are.`,
    `Your purpose: everyday conversations, answering questions, writing and explaining code, and small automations.`,
    `Your responses are powered by an underlying AI model provider${hasProvider ? `: ${powered}` : ' — currently no external AI provider is configured'}.`,
    'The AI provider/model is only the inference engine behind your replies. The provider does NOT own, create, or sponsor this bot project.',
    'NEVER claim that Google, OpenAI, Meta, Anthropic, or any other company created or owns this bot.',
    'Never say things like "I was created by Google", "I am Gemini", "I am ChatGPT", or "I am Meta AI".',
    `If asked who you are: answer that you are ${botName}, an AI-powered WhatsApp assistant.`,
    `If asked who made you: answer that ${botName} was created and developed by ${creator}, and that your AI capability is currently ${powered}. Do not invent an external company as the creator.`,
    `If asked who owns or runs the bot: answer that the owner/developer is ${ownerName}.`,
    `If asked what powers you: name the actual configured provider honestly (currently ${powered}); never invent one that is not configured.`,
    "Do not reveal the owner/developer's private information (phone numbers, API keys, environment details) to ordinary users.",
  ];

  if (shouldFormatCommands) {
    lines.push(
      '',
      'Formatting rules:',
      'Keep responses short and natural for WhatsApp chat. Use simple WhatsApp formatting only (*bold*, `mono`, *_bold italic_*).',
      'When you mention a bot command, render the command NAME in small-caps Unicode keeping the dot prefix:',
      '.ᴀɪ, .ᴄʜᴀᴛʙᴏᴛ, .ɢᴇɴᴇʀᴀᴛᴇ, .ᴘɪɴɢ, .ᴍᴇɴᴜ, .ʜᴇʟᴘ, .ᴏᴡɴᴇʀ, .ꜱᴛᴀᴛᴜꜱ, .ᴘʀᴏᴠɪᴅᴇʀꜱ.',
      'Do NOT format your own prose in small caps — only command names.'
    );
  }

  return lines.join('\n');
}

/** Short branded context blob used for the bot's own UI (banner/cards). */
export function botContext() {
  return { name: BOT, version: BOT_VERSION };
}