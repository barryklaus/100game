# Freedom and points

100next awards Freedom when a settled round leaves either overall points or current-game points at **30 or more**. Death remains at a settled current-game score of **−16 or below**. Death takes precedence if a legacy overall balance and the game score would qualify for conflicting outcomes.

- The box beside a name shows the resettable overall balance.
- The star shows points earned in the current game, starting at zero for a fresh game and carrying through that game's rounds.
- Freedom and Death reset the overall balance to **0**, including for guests and CPU seats. They do not erase any all-time statistics.
- Freed and dead characters sit out the rest of the current game. Fewer than two active seats closes the game; a fresh game restores its seats and star scores.
- Round awards remain survival +1, exact 100 +1 once per player per round, setup +1, and Overflow −5.

Account balances use a separate `account_points` table. Existing accounts keep their current cumulative points until their next recorded outcome; the original online/practice counters are preserved. Round records, resets and CPU updates are idempotent. Guest balances remain on their device. Pending local account results also affect the displayed balance while waiting to sync.

The full-screen Freedom scene animates a whole character exiting the club, opens the doors and cancels the debt. It uses the existing character and background art, finite CSS animations and a reduced-motion presentation. Simultaneous outcomes are shown once each, with the local player's outcome first.

Disposable demonstrations, with no account/statistics/settings writes:

- `/?demo=freedom`: play Zero, watch the CPU cause Overflow, earn +2 from a starting score of 28, then see Freedom at 30.
- `/?demo=last-card`: play one last card, cause Overflow from a score of −12, then see Death at −17.
- Both support `&character=<character-id>` for all 16 characters.
