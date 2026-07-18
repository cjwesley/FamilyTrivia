// Family Trivia data model. All 13 tables for the trivia domain: content
// (category, question, question_option, avatar), gameplay (game,
// game_player, game_question, response), and player state (profile,
// skill_rating, player_stats, player_category_stats, practice_session).
// Idiom follows EmailOS/fluent/src/fluent/foundation.now.ts. Every column
// is declared bare (no ownership prefix) because each table is new and
// owned by this scope (see table-guide: new-table columns need no prefix).
import {
    BooleanColumn,
    ChoiceColumn,
    DateTimeColumn,
    DecimalColumn,
    IntegerColumn,
    ReferenceColumn,
    StringColumn,
    Table,
} from '@servicenow/sdk/core'

export const x_tekvo_famtriv_category = Table({
    name: 'x_tekvo_famtriv_category',
    label: 'Trivia Category',
    display: 'name',
    schema: {
        name: StringColumn({ label: 'Name', maxLength: 80 }),
        // 1024 not 8: string columns <=255 chars land in utf8mb3 varchar storage, where
        // 4-byte emoji get mangled into FDD6/FDD7+base64; longer columns store them natively
        icon: StringColumn({ label: 'Icon (emoji)', maxLength: 1024 }),
        color: StringColumn({ label: 'Color (hex)', maxLength: 9 }),
        active: BooleanColumn({ label: 'Active', default: true }),
        otdb_id: IntegerColumn({ label: 'OTDB Category ID' }),
    },
    allowWebServiceAccess: true,
})

export const x_tekvo_famtriv_question = Table({
    name: 'x_tekvo_famtriv_question',
    label: 'Trivia Question',
    schema: {
        text: StringColumn({ label: 'Text', maxLength: 1024 }),
        qtype: ChoiceColumn({
            label: 'Type',
            choices: {
                mc: { label: 'Multiple Choice' },
                tf: { label: 'True/False' },
            },
        }),
        category: ReferenceColumn({ label: 'Category', referenceTable: 'x_tekvo_famtriv_category' }),
        difficulty: IntegerColumn({ label: 'Difficulty (1-5)', default: 3 }),
        pool: ChoiceColumn({
            label: 'Pool',
            choices: {
                game: { label: 'Game' },
                practice: { label: 'Practice' },
            },
        }),
        active: BooleanColumn({ label: 'Active', default: false }),
        source_id: StringColumn({ label: 'Source ID', maxLength: 64 }),
    },
    allowWebServiceAccess: true,
})

export const x_tekvo_famtriv_question_option = Table({
    name: 'x_tekvo_famtriv_question_option',
    label: 'Question Option',
    schema: {
        question: ReferenceColumn({ label: 'Question', referenceTable: 'x_tekvo_famtriv_question' }),
        text: StringColumn({ label: 'Text', maxLength: 512 }),
        correct: BooleanColumn({ label: 'Correct', default: false }),
        order: IntegerColumn({ label: 'Order' }),
    },
    allowWebServiceAccess: true,
})

export const x_tekvo_famtriv_game = Table({
    name: 'x_tekvo_famtriv_game',
    label: 'Trivia Game',
    display: 'code',
    schema: {
        code: StringColumn({ label: 'Join Code', maxLength: 8 }),
        host: ReferenceColumn({ label: 'Host', referenceTable: 'sys_user' }),
        mode: ChoiceColumn({
            label: 'Mode',
            choices: {
                uniform: { label: 'Everyone Same' },
                adaptive: { label: 'Skill-Matched' },
            },
        }),
        categories: StringColumn({ label: 'Category IDs (comma)', maxLength: 1024 }),
        question_count: IntegerColumn({ label: 'Question Count', default: 10 }),
        seconds_per_question: IntegerColumn({ label: 'Seconds per Question', default: 20 }),
        state: ChoiceColumn({
            label: 'State',
            choices: {
                lobby: { label: 'Lobby' },
                in_question: { label: 'In Question' },
                reveal: { label: 'Reveal' },
                finished: { label: 'Finished' },
            },
        }),
        current_round: IntegerColumn({ label: 'Current Round', default: 0 }),
        question_started_at: DateTimeColumn({ label: 'Question Started At' }),
        reveal_started_at: DateTimeColumn({ label: 'Reveal Started At' }),
        winner: ReferenceColumn({ label: 'Winner', referenceTable: 'sys_user' }),
        rolled_up: BooleanColumn({ label: 'Stats Rolled Up', default: false }),
    },
    allowWebServiceAccess: true,
})

export const x_tekvo_famtriv_game_player = Table({
    name: 'x_tekvo_famtriv_game_player',
    label: 'Game Player',
    schema: {
        game: ReferenceColumn({ label: 'Game', referenceTable: 'x_tekvo_famtriv_game' }),
        user: ReferenceColumn({ label: 'User', referenceTable: 'sys_user' }),
        score: IntegerColumn({ label: 'Score', default: 0 }),
        correct_count: IntegerColumn({ label: 'Correct Count', default: 0 }),
        answer_time_total_ms: IntegerColumn({ label: 'Total Answer Time (ms)', default: 0 }),
        place: IntegerColumn({ label: 'Place' }),
    },
    allowWebServiceAccess: true,
})

export const x_tekvo_famtriv_game_question = Table({
    name: 'x_tekvo_famtriv_game_question',
    label: 'Game Question',
    schema: {
        game: ReferenceColumn({ label: 'Game', referenceTable: 'x_tekvo_famtriv_game' }),
        round: IntegerColumn({ label: 'Round' }),
        question: ReferenceColumn({ label: 'Question', referenceTable: 'x_tekvo_famtriv_question' }),
        player: ReferenceColumn({ label: 'Player (adaptive only)', referenceTable: 'sys_user' }),
    },
    allowWebServiceAccess: true,
})

export const x_tekvo_famtriv_response = Table({
    name: 'x_tekvo_famtriv_response',
    label: 'Response',
    schema: {
        game: ReferenceColumn({ label: 'Game', referenceTable: 'x_tekvo_famtriv_game' }),
        player: ReferenceColumn({ label: 'Player', referenceTable: 'sys_user' }),
        round: IntegerColumn({ label: 'Round' }),
        question: ReferenceColumn({ label: 'Question', referenceTable: 'x_tekvo_famtriv_question' }),
        option: ReferenceColumn({ label: 'Chosen Option', referenceTable: 'x_tekvo_famtriv_question_option' }),
        correct: BooleanColumn({ label: 'Correct' }),
        answer_time_ms: IntegerColumn({ label: 'Answer Time (ms)' }),
        points: IntegerColumn({ label: 'Points' }),
        practice: BooleanColumn({ label: 'Practice', default: false }),
    },
    allowWebServiceAccess: true,
})

export const x_tekvo_famtriv_avatar = Table({
    name: 'x_tekvo_famtriv_avatar',
    label: 'Avatar',
    display: 'name',
    schema: {
        name: StringColumn({ label: 'Name', maxLength: 40 }),
        svg: StringColumn({ label: 'SVG Markup', maxLength: 4000 }),
        order: IntegerColumn({ label: 'Order' }),
        active: BooleanColumn({ label: 'Active', default: true }),
    },
    allowWebServiceAccess: true,
})

export const x_tekvo_famtriv_profile = Table({
    name: 'x_tekvo_famtriv_profile',
    label: 'Player Profile',
    schema: {
        user: ReferenceColumn({ label: 'User', referenceTable: 'sys_user' }),
        // 1024 for emoji-safe storage (see icon column note); app logic still caps at 40 chars
        nickname: StringColumn({ label: 'Nickname', maxLength: 1024 }),
        avatar_source: ChoiceColumn({
            label: 'Avatar Source',
            choices: {
                gallery: { label: 'Gallery' },
                upload: { label: 'Upload' },
                sn_photo: { label: 'ServiceNow Photo' },
            },
        }),
        avatar: ReferenceColumn({ label: 'Gallery Avatar', referenceTable: 'x_tekvo_famtriv_avatar' }),
        skill_overrides: StringColumn({ label: 'Skill Overrides (JSON catId->1..5)', maxLength: 1024 }),
    },
    allowWebServiceAccess: true,
})

export const x_tekvo_famtriv_skill_rating = Table({
    name: 'x_tekvo_famtriv_skill_rating',
    label: 'Skill Rating',
    schema: {
        user: ReferenceColumn({ label: 'User', referenceTable: 'sys_user' }),
        category: ReferenceColumn({ label: 'Category', referenceTable: 'x_tekvo_famtriv_category' }),
        accuracy: DecimalColumn({ label: 'Rolling Accuracy (0-1)', default: 0.5 }),
        sample_count: IntegerColumn({ label: 'Sample Count', default: 0 }),
    },
    allowWebServiceAccess: true,
})

export const x_tekvo_famtriv_player_stats = Table({
    name: 'x_tekvo_famtriv_player_stats',
    label: 'Player Stats',
    schema: {
        user: ReferenceColumn({ label: 'User', referenceTable: 'sys_user' }),
        total_wins: IntegerColumn({ label: 'Total Wins', default: 0 }),
        total_points: IntegerColumn({ label: 'Total Points', default: 0 }),
        total_correct: IntegerColumn({ label: 'Total Correct', default: 0 }),
        longest_win_streak: IntegerColumn({ label: 'Longest Win Streak', default: 0 }),
        current_win_streak: IntegerColumn({ label: 'Current Win Streak', default: 0 }),
    },
    allowWebServiceAccess: true,
})

export const x_tekvo_famtriv_player_category_stats = Table({
    name: 'x_tekvo_famtriv_player_category_stats',
    label: 'Player Category Stats',
    schema: {
        user: ReferenceColumn({ label: 'User', referenceTable: 'sys_user' }),
        category: ReferenceColumn({ label: 'Category', referenceTable: 'x_tekvo_famtriv_category' }),
        correct_count: IntegerColumn({ label: 'Correct Count', default: 0 }),
    },
    allowWebServiceAccess: true,
})

export const x_tekvo_famtriv_practice_session = Table({
    name: 'x_tekvo_famtriv_practice_session',
    label: 'Practice Session',
    schema: {
        user: ReferenceColumn({ label: 'User', referenceTable: 'sys_user' }),
        category: ReferenceColumn({ label: 'Category (empty = all)', referenceTable: 'x_tekvo_famtriv_category' }),
        question_count: IntegerColumn({ label: 'Questions Answered', default: 0 }),
        correct_count: IntegerColumn({ label: 'Correct', default: 0 }),
        accuracy: DecimalColumn({ label: 'Accuracy (0-1)', default: 0 }),
    },
    allowWebServiceAccess: true,
})
