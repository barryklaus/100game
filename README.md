# 100

**SIMPLE NUMBERS. BIG REACTIONS.**

**PLAY. BLUFF. SURVIVE.**

100 is a fast, tactile card game for 2–8 players. Watch the shared total, make another player take a risky turn, and stay under 101. Mix Human and CPU players at any seat. Play locally on one device or online with friends on separate devices.

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

Hosted multiplayer: **[Play 100](https://100game.100game.workers.dev/)**. The older [GitHub Pages version](https://barryklaus.github.io/100game/) still uses direct browser connections.

Choose **Play Online with Friends**, pick one of 16 characters, and create a room. Send the invite link to friends. Each friend enters a name and joins from a separate browser; the host can add CPU seats and starts the round when at least two seats are ready. The same room can play another round. Each browser's bottom panel always shows that person's own two cards and mood, even while someone else takes a turn. On one-device local games, other Human turns use a separate pass-the-device panel above the fixed local hand.

On the GitHub Pages version, the host's browser runs the rules and holds the shuffled deck. Guests receive only their own card faces; other hands and the draw pile are masked in network messages. The host must keep the tab open. PeerJS Cloud provides connection signaling, with encrypted WebRTC data channels between browsers. Some restrictive networks may need a TURN relay, which this version does not provide.

On GitHub Pages, a failed connection or unconfirmed move eventually shows a retry. Refreshing the host's page still ends that room. The hosted version runs the rules on Cloudflare instead, so the host can refresh and return to the same seat. The hosted service validates turns and sends each player a private view of the game. Rooms expire after 24 hours without activity. Players can rejoin from the same browser using a saved room token; there are no player accounts, public matchmaking, or chat.

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

## Hosted version

The Cloudflare Worker serves both the website and a persistent multiplayer room service. To try it locally:

```bash
pnpm build:cloudflare
pnpm dev:cloudflare
```

Open the local URL shown by Wrangler. Create a room in one browser, then open the invite link in another browser or an isolated browser profile. To publish a new version, run `pnpm deploy:cloudflare` while signed in to the owner's Cloudflare account. The live address is [100game.100game.workers.dev](https://100game.100game.workers.dev/). GitHub Pages continues to use the direct browser version unless its publishing workflow is changed.

## Prototype status

Version 0.2 is a browser game built with **TypeScript, Three.js, PeerJS, Cloudflare Workers, Durable Objects, HTML, CSS, and Vite**. Settings, statistics, rating, and cosmetic currency live in LocalStorage on each device. The supplied card artwork remains unchanged in its source files; optimized copies power the website. See [GAME_RULES.md](GAME_RULES.md) for complete rules and [ASSET_MANIFEST.md](ASSET_MANIFEST.md) for asset provenance.
