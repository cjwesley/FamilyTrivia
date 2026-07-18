# Groups & Self-Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Silo all competition data into admin-created groups, and let strangers self-register into a game (account + player role) from a token-gated invite link.

**Architecture:** Extends the deployed `x_tekvo_famtriv` app. Schema changes and new Script Includes go through the Fluent workspace; the new public join page and registration REST endpoint go through the REST toolchain, per the established ownership split. All server logic TDD'd on the existing in-instance harness (`node tools/run-tests.mjs`).

**Tech Stack:** unchanged (Fluent SDK, ES5 Script Includes, Service Portal widgets, snc.mjs REST tooling).

**Spec:** `docs/superpowers/specs/2026-07-18-groups-self-registration-design.md`. Read it before any task.

## Global Constraints

- All conventions from the original plan hold: ES5 server code; Script Includes in `fluent/src/server/<ClassName>.server.js` registered in `test-harness.now.ts`; commit `generated/keys.ts` with every registration; TDD RED = register only the test first (no stubs), raw unedited evidence; deploy = `cd fluent && npm run build && npm run deploy`; tests = `node tools/run-tests.mjs`; auth = existing buildSDK OAuth, one SDK-retry then BLOCKED, never handle usernames/passwords (visitor-typed registration passwords flow browser→instance only, never through logs, files, or reports).
- Silo boundary (spec, verbatim): per-group = games, wins, points, correct counts, win streaks, champion, all five leaderboard views. Personal = profile, skill ratings, practice, My Progress.
- Group creation is **admin-only via the platform UI** — no in-app creation. No standing group invite links (the spec's Group.invite_token was a leftover; this plan drops it and Task 8 removes it from the spec — games are the only in-app join path).
- Invite tokens: 40 chars, generated from two concatenated `gs.generateGUID()` values; single-game; valid only while the game is in `lobby`; never displayed, only embedded in the share link/QR.
- Registration caps (spec): global 30/hour, per-game 15, per-IP 10/hour, tracked in a scoped `registration_log` table (this table IS the audit/bulk-disable index — a `u_created_via` column on sys_user is NOT used; cross-scope dictionary writes are off-limits).
- Public surface leaks nothing beyond the game's existence pre-auth. The registration endpoint grants exactly `x_tekvo_famtriv.player`.
- Post-registration session: NO auto-login code. The join page routes new accounts through the standard instance login (`/login.do?sysparm_goto_url=<encoded invite link>`), which returns them to the join page authenticated. If `sysparm_goto_url` is ignored by the instance, the fallback UX is a "now log in, then tap your invite link again" message — verify empirically, implement whichever works.
- Baseline data: gameplay/stats tables are EMPTY (wiped 2026-07-18); content tables (category/question/question_option/avatar) are populated. No migration code anywhere.

## File Structure

```
fluent/src/fluent/tables.now.ts        # + group, group_member, registration_log; game/player_stats/player_category_stats gain columns
fluent/src/server/TriviaGroups.server.js        (new)  + TriviaGroupsTest
fluent/src/server/TriviaRegistration.server.js  (new)  + TriviaRegistrationTest
fluent/src/server/TriviaEngine.server.js        (modify: group integration)
fluent/src/server/TriviaStats.server.js         (modify: group scoping)
fluent/src/server/TriviaEngineTest.server.js    (modify: group-aware seeds + new tests)
fluent/src/server/TriviaStatsTest.server.js     (modify: group-aware)
fluent/src/server/TriviaE2ETest.server.js       (modify: two-group silo assertions)
src/rest/register.js                            (new: public REST operation script)
tools/create-register-api.mjs                   (new: endpoint records, public)
tools/ensure-page.mjs                           (modify: optional --public flag)
src/widgets/ft-join/*                           (new public widget)
src/widgets/ft-home/*                           (modify: group switcher + group-scoped context)
src/widgets/ft-leaderboard/*                    (modify: group context)
src/widgets/ft-game/*                           (modify: lobby share link/QR uses invite token)
README.md                                       (modify: groups + registration section)
```

---

### Task 1: Schema — groups, membership, registration log, group columns

**Files:**
- Modify: `fluent/src/fluent/tables.now.ts`
- Create: none (probe via existing `tools/probe-tables.mjs` extended list)

**Interfaces:**
- Produces tables (all `x_tekvo_famtriv_` prefixed): `group` (name str 80, owner ref sys_user, active bool default true, display name); `group_member` (group ref @scope@_group, user ref sys_user, joined_on glide_date_time); `registration_log` (user ref sys_user, game ref @scope@_game, ip str 64). Columns added: `game.group` ref @scope@_group; `game.invite_token` str 40; `player_stats.group` ref @scope@_group; `player_category_stats.group` ref @scope@_group.
- Note: emoji rule — any new string column that might carry astral chars must be >255. None of these do (names are fine at 80; if in doubt, 1024).

- [ ] **Step 1:** Add the three tables and four columns to `tables.now.ts`, following the file's existing `Table({ name, label, schema: { ... } })` idiom exactly (StringColumn/ReferenceColumn/BooleanColumn/DateTimeColumn, `allowWebServiceAccess: true` like the siblings, `display: 'name'` on `group`).
- [ ] **Step 2:** `cd fluent && npm run build && npm run deploy` — expect success.
- [ ] **Step 3:** Extend `tools/probe-tables.mjs` TABLES array with `'group', 'group_member', 'registration_log'`; run `node tools/probe-tables.mjs` — expect 16 `ok:` lines.
- [ ] **Step 4:** Verify one new reference: `node tools/sn-cli.mjs get sys_dictionary "name=x_tekvo_famtriv_game^element=group" reference,internal_type` → reference = `x_tekvo_famtriv_group`.
- [ ] **Step 5:** Run `node tools/run-tests.mjs` — all 8 suites still pass (new nullable columns break nothing yet).
- [ ] **Step 6:** Commit `feat: group/membership/registration-log schema and group columns` (include keys.ts).

---

### Task 2: TriviaGroups (TDD)

**Files:**
- Create: `fluent/src/server/TriviaGroups.server.js`, `fluent/src/server/TriviaGroupsTest.server.js`
- Modify: `fluent/src/server/TriviaTestRunner.server.js` (add suite), `fluent/src/fluent/test-harness.now.ts` (register both)

**Interfaces (produced — later tasks depend on these exact signatures):**
- `new TriviaGroups().userGroups(userId)` → array of `{id, name}` for active groups the user belongs to, ordered by name.
- `new TriviaGroups().isMember(userId, groupId)` → bool (false for inactive groups).
- `new TriviaGroups().ensureMember(userId, groupId)` → membership sys_id; idempotent; sets `joined_on` on first insert; no-ops (returns existing id) thereafter; refuses (returns '') for inactive/missing groups.
- `new TriviaGroups().newToken()` → 40-char string from `(gs.generateGUID() + gs.generateGUID()).substring(0, 40)`.

- [ ] **Step 1 (RED):** Write `TriviaGroupsTest.server.js` (ES5, extends TriviaTestBase, helpers copied per house style). Tests: `testEnsureMemberIdempotent` (create group via GlideRecord [name 'ZZ Grp A', owner = test user, active true]; ensureMember twice → same id, exactly one group_member row); `testUserGroupsAndIsMember` (two groups, member of one → userGroups returns exactly it, isMember true/false accordingly); `testInactiveGroupRefused` (active=false group → ensureMember returns '', isMember false, userGroups omits it); `testNewTokenShape` (length 40, two calls differ). Cleanup deletes seeded groups/members. Register ONLY the test + runner line; deploy; run — expect `FAIL TriviaGroupsTest` with `ReferenceError: "TriviaGroups" is not defined.`, exit 1 (raw output).
- [ ] **Step 2 (GREEN):** Implement `TriviaGroups.server.js` per the interface block; register; deploy; run — 9 suites, all PASS. Raw output.
- [ ] **Step 3:** Commit `feat: TriviaGroups membership service (TDD)` (include keys.ts).

---

### Task 3: TriviaEngine group integration (TDD)

**Files:**
- Modify: `fluent/src/server/TriviaEngine.server.js`, `fluent/src/server/TriviaEngineTest.server.js`

**Interfaces (changed/produced):**
- `createGame(userId, opts)` — opts gains required `groupId`; returns `{error: 'Not a member of that group'}` unless `TriviaGroups.isMember`; sets `game.group`, `game.invite_token = TriviaGroups.newToken()`.
- `_join(gameId, userId)` also calls `TriviaGroups.ensureMember(userId, game.group)` — every join path (create/join/ensureJoined) now grants group membership (spec: auto-join).
- `resolveInvite(token)` → `{gameId, state}` for a game whose `invite_token` matches, else `{error: 'invalid'}`. Never returns player data.
- `champion(groupId)` → `{userId}` scoped to `game.group = groupId`. ALL callers updated (getState, widgets pass the game's/active group).
- `getState(gameId, userId)` additionally returns `group` (sys_id), `groupName`, and — only while `state === 'lobby'` — `inviteToken`. `previousChampion` computed within the game's group.

- [ ] **Step 1 (RED):** Update `TriviaEngineTest.server.js`: `_seed(tag)` also creates a group ('ZZ EngGrp ' + tag, owner = first test user) and returns `groupId`; every `createGame` call passes `groupId`; `_cleanup` deletes group_member rows for the group and the group itself. New tests: `testCreateRequiresMembership` (non-member userId → `{error}`); `testJoinGrantsGroupMembership` (join by code → group_member row exists for joiner); `testResolveInviteAndLobbyToken` (getState in lobby exposes 40-char inviteToken matching resolveInvite round-trip; after start, getState omits inviteToken but resolveInvite still resolves with state 'in_question'); `testChampionScopedToGroup` (two groups, two finished 1-player games, different winners → champion(g1) ≠ champion(g2)). Deploy tests + updated seeds FIRST — expect FAILs on the not-yet-implemented behavior (raw output; the pre-existing lifecycle tests may also fail on the missing `groupId` handling — that is the RED).
- [ ] **Step 2 (GREEN):** Implement the engine changes. `createGame` membership gate before insert; `_join` fetches the game's group once; `champion(groupId)` adds `addQuery('group', groupId)`; getState wires group/groupName/inviteToken/previousChampion-in-group. Deploy; run — all suites PASS (raw).
- [ ] **Step 3:** Commit `feat: group-scoped game lifecycle with invite tokens (TDD)`.

---

### Task 4: TriviaStats group scoping (TDD)

**Files:**
- Modify: `fluent/src/server/TriviaStats.server.js`, `fluent/src/server/TriviaStatsTest.server.js`

**Interfaces (changed):**
- `rollupGame(gameId)` reads `game.group` and accumulates into `player_stats` rows keyed (user, group) and `player_category_stats` rows keyed (user, group, category). Games with no group are skipped (cannot occur post-Task 3; defensive guard + `gs.warn`).
- `leaderboard(groupId)` → same shape as before, but only rows/byCategory entries for that group.
- `_statsRow(userId, groupId)` internal key change.

- [ ] **Step 1 (RED):** Update `TriviaStatsTest.server.js`: `_mkGame` creates/reuses a 'ZZ StatGrp' group and sets it on the game; existing streak/idempotence assertions unchanged but read stats via (user, group). New test `testSiloAcrossGroups`: same user wins one game in group A and loses one in group B → stats row in A shows 1 win / streak 1, row in B shows 0 wins / streak 0, and `leaderboard(A)` excludes users who only played in B. Deploy tests; run — RED (raw).
- [ ] **Step 2 (GREEN):** Implement; deploy; run — all PASS (raw).
- [ ] **Step 3:** Commit `feat: per-group stats rollup and leaderboard (TDD)`.

---

### Task 5: TriviaRegistration (TDD)

**Files:**
- Create: `fluent/src/server/TriviaRegistration.server.js`, `fluent/src/server/TriviaRegistrationTest.server.js`
- Modify: runner + test-harness registrations

**Interfaces (produced):**
- `validate(token)` → `{ok: true, gameId}` only for lobby-state games; `{ok: false, reason}` with reason ∈ `invalid` (no match), `not_lobby` (game exists, not joinable-by-registration).
- `register(token, nickname, email, password, ip)` → `{ok: true, userName}` or `{ok: false, reason}` with reason ∈ `invalid`, `not_lobby`, `duplicate_email`, `rate_limited`, `missing_fields`. On success: creates sys_user (`user_name` = lowercased email, `email`, `first_name` = nickname, `user_password` via `setDisplayValue('user_password', password)`, `active` true); grants EXACTLY the player role (sys_user_has_role insert, role sys_id looked up by name `x_tekvo_famtriv.player`); creates Profile with the nickname; inserts a `registration_log` row (user, game, ip); does NOT join the game (the join page does that via ensureJoined after login — registration and joining are separate steps).
- Caps checked BEFORE any insert, via registration_log counts: global ≥ 30 in last hour → rate_limited; per-game ≥ 15 ever → rate_limited; per-IP ≥ 10 in last hour → rate_limited.
- The password parameter is used exactly once (`setDisplayValue`) and never logged, stored elsewhere, or echoed in any return value or test assertion. Tests use a literal throwaway string and delete the created users in cleanup.

- [ ] **Step 1 (RED):** `TriviaRegistrationTest.server.js`: `testValidateStates` (lobby game+token → ok; started game → not_lobby; garbage token → invalid); `testRegisterHappyPath` (register → sys_user exists with player role and Profile nickname, registration_log row written, returned userName = lowercased email); `testDuplicateEmail` (second register, same email → duplicate_email, no second user); `testRateLimitPerGame` (seed 15 registration_log rows for the game → rate_limited). Seeds its own group/game via GlideRecord (lobby state, invite_token from TriviaGroups.newToken). Cleanup deletes created sys_users (query by the test's email domain `@famtriv-test.example`), roles rows, profiles, log rows, game, group. Deploy test only; run — RED `ReferenceError: "TriviaRegistration" is not defined.` (raw).
- [ ] **Step 2 (GREEN):** Implement; deploy; run — all PASS (raw). If `setDisplayValue('user_password', ...)` does not take (verify by impersonation-free check: the sys_user record's user_password field is non-empty), STOP and report the alternative found in platform docs before improvising.
- [ ] **Step 3:** Commit `feat: TriviaRegistration invite-gated account creation (TDD)`.

---

### Task 6: Public join page + registration endpoint

**Files:**
- Create: `src/rest/register.js`, `tools/create-register-api.mjs`, `src/widgets/ft-join/{widget.json,server.js,client.js,template.html,css.scss}`
- Modify: `tools/ensure-page.mjs` (third arg `--public` sets `sp_page.public=true`)

**Interfaces:**
- REST: `POST /api/tekvo/ftreg/register` (public, requires_authentication false) body `{token, nickname, email, password}` → thin wrapper: `new TriviaRegistration().register(body.token, body.nickname, body.email, body.password, request.getHeader('X-Forwarded-For') || 'unknown')`; returns the include's result verbatim; never logs the body. Create via `tools/create-register-api.mjs` (mirror create-test-api.mjs: wsdef service_id `ftreg`, operation `register`, `requires_authentication: 'false'`, `requires_acl_authorization: 'false'`; print the real operation_uri).
- Widget `ft-join` (public: sp_widget.public=true, page `ft_join` public): server.js reads `$sp.getParameter('t')`; for guests: `data.invite = new TriviaRegistration().validate(t)` (existence only — expose ok/reason, never game details); for authenticated users with valid lobby token: `resolveInvite` + `ensureJoined` + expose `data.redirect = '?id=ft_game&g=' + gameId`. client.js: authenticated+redirect → `$window.location`; guest+ok → two cards: **Log in** (`href = '/login.do?sysparm_goto_url=' + encodeURIComponent('/trivia?id=ft_join&t=' + token)`) and **Create your player account** (nickname/email/password form → `fetch` POST to the register endpoint; on `{ok}` → send them to the same login URL with a "Account created — log in to join the game" note; on error → reason-specific message). guest+not_lobby/invalid → dead-link card. Template follows house theme classes; passwords in a `<input type="password">`, form never prefilled, no value ever interpolated back.

- [ ] **Step 1:** Extend `ensure-page.mjs`: optional 3rd positional arg `public` → include `public: 'true'` in the sp_page ensure. Backward compatible (existing calls unaffected).
- [ ] **Step 2:** Write the four widget files + rest script + api tool. Deploy: `node tools/deploy-widget.mjs src/widgets/ft-join` (add `public: 'true'` to that widget's deploy — extend deploy-widget.mjs to honor an optional `"public": true` in widget.json), `node tools/ensure-page.mjs ft_join ft-join public`, `node tools/create-register-api.mjs`.
- [ ] **Step 3 Verify (no real registrations against the instance beyond one):** (a) UNAUTHENTICATED `curl` GET of `/trivia?id=ft_join&t=garbage` → 200 (public page renders, dead-link state; if it redirects to login, the public flags are wrong — fix before proceeding). (b) Unauthenticated POST to the register endpoint with a garbage token → `{ok:false, reason:'invalid'}` (proves public reachability + gate). (c) Create one REAL registration against a REAL lobby game (create game via engine as admin first): POST with token + nickname `Probe` + email `probe@famtriv-test.example` + throwaway password → `{ok:true}`; verify sys_user + role + profile + log row via REST; then deactivate+lock the probe user and delete its rows (document each step; never echo the password). (d) `node tools/run-tests.mjs` regression — all suites PASS.
- [ ] **Step 4:** Commit `feat: public invite join page and registration endpoint`.

---

### Task 7: Widget group context (home, leaderboard, game share)

**Files:**
- Modify: `src/widgets/ft-home/{server.js,client.js,template.html}`, `src/widgets/ft-leaderboard/{server.js,client.js,template.html}`, `src/widgets/ft-game/{client.js,template.html}`

**Interfaces / changes:**
- **ft-home server:** `data.groups = new TriviaGroups().userGroups(me)`. New action `context` with `input.groupId` (validated by `isMember`, else first group): returns `data.champion`/`data.iAmChampion` from `eng.champion(groupId)` + card. `create` action: `input.opts.groupId` passes through to `createGame` (engine validates). Initial load uses the first group (client re-requests context after restoring its saved selection).
- **ft-home client:** active group persisted in `localStorage['ft_active_group']`, validated against `data.groups` (fallback: first). >1 group → chips row above the buttons (reuse `ft-tabs`/`ft-tab` classes). Switching → `server.get({action:'context', groupId})` re-renders champion; `c.create()` includes the active groupId; zero groups → replace the New Game button with the spec's empty-state card ("Ask the game admin to add you to a group or join a game via an invite link") — Join stays enabled.
- **ft-home template:** chips row; empty-state card; champion card labeled with the active group's name.
- **ft-leaderboard server:** `input.groupId` (validated member, default first); `data.rows`/`byCategory` from `leaderboard(groupId)`; `data.champion` from `champion(groupId)`; `data.groups` for chips.
- **ft-leaderboard client/template:** same chips + localStorage pattern as home; empty state for zero groups.
- **ft-game client/template:** lobby card adds a share row when `c.st.inviteToken` present: the QR now encodes `location.origin + '/trivia?id=ft_join&t=' + inviteToken` (replacing the old `?id=ft_game&g=` target — the join page handles both cohorts) and a "Copy invite link" button (`navigator.clipboard.writeText`, fallback: visible readonly input). The 4-char code display is unchanged.

- [ ] **Step 1:** Apply the three widgets' changes; redeploy each via `deploy-widget.mjs`.
- [ ] **Step 2 Verify:** REST-verify updated `script`/`client_script` fields contain the new markers (`userGroups`, `ft_active_group`, `ft-join`). Authenticated GET of `/trivia` and `/trivia?id=ft_leaderboard` → 200, server data JSON includes `groups`. Full `node tools/run-tests.mjs` — PASS. Interactive visual pass stays on the controller's deferred list.
- [ ] **Step 3:** Commit `feat: group switcher, group-scoped leaderboard, invite share sheet`.

---

### Task 8: E2E silo test, spec/README sync, final review prep

**Files:**
- Modify: `fluent/src/server/TriviaE2ETest.server.js`, `README.md`, `docs/superpowers/specs/2026-07-18-groups-self-registration-design.md`

- [ ] **Step 1:** Extend `TriviaE2ETest`: seed TWO groups; run the existing adaptive-game flow inside group 1; then a second 1-round game in group 2 won by user B; assert: user A has a (A, group1) stats row and NO group2 row; `leaderboard(group1)` ≠ `leaderboard(group2)` memberships; `champion(group1)` = A while `champion(group2)` = B; practice answer still touches no stats row in either group. Deploy; run — all suites PASS (expect 10 suites now; raw output).
- [ ] **Step 2:** README: new "Groups" section (admin-only creation via platform list `x_tekvo_famtriv_group_list.do` + owner field; membership grows via game invites; silo semantics) and "Invite & self-registration" section (share flow, token lifecycle, caps, registration_log auditing/bulk-disable, the login-redirect flow, and the hard gate: session-auth ACL check before enabling outside registrations — with the concrete check command). Spec: delete `invite_token` from the Group table row (Task-8 note in Global Constraints explains why).
- [ ] **Step 3:** Commit `feat: two-group E2E silo test and groups/registration docs`.
- [ ] **Step 4 (controller):** final whole-branch review (most capable model) over the feature branch, fix findings, merge, push.

## Post-plan notes for the executor

- Tasks are strictly sequential (each layer feeds the next); Task 6 depends on 5; Task 7 on 2–4.
- The registration endpoint and public page widen the app's attack surface — treat any reviewer finding about information leakage or cap-bypass as Important by default.
- After Task 6, the instance has a live PUBLIC endpoint on a company dev instance. If anything goes sideways mid-build, the kill switch is deactivating the `sys_ws_operation` record (`node tools/sn-cli.mjs get sys_ws_operation "name=register" sys_id` + PATCH active=false).
