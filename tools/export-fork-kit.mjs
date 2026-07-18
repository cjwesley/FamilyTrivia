// Regenerates fork-kit/data and fork-kit/assets from the live instance + local sources.
// Emoji/colors come from local constant tables (NOT read back from the instance) because
// the instance's utf8mb3 storage wraps astral-plane chars in FDD6/FDD7+base64; text fields
// that may carry that encoding are decoded and then validated clean.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { SCOPE, list } from './snc.mjs';

const KIT = new URL('../fork-kit/', import.meta.url);
mkdirSync(new URL('data/', KIT), { recursive: true });
mkdirSync(new URL('assets/avatars/', KIT), { recursive: true });

// Same constants as import-otdb.mjs / seed-avatars.mjs (single source: keep in sync by review)
const CAT_META = {
  'General Knowledge': ['🧠', '#4cc9f0'],
  'Science & Nature': ['🔬', '#06d6a0'],
  'History': ['🏛️', '#ffd166'],
  'Geography': ['🗺️', '#9b5de5'],
  'Movies': ['🎬', '#ef476f'],
  'Sports': ['⚽', '#f77f00'],
  'Animals': ['🐾', '#80ed99'],
  'Music': ['🎵', '#f15bb5'],
  'Computers': ['💻', '#00bbf9'],
};
const EMOJI = ['🦊','🐼','🦁','🐸','🦄','🐙','🦉','🐨','🐯','🦖','🐢','🦜','🐳','🦔','🐝','🌮','🍕','🤖','👾','🧙'];
const NAMES = ['Fox','Panda','Lion','Frog','Unicorn','Octopus','Owl','Koala','Tiger','T-Rex','Turtle','Parrot','Whale','Hedgehog','Bee','Taco','Pizza','Robot','Alien','Wizard'];
const HUES = [14,32,50,68,86,104,140,158,176,194,212,230,248,266,284,302,320,338,356,120];

// ServiceNow utf8mb3 astral-char encoding: U+FDD6 U+FDD7 followed by base64 of UTF-8 bytes.
const decodeAstral = (s) =>
  (s || '').replace(/[﷖﷗]+([A-Za-z0-9+/=]+)/g, (_, b64) =>
    Buffer.from(b64, 'base64').toString('utf8'));

const problems = [];
const clean = (s, where) => {
  const out = decodeAstral(s);
  if (/[﷐-﷯]/.test(out)) problems.push(`residual noncharacters in ${where}`);
  if (/&[a-zA-Z#0-9]+;/.test(out)) problems.push(`unresolved HTML entity in ${where}: ${out.slice(0, 60)}`);
  return out;
};

// --- data/questions.json ---
const cats = await list(`${SCOPE}_category`, 'active=true', 'sys_id,name');
const out = {
  exported: new Date().toISOString(),
  source: 'FamilyTrivia ServiceNow app (x_tekvo_famtriv), exported by tools/export-fork-kit.mjs',
  license_note: 'Questions derived from the Open Trivia Database (CC BY-SA 4.0) - see ATTRIBUTION.md',
  categories: [],
};
let qTotal = 0, oTotal = 0;
for (const cat of cats.sort((a, b) => a.name.localeCompare(b.name))) {
  const [icon, color] = CAT_META[cat.name] || ['❓', '#888888'];
  const entry = { name: cat.name, icon, color, questions: [] };
  const questions = await list(`${SCOPE}_question`, `active=true^category=${cat.sys_id}`, 'sys_id,text,qtype,difficulty,pool');
  for (const q of questions) {
    const options = await list(`${SCOPE}_question_option`, `question=${q.sys_id}^ORDERBYorder`, 'text,correct');
    const opts = options.map((o) => ({ text: clean(o.text, `option of "${q.text.slice(0, 40)}"`), correct: o.correct === 'true' }));
    const correctCount = opts.filter((o) => o.correct).length;
    if (correctCount !== 1) { problems.push(`question "${q.text.slice(0, 60)}" has ${correctCount} correct options`); continue; }
    entry.questions.push({
      text: clean(q.text, 'question text'),
      type: q.qtype, difficulty: parseInt(q.difficulty, 10), pool: q.pool, options: opts,
    });
    qTotal++; oTotal += opts.length;
  }
  out.categories.push(entry);
}
writeFileSync(new URL('data/questions.json', KIT), JSON.stringify(out, null, 2) + '\n', 'utf8');

// --- assets ---
copyFileSync(new URL('../src/portal/theme.css', import.meta.url), new URL('assets/theme.css', KIT));
for (let i = 0; i < EMOJI.length; i++) {
  const slug = NAMES[i].toLowerCase().replace(/[^a-z0-9]+/g, '-');
  // per-file gradient id: inlining multiple avatars into one DOM must not collide
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<defs><linearGradient id="g-${slug}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${HUES[i]},70%,55%)"/>` +
    `<stop offset="1" stop-color="hsl(${(HUES[i] + 40) % 360},70%,40%)"/></linearGradient></defs>` +
    `<rect width="100" height="100" fill="url(#g-${slug})"/>` +
    `<text x="50" y="62" font-size="52" text-anchor="middle">${EMOJI[i]}</text></svg>\n`;
  writeFileSync(new URL(`assets/avatars/${slug}.svg`, KIT), svg, 'utf8');
}

// --- report ---
console.log(`categories: ${out.categories.length}, questions: ${qTotal}, options: ${oTotal}, avatars: ${EMOJI.length}`);
if (problems.length) {
  console.error('VALIDATION FAILED:');
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}
console.log('validation clean');
