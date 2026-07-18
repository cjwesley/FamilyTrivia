# Question Data Attribution

The trivia questions in `questions.json` are derived from the
[Open Trivia Database](https://opentdb.com), used under the
[Creative Commons Attribution-ShareAlike 4.0 International license (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

Modifications made to the original OTDB content:

- HTML entities decoded to plain UTF-8
- OTDB difficulty tiers remapped to a 1–5 scale (easy → 1, medium → 3, hard → 5)
- Questions assigned to one of two pools (`game` / `practice`)
- OTDB categories consolidated/renamed to the 9 categories in this export

**If you fork this project and use this data, the CC BY-SA 4.0 terms carry
forward:** keep attribution to the Open Trivia Database, and share any adapted
question data under the same license. This applies to the question data only —
the specification and assets in this kit carry the repository's own terms.
