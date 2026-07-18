// Inserts and deletes one empty row per trivia table to prove each exists
// and accepts records via the Table API. See .superpowers/sdd/task-3-brief.md
// Step 3.
import { SCOPE, insert, del } from './snc.mjs';
const TABLES = ['category', 'question', 'question_option', 'avatar', 'profile', 'game',
  'game_player', 'game_question', 'response', 'skill_rating', 'player_stats',
  'player_category_stats', 'practice_session'];
for (const t of TABLES) {
  const rec = await insert(`${SCOPE}_${t}`, {});
  await del(`${SCOPE}_${t}`, rec.sys_id);
  console.log('ok: ' + SCOPE + '_' + t);
}
