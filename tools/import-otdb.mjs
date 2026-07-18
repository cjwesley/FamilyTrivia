import { SCOPE, ensure, insert, list, update } from './snc.mjs';

// OTDB category id -> our category (name, icon, color)
const CATS = {
  9:  ['General Knowledge', '🧠', '#4cc9f0'],
  17: ['Science & Nature', '🔬', '#06d6a0'],
  23: ['History', '🏛️', '#ffd166'],
  22: ['Geography', '🗺️', '#9b5de5'],
  11: ['Movies', '🎬', '#ef476f'],
  21: ['Sports', '⚽', '#f77f00'],
  27: ['Animals', '🐾', '#80ed99'],
  12: ['Music', '🎵', '#f15bb5'],
  18: ['Computers', '💻', '#00bbf9'],
};
const DIFF = { easy: 1, medium: 3, hard: 5 };
// Note: split('=') on a bare flag (e.g. "--activate", no "=") yields a single-element
// array, so Object.fromEntries would silently set that key to `undefined` and the
// `if (args.activate)` check below would never fire. Default the value to 'true' so
// bare boolean flags work as the brief's usage (`--activate`) requires.
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? 'true' : v];
}));
const pool = args.pool || 'game';
const perCat = parseInt(args.amount || '50', 10);

if (args.activate) {
  // bulk-activate previously imported, reviewed questions
  const inactive = await list(`${SCOPE}_question`, 'active=false^source_idISNOTEMPTY', 'sys_id');
  for (const q of inactive) await update(`${SCOPE}_question`, q.sys_id, { active: 'true' });
  console.log(`activated ${inactive.length} questions`);
  process.exit(0);
}

const decode = s => s
  .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&eacute;/g, 'é').replace(/&ouml;/g, 'ö');

let imported = 0, skipped = 0;
for (const [otdbId, [name, icon, color]] of Object.entries(CATS)) {
  const cat = await ensure(`${SCOPE}_category`, 'name=' + name, {
    name, icon, color, active: 'true', otdb_id: otdbId,
  });
  const res = await fetch(`https://opentdb.com/api.php?amount=${perCat}&category=${otdbId}&type=multiple`);
  const json = await res.json();
  for (const q of json.results || []) {
    const sourceId = 'otdb:' + Buffer.from(q.question).toString('base64').slice(0, 56);
    const dup = await list(`${SCOPE}_question`, 'source_id=' + sourceId, 'sys_id'); // list() URL-encodes the query
    if (dup.length) { skipped++; continue; }
    const qRec = await insert(`${SCOPE}_question`, {
      text: decode(q.question), qtype: 'mc', category: cat.sys_id,
      difficulty: DIFF[q.difficulty] || 3, pool, active: 'false', source_id: sourceId,
    });
    const options = [q.correct_answer, ...q.incorrect_answers]
      .map((t, i) => ({ t: decode(t), correct: i === 0 }))
      .sort(() => Math.random() - 0.5);
    for (let i = 0; i < options.length; i++) {
      await insert(`${SCOPE}_question_option`, {
        question: qRec.sys_id, text: options[i].t, correct: options[i].correct ? 'true' : 'false', order: i,
      });
    }
    imported++;
  }
  console.log(`${name}: done (running total ${imported} imported, ${skipped} dup-skipped)`);
  await new Promise(r => setTimeout(r, 5500)); // OTDB rate limit: 1 request / 5s
}
console.log(`imported ${imported} ${pool}-pool questions (inactive, pending review)`);
