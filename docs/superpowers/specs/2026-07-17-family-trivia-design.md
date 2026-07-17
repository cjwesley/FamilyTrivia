# Family Trivia — Design Spec

**Date:** 2026-07-17
**Status:** Approved design, pending implementation plan

## Purpose

A trivia game for the family, played primarily at restaurants while waiting on food (also at home). Each player uses their own phone. The entire application — data, logic, and UI — lives on the company ServiceNow instance as a scoped app. Success looks like: a game can go from "someone says let's play" to first question in under a minute, runs smoothly on restaurant Wi-Fi, and the family keeps wanting to check the leaderboard.

## Architecture

- **Platform:** One ServiceNow scoped app (working name *Family Trivia*; scope prefix per the company vendor prefix, e.g. `x_tekvo_famtriv`). No external hosting.
- **UI:** A dedicated Service Portal at `/trivia` with custom widgets (one per screen), a shared mobile-first theme, touch-optimized.
- **Logic:** All game logic (question selection, scoring, stat rollups, skill ratings) in Script Includes. Widgets stay thin.
- **Real-time sync:** `spUtil.recordWatch` on the Game record (and Game Player table for lobby joins), with a 3-second polling fallback. Both paths feed the same client render function.
- **Stats:** A business rule fires when a Game reaches `finished` and recomputes the denormalized Player Stats rows. Raw Response rows are the source of truth for rebuilds.
- **Players:** Family members log in with their existing ServiceNow user accounts on the company instance.

## Data Model

All tables in scope. Names indicative; final names get the scope prefix.

| Table | Key fields | Purpose |
|---|---|---|
| **Category** | name, icon, color, active | Trivia categories |
| **Question** | text, type (multiple choice / true-false), category (ref), difficulty (1–5), pool (`game` / `practice`), active, source_id | Question bank. `source_id` holds the Open Trivia DB ID for import dedup |
| **Question Option** | question (ref), text, correct (bool), order | Child of Question |
| **Game** | code (4-char), host (user ref), mode (`uniform` / `adaptive`), categories, question_count, seconds_per_question, state (`lobby` / `in_question` / `reveal` / `finished`), current_round, question_started_at, winner (user ref) | One game session |
| **Game Player** | game (ref), user (ref), score, correct_count, place | Membership + in-game score |
| **Game Question** | game (ref), round, question (ref), player (ref, empty in uniform mode) | Questions selected for the game, per player in adaptive mode |
| **Response** | game (ref), player (ref), round, question (ref), option (ref), correct (bool), answer_time_ms, points | One answer. Unique per (game, player, round); first write wins |
| **Player Profile** | user (ref), nickname, avatar_source (`gallery` / `upload` / `sn_photo`), avatar attachment, per-category skill override | Player identity & preferences |
| **Skill Rating** | user (ref), category (ref), rolling_accuracy, sample_count | Auto-computed skill per category, fed by game AND practice answers |
| **Player Stats** | user (ref), total_wins, total_points, total_correct, longest_win_streak, current_win_streak | Denormalized leaderboard row |
| **Player Category Stats** | user (ref), category (ref), correct_count | Child rollup for the By Category leaderboard |
| **Practice Session** | user (ref), category (ref), question_count, correct_count, accuracy, date | Powers the private My Progress tracker |

**Reigning champion** = winner of the most recent `finished` game. Derived by query; no stored flag.

## Gameplay

### Lobby
- Any player taps **New Game**, picks mode, categories, question count (default 10), timer (default 20s).
- App generates a 4-character room code, displayed large with a QR code encoding the join URL.
- Players join by code or QR; lobby shows joined avatars live. Host taps **Start**.

### Question selection (at Start)
- **Uniform (Everyone Same):** N shuffled questions from the chosen categories, mixed difficulty; one Game Question row per round.
- **Adaptive (Skill-Matched):** one Game Question row per round *per player*, drawn at that player's skill level for the category — auto rating unless a manual override exists. All players play round *k* simultaneously on different questions.
- Both modes exclude questions a player answered in the last 90 days (via Response history); if that exhausts the eligible pool, the exclusion window shrinks until enough questions qualify.
- Questions come only from the `game` pool; practice pool is separate.

### Rounds
- Countdown renders from the server-set `question_started_at`, keeping phones in sync.
- Answer options are large touch targets. A tap writes a Response with client-measured time; server clamps against `question_started_at`.
- Round closes when all players answered or the timer expires → state `reveal`: correct answer, points earned, running scoreboard.
- Host taps **Next**; auto-advance after 8 seconds if they don't.

### Scoring
- Correct: `(500 + 500 × time_remaining/total_time) × difficulty_multiplier`, where the multiplier scales 1.0× (difficulty 1) to 1.5× (difficulty 5).
- Wrong or no answer: 0. Scoring computed server-side.

### Game end
- Podium screen with confetti for the winner; fun stats (fastest finger, best in-game streak).
- Business rule updates Player Stats, category stats, win streaks; champion changes hands.

### Practice mode
- Solo, no lobby. Pick a category (or all); questions from the `practice` pool at the player's skill level; self-paced, optional timer.
- Updates Skill Rating (practicing levels you up) and records a Practice Session.
- Never touches the leaderboard or win stats. **My Progress** shows the player their own accuracy trends per category — private to them.

## Players, Avatars, Champion

- First visit auto-creates a Player Profile from `sys_user` (nickname defaults to first name) and shows a quick setup screen.
- Avatar sources: (1) shipped gallery of ~20 family-friendly SVG avatars, (2) upload (client-side circle-crop to a small square before upload), (3) the `sys_user` photo. Switching sources is non-destructive.
- Champion treatment: gold ring + crown badge on the champion's avatar everywhere; "Reigning Champion" banner on their profile; "New champion!" callout on the podium when dethroned.

## Leaderboard

One screen, segmented into exactly five views, all served from Player Stats:
1. **Wins** — total games won
2. **Points** — accumulated across all sessions
3. **Correct** — total correct answers
4. **By Category** — pick a category, ranked by correct answers in it
5. **Best Streak** — longest consecutive-wins run

Ranked lists with avatars; top 3 medaled; champion hero row on top.

## Question Content

- **Seed import:** Open Trivia Database (free API) import utility — maps OTDB categories/difficulties onto ours, dedups via `source_id`. Imported questions land inactive for a quick review pass, then bulk-activate.
- **Family-authored:** platform form/list UI (admin role) for custom questions — no custom authoring UI needed.
- Every question has a category, difficulty 1–5, and pool assignment (`game` or `practice`).

## Screens

Home → (Play → Lobby → Question → Reveal → Podium) · Practice drill · My Progress · Leaderboard · Profile/avatar picker. Admin question management uses the platform UI.

Shared theme: mobile-first, large touch targets, playful/game-like styling, one consistent design system across widgets.

## Edge Cases & Error Handling

- **Reconnect-safe:** every screen renders from server state; reopening the app drops the player into the current round.
- **Sync fallback:** if record-watch dies, 3-second polling catches up; both paths call the same render function.
- **Missing answers:** round closes on timer; non-answer scores 0; game never blocks on a player.
- **Absent host:** timer + 8s auto-advance keeps the game moving; a scheduled job closes games stuck non-finished for over an hour.
- **Duplicate answers:** server rejects all but the first Response per (game, player, round).

## Security

- Roles: `player` (play, practice, own profile) and `admin` (questions, skill overrides, close stuck games).
- ACLs: players write only their own Responses/Profile; correct-answer flags not readable by players mid-round (scoring is server-side); profiles not editable by others.

## Testing

- Script Include logic (selection, scoring, rollups, ratings) covered by ATF tests plus scripted checks against a `test` category of sample data.
- Multiplayer smoke test via REST: create game as user A, join as user B, answer rounds, assert final stats.
- Manual UI verification by playing a game with two browser sessions side by side.

## Out of Scope (for now)

- Native mobile apps, push notifications, offline play
- Teams/pairs mode
- AI question generation
- Public/anonymous players (all players have instance accounts)
