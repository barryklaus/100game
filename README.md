# 100

**SIMPLE NUMBERS. BIG REACTIONS.**

**PLAY. BLUFF. SURVIVE.**

100 is a fast, tactile card game for 2–8 players. Watch the shared total, make another player take a risky turn, and stay under 101. Mix Human and CPU players at any seat; multiple Humans can pass one device around the table.

Every player holds **exactly two cards**. Play one card every turn, then draw back to two. There is no Pass action. Fire, Water, Leaf, and Sun are visual suits and do not change the rules.

| Cards | Value or action |
| --- | --- |
| A | +1 |
| 2–6 | Face value |
| J, Q, K | +10 |
| 7 | Choose another player to play immediately |
| 8 | Reverse direction; with two players, play again |
| 9 | +0 |
| 10 | −10 |

Landing **exactly 100** scores a local +3 test-rating event and play continues. A card that takes the total **over 100** busts its player; all others survive. The local test rating also awards +1 for surviving and −5 for busting.

## Play controls

- **Mouse:** drag or flick a card toward the center of the table.
- **Touch:** swipe a card toward the center.
- **Alternate:** select a card, then press **Play Card**.

Invalid throws return to your hand. To use a 7, choose a highlighted player after the card lands.

## Play online

GitHub Pages: **[Play 100](https://barryklaus.github.io/100game/)**

## Run locally

Requires Node.js 22+ and pnpm 11 for development only. Players only need a modern browser.

```bash
pnpm install
pnpm dev
```

Open the local URL shown by Vite. To run the rule checks and make a production build:

```bash
pnpm test
pnpm build
```

## Prototype status

Version 0.1 is a browser-only prototype built with **TypeScript, Three.js, HTML, CSS, and Vite**. Settings, statistics, rating, and cosmetic currency live in LocalStorage. There are no accounts, online multiplayer, or backend services. The supplied card artwork remains unchanged in its source files; optimized copies power the website. See [GAME_RULES.md](GAME_RULES.md) for complete rules and [ASSET_MANIFEST.md](ASSET_MANIFEST.md) for asset provenance.
