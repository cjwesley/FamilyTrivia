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
