import * as wa from '../../ui/wa-style.js';

const sc = wa.smallCaps;

const JOKES = [
  'Why did the WhatsApp bot cross the road? To fetch the other side!',
  'I told my bot a joke… it said “that’s a 404: humour not found.”',
  'Why do bots make terrible dancers? Too many bugs.',
  'What’s a bot’s favourite song? “Cannot Connect to This Network.”',
];

const FACTS = [
  'Honey never spoils. Archaeologists have found 3,000-year-old honey still edible.',
  'Octopuses have three hearts.',
  'A group of flamingos is called a “flamboyance”.',
  'Bananas are berries, but strawberries are not.',
];

const QUOTES = [
  '“Success is not final, failure is not fatal: it is the courage to continue.” — Winston Churchill',
  '“The only way to do great work is to love what you do.” — Steve Jobs',
  '“In the middle of difficulty lies opportunity.” — Albert Einstein',
  '“Believe you can and you’re halfway there.” — Theodore Roosevelt',
];

const RIDDLES = [
  { q: 'I speak without a mouth and hear without ears. What am I?', a: 'An echo.' },
  { q: 'The more you take, the more you leave behind. What am I?', a: 'Footsteps.' },
  { q: 'What has keys but opens no locks?', a: 'A piano.' },
  { q: 'What gets wetter the more it dries?', a: 'A towel.' },
];

const TRUTHS = [
  'What is the most embarrassing thing you’ve done in public?',
  'Who in this chat would you swap lives with for a day?',
  'What’s the last lie you told?',
  'What is your biggest fear?',
];

const DARES = [
  'Send your current emoji history to the chat.',
  'Type one full sentence with your eyes closed.',
  'Change your profile status to something random for an hour.',
  'Send the last photo in your gallery to the chat.',
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const hash = (str = '') => { let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0; return Math.abs(h); };

function card(title, body) {
  return [wa.header(), '', title, '', body, '', wa.footer()].join('\n');
}

export function createFunCommands() {
  return [
    { name: 'joke', category: 'fun', usage: '.joke', description: 'A random joke.', execute: (c) => c.reply(card('😂 *_JOKE_*', pick(JOKES))) },
    { name: 'fact', category: 'fun', usage: '.fact', description: 'A random fact.', execute: (c) => c.reply(card('💡 *_FACT_*', pick(FACTS))) },
    { name: 'quote', category: 'fun', usage: '.quote', description: 'A motivational quote.', execute: (c) => c.reply(card('✨ *_QUOTE_*', pick(QUOTES))) },
    {
      name: 'riddle',
      category: 'fun',
      usage: '.riddle',
      description: 'Guess the riddle.',
      execute: (c) => {
        const r = pick(RIDDLES);
        return c.reply(card('🧩 *_RIDDLE_*', `_${r.q}_\n\n*(answer hidden)*`));
      },
    },
    { name: 'truth', category: 'fun', usage: '.truth', description: 'A truth question.', execute: (c) => c.reply(card('🤔 *_TRUTH_*', pick(TRUTHS))) },
    { name: 'dare', category: 'fun', usage: '.dare', description: 'A dare to complete.', execute: (c) => c.reply(card('🔥 *_DARE_*', pick(DARES))) },
    {
      name: 'ship',
      category: 'fun',
      usage: '.ship @user1 @user2',
      description: 'Love compatibility % between two people.',
      execute: (c) => {
        const a = c.args?.[0] ?? 'A';
        const b = c.args?.[1] ?? 'B';
        const pct = hash(`${a}::${b}`) % 101;
        const note = pct > 80 ? '🔥 A perfect match!' : pct > 50 ? '💞 A strong bond.' : '🙂 Could use some work.';
        return c.reply(card('💘 *_SHIP_*', `*${a}* + *${b}*\n\n❒ Compatibility : \`${pct}%\`\n❒ ${note}`));
      },
    },
    {
      name: 'rate',
      category: 'fun',
      usage: '.rate @user',
      description: 'Rate someone out of 10.',
      execute: (c) => {
        const target = c.message?.text?.match(/@?[\w\s]+/)?.[0] ?? c.args?.[0] ?? 'You';
        const score = hash(target) % 11;
        return c.reply(card('⭐ *_RATE_*', `*${target}* scores **\`${score}/10\`**`));
      },
    },
  ];
}