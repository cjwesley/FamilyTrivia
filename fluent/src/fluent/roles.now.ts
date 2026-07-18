// Family Trivia roles. Declares the two application roles used to gate
// gameplay (player) and configuration/administration (admin) access.
// Idiom follows EmailOS/fluent/src/fluent/foundation.now.ts.
import { Role } from '@servicenow/sdk/core'

export const famtriv_player = Role({
    name: 'x_tekvo_famtriv.player',
    description: 'Play Family Trivia games, view own scores and leaderboards.',
})

export const famtriv_admin = Role({
    name: 'x_tekvo_famtriv.admin',
    description: 'Administer Family Trivia configuration, questions, and player data.',
})
