/**
 * WhatsApp group administration API for one session's socket.
 *
 * Thin, defensive wrappers around Baileys group verbs so commands never need
 * to know socket internals. Every method resolves a boolean ("granted/ok") and
 * throws a USER-FACING error message on real failures. Group verbs require
 * the bot's own account to be a group admin; Baileys raises an error otherwise
 * which is surfaced honestly to the caller.
 */

function jidOf(value = '') {
  return String(value ?? '').trim();
}

/** Mentions everybody in a group (tagall) without the bot spamming itself. */
export function createGroupApi(sock) {
  if (!sock) return null;

  return {
    /** @returns {Promise<{id:[string,string]}>} group metadata if the bot is a member. */
    async metadata(jid) {
      const meta = await sock.groupMetadata(jid);
      return meta ?? null;
    },

    async participants(jid) {
      const meta = await sock.groupMetadata(jid);
      return meta?.participants ?? [];
    },

    async promote(jid, participantJid) {
      await sock.groupParticipantsUpdate(jid, [jidOf(participantJid)], 'promote');
      return true;
    },

    async demote(jid, participantJid) {
      await sock.groupParticipantsUpdate(jid, [jidOf(participantJid)], 'demote');
      return true;
    },

    async kick(jid, participantJid) {
      await sock.groupParticipantsUpdate(jid, [jidOf(participantJid)], 'remove');
      return true;
    },

    async add(jid, participantJid) {
      await sock.groupParticipantsUpdate(jid, [jidOf(participantJid)], 'add');
      return true;
    },

    async mute(jid, participantJid, { durationSec = 60 } = {}) {
      await sock.groupParticipantsUpdate(jid, [jidOf(participantJid)], 'mute', { day: durationSec });
      return true;
    },

    async unmute(jid, participantJid) {
      await sock.groupParticipantsUpdate(jid, [jidOf(participantJid)], 'unmute');
      return true;
    },

    /** Open/close the group to non-admin posting. */
    async setOpen(jid, open) {
      await sock.groupSettingUpdate(jid, open ? 'unlocked' : 'locked');
      return true;
    },

    async link(jid) {
      return sock.groupInviteCode(jid);
    },

    async revoke(jid) {
      return sock.groupRevokeInvite(jid);
    },
  };
}