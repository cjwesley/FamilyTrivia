# Groups & Self-Registration — Design Spec

**Date:** 2026-07-18
**Status:** Approved design, pending implementation plan
**Baseline:** extends the shipped Family Trivia app (see `2026-07-17-family-trivia-design.md`). All gameplay/stats test data was wiped before this feature lands; content (categories, questions, avatars) is untouched. No migration/backfill exists or is needed.

## Purpose

Let the same app host multiple social circles ("groups" — Family, college friends, coworkers) with fully siloed competition, and let a stranger at the table join a game — including creating their account — from nothing but the shared link/QR.

## The Silo Boundary (decided)

- **Per-group:** games, wins, points, correct counts, win streaks, champion, all five leaderboard views.
- **Personal (follows the user everywhere):** profile (nickname, avatar), skill ratings (adaptive-mode difficulty targeting), practice sessions and My Progress.
- Rationale: skill is a fact about the player, not a competition standing; joining a new group must not make adaptive mode serve a strong player easy questions.

## Data Model Changes

New tables (same scope, same conventions):

| Table | Key fields | Notes |
|---|---|---|
| **Group** | name, owner (ref sys_user), invite_token (str 40, unique), active (bool) | **Admin-only creation** (platform UI is sufficient; no in-app creation UI) |
| **Group Member** | group (ref), user (ref), joined_on | Unique (group, user) |

Changed tables:

| Table | Change |
|---|---|
| **Game** | + `group` (ref Group, required at creation), + `invite_token` (str 40) generated at creation |
| **Player Stats** | + `group` (ref); uniqueness becomes (user, group) |
| **Player Category Stats** | + `group` (ref); uniqueness becomes (user, group, category) |

Untouched: Profile, Skill Rating, Practice Session, Question/Category/Option/Avatar (content is global — any group plays the full bank).

## Group Rules

- Creating a game requires a group the creator belongs to. The UI keeps an **active group** (client-side selection, defaulting to the user's first/only group); New Game creates into it.
- **Joining a game joins its group** — by 4-char code, by link, or via fresh self-registration. Auto-join is silent and idempotent (GroupMember ensure).
- Members can also be added directly by the admin via the platform UI (no in-app flow — YAGNI).
- Champion, leaderboards, streaks, and the stats rollup all compute within `game.group`. `TriviaStats.rollupGame` writes to (user, game.group) rows. `champion(group)` = winner of the group's most recent finished game.
- Home screen: group switcher (chips) when the user has >1 group; leaderboard and champion banner reflect the active group. Zero groups → friendly empty state ("Ask the game admin to add you to a group or join a game via an invite link") — Home's Join-by-code still works and grants membership.
- Practice and My Progress render with no group context at all.

## Self-Registration Flow

The share sheet in the lobby offers link + QR. The link is `/trivia?id=ft_join&t=<game.invite_token>` — the **token is the invitation**; the 4-char display code never grants registration (it only lets existing accounts join from the Home screen).

1. **Authenticated arrival:** token resolves to a lobby-state game → ensureJoined (game + group) → straight into the lobby.
2. **Unauthenticated arrival:** a **public** portal page (no login) shows the game's existence only ("You're invited to a trivia game!") with two paths: *Log in* (standard instance login, then path 1) or *New here? Create your player account* — nickname, email, password, typed by the visitor directly to the instance.
3. Registration endpoint (public Scripted REST): validates token ↔ game in `lobby` state → creates `sys_user` (email as user_name, marked `u_created_via=trivia_invite`), grants exactly the `x_tekvo_famtriv.player` role, creates the Profile with the chosen nickname, establishes the session, then path 1.

### Security invariants (additions to the existing set)

- Registration is impossible without a currently-valid invite token; tokens are single-game, unguessable (40 chars), and expire with the lobby (the existing hourly stale-game cleanup is the expiry mechanism).
- The public endpoint rate-limits registrations (per IP and a global per-hour cap) and grants exactly the player role — never more, never configurable.
- The public page and endpoint leak nothing about the game beyond its existence (no player list, no group name pre-auth).
- Self-created accounts are auditable and bulk-disableable via the `u_created_via` marker.
- Passwords flow only between the visitor's device and the instance — never through app code paths that log or store them.
- **Priority bump:** the pending session-auth ACL verification must pass before the first outside registration is enabled (correct-answer leakage matters more with strangers).

## Error Handling & Edge Cases

- Token for a started/finished/missing game → public page shows "This game has already started or ended — ask for a new link" (no registration offered).
- Duplicate email at registration → clear error, offer the login path.
- A registered-but-groupless user who opens a game deep link mid-game: spectator view, as today (membership guard unchanged); in lobby: joins game + group, as today's ensureJoined plus group.
- Rollup for a game whose group was deactivated: proceeds (stats rows keep the group ref; an inactive group is hidden, not broken).
- Group switcher state is client-side only; every server operation derives group from the game or an explicit parameter, never from trusted client state.

## Testing

- Extend the in-instance harness: group-scoped stats/champion/leaderboard isolation (same user, two groups, disjoint stats); auto-join on game join; registration endpoint logic (token validation states, role grant, idempotency) — the endpoint's core moves into a Script Include (`TriviaRegistration`) so the harness can test it; the REST layer stays thin.
- E2E extension: two groups, one shared player, assert silo integrity end-to-end.
- Manual: full stranger-flow walkthrough (incognito → QR link → register → play) during the interactive session.

## Out of Scope

- In-app group creation/management UI (platform UI suffices; admin-only)
- Standing group invite links (games are the only in-app join path)
- Per-group question banks
- Cross-group aggregate views ("all my stats everywhere")
- Email verification / password reset flows (platform features handle these)
