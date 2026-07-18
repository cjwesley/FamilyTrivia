# Fork Kit — Family Trivia without ServiceNow

This directory is a self-contained handoff for rebuilding the Family Trivia
game on **any backend**. You do not need ServiceNow, and you do not need to
read any other part of this repository (though the working implementation is
there if you want a reference).

## What's here

| Path | What it is |
|---|---|
| [`SPEC.md`](SPEC.md) | The complete game specification: data model, rules engine, API contract, security invariants, realtime semantics, UI spec — all backend-neutral — plus a worked reference architecture (Supabase + React PWA) you can follow or ignore |
| [`data/questions.json`](data/questions.json) | 610 ready-to-seed questions with options, across 9 categories and two pools (game/practice) |
| [`data/ATTRIBUTION.md`](data/ATTRIBUTION.md) | License terms for the question data (CC BY-SA 4.0, Open Trivia DB) — read this before shipping |
| [`assets/theme.css`](assets/theme.css) | The full mobile-first design system (plain CSS, framework-free) |
| [`assets/avatars/`](assets/avatars/) | 20 gallery avatars as standalone SVG files |

## Where to start

1. Read `SPEC.md` §1 (overview) and §3 (rules engine) — that's the game.
2. Skim §8 (behavioral truth appendix). Every tricky rule is pinned by a test
   assertion from the original implementation; port those assertions first and
   let them drive your build.
3. Decide your stack. §9 shows one complete free-tier mapping (Supabase +
   React PWA) if you don't have strong opinions.
4. Seed `data/questions.json`, drop in `theme.css`, and go.

## What you're building, in one sentence

A mobile-web trivia game a family plays from their own phones at a restaurant
table: someone hosts a lobby with a 4-character join code, everyone answers
timed questions simultaneously (same question for all, or per-player questions
matched to skill), fast correct answers score more, and persistent leaderboards
track wins, points, streaks, and a reigning champion between dinners.
