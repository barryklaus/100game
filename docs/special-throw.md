# Special Throw

100next mechanic, added 2026-10-14.

## Player controls

The transparent **Special Throw** toggle sits just above the two cards. Arm it before playing any card. Arming shows the character's standing wind-up; unarming returns to the regular pose without spending the use. The use is spent only when an armed card play is accepted. Each active human or CPU has one use per round. The button shows **Used this round** afterwards and resets for the next round. Keyboard, double-tap, ordinary flick and boomerang inputs all use the same armed play.

## Scoring

| Sequence | Result |
| --- | --- |
| A uses Special Throw; the very next player B overflows | A's setup award is +2 instead of the ordinary +1. |
| A uses Special Throw; B survives | No Special Throw bonus. |
| B survives A's Special Throw, then B's reply makes A overflow on the very next play | A loses −7 total: Overflow −5 plus a −2 backfire. |
| A survives B's reply, or another player acts before A | The direct retaliation opportunity ends; no later −2 backfire. |
| A uses Special Throw and overflows on that same play | Ordinary Overflow −5, unless A is already in a direct retaliation window from their earlier Special Throw. |

Survival +1 and exact 100 +1 (once per player per round) remain separate awards. A successful Special Throw can therefore earn +3 including survival, or +4 including survival and exact 100. It does not stack the ordinary +1 setup and +2 special setup into a +3 setup award.

CHOOSE makes its chosen player the immediate next responder. REVERSE uses the existing reversed turn order. Target selection does not itself spend a use or end a retaliation window; an accepted card play does. A counter Special Throw can earn its own +2 while also triggering the original thrower's −2 backfire.

## Multiplayer and CPU

The hosted room validates the active seat, turn, actual card and once-per-round flag before mutating state. Spent uses and pending retaliation survive reconnects and local checkpoint recovery. The next round clears both. CPU and Autopilot use the same rules; they spend Special Throw when their chosen card leaves a public total of 90–100. They do not inspect another hand to decide.

## Presentation

The sixteen approved whole-character sequences use eight native lossless frames each. Card surfaces contain the game's rounded card-back artwork. Each character has one constant display scale across its sequence and a release-hand anchor for the flying card. The normal receive animation resumes after the special follow-through. Human flicks continue immediately from release; the toggle prepares the standing stance before the throw. Reduced motion retains the mechanic without requiring the full animation.

## Statistics

Account statistics retain attempts, successful Special Throw setups and backfires. Their net-point calculation matches the rules: survival + exacts + setups + successful special setups − 5 × overflows − 2 × backfires. A successful special setup is counted once in ordinary setups and once in the extra special-setup point. Existing account records default missing new counters to zero.

## Verification

`scripts/test-special-throw.mjs` covers 2–8 players in both directions, normal and special setup scoring, failed setups, direct retaliation through normal/CHOOSE/REVERSE replies, counter Special Throws, exact-100 combinations, Freedom/Death thresholds, atomic rejection of repeated/stale/invalid input, server CPU decisions, private snapshots, reload recovery, account totals, and all 128 exported poses.
