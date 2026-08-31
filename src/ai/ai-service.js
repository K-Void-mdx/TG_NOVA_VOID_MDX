import { buildSystemPrompt } from './identity.js';
import { BOT } from '../ui/wa-style.js';

const DEFAULT_PERSONALITY = `You are NOVA_VOID MDX, a helpful AI assistant on WhatsApp. You are friendly, concise, and direct. Never say you are Claude, GPT, or any other model. Your name is NOVA_VOID MDX. Keep responses short and natural for WhatsApp chat. Use simple formatting that works on WhatsApp.`;

export class AIService {
  /**
   * `personality` is a raw prompt override (tests / advanced config).
   * Otherwise the central identity builder produces the system prompt from the
   * router's ACTUAL configured providers, so the model always knows it is
   * NOVA_VOID MDX and can honestly name what powers it — never inventing a
   * creator (e.g. "Google made me") just because a Google model answers.
   * `memory` is retained as an inert option for backwards compatibility with
   * older configs; no user-facing training or knowledge store exists anymore.
   */
  constructor({ router, sessions, memory, personality, botName = BOT, identity = {} }) {
    this.router = router;
    this.sessions = sessions;
    this.botName = botName;
    this.identityOverride = identity;
    if (typeof personality === 'string' && personality.trim()) this.personality = personality.trim();
  }

  /** System prompt for the current chat, built from live provider state. */
  buildSystemPrompt() {
    if (this.personality) return this.personality;
    return buildSystemPrompt({
      botName: this.botName,
      providers: this.router.describe(),
      ...this.identityOverride,
    });
  }

  async chat({ userJid, prompt, scope = 'private', provider, systemPrompt = '' }) {
    const session = this.sessions.ensure(userJid, scope);
    const messages = [
      { role: 'system', content: systemPrompt || this.buildSystemPrompt() },
      ...session.messages.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: prompt },
    ];

    const result = await this.router.generateText({ messages, userJid, scope }, { provider });
    const answer = typeof result === 'string' ? result : result?.text ?? result?.content ?? '';
    if (!answer) throw new Error('AI provider returned an empty response');

    this.sessions.append(userJid, { role: 'user', content: prompt }, scope);
    this.sessions.append(userJid, { role: 'assistant', content: answer }, scope);
    return answer;
  }
}