# Family Trivia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A family trivia game running entirely on the company ServiceNow instance — Service Portal UI at `/trivia`, real-time multiplayer from phones, two game modes, practice mode, leaderboards, avatars, reigning-champion treatment.

**Architecture:** One ServiceNow scoped app (`x_tekvo_famtriv`) built the same way as the existing **EmailOS** app (`C:\Users\admincjw\ClaudeProjects\GitProjects\EmailOS\fluent`): a **ServiceNow Fluent SDK** workspace (`fluent/`) owns the app shell, tables, roles, and Script Includes, deployed with `now-sdk build` + `now-sdk install` using the already-authenticated **`buildSDK` OAuth profile** (no username/password anywhere). A small Node toolchain (`tools/`) handles what the SDK doesn't: Service Portal records (widgets/pages/portal/theme), data seeding, and the REST test-runner loop — authenticating with the same OAuth token, read from Windows Credential Manager entry `now-sdk.ServiceNow`. Game logic lives in Script Includes; screens are Service Portal widgets; live sync is `spUtil.recordWatch` + 3-second polling fallback.

**Tech Stack:** ServiceNow (scoped app, Service Portal, Scripted REST), `@servicenow/sdk` ^4.8 (Fluent), server JS = ES5 (Rhino), client JS = AngularJS 1.x (widget API), Node 18+ tooling (native `fetch`), Open Trivia DB for seed questions.

**Spec:** `docs/superpowers/specs/2026-07-17-family-trivia-design.md` — read it before starting any task.

## Global Constraints

- Instance: **`https://tekvoyantdev.service-now.com`**. Auth: the `now-sdk` **`buildSDK` OAuth profile** already on this machine (verify with `npx now-sdk auth --list` from any SDK workspace). **Never ask the user for a username or password.** If the OAuth token is expired/revoked, ask the user to re-run `now-sdk auth` interactively — that is the only auth action that needs them.
- `.env` (gitignored) holds only non-secret settings: `SN_INSTANCE=https://tekvoyantdev.service-now.com`, `SN_SCOPE=x_tekvo_famtriv`, `SN_APP_ID` (sys_id of the app record, captured in Task 2).
- Artifact ownership is split and must stay split: the **Fluent workspace (`fluent/`)** owns the app record, roles, all 13 tables, all Script Includes (game logic AND test suites), and ACLs if needed. The **REST toolchain (`tools/`)** owns Service Portal records (sp_widget/sp_page/sp_portal/sp_theme), the Scripted REST test endpoint, the scheduled cleanup job, and seed data (avatars, categories, questions). Never manage the same record from both sides.
- When a Fluent API idiom is unclear, read the corresponding file in the EmailOS workspace (`EmailOS/fluent/src/fluent/*.now.ts`, `EmailOS/fluent/src/server/*.server.js`) — it is the reference implementation for this instance and SDK version. Do not invent Fluent syntax.
- Every new `fluent/src/server/*.server.js` file must ALSO be registered in the Fluent app definition (per the pattern established in Task 4 Step 1) or the deploy silently skips it — when a class mysteriously "doesn't exist" in the instance, check registration first.
- Server-side code is **ES5 only** (no `let`/`const`/arrow functions/template literals in Script Includes, business rules, REST operation scripts).
- Client widget code targets AngularJS 1.x Service Portal widget API (`api.controller`, `c.server.get`, `spUtil`).
- Every scoped record insert must set `sys_scope` to `SN_APP_ID`.
- Spec values, verbatim: scoring `(500 + 500 × remaining/total) × (1 + 0.125 × (difficulty − 1))`; 90-day repeat-exclusion window (shrinks if pool exhausted); 8-second reveal auto-advance; defaults 10 questions / 20 seconds; 4-character join code; difficulty 1–5; pools `game`/`practice`; game states `lobby → in_question → reveal → finished`.
- **Architecture note (approved deviation from spec wording):** the in-game flow (lobby → question → reveal → podium) is ONE widget (`ft-game`) with internal views, not four pages — page reloads would kill recordWatch and the game feel. Home, Practice, Progress, Leaderboard, Profile are separate widgets/pages. Stats rollup is invoked directly from `TriviaEngine.finish()` rather than a business rule — same trigger point, deterministic and testable.
- TDD loop for server logic: add/edit the test Script Include source → `(cd fluent && npm run build && npm run deploy)` → `node tools/run-tests.mjs` (expect FAIL) → add implementation → build+deploy → run again (expect PASS) → commit. Commit after every green step.
- **Approved deviation from spec:** server tests run through a custom in-instance runner (Task 4) instead of ATF — ATF can't be triggered and read cleanly over REST from the CLI, and the runner gives the tight TDD loop this plan depends on. Coverage is the same set the spec names (selection, scoring, rollups, ratings, multiplayer smoke).
- Widget/UI tasks are verified by loading `/trivia` pages in a browser.
- Scoped Scripted REST APIs are served under the VENDOR-PREFIX namespace (e.g. `/api/tekvo/ftest`), not the full scope — the instance calculates `sys_ws_definition.namespace` and ignores Table API overrides. Tooling must look up the real `operation_uri` from the instance (run-tests.mjs does this) rather than constructing the path.

## File Structure

```
FamilyTrivia/
  .env                      # non-secret instance settings — gitignored anyway
  .gitignore
  README.md                 # how to deploy, test, seed, play (Task 19)
  fluent/                   # ServiceNow Fluent SDK workspace (mirror of EmailOS/fluent layout)
    now.config.json         # { scope: x_tekvo_famtriv, name: Family Trivia }
    package.json            # @servicenow/sdk ^4.8; scripts: build / deploy (now-sdk install)
    src/fluent/             # *.now.ts Fluent definitions: tables, roles, index
    src/server/*.server.js  # Script Includes, one file per class (game logic + *Test suites)
  tools/
    snc.mjs                 # REST helper (OAuth Bearer from Credential Manager)
    get-sn-token.ps1        # reads the now-sdk OAuth token from Windows Credential Manager
    sn-cli.mjs              # tiny CLI: ping / get
    create-test-api.mjs     # Scripted REST test-runner endpoint records
    deploy-widget.mjs       # upserts sp_widget from src/widgets/<id>/
    ensure-page.mjs         # creates sp_page→container→row→column→instance chain
    create-portal.mjs       # sp_portal + sp_theme
    create-cleanup-job.mjs  # hourly stale-game job
    run-tests.mjs           # calls the in-instance test runner, prints results
    import-otdb.mjs         # Open Trivia DB seeder (Task 18)
    seed-avatars.mjs        # avatar gallery seeder (Task 13)
  src/
    rest/*.js               # Scripted REST operation scripts (deployed by create-test-api.mjs)
    widgets/<widget-id>/    # template.html, client.js, server.js, css.scss, widget.json
    portal/theme.css        # shared theme CSS
```

Script Include convention: each class lives in `fluent/src/server/<ClassName>.server.js` and is registered in the Fluent app definition following the EmailOS idiom; `(cd fluent && npm run build && npm run deploy)` pushes every changed artifact in one shot.

---

### Task 1: Fluent workspace + OAuth REST tooling

**Files:**
- Create: `.gitignore`, `.env`, `fluent/` (SDK workspace), `tools/get-sn-token.ps1`, `tools/snc.mjs`, `tools/sn-cli.mjs`

**Interfaces:**
- Produces:
  - The Fluent SDK workspace `fluent/` (scope `x_tekvo_famtriv`), buildable and deployable with the `buildSDK` OAuth profile.
  - `snc.mjs` exports used by every later tool — `sn(method, path, body)`, `list(table, query, fields?)`, `insert(table, data)`, `update(table, sysId, data)`, `del(table, sysId)`, `ensure(table, query, data)`, `SCOPE`, `APP_ID`, `BASE`. Auth is an OAuth Bearer token read from Windows Credential Manager (`now-sdk.ServiceNow`) — the same token the SDK uses. No usernames or passwords anywhere.

- [ ] **Step 1: Verify the OAuth profile is alive.**

Run: `cd C:\Users\admincjw\ClaudeProjects\GitProjects\EmailOS\fluent && npx now-sdk auth --list`
Expected: a `buildSDK` profile, `host = https://tekvoyantdev.service-now.com`, `type = oauth`, `default = Yes`. If it is missing or errors, STOP and ask the user to run `now-sdk auth` interactively — do not attempt to create credentials yourself.

- [ ] **Step 2: Write `.gitignore` and `.env`**

`.gitignore`
```
.env
node_modules/
fluent/dist/
fluent/target/
```

`.env`
```
SN_INSTANCE=https://tekvoyantdev.service-now.com
SN_SCOPE=x_tekvo_famtriv
```

- [ ] **Step 3: Create the Fluent workspace.** Check `npx now-sdk init --help` first; if a non-interactive init exists, use it with scope `x_tekvo_famtriv`, app name `Family Trivia`, auth profile `buildSDK`. Otherwise mirror the EmailOS workspace by hand: copy `EmailOS/fluent/package.json` (change `name` to `@tekvo/familytrivia`, update `description`) and create `fluent/now.config.json`:

```json
{
    "scope": "x_tekvo_famtriv",
    "name": "Family Trivia"
}
```

(EmailOS's config also carries a `scopeId` — that is instance-assigned; leave it out and let the first deploy/init fill it in, matching whatever `now-sdk init`/`now-sdk install` produces.)

Then scaffold `fluent/src/fluent/index.now.ts` following `EmailOS/fluent/src/fluent/index.now.ts` (empty app definition to start) and run:

```bash
cd fluent && npm install
npm run build
```
Expected: build succeeds with zero artifacts. **Consult the EmailOS workspace for every Fluent idiom — do not invent syntax.** The SDK's TypeScript types in `fluent/node_modules/@servicenow/sdk` are the second reference.

- [ ] **Step 4: Write `tools/get-sn-token.ps1`** — reads the SDK's OAuth blob from Windows Credential Manager:

```powershell
$sig = @"
[DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
[DllImport("advapi32.dll")]
public static extern void CredFree(IntPtr cred);
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
"@
Add-Type -MemberDefinition $sig -Name CredMan -Namespace Win32
$ptr = [IntPtr]::Zero
if (-not [Win32.CredMan]::CredRead('now-sdk.ServiceNow', 1, 0, [ref]$ptr)) { throw 'now-sdk credential not found' }
$cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][Win32.CredMan+CREDENTIAL])
$blob = New-Object byte[] $cred.CredentialBlobSize
[System.Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $blob, 0, $cred.CredentialBlobSize)
[Win32.CredMan]::CredFree($ptr)
[Text.Encoding]::UTF8.GetString($blob)
```

Run it once (`powershell -NoProfile -ExecutionPolicy Bypass -File tools/get-sn-token.ps1`) and inspect the output shape — expect JSON containing an `access_token` (possibly nested per profile). If the output is garbled, switch the last line to `[Text.Encoding]::Unicode.GetString($blob)`. Record the actual blob shape in a comment at the top of the script.

- [ ] **Step 5: Write `tools/snc.mjs`**

```js
// ServiceNow REST helper. OAuth Bearer token from the now-sdk credential store. Node 18+.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const envPath = new URL('../.env', import.meta.url);
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export const BASE = (process.env.SN_INSTANCE || '').replace(/\/+$/, '');
export const SCOPE = process.env.SN_SCOPE || '';
export const APP_ID = process.env.SN_APP_ID || '';
if (!BASE) throw new Error('Missing SN_INSTANCE in .env');

function readToken() {
  const ps1 = fileURLToPath(new URL('./get-sn-token.ps1', import.meta.url));
  const raw = execFileSync('powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { encoding: 'utf8' });
  const m = raw.match(/"access_token"\s*:\s*"([^"]+)"/);
  if (!m) throw new Error('No access_token in now-sdk credential blob. Run a now-sdk command to refresh, or re-auth with `now-sdk auth`.');
  return m[1];
}
const AUTH = 'Bearer ' + readToken();

export async function sn(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
}

export const list = (table, query = '', fields = '') =>
  sn('GET', `/api/now/table/${table}?sysparm_query=${encodeURIComponent(query)}` +
            `&sysparm_fields=${fields}&sysparm_limit=2000&sysparm_display_value=false`)
    .then(r => r.result);

export const insert = (table, data) =>
  sn('POST', `/api/now/table/${table}`, data).then(r => r.result);

export const update = (table, sysId, data) =>
  sn('PATCH', `/api/now/table/${table}/${sysId}`, data).then(r => r.result);

export const del = (table, sysId) => sn('DELETE', `/api/now/table/${table}/${sysId}`);

// Find by encoded query; PATCH the first hit or POST a new record. Returns the record.
export async function ensure(table, query, data) {
  const found = await list(table, query, 'sys_id');
  return found.length ? update(table, found[0].sys_id, data) : insert(table, data);
}
```

- [ ] **Step 6: Write `tools/sn-cli.mjs`**

```js
import { sn, list } from './snc.mjs';
const [, , cmd, ...args] = process.argv;
if (cmd === 'ping') {
  const r = await list('sys_user', 'active=true', 'sys_id');
  console.log('auth OK, sample rows: ' + r.length);
} else if (cmd === 'get') {
  console.log(JSON.stringify(await list(args[0], args[1] || '', args[2] || ''), null, 2));
} else {
  console.log('usage: node tools/sn-cli.mjs ping | get <table> [query] [fields]');
}
```

- [ ] **Step 7: Verify connectivity**

Run: `node tools/sn-cli.mjs ping`
Expected: `auth OK, sample rows: <n>` with n ≥ 1. On 401: the access token has expired — run any real SDK command (e.g. `cd fluent && npm run build && npx now-sdk install`) which refreshes the stored token, then retry; if it still fails, ask the user to re-run `now-sdk auth`. Note in the README later which refresh path worked.

- [ ] **Step 8: Commit**

```bash
git add .gitignore fluent tools/snc.mjs tools/sn-cli.mjs tools/get-sn-token.ps1
git commit -m "feat: Fluent SDK workspace and OAuth REST tooling"
```

---

### Task 2: App + roles via Fluent, capture APP_ID

**Files:**
- Create: `fluent/src/fluent/roles.now.ts`
- Modify: `.env` (append `SN_APP_ID=`)

**Interfaces:**
- Consumes: the Fluent workspace from Task 1.
- Produces: the `Family Trivia` app record on the instance; roles `x_tekvo_famtriv.player` and `x_tekvo_famtriv.admin` (Fluent-owned); `SN_APP_ID` in `.env`.

- [ ] **Step 1: Define the roles in Fluent.** Create `fluent/src/fluent/roles.now.ts` declaring the two roles (`player`, `admin` — the SDK prefixes the scope). Use the `Role` API from `@servicenow/sdk/core`; check EmailOS for a usage example (`grep -r "Role" EmailOS/fluent/src/fluent/`) or the SDK types. Register the file in `index.now.ts` the same way EmailOS registers its fluent modules.

- [ ] **Step 2: First deploy — creates the app**

```bash
cd fluent && npm run build && npm run deploy
```
Expected: `now-sdk install` completes and reports the app installed on `tekvoyantdev.service-now.com`. If the deploy asks about the auth profile, select/confirm `buildSDK`.

- [ ] **Step 3: Capture the app sys_id**

Run: `node tools/sn-cli.mjs get sys_app scope=x_tekvo_famtriv name,scope,sys_id`
Expected: one record. Append `SN_APP_ID=<its sys_id>` to `.env`.

- [ ] **Step 4: Verify roles**

Run: `node tools/sn-cli.mjs get sys_user_role nameSTARTSWITHx_tekvo_famtriv name`
Expected: both roles.

- [ ] **Step 5: Grant roles to the family (user action).** Ask the user to assign `x_tekvo_famtriv.player` to each family member's account and `x_tekvo_famtriv.admin` to their own, or provide the usernames so you can insert `sys_user_has_role` records via `ensure('sys_user_has_role', 'user=<uid>^role=<roleId>', {user, role})`.

- [ ] **Step 6: Commit**

```bash
git add fluent .env.example 2>/dev/null; git add fluent
git commit -m "feat: Family Trivia app and roles via Fluent SDK"
```

---

### Task 3: Data model — all tables (Fluent)

**Files:**
- Create: `fluent/src/fluent/tables.now.ts` (all 13 table definitions), `tools/probe-tables.mjs`

**Interfaces:**
- Consumes: the Fluent workspace; `snc.mjs` for verification.
- Produces: instance tables named `x_tekvo_famtriv_<name>`. In server-side Script Includes, tables are referenced by literal name built once in the class constructor from `gs.getCurrentScopeName() + '_question'` etc.

- [ ] **Step 1: Learn the Fluent table idiom.** Read `EmailOS/fluent/src/fluent/foundation.now.ts` (and the SDK types under `fluent/node_modules/@servicenow/sdk`) to get the exact syntax for: table + label, string/integer/boolean/decimal/date-time columns, choice columns with value/label pairs, reference columns (to scoped tables AND to `sys_user`), default values, and max lengths. Do not invent syntax — every construct you need appears in EmailOS or the SDK types.

- [ ] **Step 2: Translate the following field specs into `fluent/src/fluent/tables.now.ts`.** The JSON blocks below are the authoritative field lists (element name, label, type, choices, defaults, max lengths) — one Fluent table definition each, registered in `index.now.ts`. In the specs, `@scope@_<name>` means a reference to our own table `x_tekvo_famtriv_<name>`.

**Table `category`** (field spec):
```json
{ "name": "category", "label": "Trivia Category", "fields": [
  { "element": "name", "label": "Name", "type": "string", "max_length": 80 },
  { "element": "icon", "label": "Icon (emoji)", "type": "string", "max_length": 8 },
  { "element": "color", "label": "Color (hex)", "type": "string", "max_length": 9 },
  { "element": "active", "label": "Active", "type": "boolean", "default": true },
  { "element": "otdb_id", "label": "OTDB Category ID", "type": "integer" }
] }
```

**Table `question`** (field spec):
```json
{ "name": "question", "label": "Trivia Question", "fields": [
  { "element": "text", "label": "Text", "type": "string", "max_length": 1024 },
  { "element": "qtype", "label": "Type", "type": "choice", "choices": [["mc", "Multiple Choice"], ["tf", "True/False"]] },
  { "element": "category", "label": "Category", "type": "reference", "reference": "@scope@_category" },
  { "element": "difficulty", "label": "Difficulty (1-5)", "type": "integer", "default": 3 },
  { "element": "pool", "label": "Pool", "type": "choice", "choices": [["game", "Game"], ["practice", "Practice"]] },
  { "element": "active", "label": "Active", "type": "boolean", "default": false },
  { "element": "source_id", "label": "Source ID", "type": "string", "max_length": 64 }
] }
```

**Table `question_option`** (field spec):
```json
{ "name": "question_option", "label": "Question Option", "fields": [
  { "element": "question", "label": "Question", "type": "reference", "reference": "@scope@_question" },
  { "element": "text", "label": "Text", "type": "string", "max_length": 512 },
  { "element": "correct", "label": "Correct", "type": "boolean", "default": false },
  { "element": "order", "label": "Order", "type": "integer" }
] }
```

**Table `game`** (field spec):
```json
{ "name": "game", "label": "Trivia Game", "fields": [
  { "element": "code", "label": "Join Code", "type": "string", "max_length": 8 },
  { "element": "host", "label": "Host", "type": "reference", "reference": "sys_user" },
  { "element": "mode", "label": "Mode", "type": "choice", "choices": [["uniform", "Everyone Same"], ["adaptive", "Skill-Matched"]] },
  { "element": "categories", "label": "Category IDs (comma)", "type": "string", "max_length": 1024 },
  { "element": "question_count", "label": "Question Count", "type": "integer", "default": 10 },
  { "element": "seconds_per_question", "label": "Seconds per Question", "type": "integer", "default": 20 },
  { "element": "state", "label": "State", "type": "choice", "choices": [["lobby", "Lobby"], ["in_question", "In Question"], ["reveal", "Reveal"], ["finished", "Finished"]] },
  { "element": "current_round", "label": "Current Round", "type": "integer", "default": 0 },
  { "element": "question_started_at", "label": "Question Started At", "type": "glide_date_time" },
  { "element": "reveal_started_at", "label": "Reveal Started At", "type": "glide_date_time" },
  { "element": "winner", "label": "Winner", "type": "reference", "reference": "sys_user" }
] }
```

**Table `game_player`** (field spec):
```json
{ "name": "game_player", "label": "Game Player", "fields": [
  { "element": "game", "label": "Game", "type": "reference", "reference": "@scope@_game" },
  { "element": "user", "label": "User", "type": "reference", "reference": "sys_user" },
  { "element": "score", "label": "Score", "type": "integer", "default": 0 },
  { "element": "correct_count", "label": "Correct Count", "type": "integer", "default": 0 },
  { "element": "answer_time_total_ms", "label": "Total Answer Time (ms)", "type": "integer", "default": 0 },
  { "element": "place", "label": "Place", "type": "integer" }
] }
```

**Table `game_question`** (field spec):
```json
{ "name": "game_question", "label": "Game Question", "fields": [
  { "element": "game", "label": "Game", "type": "reference", "reference": "@scope@_game" },
  { "element": "round", "label": "Round", "type": "integer" },
  { "element": "question", "label": "Question", "type": "reference", "reference": "@scope@_question" },
  { "element": "player", "label": "Player (adaptive only)", "type": "reference", "reference": "sys_user" }
] }
```

**Table `response`** (field spec):
```json
{ "name": "response", "label": "Response", "fields": [
  { "element": "game", "label": "Game", "type": "reference", "reference": "@scope@_game" },
  { "element": "player", "label": "Player", "type": "reference", "reference": "sys_user" },
  { "element": "round", "label": "Round", "type": "integer" },
  { "element": "question", "label": "Question", "type": "reference", "reference": "@scope@_question" },
  { "element": "option", "label": "Chosen Option", "type": "reference", "reference": "@scope@_question_option" },
  { "element": "correct", "label": "Correct", "type": "boolean" },
  { "element": "answer_time_ms", "label": "Answer Time (ms)", "type": "integer" },
  { "element": "points", "label": "Points", "type": "integer" },
  { "element": "practice", "label": "Practice", "type": "boolean", "default": false }
] }
```

**Table `profile`** (field spec):
```json
{ "name": "profile", "label": "Player Profile", "fields": [
  { "element": "user", "label": "User", "type": "reference", "reference": "sys_user" },
  { "element": "nickname", "label": "Nickname", "type": "string", "max_length": 40 },
  { "element": "avatar_source", "label": "Avatar Source", "type": "choice", "choices": [["gallery", "Gallery"], ["upload", "Upload"], ["sn_photo", "ServiceNow Photo"]] },
  { "element": "avatar", "label": "Gallery Avatar", "type": "reference", "reference": "@scope@_avatar" },
  { "element": "skill_overrides", "label": "Skill Overrides (JSON catId->1..5)", "type": "string", "max_length": 1024 }
] }
```

**Table `avatar`** (field spec):
```json
{ "name": "avatar", "label": "Avatar", "fields": [
  { "element": "name", "label": "Name", "type": "string", "max_length": 40 },
  { "element": "svg", "label": "SVG Markup", "type": "string", "max_length": 4000 },
  { "element": "order", "label": "Order", "type": "integer" },
  { "element": "active", "label": "Active", "type": "boolean", "default": true }
] }
```

**Table `skill_rating`** (field spec):
```json
{ "name": "skill_rating", "label": "Skill Rating", "fields": [
  { "element": "user", "label": "User", "type": "reference", "reference": "sys_user" },
  { "element": "category", "label": "Category", "type": "reference", "reference": "@scope@_category" },
  { "element": "accuracy", "label": "Rolling Accuracy (0-1)", "type": "decimal", "default": 0.5 },
  { "element": "sample_count", "label": "Sample Count", "type": "integer", "default": 0 }
] }
```

**Table `player_stats`** (field spec):
```json
{ "name": "player_stats", "label": "Player Stats", "fields": [
  { "element": "user", "label": "User", "type": "reference", "reference": "sys_user" },
  { "element": "total_wins", "label": "Total Wins", "type": "integer", "default": 0 },
  { "element": "total_points", "label": "Total Points", "type": "integer", "default": 0 },
  { "element": "total_correct", "label": "Total Correct", "type": "integer", "default": 0 },
  { "element": "longest_win_streak", "label": "Longest Win Streak", "type": "integer", "default": 0 },
  { "element": "current_win_streak", "label": "Current Win Streak", "type": "integer", "default": 0 }
] }
```

**Table `player_category_stats`** (field spec):
```json
{ "name": "player_category_stats", "label": "Player Category Stats", "fields": [
  { "element": "user", "label": "User", "type": "reference", "reference": "sys_user" },
  { "element": "category", "label": "Category", "type": "reference", "reference": "@scope@_category" },
  { "element": "correct_count", "label": "Correct Count", "type": "integer", "default": 0 }
] }
```

**Table `practice_session`** (field spec):
```json
{ "name": "practice_session", "label": "Practice Session", "fields": [
  { "element": "user", "label": "User", "type": "reference", "reference": "sys_user" },
  { "element": "category", "label": "Category (empty = all)", "type": "reference", "reference": "@scope@_category" },
  { "element": "question_count", "label": "Questions Answered", "type": "integer", "default": 0 },
  { "element": "correct_count", "label": "Correct", "type": "integer", "default": 0 },
  { "element": "accuracy", "label": "Accuracy (0-1)", "type": "decimal", "default": 0 }
] }
```

(Since all 13 tables deploy in one Fluent build, declaration order within `tables.now.ts` only needs to satisfy the compiler — follow whatever ordering EmailOS uses for intra-app references.)

- [ ] **Step 3: Deploy and probe all tables**

```bash
cd fluent && npm run build && npm run deploy
```

Then write `tools/probe-tables.mjs` — inserts and deletes one empty row per table to prove each exists and accepts records:

```js
import { SCOPE, insert, del } from './snc.mjs';
const TABLES = ['category', 'question', 'question_option', 'avatar', 'profile', 'game',
  'game_player', 'game_question', 'response', 'skill_rating', 'player_stats',
  'player_category_stats', 'practice_session'];
for (const t of TABLES) {
  const rec = await insert(`${SCOPE}_${t}`, {});
  await del(`${SCOPE}_${t}`, rec.sys_id);
  console.log('ok: ' + SCOPE + '_' + t);
}
```

Run: `node tools/probe-tables.mjs`
Expected: thirteen `ok:` lines.

- [ ] **Step 4: Verify a reference field works end-to-end**

Run: `node tools/sn-cli.mjs get sys_dictionary "name=x_tekvo_famtriv_question^element=category" reference,internal_type`
Expected: `reference` = `x_tekvo_famtriv_category`, `internal_type` = `reference`.

- [ ] **Step 5: Commit**

```bash
git add fluent tools/probe-tables.mjs
git commit -m "feat: all 13 trivia tables defined in Fluent"
```

---

### Task 4: In-instance test harness

**Files:**
- Create: `tools/create-test-api.mjs`, `tools/run-tests.mjs`, `fluent/src/server/TriviaTestBase.server.js`, `fluent/src/server/TriviaTestRunner.server.js`, `src/rest/test_run.js`, `fluent/src/server/TriviaHarnessTest.server.js`

**Interfaces:**
- Consumes: `snc.mjs`; the Fluent workspace.
- Produces:
  - The Script-Include registration pattern every server task follows: each ES5 class lives in `fluent/src/server/<ClassName>.server.js` and is declared as a Script Include in the Fluent app definition — find the exact idiom in EmailOS (`grep -ri "script" EmailOS/fluent/src/fluent/*.now.ts` shows how its `src/server/*.server.js` files are registered) and mirror it. Deploy = `cd fluent && npm run build && npm run deploy`.
  - `run-tests.mjs` — GETs `/api/<SCOPE>/ftest/run`, prints results, exits 0 on all-pass / 1 on any failure.
  - `TriviaTestBase` — ES5 base class: `this.failures` array, `assert(cond, msg)`, `assertEqual(actual, expected, msg)`, `run()` (invokes every own method starting with `test`, catches exceptions as failures, returns `{name, passed, total, failures}`).
  - `TriviaTestRunner.runAll()` — returns `{passed: bool, suites: [...]}`. **Every later server task registers its suite in `TriviaTestRunner.suites()`.**

- [ ] **Step 1: Establish the Script Include registration pattern.** Study how EmailOS registers its `src/server/*.server.js` files as Script Includes in the Fluent definition, and set up the same structure for this app (registration lives in `index.now.ts` or a dedicated `.now.ts` module — copy the EmailOS layout). One important check: ServiceNow Script Includes must be **ES5 accessible by classic Rhino consumers** (Service Portal widget server scripts and our Scripted REST endpoint call `new TriviaEngine()` etc. directly), so register them as classic Script Includes, not SDK-private modules. Verify by deploying `TriviaTestBase` (Step 2) and confirming `node tools/sn-cli.mjs get sys_script_include "name=TriviaTestBase" name,access,sys_scope.scope` shows it in scope `x_tekvo_famtriv`.

- [ ] **Step 2: Write `fluent/src/server/TriviaTestBase.server.js`** (ES5)

```js
var TriviaTestBase = Class.create();
TriviaTestBase.prototype = {
  initialize: function() { this.failures = []; },
  assert: function(cond, msg) { if (!cond) this.failures.push(msg || 'assert failed'); },
  assertEqual: function(actual, expected, msg) {
    if (actual != expected)
      this.failures.push((msg || 'assertEqual') + ': expected [' + expected + '] got [' + actual + ']');
  },
  run: function() {
    var total = 0;
    for (var key in this) {
      if (key.indexOf('test') === 0 && typeof this[key] === 'function') {
        total++;
        try { this[key](); }
        catch (e) { this.failures.push(key + ' threw: ' + e); }
      }
    }
    return { name: this.type, total: total, failures: this.failures, passed: this.failures.length === 0 };
  },
  type: 'TriviaTestBase'
};
```

- [ ] **Step 3: Write `fluent/src/server/TriviaTestRunner.server.js`** (ES5). The `suites()` list grows one line per later task.

```js
var TriviaTestRunner = Class.create();
TriviaTestRunner.prototype = {
  initialize: function() {},
  suites: function() {
    return [
      new TriviaHarnessTest()
      // Task 5 adds: , new TriviaScoringTest()
      // Task 6 adds: , new TriviaSkillTest()
      // Task 7 adds: , new TriviaSelectorTest()
      // Task 8 adds: , new TriviaEngineTest()
      // Task 9 adds: , new TriviaStatsTest()
      // Task 10 adds: , new TriviaPracticeTest()
      // Task 19 adds: , new TriviaE2ETest()
    ];
  },
  runAll: function() {
    var out = { passed: true, suites: [] };
    var all = this.suites();
    for (var i = 0; i < all.length; i++) {
      var r = all[i].run();
      if (!r.passed) out.passed = false;
      out.suites.push(r);
    }
    return out;
  },
  type: 'TriviaTestRunner'
};
```

- [ ] **Step 4: Write `fluent/src/server/TriviaHarnessTest.server.js`** — proves the harness itself works

```js
var TriviaHarnessTest = Class.create();
TriviaHarnessTest.prototype = Object.extendsObject(TriviaTestBase, {
  testTruth: function() { this.assert(true, 'truth is true'); },
  testMath: function() { this.assertEqual(2 + 2, 4, 'arithmetic'); },
  type: 'TriviaHarnessTest'
});
```

- [ ] **Step 5: Write `src/rest/test_run.js`** — the REST operation script

```js
(function process(request, response) {
  var result = new TriviaTestRunner().runAll();
  response.setContentType('application/json');
  response.getStreamWriter().writeString(JSON.stringify(result));
})(request, response);
```

- [ ] **Step 6: Write `tools/create-test-api.mjs`** — creates the Scripted REST API records:

```js
import { readFileSync } from 'node:fs';
import { SCOPE, APP_ID, ensure } from './snc.mjs';
const wsdef = await ensure('sys_ws_definition', 'service_id=ftest^sys_scope=' + APP_ID, {
  name: 'Family Trivia Tests', service_id: 'ftest', sys_scope: APP_ID, active: 'true',
});
await ensure('sys_ws_operation', 'web_service_definition=' + wsdef.sys_id + '^name=run', {
  name: 'run', web_service_definition: wsdef.sys_id, http_method: 'GET',
  relative_path: '/run', sys_scope: APP_ID, active: 'true',
  operation_script: readFileSync('src/rest/test_run.js', 'utf8'),
  requires_authentication: 'true', requires_acl_authorization: 'false',
});
console.log('test API at /api/' + SCOPE + '/ftest/run');
```

- [ ] **Step 7: Write `tools/run-tests.mjs`**

```js
import { SCOPE, sn } from './snc.mjs';
const r = await sn('GET', `/api/${SCOPE}/ftest/run`);
for (const s of r.suites) {
  console.log(`${s.passed ? 'PASS' : 'FAIL'}  ${s.name} (${s.total} tests)`);
  for (const f of s.failures) console.log('   - ' + f);
}
process.exit(r.passed ? 0 : 1);
```

- [ ] **Step 8: Deploy and run**

```bash
(cd fluent && npm run build && npm run deploy)
node tools/create-test-api.mjs
node tools/run-tests.mjs
```
Expected final output: `PASS  TriviaHarnessTest (2 tests)` and exit code 0.

- [ ] **Step 9: Commit**

```bash
git add tools fluent
git commit -m "feat: in-instance TDD harness (test base, runner, REST endpoint, CLI)"
```

---

### Task 5: TriviaScoring (TDD)

**Files:**
- Create: `fluent/src/server/TriviaScoring.server.js`, `fluent/src/server/TriviaScoringTest.server.js`
- Modify: `fluent/src/server/TriviaTestRunner.server.js` (register suite)

**Interfaces:**
- Produces: `new TriviaScoring().score(correct /*bool*/, answerMs /*int*/, totalSec /*int*/, difficulty /*1..5*/)` → integer points. Used by TriviaEngine (Task 8) and TriviaPractice (Task 10).

- [ ] **Step 1: Write the failing test** — `fluent/src/server/TriviaScoringTest.server.js`

```js
var TriviaScoringTest = Class.create();
TriviaScoringTest.prototype = Object.extendsObject(TriviaTestBase, {
  testCorrectInstantDiff1: function() {
    this.assertEqual(new TriviaScoring().score(true, 0, 20, 1), 1000, 'instant d1');
  },
  testCorrectAtTimeoutDiff1: function() {
    this.assertEqual(new TriviaScoring().score(true, 20000, 20, 1), 500, 'timeout d1');
  },
  testCorrectInstantDiff5: function() {
    this.assertEqual(new TriviaScoring().score(true, 0, 20, 5), 1500, 'instant d5');
  },
  testHalfwayDiff3: function() {
    // remaining 0.5 -> (500+250) * 1.25 = 937.5 -> 938
    this.assertEqual(new TriviaScoring().score(true, 10000, 20, 3), 938, 'halfway d3');
  },
  testWrong: function() {
    this.assertEqual(new TriviaScoring().score(false, 100, 20, 5), 0, 'wrong=0');
  },
  testClampOverTime: function() {
    this.assertEqual(new TriviaScoring().score(true, 99999, 20, 1), 500, 'clamped to timeout');
  },
  testClampNegative: function() {
    this.assertEqual(new TriviaScoring().score(true, -5, 20, 1), 1000, 'clamped to 0');
  },
  type: 'TriviaScoringTest'
});
```

- [ ] **Step 2: Register the suite.** In `fluent/src/server/TriviaTestRunner.server.js`, add `, new TriviaScoringTest()` after `new TriviaHarnessTest()`.

- [ ] **Step 3: Deploy test + runner, verify FAIL**

```bash
(cd fluent && npm run build && npm run deploy)
node tools/run-tests.mjs
```
Expected: `FAIL TriviaScoringTest` (TriviaScoring is not defined — tests throw), exit 1.

- [ ] **Step 4: Write `fluent/src/server/TriviaScoring.server.js`**

```js
var TriviaScoring = Class.create();
TriviaScoring.prototype = {
  initialize: function() {},
  // Spec: (500 + 500 * remaining/total) * (1 + 0.125 * (difficulty - 1)); wrong/absent = 0
  score: function(correct, answerMs, totalSec, difficulty) {
    if (!correct) return 0;
    var totalMs = totalSec * 1000;
    var t = Math.max(0, Math.min(Number(answerMs) || 0, totalMs));
    var remaining = (totalMs - t) / totalMs;
    var mult = 1 + 0.125 * (Number(difficulty) - 1);
    return Math.round((500 + 500 * remaining) * mult);
  },
  type: 'TriviaScoring'
};
```

- [ ] **Step 5: Deploy, verify PASS**

```bash
(cd fluent && npm run build && npm run deploy)
node tools/run-tests.mjs
```
Expected: all suites PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add fluent/src/server/TriviaScoring.server.js fluent/src/server/TriviaTestRunner.server.js fluent/src/server/TriviaScoringTest.server.js
git commit -m "feat: TriviaScoring with speed+difficulty formula (TDD)"
```

---

### Task 6: TriviaSkill (TDD)

**Files:**
- Create: `fluent/src/server/TriviaSkill.server.js`, `fluent/src/server/TriviaSkillTest.server.js`
- Modify: `fluent/src/server/TriviaTestRunner.server.js` (register `new TriviaSkillTest()`)

**Interfaces:**
- Consumes: tables `<SCOPE>_skill_rating`, `<SCOPE>_profile`.
- Produces (used by TriviaSelector, TriviaEngine, TriviaPractice):
  - `new TriviaSkill().targetDifficulty(userId, categoryId)` → int 1..5. Manual override from `profile.skill_overrides` JSON wins; else `1 + Math.round(accuracy * 4)` clamped to 1..5 from the skill_rating row; no row → 3 (accuracy 0.5).
  - `new TriviaSkill().recordAnswer(userId, categoryId, correct)` → updates/creates the rating row: `accuracy = accuracy * 0.9 + (correct ? 1 : 0) * 0.1`, `sample_count++`.

Test data convention (used by all data-touching suites): create records inside the test, delete them in a `cleanup()` method called at the end of each test method (`try/finally` is fine in Rhino ES5). Test users are `sys_user` rows with `user_name` starting `famtriv.test` — created via `_ensureTestUser(name)` helper shown below; reused, never deleted.

- [ ] **Step 1: Write the failing test** — `fluent/src/server/TriviaSkillTest.server.js`

```js
var TriviaSkillTest = Class.create();
TriviaSkillTest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix);
    gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize();
    gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  _makeCategory: function(name) {
    var gr = new GlideRecord(this._scope() + '_category');
    gr.initialize(); gr.setValue('name', name); gr.setValue('active', true);
    return gr.insert();
  },
  _deleteWhere: function(table, field, value) {
    var gr = new GlideRecord(this._scope() + '_' + table);
    gr.addQuery(field, value); gr.query();
    while (gr.next()) gr.deleteRecord();
  },
  testDefaultIsThree: function() {
    var u = this._ensureTestUser('skill1');
    var c = this._makeCategory('ZZ SkillTest A');
    try {
      this.assertEqual(new TriviaSkill().targetDifficulty(u, c), 3, 'no history -> 3');
    } finally {
      this._deleteWhere('category', 'sys_id', c);
    }
  },
  testRecordAnswerMovesAccuracy: function() {
    var u = this._ensureTestUser('skill2');
    var c = this._makeCategory('ZZ SkillTest B');
    try {
      var skill = new TriviaSkill();
      for (var i = 0; i < 10; i++) skill.recordAnswer(u, c, true);
      // 0.5 * 0.9^10 + 0.1*sum(0.9^k) ~= 0.826 -> 1 + round(3.3) = 4
      this.assertEqual(skill.targetDifficulty(u, c), 4, 'hot streak raises difficulty');
      for (var j = 0; j < 20; j++) skill.recordAnswer(u, c, false);
      this.assertEqual(skill.targetDifficulty(u, c), 1, 'cold streak lowers difficulty');
    } finally {
      this._deleteWhere('skill_rating', 'user', u);
      this._deleteWhere('category', 'sys_id', c);
    }
  },
  testManualOverrideWins: function() {
    var u = this._ensureTestUser('skill3');
    var c = this._makeCategory('ZZ SkillTest C');
    try {
      var p = new GlideRecord(this._scope() + '_profile');
      p.initialize(); p.setValue('user', u);
      var ov = {}; ov[c] = 5;
      p.setValue('skill_overrides', JSON.stringify(ov));
      p.insert();
      this.assertEqual(new TriviaSkill().targetDifficulty(u, c), 5, 'override wins');
    } finally {
      this._deleteWhere('profile', 'user', u);
      this._deleteWhere('category', 'sys_id', c);
    }
  },
  type: 'TriviaSkillTest'
});
```

- [ ] **Step 2: Register suite in TriviaTestRunner, deploy test + runner, verify FAIL**

```bash
(cd fluent && npm run build && npm run deploy)
node tools/run-tests.mjs
```
Expected: `FAIL TriviaSkillTest` (TriviaSkill not defined), exit 1.

- [ ] **Step 3: Write `fluent/src/server/TriviaSkill.server.js`**

```js
var TriviaSkill = Class.create();
TriviaSkill.prototype = {
  initialize: function() { this.scope = gs.getCurrentScopeName(); },

  targetDifficulty: function(userId, categoryId) {
    var p = new GlideRecord(this.scope + '_profile');
    p.addQuery('user', userId); p.query();
    if (p.next()) {
      var raw = p.getValue('skill_overrides');
      if (raw) {
        try {
          var ov = JSON.parse(raw);
          if (ov[categoryId]) return Math.min(5, Math.max(1, parseInt(ov[categoryId], 10)));
        } catch (e) { /* bad JSON -> ignore override */ }
      }
    }
    var acc = 0.5;
    var r = new GlideRecord(this.scope + '_skill_rating');
    r.addQuery('user', userId); r.addQuery('category', categoryId); r.query();
    if (r.next()) acc = parseFloat(r.getValue('accuracy'));
    return Math.min(5, Math.max(1, 1 + Math.round(acc * 4)));
  },

  recordAnswer: function(userId, categoryId, correct) {
    var r = new GlideRecord(this.scope + '_skill_rating');
    r.addQuery('user', userId); r.addQuery('category', categoryId); r.query();
    if (!r.next()) {
      r.initialize();
      r.setValue('user', userId); r.setValue('category', categoryId);
      r.setValue('accuracy', 0.5); r.setValue('sample_count', 0);
      r.insert();
      r.get(r.getUniqueValue());
    }
    var acc = parseFloat(r.getValue('accuracy'));
    r.setValue('accuracy', acc * 0.9 + (correct ? 1 : 0) * 0.1);
    r.setValue('sample_count', parseInt(r.getValue('sample_count'), 10) + 1);
    r.update();
  },
  type: 'TriviaSkill'
};
```

- [ ] **Step 4: Deploy, verify PASS**

```bash
(cd fluent && npm run build && npm run deploy)
node tools/run-tests.mjs
```
Expected: all PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add fluent/src/server/TriviaSkill.server.js fluent/src/server/TriviaTestRunner.server.js fluent/src/server/TriviaSkillTest.server.js
git commit -m "feat: TriviaSkill rating with EWMA accuracy and manual override (TDD)"
```

---

### Task 7: TriviaSelector (TDD)

**Files:**
- Create: `fluent/src/server/TriviaSelector.server.js`, `fluent/src/server/TriviaSelectorTest.server.js`
- Modify: `fluent/src/server/TriviaTestRunner.server.js` (register `new TriviaSelectorTest()`)

**Interfaces:**
- Consumes: `TriviaSkill.targetDifficulty`, tables `question`, `response`.
- Produces (used by TriviaEngine Task 8 and TriviaPractice Task 10):
  - `new TriviaSelector().roundCategories(categoryIds /*array*/, n)` → array of n category sys_ids (shuffled round-robin so rounds cycle through the chosen categories).
  - `new TriviaSelector().pickUniform(categoryIds, n, userIds)` → array of n question sys_ids, `pool=game`, active, excluding questions ANY listed user answered within the exclusion window (90 days, halving to 45/22/... until enough candidates exist; 0 = no exclusion).
  - `new TriviaSelector().pickForUser(categoryId, userId, excludeIds /*array*/, pool /*'game'|'practice'*/)` → one question sys_id at the user's target difficulty for that category (falls back ±1, then any difficulty), same 90-day per-user exclusion, or `''` if the pool is empty.

- [ ] **Step 1: Write the failing test** — `fluent/src/server/TriviaSelectorTest.server.js`

```js
var TriviaSelectorTest = Class.create();
TriviaSelectorTest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix); gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize(); gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  _makeCategory: function(name) {
    var gr = new GlideRecord(this._scope() + '_category');
    gr.initialize(); gr.setValue('name', name); gr.setValue('active', true);
    return gr.insert();
  },
  _makeQuestion: function(catId, difficulty, pool, text) {
    var q = new GlideRecord(this._scope() + '_question');
    q.initialize();
    q.setValue('text', text); q.setValue('qtype', 'mc');
    q.setValue('category', catId); q.setValue('difficulty', difficulty);
    q.setValue('pool', pool); q.setValue('active', true);
    return q.insert();
  },
  _cleanupCategory: function(catId) {
    var tables = ['response', 'question', 'category'];
    for (var i = 0; i < tables.length; i++) {
      var gr = new GlideRecord(this._scope() + '_' + tables[i]);
      if (tables[i] === 'category') gr.addQuery('sys_id', catId);
      else if (tables[i] === 'question') gr.addQuery('category', catId);
      else gr.addQuery('question.category', catId);
      gr.query();
      while (gr.next()) gr.deleteRecord();
    }
  },
  testPickUniformCountAndPool: function() {
    var c = this._makeCategory('ZZ Sel A');
    var u = this._ensureTestUser('sel1');
    try {
      for (var i = 0; i < 6; i++) this._makeQuestion(c, (i % 5) + 1, 'game', 'GameQ' + i);
      this._makeQuestion(c, 3, 'practice', 'PracticeQ');
      var picked = new TriviaSelector().pickUniform([c], 5, [u]);
      this.assertEqual(picked.length, 5, 'picked 5');
      // none of the picked may be the practice question
      var q = new GlideRecord(this._scope() + '_question');
      q.addQuery('sys_id', 'IN', picked.join(','));
      q.addQuery('pool', 'practice'); q.query();
      this.assert(!q.next(), 'no practice questions in game pick');
    } finally { this._cleanupCategory(c); }
  },
  testUniformExcludesRecentlyAnswered: function() {
    var c = this._makeCategory('ZZ Sel B');
    var u = this._ensureTestUser('sel2');
    try {
      var seen = this._makeQuestion(c, 3, 'game', 'SeenQ');
      for (var i = 0; i < 3; i++) this._makeQuestion(c, 3, 'game', 'FreshQ' + i);
      var r = new GlideRecord(this._scope() + '_response');
      r.initialize(); r.setValue('player', u); r.setValue('question', seen);
      r.setValue('correct', true); r.insert();
      var picked = new TriviaSelector().pickUniform([c], 3, [u]);
      this.assertEqual(picked.length, 3, 'still fills 3');
      this.assert(picked.join(',').indexOf(seen) === -1, 'recently answered excluded');
    } finally { this._cleanupCategory(c); }
  },
  testExclusionShrinksWhenPoolExhausted: function() {
    var c = this._makeCategory('ZZ Sel C');
    var u = this._ensureTestUser('sel3');
    try {
      // only 2 questions, both answered recently -> window must shrink to 0 and reuse them
      var q1 = this._makeQuestion(c, 3, 'game', 'OnlyQ1');
      var q2 = this._makeQuestion(c, 3, 'game', 'OnlyQ2');
      var r = new GlideRecord(this._scope() + '_response');
      r.initialize(); r.setValue('player', u); r.setValue('question', q1); r.insert();
      r.initialize(); r.setValue('player', u); r.setValue('question', q2); r.insert();
      var picked = new TriviaSelector().pickUniform([c], 2, [u]);
      this.assertEqual(picked.length, 2, 'reuses when nothing else exists');
    } finally { this._cleanupCategory(c); }
  },
  testPickForUserMatchesDifficulty: function() {
    var c = this._makeCategory('ZZ Sel D');
    var u = this._ensureTestUser('sel4');
    try {
      this._makeQuestion(c, 1, 'game', 'D1');
      var d3 = this._makeQuestion(c, 3, 'game', 'D3');
      this._makeQuestion(c, 5, 'game', 'D5');
      // no history -> target difficulty 3
      this.assertEqual(new TriviaSelector().pickForUser(c, u, [], 'game'), d3, 'picks difficulty 3');
    } finally { this._cleanupCategory(c); }
  },
  type: 'TriviaSelectorTest'
});
```

- [ ] **Step 2: Register suite, deploy test + runner, verify FAIL**

```bash
(cd fluent && npm run build && npm run deploy)
node tools/run-tests.mjs
```
Expected: `FAIL TriviaSelectorTest`, exit 1.

- [ ] **Step 3: Write `fluent/src/server/TriviaSelector.server.js`**

```js
var TriviaSelector = Class.create();
TriviaSelector.prototype = {
  initialize: function() { this.scope = gs.getCurrentScopeName(); },

  _shuffle: function(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  },

  // question sys_ids answered by any of userIds within `days` (0 disables)
  _recentIds: function(userIds, days) {
    if (!days) return [];
    var ids = [];
    var r = new GlideRecord(this.scope + '_response');
    r.addQuery('player', 'IN', userIds.join(','));
    r.addQuery('sys_created_on', '>=', gs.daysAgoStart(days));
    r.query();
    while (r.next()) ids.push(r.getValue('question'));
    return ids;
  },

  _candidates: function(categoryIds, pool, excludeIds, difficulty) {
    var q = new GlideRecord(this.scope + '_question');
    q.addQuery('active', true);
    q.addQuery('pool', pool);
    q.addQuery('category', 'IN', categoryIds.join(','));
    if (difficulty) q.addQuery('difficulty', difficulty);
    if (excludeIds.length) q.addQuery('sys_id', 'NOT IN', excludeIds.join(','));
    q.query();
    var out = [];
    while (q.next()) out.push(q.getUniqueValue());
    return out;
  },

  roundCategories: function(categoryIds, n) {
    var order = this._shuffle(categoryIds.slice());
    var out = [];
    for (var i = 0; i < n; i++) out.push(order[i % order.length]);
    return out;
  },

  pickUniform: function(categoryIds, n, userIds) {
    var days = 90;
    var cands = [];
    while (true) {
      cands = this._candidates(categoryIds, 'game', this._recentIds(userIds, days), 0);
      if (cands.length >= n || days === 0) break;
      days = Math.floor(days / 2);
      if (days < 3) days = 0;
    }
    return this._shuffle(cands).slice(0, n);
  },

  pickForUser: function(categoryId, userId, excludeIds, pool) {
    var target = new TriviaSkill().targetDifficulty(userId, categoryId);
    var days = 90;
    while (true) {
      var recent = this._recentIds([userId], days).concat(excludeIds);
      var tries = [target, target - 1, target + 1, 0]; // 0 = any difficulty
      for (var i = 0; i < tries.length; i++) {
        if (tries[i] < 0 || tries[i] > 5) continue;
        var cands = this._candidates([categoryId], pool, recent, tries[i]);
        if (cands.length) return this._shuffle(cands)[0];
      }
      if (days === 0) return '';
      days = Math.floor(days / 2);
      if (days < 3) days = 0;
    }
  },
  type: 'TriviaSelector'
};
```

- [ ] **Step 4: Deploy, verify PASS**

```bash
(cd fluent && npm run build && npm run deploy)
node tools/run-tests.mjs
```
Expected: all PASS, exit 0. (`testPickForUserMatchesDifficulty` is deterministic because only one difficulty-3 question exists.)

- [ ] **Step 5: Commit**

```bash
git add fluent/src/server/TriviaSelector.server.js fluent/src/server/TriviaTestRunner.server.js fluent/src/server/TriviaSelectorTest.server.js
git commit -m "feat: TriviaSelector with per-user difficulty targeting and shrinking exclusion window (TDD)"
```

---

### Task 8: TriviaEngine (TDD)

**Files:**
- Create: `fluent/src/server/TriviaEngine.server.js`, `fluent/src/server/TriviaEngineTest.server.js`
- Modify: `fluent/src/server/TriviaTestRunner.server.js` (register `new TriviaEngineTest()`)

**Interfaces:**
- Consumes: `TriviaSelector`, `TriviaScoring`, `TriviaSkill`; `TriviaStats.rollupGame` (Task 9 — until then, engine guards with `typeof TriviaStats !== 'undefined'`).
- Produces (every method takes explicit `userId` so widgets pass `gs.getUserID()` and tests pass fake users):
  - `createGame(userId, opts)` — opts `{mode, categories: [], questionCount, secondsPerQuestion}`; returns `{gameId, code}`.
  - `joinGame(userId, code)` — returns `{gameId}` or `{error}` (no such code / not in lobby).
  - `startGame(gameId, userId)` — host only; selects questions, writes game_question rows, state→`in_question`, round 1.
  - `answer(gameId, userId, optionId, clientMs)` — validates, first-write-wins, scores, updates game_player + skill; closes the round early when all players have answered; returns `{accepted, correct, points}`.
  - `tick(gameId)` — idempotent clock: closes an expired question (grace 2s) → `reveal`; advances an expired reveal (8s) → next round or finish.
  - `advance(gameId, userId)` — host-triggered next.
  - `finish(gameId)` — places, winner (score desc, then correct_count desc, then answer_time_total_ms asc), state→`finished`, calls `TriviaStats.rollupGame(gameId)` if defined.
  - `getState(gameId, userId)` — one JSON snapshot the game widget renders from (shape documented in the code below; **never leaks correct flags while state is `in_question`**).
  - `champion()` — `{userId}` of most recent finished game's winner, or `{userId: ''}`.

- [ ] **Step 1: Write the failing test** — `fluent/src/server/TriviaEngineTest.server.js`. Full game lifecycle with two users.

```js
var TriviaEngineTest = Class.create();
TriviaEngineTest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix); gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize(); gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  _seed: function(tag) {
    // one category + 4 MC questions (difficulty 3) with 2 options each, first option correct
    var s = this._scope();
    var c = new GlideRecord(s + '_category');
    c.initialize(); c.setValue('name', 'ZZ Eng ' + tag); c.setValue('active', true);
    var catId = c.insert();
    var correctIds = [];
    for (var i = 0; i < 4; i++) {
      var q = new GlideRecord(s + '_question');
      q.initialize(); q.setValue('text', 'EngQ' + tag + i); q.setValue('qtype', 'mc');
      q.setValue('category', catId); q.setValue('difficulty', 3);
      q.setValue('pool', 'game'); q.setValue('active', true);
      var qId = q.insert();
      for (var o = 0; o < 2; o++) {
        var op = new GlideRecord(s + '_question_option');
        op.initialize(); op.setValue('question', qId);
        op.setValue('text', 'Opt' + o); op.setValue('correct', o === 0); op.setValue('order', o);
        var opId = op.insert();
        if (o === 0) correctIds.push(opId);
      }
    }
    return { catId: catId, correctIds: correctIds };
  },
  _cleanup: function(catId) {
    var s = this._scope();
    var del = function(table, field, value) {
      var gr = new GlideRecord(s + '_' + table);
      gr.addQuery(field, value); gr.query();
      while (gr.next()) gr.deleteRecord();
    };
    del('response', 'question.category', catId);
    del('game_question', 'question.category', catId);
    del('question_option', 'question.category', catId);
    del('question', 'category', catId);
    del('category', 'sys_id', catId);
    // games created by tests: host is a famtriv.test user
    var g = new GlideRecord(s + '_game');
    g.addQuery('host.user_name', 'STARTSWITH', 'famtriv.test'); g.query();
    while (g.next()) {
      del('game_player', 'game', g.getUniqueValue());
      g.deleteRecord();
    }
  },
  _correctOptionFor: function(gameId, round, userId) {
    var s = this._scope();
    var gq = new GlideRecord(s + '_game_question');
    gq.addQuery('game', gameId); gq.addQuery('round', round); gq.query();
    var qId = '';
    while (gq.next()) {
      var pl = gq.getValue('player');
      if (pl === userId) { qId = gq.getValue('question'); break; }
      if (!pl) qId = gq.getValue('question'); // uniform row
    }
    var op = new GlideRecord(s + '_question_option');
    op.addQuery('question', qId); op.addQuery('correct', true);
    op.query(); op.next();
    return op.getUniqueValue();
  },
  _backdateQuestionStart: function(gameId, seconds) {
    var g = new GlideRecord(this._scope() + '_game'); g.get(gameId);
    var gdt = new GlideDateTime(); gdt.addSeconds(-seconds);
    g.setValue('question_started_at', gdt); g.update();
  },
  testFullUniformGame: function() {
    var seed = this._seed('U');
    var a = this._ensureTestUser('engA'), b = this._ensureTestUser('engB');
    try {
      var eng = new TriviaEngine();
      var made = eng.createGame(a, { mode: 'uniform', categories: [seed.catId], questionCount: 2, secondsPerQuestion: 20 });
      this.assertEqual(made.code.length, 4, '4-char code');
      var joined = eng.joinGame(b, made.code);
      this.assertEqual(joined.gameId, made.gameId, 'join by code');
      eng.startGame(made.gameId, a);
      var st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'in_question', 'started');
      this.assertEqual(st.round, 1, 'round 1');
      this.assert(st.question && st.question.options.length === 2, 'question served');
      this.assert(JSON.stringify(st.question).indexOf('correct') === -1, 'no correct leak in question');
      // both answer round 1 correctly -> auto reveal
      var ra = eng.answer(made.gameId, a, this._correctOptionFor(made.gameId, 1, a), 1000);
      this.assert(ra.accepted && ra.correct && ra.points > 0, 'A scored');
      var dup = eng.answer(made.gameId, a, this._correctOptionFor(made.gameId, 1, a), 1000);
      this.assert(!dup.accepted, 'duplicate rejected');
      eng.answer(made.gameId, b, this._correctOptionFor(made.gameId, 1, b), 5000);
      st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'reveal', 'all answered -> reveal');
      // host advances to round 2; only A answers; timeout closes the round without B
      eng.advance(made.gameId, a);
      eng.answer(made.gameId, a, this._correctOptionFor(made.gameId, 2, a), 1000);
      st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'in_question', 'round stays open until timeout');
      this._backdateQuestionStart(made.gameId, 30);
      eng.tick(made.gameId);
      st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'reveal', 'timeout closed round, absent player scores 0');
      eng.advance(made.gameId, a);
      st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'finished', 'game finished');
      this.assertEqual(st.podium[0].userId, a, 'A wins (faster + 2 correct)');
      this.assertEqual(eng.champion().userId, a, 'champion is A');
    } finally { this._cleanup(seed.catId); }
  },
  testTickClosesExpiredQuestion: function() {
    var seed = this._seed('T');
    var a = this._ensureTestUser('engC');
    try {
      var eng = new TriviaEngine();
      var made = eng.createGame(a, { mode: 'uniform', categories: [seed.catId], questionCount: 1, secondsPerQuestion: 20 });
      eng.startGame(made.gameId, a);
      this._backdateQuestionStart(made.gameId, 30);
      eng.tick(made.gameId);
      this.assertEqual(eng.getState(made.gameId, a).state, 'reveal', 'tick closed expired question');
      // backdate reveal_started_at by 10s -> tick finishes (only 1 round)
      var g = new GlideRecord(this._scope() + '_game'); g.get(made.gameId);
      var gdt = new GlideDateTime(); gdt.addSeconds(-10);
      g.setValue('reveal_started_at', gdt); g.update();
      eng.tick(made.gameId);
      this.assertEqual(eng.getState(made.gameId, a).state, 'finished', 'tick finished game');
    } finally { this._cleanup(seed.catId); }
  },
  testAdaptiveServesPerPlayer: function() {
    var seed = this._seed('A');
    var a = this._ensureTestUser('engD'), b = this._ensureTestUser('engE');
    try {
      var eng = new TriviaEngine();
      var made = eng.createGame(a, { mode: 'adaptive', categories: [seed.catId], questionCount: 2, secondsPerQuestion: 20 });
      eng.joinGame(b, made.code);
      eng.startGame(made.gameId, a);
      var s = this._scope();
      var gq = new GlideAggregate(s + '_game_question');
      gq.addQuery('game', made.gameId);
      gq.addAggregate('COUNT'); gq.query(); gq.next();
      this.assertEqual(gq.getAggregate('COUNT'), 4, '2 rounds x 2 players rows');
      var stA = eng.getState(made.gameId, a);
      var stB = eng.getState(made.gameId, b);
      this.assert(stA.question.gqId !== stB.question.gqId, 'per-player question rows');
    } finally { this._cleanup(seed.catId); }
  },
  type: 'TriviaEngineTest'
});
```

- [ ] **Step 2: Register suite, deploy test + runner, verify FAIL**

```bash
(cd fluent && npm run build && npm run deploy)
node tools/run-tests.mjs
```
Expected: `FAIL TriviaEngineTest`, exit 1.

- [ ] **Step 3: Write `fluent/src/server/TriviaEngine.server.js`**

```js
var TriviaEngine = Class.create();
TriviaEngine.prototype = {
  initialize: function() {
    this.scope = gs.getCurrentScopeName();
    this.GRACE_MS = 2000;   // network grace after question timer
    this.REVEAL_MS = 8000;  // spec: 8s auto-advance
  },

  _now: function() { return new GlideDateTime().getNumericValue(); },
  _ms: function(glideValue) {
    if (!glideValue) return 0;
    return new GlideDateTime(glideValue).getNumericValue();
  },
  _game: function(gameId) {
    var g = new GlideRecord(this.scope + '_game');
    return g.get(gameId) ? g : null;
  },
  _players: function(gameId) {
    var out = [];
    var p = new GlideRecord(this.scope + '_game_player');
    p.addQuery('game', gameId); p.orderByDesc('score'); p.query();
    while (p.next()) out.push({
      id: p.getUniqueValue(), userId: p.getValue('user'),
      score: parseInt(p.getValue('score'), 10) || 0,
      correct: parseInt(p.getValue('correct_count'), 10) || 0,
      timeMs: parseInt(p.getValue('answer_time_total_ms'), 10) || 0,
      place: parseInt(p.getValue('place'), 10) || 0
    });
    return out;
  },

  createGame: function(userId, opts) {
    var code = this._newCode();
    var g = new GlideRecord(this.scope + '_game');
    g.initialize();
    g.setValue('code', code);
    g.setValue('host', userId);
    g.setValue('mode', opts.mode === 'adaptive' ? 'adaptive' : 'uniform');
    g.setValue('categories', (opts.categories || []).join(','));
    g.setValue('question_count', opts.questionCount || 10);
    g.setValue('seconds_per_question', opts.secondsPerQuestion || 20);
    g.setValue('state', 'lobby');
    g.setValue('current_round', 0);
    var gameId = g.insert();
    this._join(gameId, userId);
    return { gameId: gameId, code: code };
  },

  _newCode: function() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 confusion
    while (true) {
      var code = '';
      for (var i = 0; i < 4; i++) code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      var g = new GlideRecord(this.scope + '_game');
      g.addQuery('code', code);
      g.addQuery('state', '!=', 'finished');
      g.query();
      if (!g.next()) return code;
    }
  },

  _join: function(gameId, userId) {
    var p = new GlideRecord(this.scope + '_game_player');
    p.addQuery('game', gameId); p.addQuery('user', userId); p.query();
    if (p.next()) return p.getUniqueValue();
    p.initialize(); p.setValue('game', gameId); p.setValue('user', userId);
    p.setValue('score', 0); p.setValue('correct_count', 0); p.setValue('answer_time_total_ms', 0);
    return p.insert();
  },

  joinGame: function(userId, code) {
    var g = new GlideRecord(this.scope + '_game');
    g.addQuery('code', String(code).toUpperCase());
    g.addQuery('state', 'lobby');
    g.orderByDesc('sys_created_on'); g.query();
    if (!g.next()) return { error: 'No open game with that code' };
    var gameId = g.getUniqueValue();
    this._join(gameId, userId);
    return { gameId: gameId };
  },

  startGame: function(gameId, userId) {
    var g = this._game(gameId);
    if (!g || g.getValue('state') !== 'lobby') return { error: 'Not in lobby' };
    if (g.getValue('host') !== userId) return { error: 'Only the host can start' };
    var cats = (g.getValue('categories') || '').split(',');
    var n = parseInt(g.getValue('question_count'), 10);
    var players = this._players(gameId);
    var sel = new TriviaSelector();
    var i, gq;
    if (g.getValue('mode') === 'uniform') {
      var userIds = [];
      for (i = 0; i < players.length; i++) userIds.push(players[i].userId);
      var qs = sel.pickUniform(cats, n, userIds);
      for (i = 0; i < qs.length; i++) {
        gq = new GlideRecord(this.scope + '_game_question');
        gq.initialize(); gq.setValue('game', gameId);
        gq.setValue('round', i + 1); gq.setValue('question', qs[i]);
        gq.insert();
      }
      n = qs.length; // pool may be smaller than requested
    } else {
      var roundCats = sel.roundCategories(cats, n);
      for (i = 0; i < n; i++) {
        for (var p = 0; p < players.length; p++) {
          var exclude = this._questionsInGameFor(gameId, players[p].userId);
          var qId = sel.pickForUser(roundCats[i], players[p].userId, exclude, 'game');
          if (!qId) continue;
          gq = new GlideRecord(this.scope + '_game_question');
          gq.initialize(); gq.setValue('game', gameId);
          gq.setValue('round', i + 1); gq.setValue('question', qId);
          gq.setValue('player', players[p].userId);
          gq.insert();
        }
      }
    }
    g.setValue('question_count', n);
    g.setValue('state', 'in_question');
    g.setValue('current_round', 1);
    g.setValue('question_started_at', new GlideDateTime());
    g.update();
    return { started: true };
  },

  _questionsInGameFor: function(gameId, userId) {
    var out = [];
    var gq = new GlideRecord(this.scope + '_game_question');
    gq.addQuery('game', gameId);
    gq.query();
    while (gq.next()) {
      var pl = gq.getValue('player');
      if (!pl || pl === userId) out.push(gq.getValue('question'));
    }
    return out;
  },

  _gameQuestionFor: function(gameId, round, userId) {
    var gq = new GlideRecord(this.scope + '_game_question');
    gq.addQuery('game', gameId); gq.addQuery('round', round);
    gq.query();
    var uniform = null;
    while (gq.next()) {
      var pl = gq.getValue('player');
      if (pl === userId) return { gqId: gq.getUniqueValue(), questionId: gq.getValue('question') };
      if (!pl) uniform = { gqId: gq.getUniqueValue(), questionId: gq.getValue('question') };
    }
    return uniform;
  },

  answer: function(gameId, userId, optionId, clientMs) {
    var g = this._game(gameId);
    if (!g || g.getValue('state') !== 'in_question') return { accepted: false, reason: 'round closed' };
    var round = parseInt(g.getValue('current_round'), 10);
    // first write wins
    var dup = new GlideRecord(this.scope + '_response');
    dup.addQuery('game', gameId); dup.addQuery('player', userId); dup.addQuery('round', round);
    dup.query();
    if (dup.next()) return { accepted: false, reason: 'already answered' };
    var mine = this._gameQuestionFor(gameId, round, userId);
    if (!mine) return { accepted: false, reason: 'no question for you this round' };
    var op = new GlideRecord(this.scope + '_question_option');
    if (!op.get(optionId) || op.getValue('question') !== mine.questionId)
      return { accepted: false, reason: 'invalid option' };
    var q = new GlideRecord(this.scope + '_question');
    q.get(mine.questionId);
    var totalSec = parseInt(g.getValue('seconds_per_question'), 10);
    var elapsed = this._now() - this._ms(g.getValue('question_started_at'));
    var ms = Math.max(0, Math.min(parseInt(clientMs, 10) || 0, elapsed)); // clamp to server clock
    if (elapsed > totalSec * 1000 + this.GRACE_MS) return { accepted: false, reason: 'too late' };
    var correct = op.getValue('correct') === '1' || op.getValue('correct') === 'true';
    var points = new TriviaScoring().score(correct, ms, totalSec, parseInt(q.getValue('difficulty'), 10));
    var r = new GlideRecord(this.scope + '_response');
    r.initialize();
    r.setValue('game', gameId); r.setValue('player', userId); r.setValue('round', round);
    r.setValue('question', mine.questionId); r.setValue('option', optionId);
    r.setValue('correct', correct); r.setValue('answer_time_ms', ms); r.setValue('points', points);
    r.insert();
    var p = new GlideRecord(this.scope + '_game_player');
    p.addQuery('game', gameId); p.addQuery('user', userId); p.query();
    if (p.next()) {
      p.setValue('score', (parseInt(p.getValue('score'), 10) || 0) + points);
      if (correct) p.setValue('correct_count', (parseInt(p.getValue('correct_count'), 10) || 0) + 1);
      p.setValue('answer_time_total_ms', (parseInt(p.getValue('answer_time_total_ms'), 10) || 0) + ms);
      p.update();
    }
    new TriviaSkill().recordAnswer(userId, q.getValue('category'), correct);
    // all answered? close early
    var players = this._players(gameId);
    var resp = new GlideAggregate(this.scope + '_response');
    resp.addQuery('game', gameId); resp.addQuery('round', round);
    resp.addAggregate('COUNT'); resp.query(); resp.next();
    if (parseInt(resp.getAggregate('COUNT'), 10) >= players.length) this._toReveal(g);
    return { accepted: true, correct: correct, points: points };
  },

  _toReveal: function(g) {
    if (g.getValue('state') !== 'in_question') return;
    g.setValue('state', 'reveal');
    g.setValue('reveal_started_at', new GlideDateTime());
    g.update();
  },

  tick: function(gameId) {
    var g = this._game(gameId);
    if (!g) return;
    var state = g.getValue('state');
    if (state === 'in_question') {
      var totalMs = parseInt(g.getValue('seconds_per_question'), 10) * 1000;
      if (this._now() - this._ms(g.getValue('question_started_at')) > totalMs + this.GRACE_MS)
        this._toReveal(g);
    } else if (state === 'reveal') {
      if (this._now() - this._ms(g.getValue('reveal_started_at')) > this.REVEAL_MS)
        this._advance(g);
    }
  },

  advance: function(gameId, userId) {
    var g = this._game(gameId);
    if (!g || g.getValue('state') !== 'reveal') return { error: 'not in reveal' };
    if (g.getValue('host') !== userId) return { error: 'host only' };
    this._advance(g);
    return { advanced: true };
  },

  _advance: function(g) {
    var round = parseInt(g.getValue('current_round'), 10);
    var total = parseInt(g.getValue('question_count'), 10);
    if (round >= total) { this.finish(g.getUniqueValue()); return; }
    g.setValue('current_round', round + 1);
    g.setValue('state', 'in_question');
    g.setValue('question_started_at', new GlideDateTime());
    g.update();
  },

  finish: function(gameId) {
    var g = this._game(gameId);
    if (!g || g.getValue('state') === 'finished') return;
    var players = this._players(gameId); // ordered score desc
    players.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correct !== a.correct) return b.correct - a.correct;
      return a.timeMs - b.timeMs;
    });
    for (var i = 0; i < players.length; i++) {
      var p = new GlideRecord(this.scope + '_game_player');
      p.get(players[i].id);
      p.setValue('place', i + 1);
      p.update();
    }
    g.setValue('state', 'finished');
    if (players.length) g.setValue('winner', players[0].userId);
    g.update();
    if (typeof TriviaStats !== 'undefined') new TriviaStats().rollupGame(gameId);
  },

  champion: function() {
    var g = new GlideRecord(this.scope + '_game');
    g.addQuery('state', 'finished');
    g.addNotNullQuery('winner');
    g.orderByDesc('sys_updated_on');
    g.setLimit(1); g.query();
    return { userId: g.next() ? g.getValue('winner') : '' };
  },

  getState: function(gameId, userId) {
    var g = this._game(gameId);
    if (!g) return { error: 'no such game' };
    var state = g.getValue('state');
    var out = {
      gameId: gameId, state: state, code: g.getValue('code'),
      mode: g.getValue('mode'), host: g.getValue('host'), isHost: g.getValue('host') === userId,
      round: parseInt(g.getValue('current_round'), 10) || 0,
      totalRounds: parseInt(g.getValue('question_count'), 10) || 0,
      secondsPerQuestion: parseInt(g.getValue('seconds_per_question'), 10) || 20,
      serverNow: this._now(),
      players: this._players(gameId),
      champion: this.champion().userId
    };
    if (state === 'in_question') {
      out.endsAt = this._ms(g.getValue('question_started_at')) + out.secondsPerQuestion * 1000;
      var mine = this._gameQuestionFor(gameId, out.round, userId);
      if (mine) {
        var q = new GlideRecord(this.scope + '_question');
        q.get(mine.questionId);
        var cat = new GlideRecord(this.scope + '_category');
        cat.get(q.getValue('category'));
        var options = [];
        var op = new GlideRecord(this.scope + '_question_option');
        op.addQuery('question', mine.questionId); op.orderBy('order'); op.query();
        while (op.next()) options.push({ id: op.getUniqueValue(), text: op.getValue('text') });
        out.question = {
          gqId: mine.gqId, text: q.getValue('text'),
          category: cat.getValue('name'), icon: cat.getValue('icon'),
          difficulty: parseInt(q.getValue('difficulty'), 10), options: options
        };
        var r = new GlideRecord(this.scope + '_response');
        r.addQuery('game', gameId); r.addQuery('player', userId); r.addQuery('round', out.round);
        r.query();
        out.answered = r.next();
      }
    }
    if (state === 'reveal' || state === 'finished') {
      out.reveal = [];
      var rr = new GlideRecord(this.scope + '_response');
      rr.addQuery('game', gameId); rr.addQuery('round', out.round); rr.query();
      while (rr.next()) out.reveal.push({
        userId: rr.getValue('player'), correct: rr.getValue('correct') === '1',
        points: parseInt(rr.getValue('points'), 10) || 0
      });
      var mine2 = this._gameQuestionFor(gameId, out.round, userId);
      if (mine2) {
        var cop = new GlideRecord(this.scope + '_question_option');
        cop.addQuery('question', mine2.questionId); cop.addQuery('correct', true);
        cop.query();
        if (cop.next()) out.correctOption = { id: cop.getUniqueValue(), text: cop.getValue('text') };
      }
    }
    if (state === 'finished') {
      out.podium = [];
      var pl = this._players(gameId);
      pl.sort(function(a, b) { return (a.place || 99) - (b.place || 99); });
      for (var i = 0; i < pl.length; i++)
        out.podium.push({ userId: pl[i].userId, score: pl[i].score, correct: pl[i].correct, place: pl[i].place });
      out.winner = g.getValue('winner');
      // fun stats: fastest finger (lowest avg answer time) + best in-game correct run
      var best = { userId: '', avg: 0 };
      for (var f = 0; f < pl.length; f++) {
        var rc = new GlideAggregate(this.scope + '_response');
        rc.addQuery('game', gameId); rc.addQuery('player', pl[f].userId);
        rc.addAggregate('COUNT'); rc.query(); rc.next();
        var n = parseInt(rc.getAggregate('COUNT'), 10);
        if (!n) continue;
        var avg = pl[f].timeMs / n;
        if (!best.userId || avg < best.avg) best = { userId: pl[f].userId, avg: avg };
      }
      if (best.userId) out.fastestFinger = { userId: best.userId, avgSec: Math.round(best.avg / 100) / 10 };
      var runs = { userId: '', len: 0 };
      for (var s2 = 0; s2 < pl.length; s2++) {
        var rr2 = new GlideRecord(this.scope + '_response');
        rr2.addQuery('game', gameId); rr2.addQuery('player', pl[s2].userId);
        rr2.orderBy('round'); rr2.query();
        var cur = 0, mx = 0;
        while (rr2.next()) {
          if (rr2.getValue('correct') === '1' || rr2.getValue('correct') === 'true') { cur++; if (cur > mx) mx = cur; }
          else cur = 0;
        }
        if (mx > runs.len) runs = { userId: pl[s2].userId, len: mx };
      }
      if (runs.len > 1) out.bestRun = runs;
      // champion BEFORE this game, so the podium can announce a dethroning
      var prev = new GlideRecord(this.scope + '_game');
      prev.addQuery('state', 'finished');
      prev.addNotNullQuery('winner');
      prev.addQuery('sys_id', '!=', gameId);
      prev.orderByDesc('sys_updated_on');
      prev.setLimit(1); prev.query();
      out.previousChampion = prev.next() ? prev.getValue('winner') : '';
    }
    return out;
  },
  type: 'TriviaEngine'
};
```

- [ ] **Step 4: Deploy, verify PASS**

```bash
(cd fluent && npm run build && npm run deploy)
node tools/run-tests.mjs
```
Expected: all suites PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add fluent/src/server/TriviaEngine.server.js fluent/src/server/TriviaTestRunner.server.js fluent/src/server/TriviaEngineTest.server.js
git commit -m "feat: TriviaEngine full game lifecycle with tick-driven timing (TDD)"
```

---

### Task 9: TriviaStats — leaderboard rollup & champion data (TDD)

**Files:**
- Create: `fluent/src/server/TriviaStats.server.js`, `fluent/src/server/TriviaStatsTest.server.js`
- Modify: `fluent/src/server/TriviaTestRunner.server.js` (register `new TriviaStatsTest()`)

**Interfaces:**
- Consumes: tables `game`, `game_player`, `response`, `question`, `player_stats`, `player_category_stats`; called by `TriviaEngine.finish()`.
- Produces (used by leaderboard widget Task 17):
  - `new TriviaStats().rollupGame(gameId)` — idempotence guard: skips if this game was already rolled up (tracked by a `rolled_up` boolean added to the game table in Step 1). For each game player: `total_points += score`, `total_correct += correct_count`; per-category correct counts from that game's responses joined to question.category; winner gets `total_wins++`, `current_win_streak++`, `longest_win_streak = max`; every other player's `current_win_streak = 0`.
  - `new TriviaStats().leaderboard()` — `{rows: [{userId, wins, points, correct, longestStreak}], byCategory: {catId: [{userId, correct}]}}` sorted appropriately.

- [ ] **Step 1: Add the `rolled_up` field to the game table.** In `fluent/src/fluent/tables.now.ts`, add a boolean column `rolled_up` (label "Stats Rolled Up", default false) to the `game` table definition, then `cd fluent && npm run build && npm run deploy`.

- [ ] **Step 2: Write the failing test** — `fluent/src/server/TriviaStatsTest.server.js`

```js
var TriviaStatsTest = Class.create();
TriviaStatsTest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix); gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize(); gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  _mkGame: function(hostId, winnerId, players) {
    // players: [{userId, score, correct}]
    var s = this._scope();
    var g = new GlideRecord(s + '_game');
    g.initialize(); g.setValue('code', 'ZZZ9'); g.setValue('host', hostId);
    g.setValue('mode', 'uniform'); g.setValue('state', 'finished'); g.setValue('winner', winnerId);
    var gid = g.insert();
    for (var i = 0; i < players.length; i++) {
      var p = new GlideRecord(s + '_game_player');
      p.initialize(); p.setValue('game', gid); p.setValue('user', players[i].userId);
      p.setValue('score', players[i].score); p.setValue('correct_count', players[i].correct);
      p.insert();
    }
    return gid;
  },
  _statsFor: function(userId) {
    var st = new GlideRecord(this._scope() + '_player_stats');
    st.addQuery('user', userId); st.query();
    if (!st.next()) return null;
    return {
      wins: parseInt(st.getValue('total_wins'), 10),
      points: parseInt(st.getValue('total_points'), 10),
      correct: parseInt(st.getValue('total_correct'), 10),
      cur: parseInt(st.getValue('current_win_streak'), 10),
      longest: parseInt(st.getValue('longest_win_streak'), 10)
    };
  },
  _wipe: function(userIds) {
    var s = this._scope();
    var tables = ['player_stats', 'player_category_stats'];
    for (var t = 0; t < tables.length; t++)
      for (var i = 0; i < userIds.length; i++) {
        var gr = new GlideRecord(s + '_' + tables[t]);
        gr.addQuery('user', userIds[i]); gr.query();
        while (gr.next()) gr.deleteRecord();
      }
    var g = new GlideRecord(s + '_game');
    g.addQuery('code', 'ZZZ9'); g.query();
    while (g.next()) {
      var gp = new GlideRecord(s + '_game_player');
      gp.addQuery('game', g.getUniqueValue()); gp.query();
      while (gp.next()) gp.deleteRecord();
      g.deleteRecord();
    }
  },
  testRollupAndStreaks: function() {
    var a = this._ensureTestUser('statA'), b = this._ensureTestUser('statB');
    this._wipe([a, b]);
    try {
      var stats = new TriviaStats();
      // game 1: A wins
      stats.rollupGame(this._mkGame(a, a, [{userId: a, score: 900, correct: 2}, {userId: b, score: 400, correct: 1}]));
      // game 2: A wins again
      stats.rollupGame(this._mkGame(a, a, [{userId: a, score: 800, correct: 1}, {userId: b, score: 700, correct: 2}]));
      // game 3: B wins
      var g3 = this._mkGame(a, b, [{userId: a, score: 100, correct: 0}, {userId: b, score: 999, correct: 3}]);
      stats.rollupGame(g3);
      var sa = this._statsFor(a), sb = this._statsFor(b);
      this.assertEqual(sa.wins, 2, 'A 2 wins');
      this.assertEqual(sa.points, 1800, 'A points accumulate');
      this.assertEqual(sa.correct, 3, 'A correct accumulate');
      this.assertEqual(sa.longest, 2, 'A longest streak 2');
      this.assertEqual(sa.cur, 0, 'A current streak reset');
      this.assertEqual(sb.wins, 1, 'B 1 win');
      this.assertEqual(sb.cur, 1, 'B current streak 1');
      // idempotence: re-rolling game 3 changes nothing
      stats.rollupGame(g3);
      this.assertEqual(this._statsFor(b).wins, 1, 'rollup is idempotent');
    } finally { this._wipe([a, b]); }
  },
  type: 'TriviaStatsTest'
});
```

- [ ] **Step 3: Register suite, deploy test + runner, verify FAIL**

```bash
(cd fluent && npm run build && npm run deploy)
node tools/run-tests.mjs
```
Expected: `FAIL TriviaStatsTest`, exit 1.

- [ ] **Step 4: Write `fluent/src/server/TriviaStats.server.js`**

```js
var TriviaStats = Class.create();
TriviaStats.prototype = {
  initialize: function() { this.scope = gs.getCurrentScopeName(); },

  _statsRow: function(userId) {
    var st = new GlideRecord(this.scope + '_player_stats');
    st.addQuery('user', userId); st.query();
    if (!st.next()) {
      st.initialize(); st.setValue('user', userId);
      st.setValue('total_wins', 0); st.setValue('total_points', 0); st.setValue('total_correct', 0);
      st.setValue('longest_win_streak', 0); st.setValue('current_win_streak', 0);
      st.insert(); st.get(st.getUniqueValue());
    }
    return st;
  },
  _int: function(gr, f) { return parseInt(gr.getValue(f), 10) || 0; },

  rollupGame: function(gameId) {
    var g = new GlideRecord(this.scope + '_game');
    if (!g.get(gameId) || g.getValue('rolled_up') === '1' || g.getValue('rolled_up') === 'true') return;
    var winner = g.getValue('winner');
    var p = new GlideRecord(this.scope + '_game_player');
    p.addQuery('game', gameId); p.query();
    while (p.next()) {
      var userId = p.getValue('user');
      var st = this._statsRow(userId);
      st.setValue('total_points', this._int(st, 'total_points') + this._int(p, 'score'));
      st.setValue('total_correct', this._int(st, 'total_correct') + this._int(p, 'correct_count'));
      if (userId === winner) {
        st.setValue('total_wins', this._int(st, 'total_wins') + 1);
        var cur = this._int(st, 'current_win_streak') + 1;
        st.setValue('current_win_streak', cur);
        if (cur > this._int(st, 'longest_win_streak')) st.setValue('longest_win_streak', cur);
      } else {
        st.setValue('current_win_streak', 0);
      }
      st.update();
      // per-category correct counts from this game's responses
      var r = new GlideRecord(this.scope + '_response');
      r.addQuery('game', gameId); r.addQuery('player', userId); r.addQuery('correct', true);
      r.query();
      var perCat = {};
      while (r.next()) {
        var q = new GlideRecord(this.scope + '_question');
        if (q.get(r.getValue('question'))) {
          var cat = q.getValue('category');
          perCat[cat] = (perCat[cat] || 0) + 1;
        }
      }
      for (var cat2 in perCat) {
        var cs = new GlideRecord(this.scope + '_player_category_stats');
        cs.addQuery('user', userId); cs.addQuery('category', cat2); cs.query();
        if (!cs.next()) {
          cs.initialize(); cs.setValue('user', userId); cs.setValue('category', cat2);
          cs.setValue('correct_count', 0); cs.insert(); cs.get(cs.getUniqueValue());
        }
        cs.setValue('correct_count', this._int(cs, 'correct_count') + perCat[cat2]);
        cs.update();
      }
    }
    g.setValue('rolled_up', true);
    g.update();
  },

  leaderboard: function() {
    var rows = [];
    var st = new GlideRecord(this.scope + '_player_stats');
    st.query();
    while (st.next()) rows.push({
      userId: st.getValue('user'),
      wins: this._int(st, 'total_wins'), points: this._int(st, 'total_points'),
      correct: this._int(st, 'total_correct'),
      longestStreak: this._int(st, 'longest_win_streak'),
      currentStreak: this._int(st, 'current_win_streak')
    });
    var byCategory = {};
    var cs = new GlideRecord(this.scope + '_player_category_stats');
    cs.orderByDesc('correct_count'); cs.query();
    while (cs.next()) {
      var cat = cs.getValue('category');
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push({ userId: cs.getValue('user'), correct: this._int(cs, 'correct_count') });
    }
    return { rows: rows, byCategory: byCategory };
  },
  type: 'TriviaStats'
};
```

- [ ] **Step 5: Deploy, verify PASS**

```bash
(cd fluent && npm run build && npm run deploy)
node tools/run-tests.mjs
```
Expected: all PASS, exit 0.

Now that TriviaStats exists, `TriviaEngine.finish()` rolls up the engine test's games, which would leave `famtriv.test` users in `player_stats`. Update `TriviaEngineTest._cleanup` to also delete `player_stats` and `player_category_stats` rows where `user.user_name STARTSWITH famtriv.test` (same `del`-style loop), redeploy `fluent/src/server/TriviaEngineTest.server.js`, and re-run `node tools/run-tests.mjs` — expect all PASS.

- [ ] **Step 6: Commit**

```bash
git add fluent/src/server
git commit -m "feat: TriviaStats idempotent rollup with streaks and per-category counts (TDD)"
```

---

### Task 10: TriviaPractice (TDD)

**Files:**
- Create: `fluent/src/server/TriviaPractice.server.js`, `fluent/src/server/TriviaPracticeTest.server.js`
- Modify: `fluent/src/server/TriviaTestRunner.server.js` (register `new TriviaPracticeTest()`)

**Interfaces:**
- Consumes: `TriviaSelector.pickForUser` (pool `'practice'`), `TriviaSkill`, `TriviaScoring`, tables `practice_session`, `response`, `question`, `question_option`, `category`.
- Produces (used by practice widget Task 18):
  - `startSession(userId, categoryId /*'' = all active cats*/)` → `{sessionId}`.
  - `nextQuestion(sessionId, userId)` → `{question: {id, text, category, icon, difficulty, options: [{id, text}]}}` or `{done: true}` when the pool is exhausted; never repeats a question within the session.
  - `answerQuestion(sessionId, userId, questionId, optionId, answerMs)` → `{correct, points, correctOption: {id, text}}`; writes a `response` row with `practice=true` and NO game; updates `TriviaSkill`; increments session counters and accuracy.
  - `progress(userId)` → `{sessions: [{date, category, count, correct, accuracy}], ratings: [{categoryId, categoryName, accuracy, samples}]}` — only that user's data.

- [ ] **Step 1: Write the failing test** — `fluent/src/server/TriviaPracticeTest.server.js`

```js
var TriviaPracticeTest = Class.create();
TriviaPracticeTest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix); gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize(); gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  _seedPractice: function(tag, count) {
    var s = this._scope();
    var c = new GlideRecord(s + '_category');
    c.initialize(); c.setValue('name', 'ZZ Prac ' + tag); c.setValue('active', true);
    var catId = c.insert();
    for (var i = 0; i < count; i++) {
      var q = new GlideRecord(s + '_question');
      q.initialize(); q.setValue('text', 'PracQ' + tag + i); q.setValue('qtype', 'tf');
      q.setValue('category', catId); q.setValue('difficulty', 3);
      q.setValue('pool', 'practice'); q.setValue('active', true);
      var qId = q.insert();
      var vals = [['True', true], ['False', false]];
      for (var o = 0; o < 2; o++) {
        var op = new GlideRecord(s + '_question_option');
        op.initialize(); op.setValue('question', qId);
        op.setValue('text', vals[o][0]); op.setValue('correct', vals[o][1]); op.setValue('order', o);
        op.insert();
      }
    }
    return catId;
  },
  _cleanup: function(catId, userId) {
    var s = this._scope();
    var del = function(table, field, value) {
      var gr = new GlideRecord(s + '_' + table);
      gr.addQuery(field, value); gr.query();
      while (gr.next()) gr.deleteRecord();
    };
    del('response', 'question.category', catId);
    del('question_option', 'question.category', catId);
    del('question', 'category', catId);
    del('practice_session', 'user', userId);
    del('skill_rating', 'user', userId);
    del('category', 'sys_id', catId);
  },
  testPracticeFlow: function() {
    var u = this._ensureTestUser('prac1');
    var c = this._seedPractice('A', 3);
    try {
      var pr = new TriviaPractice();
      var made = pr.startSession(u, c);
      this.assert(!!made.sessionId, 'session created');
      var seen = {};
      for (var i = 0; i < 3; i++) {
        var nq = pr.nextQuestion(made.sessionId, u);
        this.assert(nq.question, 'question ' + i + ' served');
        this.assert(!seen[nq.question.id], 'no repeat within session');
        seen[nq.question.id] = true;
        // find the True option (correct) and answer with it
        var correctOpt = null;
        for (var o = 0; o < nq.question.options.length; o++)
          if (nq.question.options[o].text === 'True') correctOpt = nq.question.options[o].id;
        var res = pr.answerQuestion(made.sessionId, u, nq.question.id, correctOpt, 2000);
        this.assert(res.correct, 'answered correctly');
      }
      this.assert(pr.nextQuestion(made.sessionId, u).done, 'pool exhausted -> done');
      var prog = pr.progress(u);
      this.assertEqual(prog.sessions.length, 1, 'one session in progress');
      this.assertEqual(prog.sessions[0].correct, 3, 'session correct count');
      this.assert(prog.ratings.length >= 1, 'skill rating created by practice');
    } finally { this._cleanup(c, u); }
  },
  type: 'TriviaPracticeTest'
});
```

- [ ] **Step 2: Register suite, deploy test + runner, verify FAIL** (same three commands as prior tasks). Expected: `FAIL TriviaPracticeTest`, exit 1.

- [ ] **Step 3: Write `fluent/src/server/TriviaPractice.server.js`**

```js
var TriviaPractice = Class.create();
TriviaPractice.prototype = {
  initialize: function() { this.scope = gs.getCurrentScopeName(); },
  _int: function(gr, f) { return parseInt(gr.getValue(f), 10) || 0; },

  startSession: function(userId, categoryId) {
    var s = new GlideRecord(this.scope + '_practice_session');
    s.initialize(); s.setValue('user', userId);
    if (categoryId) s.setValue('category', categoryId);
    s.setValue('question_count', 0); s.setValue('correct_count', 0); s.setValue('accuracy', 0);
    return { sessionId: s.insert() };
  },

  _sessionCategoryIds: function(sess) {
    var cat = sess.getValue('category');
    if (cat) return [cat];
    var out = [];
    var c = new GlideRecord(this.scope + '_category');
    c.addQuery('active', true); c.query();
    while (c.next()) out.push(c.getUniqueValue());
    return out;
  },

  _answeredInSession: function(sessionId, userId) {
    // within-session repeats tracked via responses created after the session record
    var sess = new GlideRecord(this.scope + '_practice_session');
    sess.get(sessionId);
    var out = [];
    var r = new GlideRecord(this.scope + '_response');
    r.addQuery('player', userId); r.addQuery('practice', true);
    r.addQuery('sys_created_on', '>=', sess.getValue('sys_created_on'));
    r.query();
    while (r.next()) out.push(r.getValue('question'));
    return out;
  },

  nextQuestion: function(sessionId, userId) {
    var sess = new GlideRecord(this.scope + '_practice_session');
    if (!sess.get(sessionId) || sess.getValue('user') !== userId) return { error: 'no session' };
    var cats = this._sessionCategoryIds(sess);
    var exclude = this._answeredInSession(sessionId, userId);
    var sel = new TriviaSelector();
    for (var i = 0; i < cats.length; i++) {
      var cat = cats[(i + this._int(sess, 'question_count')) % cats.length]; // rotate categories
      var qId = sel.pickForUser(cat, userId, exclude, 'practice');
      if (qId) return { question: this._payload(qId) };
    }
    return { done: true };
  },

  _payload: function(qId) {
    var q = new GlideRecord(this.scope + '_question');
    q.get(qId);
    var cat = new GlideRecord(this.scope + '_category');
    cat.get(q.getValue('category'));
    var options = [];
    var op = new GlideRecord(this.scope + '_question_option');
    op.addQuery('question', qId); op.orderBy('order'); op.query();
    while (op.next()) options.push({ id: op.getUniqueValue(), text: op.getValue('text') });
    return {
      id: qId, text: q.getValue('text'), category: cat.getValue('name'),
      icon: cat.getValue('icon'), difficulty: this._int(q, 'difficulty'), options: options
    };
  },

  answerQuestion: function(sessionId, userId, questionId, optionId, answerMs) {
    var sess = new GlideRecord(this.scope + '_practice_session');
    if (!sess.get(sessionId) || sess.getValue('user') !== userId) return { error: 'no session' };
    var op = new GlideRecord(this.scope + '_question_option');
    if (!op.get(optionId) || op.getValue('question') !== questionId) return { error: 'invalid option' };
    var q = new GlideRecord(this.scope + '_question');
    q.get(questionId);
    var correct = op.getValue('correct') === '1' || op.getValue('correct') === 'true';
    var points = new TriviaScoring().score(correct, answerMs, 20, this._int(q, 'difficulty'));
    var r = new GlideRecord(this.scope + '_response');
    r.initialize();
    r.setValue('player', userId); r.setValue('question', questionId); r.setValue('option', optionId);
    r.setValue('correct', correct); r.setValue('answer_time_ms', answerMs);
    r.setValue('points', points); r.setValue('practice', true);
    r.insert();
    new TriviaSkill().recordAnswer(userId, q.getValue('category'), correct);
    var count = this._int(sess, 'question_count') + 1;
    var correctCount = this._int(sess, 'correct_count') + (correct ? 1 : 0);
    sess.setValue('question_count', count);
    sess.setValue('correct_count', correctCount);
    sess.setValue('accuracy', correctCount / count);
    sess.update();
    var cop = new GlideRecord(this.scope + '_question_option');
    cop.addQuery('question', questionId); cop.addQuery('correct', true); cop.query(); cop.next();
    return { correct: correct, points: points, correctOption: { id: cop.getUniqueValue(), text: cop.getValue('text') } };
  },

  progress: function(userId) {
    var sessions = [];
    var s = new GlideRecord(this.scope + '_practice_session');
    s.addQuery('user', userId); s.orderByDesc('sys_created_on'); s.setLimit(50); s.query();
    while (s.next()) {
      var catName = '';
      var cat = new GlideRecord(this.scope + '_category');
      if (s.getValue('category') && cat.get(s.getValue('category'))) catName = cat.getValue('name');
      sessions.push({
        date: s.getValue('sys_created_on'), category: catName || 'All',
        count: this._int(s, 'question_count'), correct: this._int(s, 'correct_count'),
        accuracy: parseFloat(s.getValue('accuracy')) || 0
      });
    }
    var ratings = [];
    var r = new GlideRecord(this.scope + '_skill_rating');
    r.addQuery('user', userId); r.query();
    while (r.next()) {
      var c2 = new GlideRecord(this.scope + '_category');
      c2.get(r.getValue('category'));
      ratings.push({
        categoryId: r.getValue('category'), categoryName: c2.getValue('name'),
        accuracy: parseFloat(r.getValue('accuracy')) || 0, samples: this._int(r, 'sample_count')
      });
    }
    return { sessions: sessions, ratings: ratings };
  },
  type: 'TriviaPractice'
};
```

- [ ] **Step 4: Deploy, verify PASS** (`(cd fluent && npm run build && npm run deploy) && node tools/run-tests.mjs`). Expected: all PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add fluent/src/server/TriviaPractice.server.js fluent/src/server/TriviaTestRunner.server.js fluent/src/server/TriviaPracticeTest.server.js
git commit -m "feat: TriviaPractice sessions feeding skill ratings and private progress (TDD)"
```

---

### Task 11: Cleanup job + security verification

**Files:**
- Create: `tools/create-cleanup-job.mjs`

**Interfaces:**
- Consumes: `TriviaEngine.finish`.
- Produces: an hourly scheduled job that force-finishes stale games (spec: stuck non-finished > 1 hour).

- [ ] **Step 1: Write `tools/create-cleanup-job.mjs`**

```js
import { SCOPE, APP_ID, ensure } from './snc.mjs';
const script = `
var g = new GlideRecord('${SCOPE}_game');
g.addQuery('state', '!=', 'finished');
g.addQuery('sys_updated_on', '<', gs.hoursAgoStart(1));
g.query();
while (g.next()) {
  if (g.getValue('state') === 'lobby') { g.setValue('state', 'finished'); g.update(); }
  else new TriviaEngine().finish(g.getUniqueValue());
}
`;
await ensure('sysauto_script', 'name=Family Trivia stale game cleanup', {
  name: 'Family Trivia stale game cleanup', sys_scope: APP_ID, active: 'true',
  script, run_type: 'periodically', run_period: '1970-01-01 01:00:00',
});
console.log('cleanup job ensured');
```

(A lobby game that never started has no winner — closing it without `finish()` keeps it off the champion query, which requires a non-empty winner.)

- [ ] **Step 2: Run it, verify**

Run: `node tools/create-cleanup-job.mjs`, then `node tools/sn-cli.mjs get sysauto_script "name=Family Trivia stale game cleanup" name,active,run_period`
Expected: one active record, period 1 hour.

- [ ] **Step 3: Security check — players must NOT reach our tables via the REST Table API.** Ask the user for (or create) a low-privilege test login, then:

Run (Git Bash, substituting real values):
```bash
curl -s -o /dev/null -w "%{http_code}" -u 'famtriv.testlogin:PASSWORD' \
  "$SN_INSTANCE/api/now/table/<SCOPE>_question?sysparm_limit=1"
```
Expected: `403` (or `401` if the account can't log in at all). If this returns `200` with data, STOP and flag to the user: the instance's default ACLs are not protecting scoped tables, and read/write ACLs must be added in the instance UI (System Security → Access Control) before the game is used — correct answers would otherwise be queryable mid-game. Document the outcome in the README (Task 19).

- [ ] **Step 4: Commit**

```bash
git add tools/create-cleanup-job.mjs
git commit -m "feat: hourly stale-game cleanup job and REST ACL verification"
```

---

### Task 12: Service Portal scaffold, theme, and widget deploy tooling

**Files:**
- Create: `tools/deploy-widget.mjs`, `tools/ensure-page.mjs`, `tools/create-portal.mjs`, `src/portal/theme.css`

**Interfaces:**
- Produces:
  - `deploy-widget.mjs src/widgets/<id>` — upserts `sp_widget` (fields: `id`, `name`, `template`, `css`, `client_script`, `script`) from `widget.json` + `template.html` + `css.scss` + `client.js` + `server.js` in that directory.
  - `ensure-page.mjs <pageId> <widgetId> [roles]` — ensures `sp_page` (+one container/row/column/instance chain) whose single widget is `<widgetId>`; optional comma-separated roles restrict the page.
  - `create-portal.mjs` — ensures `sp_theme` "Family Trivia" (CSS = `src/portal/theme.css`) and `sp_portal` with `url_suffix=trivia`, homepage=`ft_home` page, theme set. Re-runnable to push theme changes.
  - Portal URL convention used by all widgets: `/trivia?id=<pageId>` (e.g. `/trivia?id=ft_game&g=<gameSysId>`).

- [ ] **Step 1: Write `tools/deploy-widget.mjs`**

```js
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { APP_ID, ensure } from './snc.mjs';
const dir = process.argv[2];
const meta = JSON.parse(readFileSync(join(dir, 'widget.json'), 'utf8'));
const read = f => existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '';
await ensure('sp_widget', 'id=' + meta.id, {
  id: meta.id, name: meta.name, sys_scope: APP_ID,
  template: read('template.html'), css: read('css.scss'),
  client_script: read('client.js'), script: read('server.js'),
  public: 'false',
});
console.log('deployed widget: ' + meta.id);
```

- [ ] **Step 2: Write `tools/ensure-page.mjs`**

```js
import { APP_ID, ensure, list } from './snc.mjs';
const [, , pageId, widgetId, roles] = process.argv;
const page = await ensure('sp_page', 'id=' + pageId, {
  id: pageId, title: pageId, sys_scope: APP_ID, ...(roles ? { roles } : {}),
});
const container = await ensure('sp_container', 'sp_page=' + page.sys_id, {
  sp_page: page.sys_id, sys_scope: APP_ID,
});
const row = await ensure('sp_row', 'sp_container=' + container.sys_id, {
  sp_container: container.sys_id, sys_scope: APP_ID,
});
const col = await ensure('sp_column', 'sp_row=' + row.sys_id, {
  sp_row: row.sys_id, size: 12, sys_scope: APP_ID,
});
const widget = (await list('sp_widget', 'id=' + widgetId, 'sys_id'))[0];
if (!widget) throw new Error('widget not deployed: ' + widgetId);
await ensure('sp_instance', 'sp_column=' + col.sys_id, {
  sp_column: col.sys_id, sp_widget: widget.sys_id, id: pageId + '_inst', sys_scope: APP_ID,
});
console.log('page ' + pageId + ' -> widget ' + widgetId);
```

- [ ] **Step 3: Write `src/portal/theme.css`** — the shared design system. Mobile-first, dark, playful:

```css
:root {
  --ft-bg: #1a1040;
  --ft-bg2: #2b1a66;
  --ft-card: rgba(255, 255, 255, 0.08);
  --ft-text: #f5f2ff;
  --ft-dim: #b9aee0;
  --ft-accent: #ffd166;
  --ft-green: #06d6a0;
  --ft-red: #ef476f;
  --ft-blue: #4cc9f0;
  --ft-purple: #9b5de5;
}
body, .body-content { background: linear-gradient(160deg, var(--ft-bg), var(--ft-bg2)) fixed !important; color: var(--ft-text); }
.ft-app { max-width: 480px; margin: 0 auto; padding: 12px; font-family: 'Segoe UI', system-ui, sans-serif;
  -webkit-user-select: none; user-select: none; }
.ft-card { background: var(--ft-card); border-radius: 20px; padding: 16px; margin-bottom: 12px;
  backdrop-filter: blur(6px); }
.ft-btn { display: block; width: 100%; border: none; border-radius: 16px; padding: 18px;
  font-size: 18px; font-weight: 700; color: #1a1040; background: var(--ft-accent);
  margin-bottom: 10px; touch-action: manipulation; }
.ft-btn:active { transform: scale(0.97); }
.ft-btn.ft-secondary { background: var(--ft-card); color: var(--ft-text); }
.ft-btn.ft-option { background: var(--ft-blue); color: #06283d; text-align: left; min-height: 64px; }
.ft-btn.ft-option.ft-sel { outline: 4px solid var(--ft-accent); }
.ft-btn.ft-option.ft-right { background: var(--ft-green); }
.ft-btn.ft-option.ft-wrong { background: var(--ft-red); color: #fff; opacity: 0.85; }
.ft-btn:disabled { opacity: 0.55; }
.ft-title { font-size: 26px; font-weight: 800; text-align: center; margin: 14px 0; }
.ft-code { font-size: 44px; letter-spacing: 10px; text-align: center; font-weight: 800; color: var(--ft-accent); }
.ft-avatar { width: 48px; height: 48px; border-radius: 50%; overflow: hidden; background: #fff2;
  display: inline-flex; align-items: center; justify-content: center; }
.ft-avatar svg, .ft-avatar img { width: 100%; height: 100%; object-fit: cover; }
.ft-champ .ft-avatar { box-shadow: 0 0 0 3px gold; position: relative; }
.ft-crown { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); font-size: 16px; }
.ft-row { display: flex; align-items: center; gap: 12px; padding: 10px 4px; }
.ft-grow { flex: 1; }
.ft-timerbar { height: 10px; border-radius: 5px; background: #ffffff22; overflow: hidden; }
.ft-timerbar > div { height: 100%; background: var(--ft-accent); transition: width 0.25s linear; }
.ft-podium-1 { font-size: 22px; font-weight: 800; color: gold; }
.ft-medal { font-size: 22px; width: 34px; text-align: center; }
.ft-dim { color: var(--ft-dim); font-size: 14px; }
.ft-tabs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; }
.ft-tab { padding: 8px 14px; border-radius: 999px; background: var(--ft-card); white-space: nowrap;
  border: none; color: var(--ft-text); font-weight: 600; }
.ft-tab.ft-on { background: var(--ft-accent); color: #1a1040; }
@keyframes ft-pop { 0% { transform: scale(0); } 80% { transform: scale(1.15); } 100% { transform: scale(1); } }
.ft-pop { animation: ft-pop 0.4s ease-out; }
.ft-confetti { position: relative; height: 0; z-index: 10; pointer-events: none; }
.ft-confetti span { position: absolute; top: -10px; width: 8px; height: 14px; opacity: 0.9;
  background: var(--ft-purple); animation: ft-fall 2.6s linear infinite; }
.ft-confetti span:nth-child(3n) { background: var(--ft-accent); left: 15%; }
.ft-confetti span:nth-child(3n+1) { background: var(--ft-green); left: 45%; animation-delay: 0.7s; }
.ft-confetti span:nth-child(3n+2) { background: var(--ft-red); left: 75%; animation-delay: 1.3s; }
.ft-confetti span:nth-child(2n) { transform: rotate(45deg); animation-delay: 0.4s; }
.ft-confetti span:nth-child(5n) { left: 30%; } .ft-confetti span:nth-child(7n) { left: 60%; }
.ft-confetti span:nth-child(11n) { left: 90%; }
@keyframes ft-fall { to { transform: translateY(70vh) rotate(360deg); opacity: 0; } }
```

- [ ] **Step 4: Write `tools/create-portal.mjs`**

```js
import { readFileSync } from 'node:fs';
import { APP_ID, ensure, list } from './snc.mjs';
const theme = await ensure('sp_theme', 'name=Family Trivia', {
  name: 'Family Trivia', sys_scope: APP_ID, css_variables: '',
  css: readFileSync('src/portal/theme.css', 'utf8'),
});
const home = (await list('sp_page', 'id=ft_home', 'sys_id'))[0];
await ensure('sp_portal', 'url_suffix=trivia', {
  title: 'Family Trivia', url_suffix: 'trivia', sys_scope: APP_ID,
  theme: theme.sys_id, ...(home ? { homepage: home.sys_id } : {}),
});
console.log('portal /trivia ensured');
```

- [ ] **Step 5: Run portal creation (home page comes in Task 14 — rerun then):**

```bash
node tools/create-portal.mjs
```
Expected: `portal /trivia ensured`. Open `<instance>/trivia` in a browser: a Service Portal shell loads (empty homepage for now) with the dark gradient background.

- [ ] **Step 6: Commit**

```bash
git add tools/deploy-widget.mjs tools/ensure-page.mjs tools/create-portal.mjs src/portal/theme.css
git commit -m "feat: portal scaffold, theme, widget/page deploy tooling"
```

---

### Task 13: Avatar gallery + Profile widget

**Files:**
- Create: `tools/seed-avatars.mjs`, `src/widgets/ft-profile/{widget.json,template.html,client.js,server.js,css.scss}`, `fluent/src/server/TriviaProfile.server.js`

**Interfaces:**
- Consumes: tables `avatar`, `profile`; `sys_user` (name, photo); attachment API for uploads.
- Produces:
  - 20 gallery avatar records (emoji-on-gradient SVGs).
  - `TriviaProfile` Script Include (used by ALL widgets to render players):
    - `getOrCreate(userId)` → `{profileId, nickname, avatarSource}` (creates from sys_user first name on first call).
    - `card(userId)` → `{userId, nickname, avatarHtml}` where avatarHtml is inline SVG (gallery), `<img>` of profile attachment (upload), or `<img>` of `/sys_user.do?sys_id=<id>.iixdb` user photo (sn_photo); falls back to an initial-letter SVG when the chosen source has no image.
    - `cards(userIds)` → map userId→card, batched.
    - `save(userId, {nickname, avatarSource, avatarId})` → updates own profile only.
  - Page `ft_profile` at `/trivia?id=ft_profile`.

- [ ] **Step 1: Write `tools/seed-avatars.mjs`**

```js
import { APP_ID, ensure } from './snc.mjs';
const EMOJI = ['🦊','🐼','🦁','🐸','🦄','🐙','🦉','🐨','🐯','🦖','🐢','🦜','🐳','🦔','🐝','🌮','🍕','🤖','👾','🧙'];
const NAMES = ['Fox','Panda','Lion','Frog','Unicorn','Octopus','Owl','Koala','Tiger','T-Rex','Turtle','Parrot','Whale','Hedgehog','Bee','Taco','Pizza','Robot','Alien','Wizard'];
const HUES = [14,32,50,68,86,104,140,158,176,194,212,230,248,266,284,302,320,338,356,120];
for (let i = 0; i < EMOJI.length; i++) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${HUES[i]},70%,55%)"/>` +
    `<stop offset="1" stop-color="hsl(${(HUES[i]+40)%360},70%,40%)"/></linearGradient></defs>` +
    `<rect width="100" height="100" fill="url(#g)"/>` +
    `<text x="50" y="62" font-size="52" text-anchor="middle">${EMOJI[i]}</text></svg>`;
  await ensure(`${process.env.SN_SCOPE}_avatar`, 'name=' + NAMES[i], {
    name: NAMES[i], svg, order: i, active: 'true', sys_scope: APP_ID,
  });
}
console.log('seeded 20 avatars');
```

Run: `node tools/seed-avatars.mjs` → `seeded 20 avatars`; verify `node tools/sn-cli.mjs get <SCOPE>_avatar active=true name` shows 20.

- [ ] **Step 2: Write `fluent/src/server/TriviaProfile.server.js`** and deploy

```js
var TriviaProfile = Class.create();
TriviaProfile.prototype = {
  initialize: function() { this.scope = gs.getCurrentScopeName(); },

  getOrCreate: function(userId) {
    var created = false;
    var p = new GlideRecord(this.scope + '_profile');
    p.addQuery('user', userId); p.query();
    if (!p.next()) {
      var u = new GlideRecord('sys_user');
      u.get(userId);
      p.initialize();
      p.setValue('user', userId);
      p.setValue('nickname', u.getValue('first_name') || u.getValue('user_name'));
      p.setValue('avatar_source', 'gallery');
      p.insert(); p.get(p.getUniqueValue());
      created = true;
    }
    return { profileId: p.getUniqueValue(), nickname: p.getValue('nickname'),
             avatarSource: p.getValue('avatar_source'), avatarId: p.getValue('avatar'),
             created: created };
  },

  _initialSvg: function(nickname) {
    var letter = (nickname || '?').charAt(0).toUpperCase();
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect width="100" height="100" fill="#9b5de5"/>' +
      '<text x="50" y="66" font-size="48" text-anchor="middle" fill="#fff" font-family="sans-serif">' +
      letter + '</text></svg>';
  },

  card: function(userId) {
    var info = this.getOrCreate(userId);
    var html = '';
    if (info.avatarSource === 'gallery' && info.avatarId) {
      var a = new GlideRecord(this.scope + '_avatar');
      if (a.get(info.avatarId)) html = a.getValue('svg');
    } else if (info.avatarSource === 'upload') {
      var att = new GlideRecord('sys_attachment');
      att.addQuery('table_name', this.scope + '_profile');
      att.addQuery('table_sys_id', info.profileId);
      att.orderByDesc('sys_created_on'); att.setLimit(1); att.query();
      if (att.next()) html = '<img src="/sys_attachment.do?sys_id=' + att.getUniqueValue() + '"/>';
    } else if (info.avatarSource === 'sn_photo') {
      var u = new GlideRecord('sys_user');
      if (u.get(userId) && u.getValue('photo'))
        html = '<img src="/' + u.getValue('photo') + '.iix"/>';
    }
    if (!html) html = this._initialSvg(info.nickname);
    return { userId: userId, nickname: info.nickname, avatarHtml: html };
  },

  cards: function(userIds) {
    var out = {};
    for (var i = 0; i < userIds.length; i++) out[userIds[i]] = this.card(userIds[i]);
    return out;
  },

  save: function(userId, data) {
    var p = new GlideRecord(this.scope + '_profile');
    p.addQuery('user', userId); p.query();
    if (!p.next()) return { error: 'no profile' };
    if (data.nickname) p.setValue('nickname', String(data.nickname).substring(0, 40));
    if (data.avatarSource) p.setValue('avatar_source', data.avatarSource);
    if (data.avatarId !== undefined) p.setValue('avatar', data.avatarId);
    p.update();
    return this.getOrCreate(userId);
  },
  type: 'TriviaProfile'
};
```

Run: `(cd fluent && npm run build && npm run deploy)`

- [ ] **Step 3: Write the profile widget** — `src/widgets/ft-profile/`

`widget.json`
```json
{ "id": "ft-profile", "name": "FT Profile" }
```

`server.js`
```js
(function() {
  var me = gs.getUserID();
  var prof = new TriviaProfile();
  if (input && input.action === 'save') {
    data.saved = prof.save(me, input.payload);
  }
  data.profile = prof.getOrCreate(me);
  data.card = prof.card(me);
  data.champion = new TriviaEngine().champion().userId === me;
  data.avatars = [];
  var a = new GlideRecord(gs.getCurrentScopeName() + '_avatar');
  a.addQuery('active', true); a.orderBy('order'); a.query();
  while (a.next()) data.avatars.push({ id: a.getUniqueValue(), name: a.getValue('name'), svg: a.getValue('svg') });
  var u = new GlideRecord('sys_user');
  u.get(me);
  data.hasSnPhoto = !!u.getValue('photo');
  data.profileTable = gs.getCurrentScopeName() + '_profile';
})();
```

`client.js`
```js
api.controller = function($scope, $sce) {
  var c = this;
  c.data = $scope.data;
  c.nickname = c.data.profile.nickname;
  c.trust = function(html) { return $sce.trustAsHtml(html); };
  c.save = function(source, avatarId) {
    c.server.get({ action: 'save', payload: { nickname: c.nickname, avatarSource: source, avatarId: avatarId || '' } })
      .then(function(r) { c.data = r.data; });
  };
  // upload: file input -> canvas circle-crop to 256x256 jpeg -> attachment API
  c.upload = function(files) {
    if (!files || !files.length) return;
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      var ctx = canvas.getContext('2d');
      var side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
      canvas.toBlob(function(blob) {
        var fd = new FormData();
        fd.append('table_name', c.data.profileTable);
        fd.append('table_sys_id', c.data.profile.profileId);
        fd.append('uploadFile', blob, 'avatar.jpg');
        fetch('/api/now/attachment/upload', {
          method: 'POST',
          headers: { 'X-UserToken': window.g_ck },
          body: fd
        }).then(function() { c.save('upload'); });
      }, 'image/jpeg', 0.85);
    };
    img.src = URL.createObjectURL(files[0]);
  };
};
```

`template.html`
```html
<div class="ft-app">
  <div class="ft-title">My Profile <span ng-if="c.data.champion">🏆</span></div>
  <div class="ft-card" ng-if="c.data.champion" style="text-align:center; color: gold;">
    👑 Reigning Champion 👑
  </div>
  <div class="ft-card" style="text-align:center;">
    <div class="ft-avatar" style="width:96px;height:96px;margin:0 auto;" ng-bind-html="c.trust(c.data.card.avatarHtml)"></div>
    <div style="margin-top:10px;font-weight:700;">{{c.data.card.nickname}}</div>
  </div>
  <div class="ft-card">
    <label class="ft-dim">Nickname</label>
    <input class="form-control" ng-model="c.nickname" maxlength="40"
           style="border-radius:12px;font-size:18px;" />
    <button class="ft-btn" style="margin-top:10px;" ng-click="c.save(c.data.profile.avatarSource, c.data.profile.avatarId)">Save name</button>
  </div>
  <div class="ft-card">
    <div class="ft-dim" style="margin-bottom:8px;">Pick an avatar</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;">
      <div class="ft-avatar" ng-repeat="a in c.data.avatars" style="width:56px;height:56px;"
           ng-class="{'ft-champ': c.data.profile.avatarId === a.id}"
           ng-click="c.save('gallery', a.id)" ng-bind-html="c.trust(a.svg)"></div>
    </div>
  </div>
  <div class="ft-card">
    <label class="ft-btn ft-secondary" style="text-align:center;margin-bottom:8px;">
      📷 Upload a photo
      <input type="file" accept="image/*" style="display:none"
             onchange="angular.element(this).scope().c.upload(this.files)" />
    </label>
    <button class="ft-btn ft-secondary" ng-if="c.data.hasSnPhoto" ng-click="c.save('sn_photo')">
      Use my ServiceNow photo
    </button>
  </div>
  <a class="ft-btn ft-secondary" href="?id=ft_home" style="text-align:center;">← Home</a>
</div>
```

`css.scss` — empty file (theme covers it).

Every widget that renders `avatarHtml` uses this same `$sce.trustAsHtml` pattern — the SVG markup comes from our own avatar table or `TriviaProfile._initialSvg`, never from user-typed text (nicknames render with `{{ }}` interpolation, which escapes).

- [ ] **Step 4: Deploy widget + page, verify in browser**

```bash
node tools/deploy-widget.mjs src/widgets/ft-profile
node tools/ensure-page.mjs ft_profile ft-profile
```
Open `<instance>/trivia?id=ft_profile` logged in as the admin: profile auto-creates, nickname defaults to first name, 20 avatars render, tapping one selects it (gold ring), saving a nickname persists after reload. Test at mobile width (390px).

- [ ] **Step 5: Commit**

```bash
git add tools/seed-avatars.mjs fluent/src/server/TriviaProfile.server.js src/widgets/ft-profile
git commit -m "feat: avatar gallery, TriviaProfile, and profile widget with 3 avatar sources"
```

---

### Task 14: Home widget

**Files:**
- Create: `src/widgets/ft-home/{widget.json,template.html,client.js,server.js,css.scss}`

**Interfaces:**
- Consumes: `TriviaProfile.card`, `TriviaEngine.champion`, `TriviaEngine.joinGame`, `TriviaEngine.createGame`, table `category`.
- Produces: page `ft_home` — the portal homepage: player identity row, champion banner, New Game (mode/categories/count picker), Join by code, and nav buttons to Practice / Leaderboard / My Progress / Profile.

- [ ] **Step 1: Write the widget files**

`widget.json`
```json
{ "id": "ft-home", "name": "FT Home" }
```

`server.js`
```js
(function() {
  var me = gs.getUserID();
  var eng = new TriviaEngine();
  var prof = new TriviaProfile();
  if (input) {
    if (input.action === 'create') {
      data.created = eng.createGame(me, input.opts);
      return;
    }
    if (input.action === 'join') {
      data.joined = eng.joinGame(me, input.code);
      return;
    }
  }
  data.firstVisit = prof.getOrCreate(me).created; // spec: first visit -> quick setup screen
  data.me = prof.card(me);
  var champId = eng.champion().userId;
  data.champion = champId ? prof.card(champId) : null;
  data.iAmChampion = champId === me;
  data.categories = [];
  var c = new GlideRecord(gs.getCurrentScopeName() + '_category');
  c.addQuery('active', true); c.orderBy('name'); c.query();
  while (c.next()) data.categories.push({ id: c.getUniqueValue(), name: c.getValue('name'), icon: c.getValue('icon') });
})();
```

`client.js`
```js
api.controller = function($scope, $window, $sce) {
  var c = this;
  c.data = $scope.data;
  c.trust = function(h) { return $sce.trustAsHtml(h); };
  // first ever visit: send them to profile setup (nickname + avatar) once
  if (c.data.firstVisit) { $window.location.href = '?id=ft_profile'; return; }
  c.view = 'home'; // home | new | join
  c.opts = { mode: 'uniform', categories: [], questionCount: 10, secondsPerQuestion: 20 };
  c.joinCode = '';
  c.err = '';
  c.toggleCat = function(id) {
    var i = c.opts.categories.indexOf(id);
    if (i >= 0) c.opts.categories.splice(i, 1); else c.opts.categories.push(id);
  };
  c.create = function() {
    if (!c.opts.categories.length) { c.err = 'Pick at least one category'; return; }
    c.server.get({ action: 'create', opts: c.opts }).then(function(r) {
      if (r.data.created && r.data.created.gameId)
        $window.location.href = '?id=ft_game&g=' + r.data.created.gameId;
    });
  };
  c.join = function() {
    c.server.get({ action: 'join', code: c.joinCode }).then(function(r) {
      if (r.data.joined && r.data.joined.gameId)
        $window.location.href = '?id=ft_game&g=' + r.data.joined.gameId;
      else c.err = (r.data.joined && r.data.joined.error) || 'Could not join';
    });
  };
};
```

`template.html`
```html
<div class="ft-app">
  <div class="ft-row">
    <div class="ft-avatar" ng-class="{'ft-champ': c.data.iAmChampion}"
         ng-bind-html="c.trust(c.data.me.avatarHtml)"></div>
    <div class="ft-grow" style="font-weight:700;">{{c.data.me.nickname}} <span ng-if="c.data.iAmChampion">👑</span></div>
    <a href="?id=ft_profile" class="ft-dim">Edit</a>
  </div>
  <div class="ft-title">Family Trivia</div>
  <div class="ft-card ft-row" ng-if="c.data.champion">
    <div class="ft-avatar ft-pop" style="box-shadow:0 0 0 3px gold;"
         ng-bind-html="c.trust(c.data.champion.avatarHtml)"></div>
    <div class="ft-grow">
      <div style="color:gold;font-weight:700;">🏆 Reigning Champion</div>
      <div>{{c.data.champion.nickname}}</div>
    </div>
  </div>

  <div ng-if="c.view === 'home'">
    <button class="ft-btn" ng-click="c.view = 'new'">🎮 New Game</button>
    <button class="ft-btn ft-secondary" ng-click="c.view = 'join'">🔑 Join Game</button>
    <button class="ft-btn ft-secondary" onclick="window.location='?id=ft_practice'">🧠 Practice</button>
    <button class="ft-btn ft-secondary" onclick="window.location='?id=ft_leaderboard'">🥇 Leaderboard</button>
    <button class="ft-btn ft-secondary" onclick="window.location='?id=ft_progress'">📈 My Progress</button>
  </div>

  <div ng-if="c.view === 'new'" class="ft-card">
    <div class="ft-dim">Mode</div>
    <div class="ft-tabs">
      <button class="ft-tab" ng-class="{'ft-on': c.opts.mode === 'uniform'}" ng-click="c.opts.mode = 'uniform'">Everyone Same</button>
      <button class="ft-tab" ng-class="{'ft-on': c.opts.mode === 'adaptive'}" ng-click="c.opts.mode = 'adaptive'">Skill-Matched</button>
    </div>
    <div class="ft-dim" style="margin-top:8px;">Categories</div>
    <div class="ft-tabs" style="flex-wrap:wrap;">
      <button class="ft-tab" ng-repeat="cat in c.data.categories"
              ng-class="{'ft-on': c.opts.categories.indexOf(cat.id) >= 0}"
              ng-click="c.toggleCat(cat.id)">{{cat.icon}} {{cat.name}}</button>
    </div>
    <div class="ft-dim" style="margin-top:8px;">Questions: {{c.opts.questionCount}}</div>
    <input type="range" min="5" max="20" step="1" ng-model="c.opts.questionCount" style="width:100%;" />
    <div class="ft-dim">Seconds per question: {{c.opts.secondsPerQuestion}}</div>
    <input type="range" min="10" max="60" step="5" ng-model="c.opts.secondsPerQuestion" style="width:100%;" />
    <div style="color:var(--ft-red);" ng-if="c.err">{{c.err}}</div>
    <button class="ft-btn" style="margin-top:10px;" ng-click="c.create()">Create Lobby</button>
    <button class="ft-btn ft-secondary" ng-click="c.view = 'home'; c.err = ''">Cancel</button>
  </div>

  <div ng-if="c.view === 'join'" class="ft-card">
    <input class="form-control" ng-model="c.joinCode" placeholder="CODE" maxlength="4"
           style="text-transform:uppercase;font-size:28px;text-align:center;letter-spacing:8px;border-radius:12px;"
           autocapitalize="characters" autocomplete="off" />
    <div style="color:var(--ft-red);margin-top:6px;" ng-if="c.err">{{c.err}}</div>
    <button class="ft-btn" style="margin-top:10px;" ng-click="c.join()">Join</button>
    <button class="ft-btn ft-secondary" ng-click="c.view = 'home'; c.err = ''">Cancel</button>
  </div>
</div>
```

`css.scss` — empty.

Note: `ng-model` on `input[type=range]` yields strings; `TriviaEngine.createGame` already coerces with `parseInt`-safe defaults (`opts.questionCount || 10`) — pass through as-is; the engine's `setValue` handles numeric strings.

- [ ] **Step 2: Deploy, wire homepage, verify**

```bash
node tools/deploy-widget.mjs src/widgets/ft-home
node tools/ensure-page.mjs ft_home ft-home
node tools/create-portal.mjs
```
Open `<instance>/trivia`: home renders with your avatar, New Game opens the picker, Join shows the code input. If no categories exist yet, seed one for verification:

```bash
node -e "import('./tools/snc.mjs').then(async m => console.log(await m.insert(m.SCOPE + '_category', { name: 'General Knowledge', icon: '🧠', color: '#4cc9f0', active: 'true' })))"
```

(Game page doesn't exist yet — creating a game will land on a blank page; that's expected until Task 15.)

- [ ] **Step 3: Commit**

```bash
git add src/widgets/ft-home
git commit -m "feat: home widget with new-game picker, join-by-code, champion banner"
```

---

### Task 15: Game widget — lobby, realtime plumbing, question/reveal/podium

**Files:**
- Create: `src/widgets/ft-game/{widget.json,template.html,client.js,server.js,css.scss}`

**Interfaces:**
- Consumes: `TriviaEngine` (getState, startGame, answer, advance, tick), `TriviaProfile.cards`.
- Produces: page `ft_game` at `/trivia?id=ft_game&g=<gameSysId>` — the whole in-game experience.

**Realtime contract:** client calls `server.get({action:'state'})` to re-render. Triggers: (1) `spUtil.recordWatch` on the game record; (2) 3s `$interval` poll fallback; (3) a 1s local countdown that calls `{action:'tick'}` once when the timer hits zero (any client can close the round — the server is idempotent). All three funnel into ONE `refresh()`.

- [ ] **Step 1: Write the widget files**

`widget.json`
```json
{ "id": "ft-game", "name": "FT Game" }
```

`server.js`
```js
(function() {
  var me = gs.getUserID();
  var eng = new TriviaEngine();
  var gameId = (input && input.gameId) || $sp.getParameter('g');
  data.gameId = gameId;
  data.me = me;
  if (input) {
    if (input.action === 'start') data.result = eng.startGame(gameId, me);
    else if (input.action === 'answer') data.result = eng.answer(gameId, me, input.optionId, input.clientMs);
    else if (input.action === 'advance') data.result = eng.advance(gameId, me);
    else if (input.action === 'tick') eng.tick(gameId);
  }
  data.state = eng.getState(gameId, me);
  if (!data.state.error) {
    var ids = [];
    for (var i = 0; i < data.state.players.length; i++) ids.push(data.state.players[i].userId);
    data.cards = new TriviaProfile().cards(ids);
  }
  data.gameTable = gs.getCurrentScopeName() + '_game';
})();
```

`client.js`
```js
api.controller = function($scope, $interval, $timeout, $sce, spUtil) {
  var c = this;
  c.data = $scope.data;
  c.trust = function(h) { return $sce.trustAsHtml(h); };
  c.st = c.data.state;
  c.cards = c.data.cards;
  c.selected = '';
  c.answeredAt = 0;
  c.remaining = 0;
  c.pct = 100;
  var clockSkew = Date.now() - c.st.serverNow; // client clock - server clock
  var tickSent = false;
  var busy = false;

  function apply(result) {
    c.st = result.data.state;
    c.cards = result.data.cards || c.cards;
    clockSkew = Date.now() - c.st.serverNow;
    if (c.st.state !== 'in_question') { c.selected = ''; tickSent = false; }
  }
  c.refresh = function() {
    if (busy) return;
    busy = true;
    c.server.get({ action: 'state', gameId: c.data.gameId })
      .then(function(r) { apply(r); busy = false; }, function() { busy = false; });
  };

  // trigger 1: record watch on this game record
  spUtil.recordWatch($scope, c.data.gameTable, 'sys_id=' + c.data.gameId, function() { c.refresh(); });
  // trigger 2: 3s poll fallback
  var poll = $interval(c.refresh, 3000);
  // trigger 3: 1s local countdown + one-shot tick when expired
  var clock = $interval(function() {
    if (c.st.state !== 'in_question' || !c.st.endsAt) return;
    var msLeft = c.st.endsAt - (Date.now() - clockSkew);
    c.remaining = Math.max(0, Math.ceil(msLeft / 1000));
    c.pct = Math.max(0, Math.min(100, msLeft / (c.st.secondsPerQuestion * 10)));
    if (msLeft <= -500 && !tickSent) {
      tickSent = true;
      c.server.get({ action: 'tick', gameId: c.data.gameId }).then(apply);
    }
  }, 250);
  // reveal auto-advance safety: ANY client nudges tick during reveal (server is
  // idempotent) so the game advances even if the host closed their phone
  var revealNudge = $interval(function() {
    if (c.st.state === 'reveal')
      c.server.get({ action: 'tick', gameId: c.data.gameId }).then(apply);
  }, 9000);
  $scope.$on('$destroy', function() {
    $interval.cancel(poll); $interval.cancel(clock); $interval.cancel(revealNudge);
  });

  c.start = function() {
    c.server.get({ action: 'start', gameId: c.data.gameId }).then(apply);
  };
  c.answer = function(optionId) {
    if (c.selected || c.st.answered) return;
    c.selected = optionId;
    var clientMs = c.st.secondsPerQuestion * 1000 - (c.st.endsAt - (Date.now() - clockSkew));
    c.server.get({ action: 'answer', gameId: c.data.gameId, optionId: optionId, clientMs: Math.round(clientMs) })
      .then(apply);
  };
  c.next = function() {
    c.server.get({ action: 'advance', gameId: c.data.gameId }).then(apply);
  };
  c.myReveal = function() {
    if (!c.st.reveal) return null;
    for (var i = 0; i < c.st.reveal.length; i++)
      if (c.st.reveal[i].userId === c.data.me) return c.st.reveal[i];
    return null;
  };
  c.qrUrl = function() {
    var join = location.origin + '/trivia?id=ft_game&g=' + c.data.gameId;
    return 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(join);
  };
};
```

`template.html`
```html
<div class="ft-app" ng-if="!c.st.error">

  <!-- LOBBY -->
  <div ng-if="c.st.state === 'lobby'">
    <div class="ft-title">Game Lobby</div>
    <div class="ft-card" style="text-align:center;">
      <div class="ft-dim">Join code</div>
      <div class="ft-code">{{c.st.code}}</div>
      <img ng-src="{{c.qrUrl()}}" style="border-radius:12px;margin-top:8px;" alt="QR to join"/>
      <div class="ft-dim" style="margin-top:6px;">{{c.st.mode === 'adaptive' ? 'Skill-Matched' : 'Everyone Same'}} · {{c.st.totalRounds}} questions</div>
    </div>
    <div class="ft-card">
      <div class="ft-row" ng-repeat="p in c.st.players"
           ng-class="{'ft-champ': p.userId === c.st.champion}">
        <div class="ft-avatar" style="position:relative;" ng-bind-html="c.trust(c.cards[p.userId].avatarHtml)">
        </div>
        <div class="ft-grow">{{c.cards[p.userId].nickname}} <span ng-if="p.userId === c.st.champion">👑</span></div>
        <div class="ft-dim" ng-if="p.userId === c.st.host">host</div>
      </div>
    </div>
    <button class="ft-btn" ng-if="c.st.isHost" ng-click="c.start()"
            ng-disabled="c.st.players.length < 1">Start Game</button>
    <div class="ft-dim" style="text-align:center;" ng-if="!c.st.isHost">Waiting for host to start…</div>
  </div>

  <!-- QUESTION -->
  <div ng-if="c.st.state === 'in_question'">
    <div class="ft-row">
      <div class="ft-dim">Round {{c.st.round}}/{{c.st.totalRounds}}</div>
      <div class="ft-grow"></div>
      <div style="font-weight:800;font-size:20px;">{{c.remaining}}s</div>
    </div>
    <div class="ft-timerbar"><div ng-style="{width: c.pct + '%'}"></div></div>
    <div class="ft-card" style="margin-top:12px;">
      <div class="ft-dim">{{c.st.question.icon}} {{c.st.question.category}} · difficulty {{c.st.question.difficulty}}/5</div>
      <div style="font-size:20px;font-weight:700;margin-top:6px;">{{c.st.question.text}}</div>
    </div>
    <div ng-if="!c.st.answered && !c.selected">
      <button class="ft-btn ft-option" ng-repeat="o in c.st.question.options"
              ng-click="c.answer(o.id)">{{o.text}}</button>
    </div>
    <div ng-if="c.st.answered || c.selected" class="ft-card" style="text-align:center;">
      <div class="ft-pop" style="font-size:40px;">🔒</div>
      <div>Answer locked in! Waiting for the others…</div>
    </div>
  </div>

  <!-- REVEAL -->
  <div ng-if="c.st.state === 'reveal'">
    <div class="ft-title">Round {{c.st.round}} results</div>
    <div class="ft-card" style="text-align:center;">
      <div class="ft-dim">Correct answer</div>
      <div style="font-size:22px;font-weight:800;color:var(--ft-green);">{{c.st.correctOption.text}}</div>
      <div class="ft-pop" style="font-size:34px;margin-top:6px;"
           ng-if="c.myReveal()">{{c.myReveal().correct ? '✅ +' + c.myReveal().points : '❌ 0'}}</div>
      <div class="ft-dim" ng-if="!c.myReveal()">⏰ Time ran out</div>
    </div>
    <div class="ft-card">
      <div class="ft-row" ng-repeat="p in c.st.players | orderBy:'-score'">
        <div class="ft-medal">{{$index === 0 ? '🥇' : $index === 1 ? '🥈' : $index === 2 ? '🥉' : ''}}</div>
        <div class="ft-avatar" ng-bind-html="c.trust(c.cards[p.userId].avatarHtml)"></div>
        <div class="ft-grow">{{c.cards[p.userId].nickname}}</div>
        <div style="font-weight:800;">{{p.score}}</div>
      </div>
    </div>
    <button class="ft-btn" ng-if="c.st.isHost" ng-click="c.next()">
      {{c.st.round < c.st.totalRounds ? 'Next Question →' : 'Final Results →'}}
    </button>
  </div>

  <!-- PODIUM -->
  <div ng-if="c.st.state === 'finished'">
    <div class="ft-confetti"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div class="ft-title">🏁 Final Results</div>
    <div class="ft-card" style="text-align:center;" ng-if="c.st.podium.length">
      <div class="ft-pop" style="font-size:56px;">🏆</div>
      <div class="ft-podium-1">{{c.cards[c.st.winner].nickname}} wins!</div>
      <div style="color:gold;font-weight:700;"
           ng-if="c.st.previousChampion && c.st.winner !== c.st.previousChampion">👑 New champion!</div>
    </div>
    <div class="ft-card" ng-if="c.st.fastestFinger || c.st.bestRun">
      <div class="ft-row" ng-if="c.st.fastestFinger">
        <div class="ft-medal">⚡</div>
        <div class="ft-grow">Fastest finger: <b>{{c.cards[c.st.fastestFinger.userId].nickname}}</b></div>
        <div class="ft-dim">{{c.st.fastestFinger.avgSec}}s avg</div>
      </div>
      <div class="ft-row" ng-if="c.st.bestRun">
        <div class="ft-medal">🔥</div>
        <div class="ft-grow">Hot streak: <b>{{c.cards[c.st.bestRun.userId].nickname}}</b></div>
        <div class="ft-dim">{{c.st.bestRun.len}} in a row</div>
      </div>
    </div>
    <div class="ft-card">
      <div class="ft-row" ng-repeat="p in c.st.podium">
        <div class="ft-medal">{{p.place === 1 ? '🥇' : p.place === 2 ? '🥈' : p.place === 3 ? '🥉' : p.place}}</div>
        <div class="ft-avatar" ng-bind-html="c.trust(c.cards[p.userId].avatarHtml)"></div>
        <div class="ft-grow">{{c.cards[p.userId].nickname}}</div>
        <div>
          <div style="font-weight:800;">{{p.score}}</div>
          <div class="ft-dim">{{p.correct}} correct</div>
        </div>
      </div>
    </div>
    <a class="ft-btn" href="?id=ft_home">Play Again</a>
    <a class="ft-btn ft-secondary" href="?id=ft_leaderboard">Leaderboard</a>
  </div>
</div>
<div class="ft-app" ng-if="c.st.error">
  <div class="ft-card">{{c.st.error}}</div>
  <a class="ft-btn" href="?id=ft_home">← Home</a>
</div>
```

`css.scss` — empty.

Implementation notes:
- The QR image uses `api.qrserver.com` (external, free, no key). At a restaurant this loads fine; if it fails to load, the join code still works — acceptable degradation. If the instance blocks external images via CSP, drop the `<img>` and keep the code only.
- `spUtil.recordWatch` requires the table to be watchable; if updates don't arrive (check browser console for AMB errors), the 3s poll still drives the game — the feature test below must pass either way.
- The champion gold ring in lobby uses `ft-champ` on the row; the crown emoji suffices for v1.

- [ ] **Step 2: Deploy + page**

```bash
node tools/deploy-widget.mjs src/widgets/ft-game
node tools/ensure-page.mjs ft_game ft-game
```

- [ ] **Step 3: Two-browser live test.** Seed at least 6 active game-pool questions in one category (run Task 18 first if preferred, or insert them via a quick script against `snc.mjs` following the Task 14 category-seeding one-liner pattern). Then:
1. Browser session A (admin): Home → New Game → pick category → Create Lobby. Code + QR render.
2. Browser session B (different user or incognito with a second account): Home → Join with code. A's lobby shows B appear within ~3s (watch or poll).
3. A starts. Both browsers flip to the question together; countdown runs; big touch targets.
4. A answers fast-correct, B answers slow-correct → reveal shows both, A earned more points; scoreboard ordered A first.
5. Nobody answers one round → timer hits 0 → reveal happens on its own (tick).
6. Kill B's tab mid-round, reopen the game URL → B lands back in the current round (reconnect-safe).
7. Last round → podium, confetti emoji, winner named; Home shows the new champion banner.
Expected: all 7 behaviors observed.

- [ ] **Step 4: Commit**

```bash
git add src/widgets/ft-game
git commit -m "feat: full game widget - lobby, live rounds, reveal, podium"
```

---

### Task 16: Leaderboard widget

**Files:**
- Create: `src/widgets/ft-leaderboard/{widget.json,template.html,client.js,server.js,css.scss}`

**Interfaces:**
- Consumes: `TriviaStats.leaderboard()`, `TriviaProfile.cards`, `TriviaEngine.champion`, table `category`.
- Produces: page `ft_leaderboard` with the five spec views: Wins, Points, Correct, By Category, Best Streak.

- [ ] **Step 1: Write the widget files**

`widget.json`
```json
{ "id": "ft-leaderboard", "name": "FT Leaderboard" }
```

`server.js`
```js
(function() {
  var stats = new TriviaStats().leaderboard();
  data.rows = stats.rows;
  data.byCategory = stats.byCategory;
  var ids = [];
  for (var i = 0; i < stats.rows.length; i++) ids.push(stats.rows[i].userId);
  for (var cat in stats.byCategory)
    for (var j = 0; j < stats.byCategory[cat].length; j++)
      if (ids.indexOf(stats.byCategory[cat][j].userId) === -1) ids.push(stats.byCategory[cat][j].userId);
  var prof = new TriviaProfile();
  data.cards = prof.cards(ids);
  var champId = new TriviaEngine().champion().userId;
  data.champion = champId ? prof.card(champId) : null;
  data.categories = [];
  var c = new GlideRecord(gs.getCurrentScopeName() + '_category');
  c.addQuery('active', true); c.orderBy('name'); c.query();
  while (c.next()) data.categories.push({ id: c.getUniqueValue(), name: c.getValue('name'), icon: c.getValue('icon') });
})();
```

`client.js`
```js
api.controller = function($scope, $sce) {
  var c = this;
  c.data = $scope.data;
  c.trust = function(h) { return $sce.trustAsHtml(h); };
  c.tab = 'wins'; // wins | points | correct | category | streak
  c.cat = c.data.categories.length ? c.data.categories[0].id : '';
  var SORT = { wins: 'wins', points: 'points', correct: 'correct', streak: 'longestStreak' };
  c.ranked = function() {
    var key = SORT[c.tab];
    if (!key) return [];
    return c.data.rows.slice().sort(function(a, b) { return b[key] - a[key]; });
  };
  c.catRows = function() { return c.data.byCategory[c.cat] || []; };
  c.value = function(row) { return row[SORT[c.tab]]; };
  c.medal = function(i) { return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1); };
};
```

`template.html`
```html
<div class="ft-app">
  <div class="ft-title">Leaderboard</div>
  <div class="ft-card ft-row" ng-if="c.data.champion">
    <div class="ft-avatar" style="box-shadow:0 0 0 3px gold;"
         ng-bind-html="c.trust(c.data.champion.avatarHtml)"></div>
    <div class="ft-grow">
      <div style="color:gold;font-weight:700;">🏆 Reigning Champion</div>
      <div>{{c.data.champion.nickname}}</div>
    </div>
  </div>
  <div class="ft-tabs">
    <button class="ft-tab" ng-class="{'ft-on': c.tab === 'wins'}" ng-click="c.tab = 'wins'">Wins</button>
    <button class="ft-tab" ng-class="{'ft-on': c.tab === 'points'}" ng-click="c.tab = 'points'">Points</button>
    <button class="ft-tab" ng-class="{'ft-on': c.tab === 'correct'}" ng-click="c.tab = 'correct'">Correct</button>
    <button class="ft-tab" ng-class="{'ft-on': c.tab === 'category'}" ng-click="c.tab = 'category'">By Category</button>
    <button class="ft-tab" ng-class="{'ft-on': c.tab === 'streak'}" ng-click="c.tab = 'streak'">Best Streak</button>
  </div>
  <div class="ft-tabs" ng-if="c.tab === 'category'" style="flex-wrap:wrap;">
    <button class="ft-tab" ng-repeat="cat in c.data.categories"
            ng-class="{'ft-on': c.cat === cat.id}" ng-click="c.cat = cat.id">{{cat.icon}} {{cat.name}}</button>
  </div>
  <div class="ft-card" ng-if="c.tab !== 'category'">
    <div class="ft-row" ng-repeat="row in c.ranked() track by row.userId">
      <div class="ft-medal">{{c.medal($index)}}</div>
      <div class="ft-avatar" ng-bind-html="c.trust(c.data.cards[row.userId].avatarHtml)"></div>
      <div class="ft-grow">{{c.data.cards[row.userId].nickname}}</div>
      <div style="font-weight:800;">{{c.value(row)}}</div>
    </div>
    <div class="ft-dim" ng-if="!c.data.rows.length" style="text-align:center;">No games played yet!</div>
  </div>
  <div class="ft-card" ng-if="c.tab === 'category'">
    <div class="ft-row" ng-repeat="row in c.catRows() track by row.userId">
      <div class="ft-medal">{{c.medal($index)}}</div>
      <div class="ft-avatar" ng-bind-html="c.trust(c.data.cards[row.userId].avatarHtml)"></div>
      <div class="ft-grow">{{c.data.cards[row.userId].nickname}}</div>
      <div style="font-weight:800;">{{row.correct}}</div>
    </div>
    <div class="ft-dim" ng-if="!c.catRows().length" style="text-align:center;">No answers in this category yet.</div>
  </div>
  <a class="ft-btn ft-secondary" href="?id=ft_home" style="text-align:center;">← Home</a>
</div>
```

`css.scss` — empty.

- [ ] **Step 2: Deploy + page, verify**

```bash
node tools/deploy-widget.mjs src/widgets/ft-leaderboard
node tools/ensure-page.mjs ft_leaderboard ft-leaderboard
```
Open `/trivia?id=ft_leaderboard`. After the Task 15 live test there is at least one finished game: Wins/Points/Correct/Streak tabs rank correctly against the `player_stats` numbers (cross-check with `node tools/sn-cli.mjs get <SCOPE>_player_stats "" user,total_wins,total_points`), By Category shows counts for the tested category, champion hero row on top.

- [ ] **Step 3: Commit**

```bash
git add src/widgets/ft-leaderboard
git commit -m "feat: leaderboard widget with five ranked views and champion hero"
```

---

### Task 17: Practice + My Progress widgets

**Files:**
- Create: `src/widgets/ft-practice/{widget.json,template.html,client.js,server.js,css.scss}`, `src/widgets/ft-progress/{widget.json,template.html,client.js,server.js,css.scss}`

**Interfaces:**
- Consumes: `TriviaPractice` (startSession, nextQuestion, answerQuestion, progress), table `category`.
- Produces: pages `ft_practice` and `ft_progress`.

- [ ] **Step 1: Write `src/widgets/ft-practice/`**

`widget.json`
```json
{ "id": "ft-practice", "name": "FT Practice" }
```

`server.js`
```js
(function() {
  var me = gs.getUserID();
  var pr = new TriviaPractice();
  if (input) {
    if (input.action === 'start') data.session = pr.startSession(me, input.categoryId || '');
    else if (input.action === 'next') data.next = pr.nextQuestion(input.sessionId, me);
    else if (input.action === 'answer')
      data.answered = pr.answerQuestion(input.sessionId, me, input.questionId, input.optionId, input.answerMs);
  }
  data.categories = [];
  var c = new GlideRecord(gs.getCurrentScopeName() + '_category');
  c.addQuery('active', true); c.orderBy('name'); c.query();
  while (c.next()) data.categories.push({ id: c.getUniqueValue(), name: c.getValue('name'), icon: c.getValue('icon') });
})();
```

`client.js`
```js
api.controller = function($scope) {
  var c = this;
  c.data = $scope.data;
  c.view = 'setup'; // setup | question | feedback | done
  c.categoryId = '';
  c.sessionId = '';
  c.q = null;
  c.result = null;
  c.count = 0; c.correct = 0;
  var startedAt = 0;
  c.start = function() {
    c.server.get({ action: 'start', categoryId: c.categoryId }).then(function(r) {
      c.sessionId = r.data.session.sessionId;
      c.count = 0; c.correct = 0;
      c.next();
    });
  };
  c.next = function() {
    c.server.get({ action: 'next', sessionId: c.sessionId }).then(function(r) {
      if (r.data.next.done) { c.view = 'done'; return; }
      c.q = r.data.next.question;
      c.result = null;
      startedAt = Date.now();
      c.view = 'question';
    });
  };
  c.answer = function(optionId) {
    c.server.get({
      action: 'answer', sessionId: c.sessionId, questionId: c.q.id,
      optionId: optionId, answerMs: Date.now() - startedAt
    }).then(function(r) {
      c.result = r.data.answered;
      c.count++;
      if (c.result.correct) c.correct++;
      c.view = 'feedback';
    });
  };
  c.stop = function() { c.view = 'done'; };
  // Math is unavailable in Angular expressions - compute here
  c.pct = function() { return c.count ? Math.round(c.correct / c.count * 100) + '%' : '—'; };
};
```

`template.html`
```html
<div class="ft-app">
  <div ng-if="c.view === 'setup'">
    <div class="ft-title">🧠 Practice</div>
    <div class="ft-card">
      <div class="ft-dim">Category</div>
      <div class="ft-tabs" style="flex-wrap:wrap;">
        <button class="ft-tab" ng-class="{'ft-on': c.categoryId === ''}" ng-click="c.categoryId = ''">🌀 All</button>
        <button class="ft-tab" ng-repeat="cat in c.data.categories"
                ng-class="{'ft-on': c.categoryId === cat.id}" ng-click="c.categoryId = cat.id">{{cat.icon}} {{cat.name}}</button>
      </div>
    </div>
    <button class="ft-btn" ng-click="c.start()">Start Drilling</button>
    <a class="ft-btn ft-secondary" href="?id=ft_home" style="text-align:center;">← Home</a>
  </div>

  <div ng-if="c.view === 'question'">
    <div class="ft-dim">{{c.q.icon}} {{c.q.category}} · difficulty {{c.q.difficulty}}/5 · {{c.correct}}/{{c.count}} so far</div>
    <div class="ft-card"><div style="font-size:20px;font-weight:700;">{{c.q.text}}</div></div>
    <button class="ft-btn ft-option" ng-repeat="o in c.q.options" ng-click="c.answer(o.id)">{{o.text}}</button>
    <button class="ft-btn ft-secondary" ng-click="c.stop()">End session</button>
  </div>

  <div ng-if="c.view === 'feedback'">
    <div class="ft-card" style="text-align:center;">
      <div class="ft-pop" style="font-size:48px;">{{c.result.correct ? '✅' : '❌'}}</div>
      <div ng-if="!c.result.correct">Answer: <b style="color:var(--ft-green);">{{c.result.correctOption.text}}</b></div>
      <div class="ft-dim" ng-if="c.result.correct">+{{c.result.points}} practice points</div>
    </div>
    <button class="ft-btn" ng-click="c.next()">Next →</button>
    <button class="ft-btn ft-secondary" ng-click="c.stop()">End session</button>
  </div>

  <div ng-if="c.view === 'done'">
    <div class="ft-title">Session complete</div>
    <div class="ft-card" style="text-align:center;">
      <div style="font-size:40px;">{{c.pct()}}</div>
      <div class="ft-dim">{{c.correct}} of {{c.count}} correct</div>
    </div>
    <a class="ft-btn" href="?id=ft_progress">See My Progress</a>
    <button class="ft-btn ft-secondary" ng-click="c.view = 'setup'">Practice again</button>
    <a class="ft-btn ft-secondary" href="?id=ft_home" style="text-align:center;">← Home</a>
  </div>
</div>
```

`css.scss` — empty.

- [ ] **Step 2: Write `src/widgets/ft-progress/`**

`widget.json`
```json
{ "id": "ft-progress", "name": "FT Progress" }
```

`server.js`
```js
(function() {
  data.progress = new TriviaPractice().progress(gs.getUserID());
})();
```

`client.js`
```js
api.controller = function($scope) {
  var c = this;
  c.data = $scope.data;
  c.pct = function(x) { return Math.round(x * 100) + '%'; };
  c.stars = function(acc) {
    var level = Math.min(5, Math.max(1, 1 + Math.round(acc * 4)));
    return '★★★★★'.substring(0, level) + '☆☆☆☆☆'.substring(0, 5 - level);
  };
};
```

`template.html`
```html
<div class="ft-app">
  <div class="ft-title">📈 My Progress</div>
  <div class="ft-card">
    <div class="ft-dim" style="margin-bottom:8px;">Skill by category (drives Skill-Matched mode)</div>
    <div class="ft-row" ng-repeat="r in c.data.progress.ratings">
      <div class="ft-grow">{{r.categoryName}}</div>
      <div style="color:var(--ft-accent);letter-spacing:2px;">{{c.stars(r.accuracy)}}</div>
      <div class="ft-dim">{{c.pct(r.accuracy)}}</div>
    </div>
    <div class="ft-dim" ng-if="!c.data.progress.ratings.length" style="text-align:center;">
      Play or practice to build your skill profile!
    </div>
  </div>
  <div class="ft-card">
    <div class="ft-dim" style="margin-bottom:8px;">Recent practice sessions</div>
    <div class="ft-row" ng-repeat="s in c.data.progress.sessions">
      <div class="ft-grow">
        <div>{{s.category}}</div>
        <div class="ft-dim">{{s.date}}</div>
      </div>
      <div style="font-weight:800;">{{s.correct}}/{{s.count}}</div>
    </div>
    <div class="ft-dim" ng-if="!c.data.progress.sessions.length" style="text-align:center;">No sessions yet.</div>
  </div>
  <a class="ft-btn" href="?id=ft_practice">Practice now</a>
  <a class="ft-btn ft-secondary" href="?id=ft_home" style="text-align:center;">← Home</a>
</div>
```

`css.scss` — empty.

- [ ] **Step 3: Deploy + pages, verify**

```bash
node tools/deploy-widget.mjs src/widgets/ft-practice
node tools/deploy-widget.mjs src/widgets/ft-progress
node tools/ensure-page.mjs ft_practice ft-practice
node tools/ensure-page.mjs ft_progress ft-progress
```
Verify in browser (needs practice-pool questions — seed a few `pool=practice` questions the same way as Task 15's seeding if Task 18 hasn't run): full drill loop works, feedback shows correct answer on a miss, done screen shows percentage, My Progress lists the session and a skill rating row, and questions served in a session never repeat.

- [ ] **Step 4: Commit**

```bash
git add src/widgets/ft-practice src/widgets/ft-progress
git commit -m "feat: practice drill and private progress widgets"
```

---

### Task 18: Open Trivia DB import + category seeding

**Files:**
- Create: `tools/import-otdb.mjs`

**Interfaces:**
- Consumes: `https://opentdb.com/api.php` (free, no key), `snc.mjs`.
- Produces: ~9 categories with icons; several hundred questions per run, each with category/difficulty/pool/source_id, **inactive** pending review; CLI flags `--pool=game|practice`, `--amount=N`, `--activate`.

- [ ] **Step 1: Write `tools/import-otdb.mjs`**

```js
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
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
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
```

- [ ] **Step 2: Import both pools**

```bash
node tools/import-otdb.mjs --pool=game --amount=50
node tools/import-otdb.mjs --pool=practice --amount=25
```
Expected: ~450 game + ~225 practice questions (fewer if OTDB has less stock in a category), 9 categories with icons. Duplicate protection: practice-pool run skips any question text already imported to the game pool — the two pools stay disjoint, satisfying the spec's "practice mode has a different set of questions".

- [ ] **Step 3: Review + activate.** Tell the user: questions are imported inactive; review in the platform list (`<instance>/<SCOPE>_question_list.do`) if desired. Then activate:

```bash
node tools/import-otdb.mjs --activate
```
Verify: `node tools/sn-cli.mjs get <SCOPE>_question "active=true^pool=game" sys_id` returns rows (spot-check counts per category).

- [ ] **Step 4: Family-authored questions note.** Admins add custom questions in the platform UI: `<SCOPE>_question.do` form + related-list options. No custom UI (per spec). Confirm the form is usable: create one test question with 2 options, verify it appears in a practice session, then deactivate it.

- [ ] **Step 5: Commit**

```bash
git add tools/import-otdb.mjs
git commit -m "feat: Open Trivia DB importer with category seeding and dedup"
```

---

### Task 19: End-to-end server test + README

**Files:**
- Create: `fluent/src/server/TriviaE2ETest.server.js`, `README.md`
- Modify: `fluent/src/server/TriviaTestRunner.server.js` (register `new TriviaE2ETest()`)

**Interfaces:**
- Consumes: everything.
- Produces: a full-lifecycle regression test runnable anytime via `node tools/run-tests.mjs`; project README.

- [ ] **Step 1: Write `fluent/src/server/TriviaE2ETest.server.js`** — the full-stack smoke test: seeds its own category/questions (reuse the `_seed`/`_cleanup` pattern from `TriviaEngineTest` verbatim), then: create adaptive game as user A → join as B → start → both answer every round (A always correct via `_correctOptionFor`, B always the wrong option) → force-finish via backdate+tick → assert: game finished; A is winner; A's `player_stats.total_wins` incremented by exactly 1 vs. before; B's `current_win_streak` is 0; a `skill_rating` row exists for both users in the test category; champion() returns A. Also assert practice isolation: run one practice answer for B in the test category and verify `player_stats` for B is UNCHANGED (practice never touches the leaderboard). Cleanup deletes all seeded data and famtriv.test stats rows.

The test class follows the exact same helper structure as `TriviaEngineTest` (`_scope`, `_ensureTestUser`, `_seed`, `_cleanup`, `_correctOptionFor`, `_backdateQuestionStart`) — copy those helpers in (each test class is standalone; there is no shared test utility include by design, so suites can be read in isolation).

- [ ] **Step 2: Register, deploy, run**

```bash
(cd fluent && npm run build && npm run deploy)
node tools/run-tests.mjs
```
Expected: all suites PASS including `TriviaE2ETest`, exit 0.

- [ ] **Step 3: Full manual playtest.** Two browser sessions, run one complete game in EACH mode end-to-end (uniform + adaptive) plus one practice session, on a phone-sized viewport (390px). Checklist: lobby join < 3s propagation · synchronized question flip · timer countdown smooth · answer lock · reveal points match scoring formula · podium & champion banner update · leaderboard all five tabs correct · practice never changes leaderboard numbers · reconnect mid-round works.

- [ ] **Step 4: Write `README.md`** — cover: what this is; architecture (repo = source of truth, deploy via `tools/`); `.env` setup; full deploy-from-scratch order (Task 1→18 commands); how to run tests; how to import/activate questions; how to add family questions; how to grant the player role; the security-check result from Task 11 Step 3; portal URL `/trivia`. Keep it under 150 lines, command-first.

- [ ] **Step 5: Final commit**

```bash
git add fluent/src/server/TriviaE2ETest.server.js fluent/src/server/TriviaTestRunner.server.js README.md
git commit -m "feat: end-to-end regression test and README"
```

---

## Post-plan notes for the executor

- Tasks 1–4 are strictly sequential. Tasks 5–7 are sequential (each layer feeds the next). Tasks 8–10 depend on 5–7. Tasks 12–17 depend on 8–10 (widgets call the engines) and on each other only via the shared theme. Task 18 can run any time after Task 3. Task 19 is last.
- Widget verification is visual — use the browser pane at mobile width. Server verification is `node tools/run-tests.mjs` — never claim a server task done without a passing run.
- If `spUtil.recordWatch` doesn't fire on the instance (plugin/property variance), the game still works on the 3s poll; note it in the README and move on — do not sink time into AMB debugging.
- The spec is the authority on behavior; this plan is the authority on structure. On conflict, re-read the spec, then fix the plan file in the same commit as the code.
