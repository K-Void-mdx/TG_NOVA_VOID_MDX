import { loadJson, saveJson } from './storage/json-store.js';
import { normalizeJid } from './permissions/roles.js';

/**
 * Mutable, disk-persisted bot settings that operators adjust at runtime:
 *   - the WhatsApp command prefix (`.setprefix`)
 *   - extra trusted sender JIDs (`.addsudo` / `.delsudo`)
 *
 * Data lives in one JSON file (`data/settings.json` by default). Sudo added
 * here is MERGED with the static SUDO_JIDS from env, never replacing it.
 * Prefix set here OVERRIDES the static PREFIX while it is set.
 */
export class BotSettings {
  #file;
  #data;

  constructor(file) {
    if (!file) throw new Error('BotSettings requires a file path');
    this.#file = String(file);
    this.#data = loadJson(this.#file, { prefix: '', sudoJids: [] });
  }

  get prefix() {
    return String(this.#data.prefix ?? '').trim();
  }

  get sudoJids() {
    return [...new Set((this.#data.sudoJids ?? []).map(normalizeJid).filter(Boolean))];
  }

  setPrefix(prefix) {
    const clean = String(prefix ?? '').trim();
    if (!clean) return false;
    this.#data.prefix = clean;
    this.#persist();
    return true;
  }

  addSudo(jid) {
    const clean = normalizeJid(jid);
    if (!clean) return false;
    if (this.sudoJids.includes(clean)) return false;
    this.#data.sudoJids = this.sudoJids;
    this.#data.sudoJids.push(clean);
    this.#persist();
    return true;
  }

  delSudo(jid) {
    const clean = normalizeJid(jid);
    const before = this.sudoJids.length;
    this.#data.sudoJids = this.sudoJids.filter((item) => item !== clean);
    if (this.sudoJids.length !== before) this.#persist();
    return this.sudoJids.length !== before;
  }

  #persist() {
    saveJson(this.#file, this.#data);
  }
}