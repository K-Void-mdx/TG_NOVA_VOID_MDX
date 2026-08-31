/**
 * Telegram membership gate.
 *
 * Before a Telegram user may use the bot they must be a member of the
 * configured required channel AND group (verified via getChatMember). The
 * owner is ALWAYS exempt, so misconfiguration can never lock the operator out.
 * Verified results are cached briefly; the "✓ ᴄʜᴇᴄᴋ ᴍᴇᴍʙᴇʀꜱʜɪᴘ" button forces
 * a fresh check.
 */

const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member']);
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 500;

export function isMember(member) {
  return MEMBER_STATUSES.has(String(member?.status ?? '').toLowerCase());
}

export function createMembershipGate({
  client,
  ownerIds = [],
  channelChat = '',
  groupChat = '',
  getNow = () => Date.now(),
  now = getNow,
}) {
  const cache = new Map();
  const targets = [channelChat, groupChat].filter(Boolean);

  function isOwner(userId) {
    const id = String(userId).replace(/^tg:/, '');
    return ownerIds.some((owner) => String(owner).replace(/^tg:/, '') === id);
  }

  async function checkTarget(chatId, userId) {
    let member;
    try {
      member = await client.getChatMember(chatId, userId);
    } catch (error) {
      // The bot is not in that channel/group (or the chat id is wrong). This
      // is a real misconfiguration, never a silent pass: report the target as
      // missing so the operator notices, and log the cause.
      return { chat: chatId, ok: false, access: false, error };
    }
    return { chat: chatId, ok: isMember(member), access: true };
  }

  /**
   * Returns { ok, missing, owner, error } — never throws. With `force: true`
   * the cache is bypassed (used by the membership check button).
   */
  async function verify(userId, { force = false } = {}) {
    const id = String(userId).replace(/^tg:/, '');
    if (isOwner(id)) return { ok: true, missing: [], owner: true };

    if (!force) {
      const cached = cache.get(id);
      if (cached && cached.expiresAt > now()) {
        return { ...cached.result, cached: true };
      }
    }

    const results = [];
    for (const chat of targets) {
      results.push(await checkTarget(chat, id));
    }
    const failed = results.filter((item) => !item.ok);
    const firstError = results.find((item) => item.error)?.error;
    const result = {
      ok: failed.length === 0,
      missing: failed.map((item) => item.chat),
      error: firstError ?? null,
      owner: false,
    };

    if (result.ok) {
      if (cache.size >= MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(id, { result, expiresAt: now() + CACHE_TTL_MS });
    }
    return result;
  }

  function invalidate(userId) {
    cache.delete(String(userId).replace(/^tg:/, ''));
  }

  const result = {
    verify,
    invalidate,
    isOwner,
    targets,
  };
  return result;
}