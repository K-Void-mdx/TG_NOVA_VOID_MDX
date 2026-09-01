import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * NOVA_VOID MDX brand image.
 *
 * The image (catbox URL, configured via BRAND_IMAGE_URL) is fetched once and
 * cached in memory so the bot never re-downloads it on every command. The
 * first fetch happens lazily; commands that require an image degrade to plain
 * text if the network is down (the bot must never break because a catbox
 * fetch failed).
 */

const FETCH_TIMEOUT_MS = 15_000;
const DISK_CACHE_REL = 'data/brand-image.bin';
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let cachedBuffer = null;
let inflight = null;

/** Resolves the configured brand-image URL (override via BRAND_IMAGE_URL). */
function configuredUrl() {
  return String(process.env.BRAND_IMAGE_URL || 'https://files.catbox.moe/hh1cbl.jpg').trim() || '';
}

function cacheFile() {
  return join(PROJECT_ROOT, DISK_CACHE_REL);
}

/**
 * Returns the brand image Buffer, or null if it cannot be fetched/cached on
 * the first attempt (e.g. no network). The buffer is memoized for the life of
 * the process and refreshed on disk for a warm next boot.
 *
 * @returns {Promise<Buffer|null>}
 */
export async function getBrandImage() {
  const url = configuredUrl();
  if (!url) return null;
  if (cachedBuffer) return cachedBuffer;
  if (inflight) return inflight;
  inflight = fetchBrandImage(url).finally(() => { inflight = null; });
  return inflight;
}

async function fetchBrandImage(url) {
  // Warm from disk first — cheaper than a network round-trip on boot.
  const disk = cacheFile();
  try {
    if (!cachedBuffer && existsSync(disk)) {
      const bytes = await readFile(disk);
      if (bytes?.length) cachedBuffer = bytes;
    }
  } catch { /* corrupt cache is simply refetched */ }

  if (cachedBuffer) return cachedBuffer;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) return null;
    cachedBuffer = bytes;
    try { await writeFile(disk, bytes); } catch { /* cache is best-effort */ }
    return bytes;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}