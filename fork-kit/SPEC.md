# Family Trivia — Portable Game Specification

**Version:** 1.0 (2026-07-18), extracted from the working ServiceNow implementation in this repository.
**Audience:** a developer rebuilding this game on any backend, with no ServiceNow knowledge assumed.
**Authority:** where prose is ambiguous, §8 (Behavioral Truth) wins — it maps every rule to a concrete test assertion from the reference implementation.

---

## 1. Overview & Glossary

Family Trivia is a real-time, phone-first multiplayer trivia game for a small group (2–8 players, one household). One player hosts a **game**; others join via a 4-character **join code** or a scanned link. The game serves timed rounds; players answer on their own devices; faster correct answers score more; a podium ends the game and persistent **leaderboards** accumulate across games. A solo **practice mode** drills a separate question pool and feeds each player's **skill rating**, which the adaptive game mode uses to serve each player questions at their level.

| Term | Meaning |
|---|---|
| Game | One session: lobby → rounds → podium |
| Round | One question slot; all players play round *k* at the same time |
| Uniform mode | Every player gets the same question each round |
| Adaptive mode | Each player gets their own question each round, matched to their skill in that round's category |
| Pool | Every question belongs to `game` or `practice`; the pools never mix |
| Skill rating | Per player per category: rolling accuracy in [0,1] |
| Champion | Winner of the most recent finished game |
| Response | One player's answer to one round — at most one per (game, player, round) |

## 2. Data Model

Thirteen entities. Names are suggestions; fields and relations are requirements. Types: `str`, `int`, `bool`, `dec` (decimal), `ts` (timestamp), `ref(X)` (foreign key).

`User` is **not** one of the thirteen — it is whatever identity your auth provider gives you (an id, a display name source, optionally a photo). Every `ref(User)` below points at that external identity.

Seeding note for `data/questions.json`: the export intentionally omits three declared fields — synthesize them at seed time: `active = true`, `QuestionOption.order` = the option's array index, `source_id` = null or any stable hash you like (it only matters if you re-import from Open Trivia DB later and want dedup).

**Category** — `name str`, `icon str` (emoji), `color str` (hex), `active bool`.

**Question** — `text str`, `type enum(mc, tf)`, `category ref(Category)`, `difficulty int 1–5`, `pool enum(game, practice)`, `active bool`, `source_id str` (import dedup key).

**QuestionOption** — `question ref(Question)`, `text str`, `correct bool`, `order int`. Integrity: exactly one correct option per question.

**Game** — `code str(4)`, `host ref(User)`, `mode enum(uniform, adaptive)`, `categories` (list of Category refs; a join table or array column), `question_count int` (default 10), `seconds_per_question int` (default 20), `state enum(lobby, in_question, reveal, finished)`, `current_round int`, `question_started_at ts`, `reveal_started_at ts`, `winner ref(User)`, `rolled_up bool` (stats-idempotence flag).

**GamePlayer** — `game ref(Game)`, `user ref(User)`, `score int`, `correct_count int`, `answer_time_total_ms int`, `place int`. Unique on (game, user).

**GameQuestion** — `game ref(Game)`, `round int`, `question ref(Question)`, `player ref(User)` (null in uniform mode). All rows written at game start.

**Response** — `game ref(Game)`, `player ref(User)`, `round int`, `question ref(Question)`, `option ref(QuestionOption)`, `correct bool`, `answer_time_ms int`, `points int`, `practice bool`. **Unique constraint on (game, player, round) — enforce at the database level.** (The reference implementation could only check-then-insert; your backend should do better.)

**PlayerProfile** — `user ref(User)`, `nickname str(40)`, `avatar_source enum(gallery, upload, external_photo)`, `avatar ref(Avatar)`, `skill_overrides` (map of Category → 1–5; JSON is fine). Auto-created on first visit; nickname defaults to the user's first name.

**Avatar** — `name str`, `svg str` (or a file reference), `order int`, `active bool`. Seed from `assets/avatars/`.

**SkillRating** — `user ref(User)`, `category ref(Category)`, `accuracy dec` (default 0.5), `sample_count int`. Unique on (user, category).

**PlayerStats** — `user ref(User)`, `total_wins int`, `total_points int`, `total_correct int`, `longest_win_streak int`, `current_win_streak int`. One row per user.

**PlayerCategoryStats** — `user ref(User)`, `category ref(Category)`, `correct_count int`. Unique on (user, category).

**PracticeSession** — `user ref(User)`, `category ref(Category)` (null = all), `question_count int`, `correct_count int`, `accuracy dec`.

## 3. Rules Engine

### 3.1 Game state machine

```
lobby ──start(host)──▶ in_question ──all answered OR timer+grace──▶ reveal
  ▲                        ▲                                          │
  │                        └───────── next round ─────────────────────┤
 create                                                               │
                                            last round ──▶ finished ◀─┘
```

Transition rules:
- `create`: any player. Generates a unique 4-char code from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no O/0/I/1 lookalikes); uniqueness is checked against non-finished games only. Creator becomes host and is auto-joined as a player.
- `join`: by code, only while `state = lobby`. Joining is idempotent. Opening a game deep-link (QR scan) while the game is in `lobby` ALSO joins the viewer — scan = join intent. Deep-linking into a started game grants spectator view only, never player membership.
- `start`: host only, from `lobby`. Selects ALL questions up front (§3.2), writes GameQuestion rows, sets `current_round = 1`, `state = in_question`, stamps `question_started_at` server-side.
- `in_question → reveal`: when every GamePlayer has a Response for the current round, OR when server time exceeds `question_started_at + seconds_per_question + 2s grace`. Stamps `reveal_started_at`.
- `reveal → next`: host action, or automatically after 8 seconds (see §3.6 tick). Increments round, re-stamps `question_started_at`; after the last round, goes to `finished` instead.
- `finished`: compute places and winner (§3.5), set `winner`, run the stats rollup exactly once.

### 3.2 Question selection (at game start)

Data note: the shipped question bank only uses difficulties {1, 3, 5} (the Open Trivia DB easy/medium/hard remap). For computed targets of 2 or 4, the "exact target" step therefore never matches and the ±1 fallback does the work — expected behavior, not a bug. Family-authored questions may use any of 1–5.

Common: only `active = true`, `pool = game` questions from the game's chosen categories. Repeat-avoidance: exclude questions a player has answered in the last **90 days** (game or practice responses); if that leaves too few candidates, halve the window (90 → 45 → 22 → 11 → 5 → 0; below 3 days snap to 0 = no exclusion) until enough qualify.

- **Uniform:** pick `question_count` questions from the chosen categories, shuffled, mixed difficulty; the exclusion set is the union of ALL joined players' recent questions. One GameQuestion row per round with `player = null`. If the pool yields fewer than requested, the game shrinks to what was found.
- **Adaptive:** first fix a category per round by shuffling the chosen categories and cycling them round-robin (so a 10-round game over 3 categories visits each ~3 times, same category for everyone in a given round). Then for each round × player, pick one question in that round's category at the player's **target difficulty** (§3.3), falling back in the order: exact target → target−1 → target+1 → any difficulty; each attempt applies the per-player exclusion window (which also excludes questions already picked for that player earlier in this game). One GameQuestion row per round per player.
  - Boundary rule: when target = 1, the fallback order is 1 → 2 → any (a "difficulty 0" never exists; do not let a sentinel value collapse the target−1 step into "any" — the reference implementation has this bug, documented so you don't copy it).

### 3.3 Skill ratings

- Rating = rolling accuracy per (user, category), initialized 0.5, updated on EVERY answered question — game and practice alike: `accuracy ← accuracy × 0.9 + (correct ? 1 : 0) × 0.1`; increment `sample_count`.
- Target difficulty = `clamp(1, 5, 1 + round(accuracy × 4))`. Accuracy 0.5 → 3; sustained success drifts up; sustained failure drifts down.
- Manual override: `PlayerProfile.skill_overrides[category]`, when set (1–5), replaces the computed target for that category. Malformed override data is ignored, never fatal.

### 3.4 Scoring

For a correct answer: `points = round((500 + 500 × remaining/total) × (1 + 0.125 × (difficulty − 1)))` where `total = seconds_per_question × 1000` ms, `remaining = total − clamp(0, total, answer_time_ms)`. Wrong or missing answer: 0 points, always.

Worked examples (20s round): instant correct at difficulty 1 → 1000; at the buzzer, difficulty 1 → 500; instant at difficulty 5 → 1500; halfway (10s) at difficulty 3 → round(750 × 1.25) = **938**.

Answer-time honesty: the client reports its measured `answer_time_ms`, but the server clamps it to `[0, server_elapsed]` where `server_elapsed = now − question_started_at`. Answers arriving after `total + 2s grace` are rejected. All scoring happens server-side.

### 3.5 Winner, places, tie-breaks

Sort players by: score DESC, then correct_count DESC, then answer_time_total_ms ASC. First is the winner; `place` = 1-based rank. The **champion** is derived, never stored globally: winner of the most recently finished game that has a winner (lobby games force-closed by cleanup have no winner and never count).

### 3.6 Timing: the tick contract

There is no server-side scheduler for round timing. **The server applies the tick check lazily at the top of every `getState` read**, so ordinary polling drives round progression without any client cooperation — this is load-bearing, not an optimization (a round with an absent player would otherwise hang on client heroics; learned in live play). Additionally, any client may call an idempotent `tick(game)` operation at any time; the server checks the clock and applies at most one transition:
- `in_question` and `now > question_started_at + seconds_per_question + 2000ms` → close the round (missing answers simply score 0; the game NEVER blocks on an absent player).
- `reveal` and `now > reveal_started_at + 8000ms` → advance (any client's tick works — the game survives the host pocketing their phone).

Clients: run a local countdown from the server-stamped deadline, correcting for client-server clock skew (`skew = client_now − server_now` captured on every state fetch); fire ticks only after the server grace window has certainly passed (countdown + grace + margin), re-armed every ~3s while the round remains open (never a one-shot - a single lost tick must not matter); additionally nudge tick every ~9s during reveal.

### 3.7 Stats rollup (on finish, exactly once)

Guarded by `Game.rolled_up`. For each GamePlayer: add score to `total_points`, correct_count to `total_correct`; per-category correct counts from this game's responses joined to their questions' categories accumulate into PlayerCategoryStats. Winner: `total_wins += 1`, `current_win_streak += 1`, `longest_win_streak = max(longest, current)`. Every other player in the game: `current_win_streak = 0`. Players not in the game are untouched.

### 3.8 Practice mode

Solo, no lobby. A session fixes a category (or "all active categories", rotating per question). Questions come ONLY from the practice pool, at the player's target difficulty with the §3.2 fallback and exclusion rules, never repeating within the session. Each answer: writes a Response with `practice = true` and no game reference; updates SkillRating (§3.3); updates the session's counters and accuracy. Scoring uses the §3.4 formula with a 20s baseline for the time bonus (display only). **Practice never touches PlayerStats, PlayerCategoryStats, wins, or streaks** — this isolation is a hard invariant. A player sees only their own sessions and ratings ("My Progress").

### 3.9 Housekeeping

An hourly job force-finishes games stuck in a non-finished state for over 1 hour: lobby games close winnerless; started games run the normal finish path (so their partial scores still roll up).

## 4. API Contract

Fourteen server operations. Signatures are language-neutral; `user` is always the authenticated caller, never a parameter a client controls. Errors are returned as data (`{error: string}`), not transport failures, unless auth fails.

| Op | In | Out | Notes |
|---|---|---|---|
| createGame | mode, categoryIds[], questionCount, secondsPerQuestion | {gameId, code} | caller becomes host + player |
| joinGame | code | {gameId} \| {error} | lobby only; idempotent |
| ensureJoined | gameId | — | lobby only; no-op otherwise; used by deep links |
| startGame | gameId | {started} \| {error} | host only, from lobby; runs selection |
| getState | gameId | snapshot (below) | the ONLY read clients use |
| answer | gameId, optionId, clientMs | {accepted, correct, points} \| {accepted: false, reason} | membership-guarded; first write wins — a second submission for the same round returns `{accepted: false, reason: "already answered"}` (it does not echo the first result) |
| tick | gameId | — | idempotent clock check (§3.6) |
| advance | gameId | {advanced} \| {error} | host only, from reveal |
| champion | — | {userId \| null} | |
| practiceStart | categoryId \| null | {sessionId} | |
| practiceNext | sessionId | {question} \| {done} | question payload has NO correct flags |
| practiceAnswer | sessionId, questionId, optionId, answerMs | {correct, points, correctOption} | |
| progress | — | {sessions[], ratings[]} | caller's own data only |
| leaderboard | — | {rows[], byCategory{}} | rows: wins/points/correct/streaks per user |

**getState snapshot** (shape by state): always `{state, code, mode, isHost, round, totalRounds, secondsPerQuestion, serverNow, players[{userId, score, correct, place}], champion}`. In `in_question`: + `{endsAt, answered, question: {text, category, icon, difficulty, options[{id, text}]}}` — **never a correct flag**. In `reveal`/`finished`: + `{correctOption, reveal[{userId, correct, points}]}`. In `finished`: + `{podium[], winner, previousChampion, fastestFinger?, bestRun?}` — `previousChampion` is the champion BEFORE this game (so the UI can announce a dethroning); `fastestFinger` = lowest average answer time; `bestRun` = longest within-game consecutive-correct streak (only if ≥ 2).

## 5. Security Invariants

Non-negotiable on any backend:

1. Correct-answer flags never reach a client while its round is answerable — not in getState, not in practiceNext, not via direct table/API reads. **If your backend exposes tables to authenticated clients (auto-generated REST, GraphQL, or realtime payloads), row/column security must block reading QuestionOption.correct and the Question bank.** This was the hardest thing to prove on the original platform; with row-level security it's cheap — do it properly.
2. All scoring, timing validation, and state transitions are server-authoritative. Clients send intentions (option id, measured ms); the server decides everything else.
3. `answer` requires game membership (a GamePlayer row). Spectators can watch; their answers are rejected and never count toward round-close.
4. A player writes only their own Response/Profile/PracticeSession rows and reads only their own progress data.
5. Practice never mutates leaderboard tables (§3.8).
6. Host-only operations (start, advance) verify the caller is the game's host.
7. **Question and option text renders escaped, always** — same as nicknames. The seed data really does contain option strings like `<marquee></marquee>` (HTML-trivia questions); render them as text, never as markup.

## 6. Realtime Semantics

What must propagate to all connected players, and how fast:
- Lobby membership changes and every state transition (question flip, reveal, finish): target < 1s with push; **3s polling is an acceptable fallback** and the reference client always polls at 3s even when push works, funneling both into one render path.
- The countdown never depends on push: it renders locally from `endsAt` + clock skew.
- Reconnect-safety is a requirement: a player who kills their browser mid-round and reopens the game URL must land in the current round with correct state, purely from getState. No client-side session state may be load-bearing.

## 7. UI Specification

Seven screens, one shared design system (`assets/theme.css` — dark, playful, mobile-first, 44px+ touch targets; class names below refer to it). Nicknames are user text: always render escaped, never as HTML. Avatar SVGs are trusted app assets.

1. **Home** — player identity row (avatar + nickname, gold ring + 👑 if champion); champion banner card; big buttons: New Game / Join Game / Practice / Leaderboard / My Progress. New Game opens mode toggle (Everyone Same / Skill-Matched), category multi-select chips, sliders for question count (5–20, default 10) and seconds (10–60 step 5, default 20). Join is a 4-char uppercase code input. First-ever visit redirects to Profile setup once.
2. **Lobby** — join code huge (`ft-code`), QR encoding the game deep-link, mode + length summary, live player list with avatars (champion ringed), Start button (host) or "Waiting for host…".
3. **Question** — round x/y, countdown seconds + shrinking timer bar, category + difficulty line, question text large, options as full-width colored buttons; tapping locks (🔒 "Answer locked in!") until reveal.
4. **Reveal** — correct answer highlighted green; your delta (✅ +938 / ❌ 0 / ⏰ missed); running scoreboard with medals; host's Next button.
5. **Podium** — CSS confetti, 🏆 winner name, "👑 New champion!" only when the winner differs from `previousChampion`; ranked list with medals + scores + correct counts; fun-stat rows (⚡ fastest finger, 🔥 hot streak); Play Again / Leaderboard buttons.
6. **Practice + My Progress** — category picker → self-paced drill with per-answer feedback (correct answer shown on miss) → session summary (percentage); Progress shows per-category star ratings (1–5 stars = target difficulty) and recent session list. Private to the player.
7. **Profile** — nickname editor; avatar picker: 20-item gallery grid, photo upload (client-side center-crop to 256×256 before upload), or "use my account photo" when one exists; champion banner when reigning. Switching avatar sources is non-destructive.

## 8. Behavioral Truth Appendix

The reference implementation pins these behaviors with in-instance tests (`fluent/src/server/*Test.server.js` in this repo). **Port the assertions before the code** — they are the spec's ground truth.

| Behavior | Pinned by |
|---|---|
| Scoring: instant d1 = 1000, buzzer d1 = 500, instant d5 = 1500, halfway d3 = 938, wrong = 0, clamps both directions | TriviaScoringTest (7 assertions) |
| Skill: no history → difficulty 3; 10 straight correct → 4; 20 straight wrong → 1; manual override wins | TriviaSkillTest |
| Selection: game pool only; recently-answered excluded; window shrinks to reuse when pool exhausted; per-user difficulty targeting | TriviaSelectorTest |
| Lifecycle: 4-char code; join by code; duplicate answer rejected; all-answered → reveal; absent player never blocks (timeout closes, scores 0); adaptive = per-player question rows; podium places; champion | TriviaEngineTest.testFullUniformGame / testAdaptiveServesPerPlayer / testTickClosesExpiredQuestion |
| No correct-flag leakage mid-round: `getState` question payload contains no `correct` anywhere | TriviaEngineTest (JSON.stringify scan) |
| Spectators: answer rejected, round stays open, no ghost response; deep-link joins in lobby, idempotent, refused after start | TriviaEngineTest.testSpectatorCannotAnswerAndQrJoins |
| Stats: points/correct accumulate; streak grows, resets on loss, longest tracked; rollup idempotent (re-run changes nothing) | TriviaStatsTest.testRollupAndStreaks |
| Practice: no in-session repeats; pool exhaustion → done; skill rating created by practice; session accuracy | TriviaPracticeTest.testPracticeFlow |
| Full E2E: adaptive 2-player game, winner's total_wins +exactly 1, loser streak 0, practice answer leaves PlayerStats untouched | TriviaE2ETest |

## 9. Reference Architecture (one way to do it — not a requirement)

A complete free-tier mapping: **Supabase (Postgres + Auth + Realtime + Storage) + a React PWA**.

- **Schema:** the 13 entities as Postgres tables, snake_case, with the real constraints §2 asks for: `unique(game_id, player_id, round)` on response, `unique(game_id, user_id)` on game_player, partial unique index on games `(code) where state != 'finished'`, and a check constraint or trigger enforcing one-correct-option per question at seed time.
- **Auth:** Supabase Auth with magic links (family = allowlist of emails, or a shared invite link + email OTP). `auth.uid()` replaces every `userId` parameter.
- **Server logic:** implement §4 as Postgres functions (`security definer`) — createGame, startGame (selection lives here), answer, tick, advance, practice ops, rollup. Postgres functions give you transactional round-close and make the unique constraint the real first-write-wins arbiter. `getState` can be a function returning the snapshot JSON.
- **RLS (this is where §5 gets easy):** questions/question_options: **no client SELECT at all** — question payloads only ever leave through the getState/practiceNext functions, which strip correct flags. response: INSERT via function only; SELECT own rows + rows of games you're in after reveal. profiles/practice_sessions/skill_ratings: own-row policies. player_stats/categories/avatars: read-all authenticated. games/game_players: SELECT for members (and lobby games by code lookup via function).
- **Realtime:** Supabase Realtime on the game row (postgres_changes on `games` filtered by id) triggers a getState refetch — same render-path discipline as §6, keep the 3s poll fallback. Lobby: subscribe to `game_players` for the game id.
- **Storage:** an `avatars` bucket for uploads (client crops to 256×256 first, as §7); gallery SVGs ship as static assets.
- **PWA:** React + Vite, one route per screen from §7, `theme.css` imported globally, installable manifest so it feels like an app on phones. QR: generate client-side (e.g. a tiny local QR lib) — don't ship the join URL to a third-party image service.
- **Question seeding:** one script reading `data/questions.json` → inserts categories, questions, options (synthesizing `active`/`order`/`source_id` per §2's seeding note). Respect `data/ATTRIBUTION.md`.
- **Housekeeping (§3.9):** schedule the stale-game cleanup with `pg_cron` (available on Supabase: hourly `select cleanup_stale_games()`), or a scheduled Edge Function if you prefer. Any cron mechanism works — the job is one idempotent SQL function.
- **Auth allowlist:** restricting magic-link signup to the family is easiest with a `profiles`-insert trigger (or Auth Hook) that rejects emails outside an `allowed_emails` table; a shared secret invite code entered post-signup also works. Pick one — don't leave signup open.
- **Suggested build order:** schema + RLS + seed → scoring/skill/selection functions with ported §8 assertions (pgTAP or a JS test runner against a dev project) → game lifecycle functions → lobby/question/reveal/podium UI → leaderboard + profile + practice UI → E2E port.

---

*This spec describes the game as actually implemented and tested on the original backend, including two deliberate divergences: the database-level uniqueness on Response (§2) and the difficulty-1 fallback fix (§3.2), both improvements over known reference-implementation warts.*
