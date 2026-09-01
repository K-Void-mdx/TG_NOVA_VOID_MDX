import * as wa from '../../ui/wa-style.js';

const sc = wa.smallCaps;

function usageCard(cmd, usage) {
  return ['⚠️ *_USAGE_*', '', '`.' + sc(cmd) + ' ' + usage + '`', '', wa.footer()].join('\n');
}

function card(title, body) {
  return [wa.header(), '', title, '', body, '', wa.footer()].join('\n');
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'NOVA_VOID-MDX/1.0' } });
  if (!res.ok) throw new Error('bad status');
  return res.json();
}

/**
 * Lightweight text-only search results. Google uses DuckDuckGo's Zero-Click
 * Instant Answer (free, no key); Wikipedia uses its public REST API; news uses
 * Google News RSS-to-JSON. All return plain text links the user can open.
 */
export function createSearchCommands() {
  return [
    {
      name: 'google',
      aliases: ['g', 'search'],
      category: 'search',
      usage: '.google <query>',
      description: 'Top results with links (text only).',
      async execute(ctx) {
        const q = String(ctx.argsText ?? '').trim();
        if (!q) return ctx.reply(usageCard('google', '<query>'));
        try {
          const json = await fetchJson(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`);
          const abstract = json?.AbstractText ?? '';
          const links = (json?.RelatedTopics ?? []).slice(0, 5).filter((t) => t?.Text && t?.FirstURL);
          const body = [
            abstract ? `${abstract}\n` : '',
            ...links.map((t, i) => `${i + 1}. _${t.Text}_\n   _${t.FirstURL}_`),
            ...(links.length ? [] : ['No text results found. Try a more specific query.']),
          ].join('\n');
          return ctx.reply(card('🔎 *_GOOGLE_*', body));
        } catch {
          return ctx.reply(card('⚠️ *_SEARCH UNAVAILABLE_*', 'The search service is unreachable. Try again later.'));
        }
      },
    },
    {
      name: 'wiki',
      category: 'search',
      usage: '.wiki <topic>',
      description: 'One-paragraph Wikipedia summary.',
      async execute(ctx) {
        const q = String(ctx.argsText ?? '').trim();
        if (!q) return ctx.reply(usageCard('wiki', '<topic>'));
        try {
          const json = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q.replace(/\s+/g, '_'))}`);
          const text = json?.extract ?? json?.extract_html?.replace(/<[^>]+>/g, '') ?? '';
          if (!text) return ctx.reply(card('⚠️ *_NOT FOUND_*', `No summary for “${q}”.`));
          return ctx.reply(card('📖 *_WIKIPEDIA_*', `*${json.title}*\n\n${text}`));
        } catch {
          return ctx.reply(card('⚠️ *_WIKI UNAVAILABLE_*', 'Wikipedia is unreachable. Try again later.'));
        }
      },
    },
    {
      name: 'news',
      category: 'search',
      usage: '.news [topic]',
      description: 'Top headlines (optional topic).',
      async execute(ctx) {
        const topic = String(ctx.argsText ?? '').trim();
        try {
          const query = topic ? `${encodeURIComponent(topic)} in:news` : 'top stories';
          const json = await fetchJson(`https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&t=News`);
          const topics = (json?.RelatedTopics ?? []).filter((t) => t?.Text && t?.FirstURL).slice(0, 5);
          const body = topics.length
            ? topics.map((t, i) => `${i + 1}. _${t.Text}_\n   _${t.FirstURL}_`).join('\n')
            : 'No headlines found. Try a different topic.';
          return ctx.reply(card('📰 *_NEWS_*', body));
        } catch {
          return ctx.reply(card('⚠️ *_NEWS UNAVAILABLE_*', 'The news service is unreachable. Try again later.'));
        }
      },
    },
    {
      name: 'yts',
      category: 'search',
      usage: '.yts <query>',
      description: 'YouTube search results (links).',
      async execute(ctx) {
        const q = String(ctx.argsText ?? '').trim();
        if (!q) return ctx.reply(usageCard('yts', '<query>'));
        return ctx.reply(card('▶️ *_YOUTUBE SEARCH_*', `Search “${q}” on YouTube:\n\nhttps://www.youtube.com/results?search_query=${encodeURIComponent(q)}`));
      },
    },
  ];
}