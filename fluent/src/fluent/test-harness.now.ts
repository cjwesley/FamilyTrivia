// In-instance TDD harness: classic (Class.create) Script Includes so that
// Rhino consumers (Service Portal widget server scripts, the ftest Scripted
// REST operation) can call `new TriviaTestRunner()` directly.
// Idiom follows @servicenow/sdk docs/guides/script-include-guide.md
// ("Script Include with External File" / ScriptInclude + Now.include()).
// Every later server task (Task 5+) adds its own ScriptInclude() here for
// its <Name>.server.js and registers its test suite in TriviaTestRunner.suites().
import { ScriptInclude } from '@servicenow/sdk/core'

export const TriviaTestBase = ScriptInclude({
    $id: Now.ID['trivia_test_base_si'],
    name: 'TriviaTestBase',
    script: Now.include('../server/TriviaTestBase.server.js'),
    description: 'Base class for in-instance test suites: assert/assertEqual/run().',
    accessibleFrom: 'package_private',
})

export const TriviaHarnessTest = ScriptInclude({
    $id: Now.ID['trivia_harness_test_si'],
    name: 'TriviaHarnessTest',
    script: Now.include('../server/TriviaHarnessTest.server.js'),
    description: 'Proves the harness itself works (extends TriviaTestBase).',
    accessibleFrom: 'package_private',
})

export const TriviaTestRunner = ScriptInclude({
    $id: Now.ID['trivia_test_runner_si'],
    name: 'TriviaTestRunner',
    script: Now.include('../server/TriviaTestRunner.server.js'),
    description: 'Aggregates and runs every registered test suite.',
    accessibleFrom: 'package_private',
})

export const TriviaScoringTest = ScriptInclude({
    $id: Now.ID['trivia_scoring_test_si'],
    name: 'TriviaScoringTest',
    script: Now.include('../server/TriviaScoringTest.server.js'),
    description: 'Tests for TriviaScoring scoring formula.',
    accessibleFrom: 'package_private',
})

export const TriviaScoring = ScriptInclude({
    $id: Now.ID['trivia_scoring_si'],
    name: 'TriviaScoring',
    script: Now.include('../server/TriviaScoring.server.js'),
    description: 'Scoring calculation: (500 + 500 * remaining/total) * (1 + 0.125 * (difficulty - 1)).',
    accessibleFrom: 'package_private',
})

export const TriviaSkillTest = ScriptInclude({
    $id: Now.ID['trivia_skill_test_si'],
    name: 'TriviaSkillTest',
    script: Now.include('../server/TriviaSkillTest.server.js'),
    description: 'Tests for TriviaSkill adaptive difficulty rating.',
    accessibleFrom: 'package_private',
})

export const TriviaSkill = ScriptInclude({
    $id: Now.ID['trivia_skill_si'],
    name: 'TriviaSkill',
    script: Now.include('../server/TriviaSkill.server.js'),
    description: 'Adaptive difficulty: targetDifficulty(userId, categoryId) and recordAnswer(userId, categoryId, correct).',
    accessibleFrom: 'package_private',
})

export const TriviaSelectorTest = ScriptInclude({
    $id: Now.ID['trivia_selector_test_si'],
    name: 'TriviaSelectorTest',
    script: Now.include('../server/TriviaSelectorTest.server.js'),
    description: 'Tests for TriviaSelector question/category picking.',
    accessibleFrom: 'package_private',
})

export const TriviaSelector = ScriptInclude({
    $id: Now.ID['trivia_selector_si'],
    name: 'TriviaSelector',
    script: Now.include('../server/TriviaSelector.server.js'),
    description: 'Question and category selection: roundCategories, pickUniform, pickForUser (per-user difficulty targeting with shrinking exclusion window).',
    accessibleFrom: 'package_private',
})

export const TriviaStatsTest = ScriptInclude({
    $id: Now.ID['trivia_stats_test_si'],
    name: 'TriviaStatsTest',
    script: Now.include('../server/TriviaStatsTest.server.js'),
    description: 'Tests for TriviaStats leaderboard rollup and champion data.',
    accessibleFrom: 'package_private',
})

export const TriviaEngineTest = ScriptInclude({
    $id: Now.ID['trivia_engine_test_si'],
    name: 'TriviaEngineTest',
    script: Now.include('../server/TriviaEngineTest.server.js'),
    description: 'Tests for TriviaEngine game lifecycle.',
    accessibleFrom: 'package_private',
})

export const TriviaEngine = ScriptInclude({
    $id: Now.ID['trivia_engine_si'],
    name: 'TriviaEngine',
    script: Now.include('../server/TriviaEngine.server.js'),
    description: 'Game-lifecycle engine: create/join/start/answer/tick/advance/finish/getState/champion.',
    accessibleFrom: 'package_private',
})

export const TriviaStats = ScriptInclude({
    $id: Now.ID['trivia_stats_si'],
    name: 'TriviaStats',
    script: Now.include('../server/TriviaStats.server.js'),
    description: 'Leaderboard rollup: rollupGame(gameId) idempotent stats aggregation, leaderboard() ranked rows + per-category.',
    accessibleFrom: 'package_private',
})

export const TriviaPracticeTest = ScriptInclude({
    $id: Now.ID['trivia_practice_test_si'],
    name: 'TriviaPracticeTest',
    script: Now.include('../server/TriviaPracticeTest.server.js'),
    description: 'Tests for TriviaPractice solo practice sessions.',
    accessibleFrom: 'package_private',
})

export const TriviaPractice = ScriptInclude({
    $id: Now.ID['trivia_practice_si'],
    name: 'TriviaPractice',
    script: Now.include('../server/TriviaPractice.server.js'),
    description: 'Solo practice sessions: startSession/nextQuestion/answerQuestion/progress feeding TriviaSkill ratings.',
    accessibleFrom: 'package_private',
})

export const TriviaProfile = ScriptInclude({
    $id: Now.ID['trivia_profile_si'],
    name: 'TriviaProfile',
    script: Now.include('../server/TriviaProfile.server.js'),
    description: 'Player profile rendering used by all widgets: getOrCreate/card/cards/save (nickname + avatar source: gallery/upload/sn_photo).',
    accessibleFrom: 'package_private',
})

export const TriviaGroupsTest = ScriptInclude({
    $id: Now.ID['trivia_groups_test_si'],
    name: 'TriviaGroupsTest',
    script: Now.include('../server/TriviaGroupsTest.server.js'),
    description: 'Tests for TriviaGroups membership service.',
    accessibleFrom: 'package_private',
})

export const TriviaGroups = ScriptInclude({
    $id: Now.ID['trivia_groups_si'],
    name: 'TriviaGroups',
    script: Now.include('../server/TriviaGroups.server.js'),
    description: 'Group membership service: userGroups/isMember/ensureMember/newToken.',
    accessibleFrom: 'package_private',
})

export const TriviaE2ETest = ScriptInclude({
    $id: Now.ID['trivia_e2e_test_si'],
    name: 'TriviaE2ETest',
    script: Now.include('../server/TriviaE2ETest.server.js'),
    description: 'Full-stack smoke test: adaptive game lifecycle (create/join/start/answer/finish), champion/stats/skill-rating invariants, and practice-isolation.',
    accessibleFrom: 'package_private',
})
