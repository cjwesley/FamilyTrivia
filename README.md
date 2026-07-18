# Family Trivia

A family-friendly, real-time multiplayer trivia game running entirely inside
a ServiceNow scoped app (`x_tekvo_famtriv`) on `https://tekvoyantdev.service-now.com`.
Play from phones at **`/trivia`**: 4-char join codes, uniform or per-player
adaptive-difficulty modes, solo practice, avatars, leaderboards, a champion banner.

## Architecture

The repo is the source of truth; nothing is hand-authored in the instance UI.
Two toolchains own disjoint record sets — never edit the same record from both:

- **`fluent/`** — ServiceNow Fluent SDK workspace. Owns the app record, the
  two roles, all 13 tables, and every Script Include (game logic in
  `fluent/src/server/*.server.js` + `*Test.server.js` suites). Deployed via
  `now-sdk build` / `now-sdk install`.
- **`tools/`** — Node scripts (native `fetch`). Own Service Portal records
  (`sp_widget`/`sp_page`/`sp_portal`/`sp_theme`), the test-runner REST
  endpoint, the hourly cleanup job, and seed data (avatars, OTDB questions).
- **`src/widgets/<id>/`** — the 6 Service Portal widgets, deployed by
  `tools/deploy-widget.mjs`.

Server code is ES5 (Rhino). Client widget code is AngularJS 1.x. Live sync
is `spUtil.recordWatch` with a 3s polling fallback (see Known items).

## Setup: `.env` + OAuth

No password ever appears in this repo or its tooling. Auth is the `now-sdk`
**`buildSDK`** OAuth profile already registered on this machine;
`tools/get-sn-token.ps1` reads the live access token out of Windows
Credential Manager entry `now-sdk.ServiceNow` at call time (never on disk).
Verify the profile first:

```bash
npx now-sdk auth --list   # expect: *[buildSDK] ... type = oauth, default = Yes
```

`.env` at the repo root (gitignored) holds only non-secret settings:

```
SN_INSTANCE=https://tekvoyantdev.service-now.com
SN_SCOPE=x_tekvo_famtriv
SN_APP_ID=5e8dc2fa8c9148b8a155c40450732ab3
```

If the OAuth token is expired/revoked, re-run `now-sdk auth` interactively — the only auth action a human ever needs to do.

## Deploy from scratch

```bash
# app, roles, all 13 tables, Script Includes (game logic + tests)
cd fluent && npm install && npm run build && npm run deploy && cd ..

node tools/create-test-api.mjs      # test-runner REST endpoint
node tools/create-cleanup-job.mjs   # hourly stale-game cleanup
node tools/create-portal.mjs        # portal shell + theme

for w in ft-profile ft-home ft-game ft-leaderboard ft-practice ft-progress; do
  node tools/deploy-widget.mjs "src/widgets/$w"
  node tools/ensure-page.mjs "${w/ft-/ft_}" "$w"
done
node tools/create-portal.mjs        # re-run: backfills homepage now ft_home exists
node tools/seed-avatars.mjs         # 20-avatar gallery
# then: import/activate questions (next section)
```
Every step is idempotent (`ensure()` = query-then-insert/patch) — safe to
re-run any of it.

## Run tests

```bash
cd fluent && npm run build && npm run deploy && cd ..
node tools/run-tests.mjs
```

Expected: `8 suites / 22 tests`, all `PASS`, exit `0` (`TriviaHarnessTest`,
`TriviaScoringTest`, `TriviaSkillTest`, `TriviaSelectorTest`,
`TriviaEngineTest`, `TriviaStatsTest`, `TriviaPracticeTest`,
`TriviaE2ETest`). TDD loop: edit test → build+deploy → run (expect FAIL) →
edit implementation → build+deploy → run (expect PASS) → commit.

`run-tests.mjs` does not hit `/api/<scope>/ftest/run` — the instance derives
`sys_ws_definition.namespace` from the **vendor-prefix** substring of the
scope, not the full scope name, so the real path is `/api/tekvo/ftest/run`.
The tool looks up the live `sys_ws_operation.operation_uri` rather than
guessing the URL; do the same for any future REST endpoint in this app.

## Import / activate questions

```bash
node tools/import-otdb.mjs --pool=game --amount=50      # ~450 game-pool Qs
node tools/import-otdb.mjs --pool=practice --amount=25   # ~160 practice-pool Qs
node tools/import-otdb.mjs --activate                     # bulk-activate imported
```

Imports 9 categories from the Open Trivia DB; game/practice pools are kept
disjoint by `source_id` (base64 of question text). Imports land inactive so
you can review before `--activate`. 610 questions live (449 game / 161 practice, 9 categories).

## Add family-authored questions

No custom authoring UI exists — use the platform list:
`<instance>/x_tekvo_famtriv_question_list.do`. Create a question (`text`,
`category`, `difficulty` 1-5, `pool` = `game`/`practice`, `active`), add 2+
related `x_tekvo_famtriv_question_option` records with exactly one
`correct=true`. Same list deactivates any question you don't want live.

## Granting roles

```
x_tekvo_famtriv.player  sys_id f36d8f7729de40cc8a07ddb15cc24865  — play, view own scores
x_tekvo_famtriv.admin   sys_id b1ab0bc2eefb4f8ab68ecf10f956f556  — manage questions/config
```

Grant via `sys_user_has_role`, or User Administration > Users > Roles related
list — `player` for every family member who plays, `admin` for whoever manages config.

## Security posture

- **Basic-auth vector: closed.** Table API access via HTTP Basic Auth is
  gated by `glide.authenticate.basic_auth.restriction.enforce` +
  `.allowed_roles = snc_basic_auth_api_access`; a disposable roleless test
  account got `401`, identical to no credentials — rejected before reaching table ACLs.
- **Session-auth ACL check: still pending.** That check never reached ACL
  evaluation, so it does not prove the scoped tables' ACLs return `403` to
  an authenticated-but-unprivileged **portal session** (cookie +
  `X-UserToken`, what a logged-in-but-unprivileged browser would use).
  Only the Basic Auth vector is confirmed closed — open follow-up.

## Known items

- **Emoji storage**: string columns are `utf8mb3` (no native 4-byte UTF-8),
  so astral-plane category icons store FDD6/FDD7-surrogate + base64
  mangled rather than literal codepoints — an instance quirk, not app code.
  Verify icons render correctly client-side.
- **QR codes** for join links render via the external `api.qrserver.com`
  image API — needs outbound network access, no local fallback.
- **`spUtil.recordWatch`** may or may not fire depending on instance
  AMB/plugin config; the game widget always falls back to a 3s poll too,
  so gameplay works either way — just less snappy on poll.

## Deferred to manual playtest

The two-browser live test (uniform + adaptive + practice at 390px: lobby
join propagation, synced question flip, countdown, answer lock, reveal
scoring, podium/champion banner, all 5 leaderboard tabs, practice never
touching the leaderboard, reconnect mid-round) needs a real session with the
user present — not run here. `TriviaE2ETest` covers the equivalent lifecycle
headlessly and passes; the browser/UX pass is still outstanding.
