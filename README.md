# 100

**SIMPLE NUMBERS. BIG REACTIONS.**

**PLAY. BLUFF. SURVIVE.**

100 is a fast, tactile card game for 2–8 players. Watch the shared total, make another player take a risky turn, and stay under 101. Mix Human and CPU players at any seat. Play locally on one device or online with friends on separate devices.

Every player holds **exactly two cards**. Play one card every turn, then draw back to two. There is no Pass action. Fire, Water, Leaf, and Sun are visual suits and do not change the rules.

| Cards | Value or action |
| --- | --- |
| 1 | +1 |
| 2–6 | Face value |
| Normal 10 (three artworks per suit) | +10 |
| CHOOSE PLAYER | Choose another player to play immediately |
| REVERSE | Reverse direction; with two players, play again |
| ZERO | +0 |
| MINUS TEN | −10 |

Landing **exactly 100** scores a local +3 test-rating event and play continues. A card that takes the total **over 100** busts its player; all others survive. The local test rating also awards +1 for surviving and −5 for busting.

## Play controls

- **Mouse or touch:** a short upward flick plays a card. Dragging tilts the physical card; releasing sideways or downward returns it to the hand.
- **Inspect:** hold a card briefly without moving to lift and enlarge it.
- **Alternate:** select a card, then press **Play Card**.
- **Keyboard:** focus a card and press Enter or Space to select it, then activate **Play Card**.
- **Emotes:** tap or hold the Emote button to open the reaction wheel.

Invalid throws return to your hand. After CHOOSE PLAYER lands, choose a highlighted player.

## 3D presentation

The live game is a Three.js scene: eight fixed chairs, a layered wood-and-cloth table, a sculpted energy well, an extruded gold total, physical card meshes and stacks, candlelit props, and a layered nighttime city beyond the windows. Original card faces retain their aspect ratio and printed borders, with no added frame or foil overlay. Thin paper edges follow the artwork's transparency. Each pile contains one physical layer per card, rests on the cloth, and grows or shrinks with its actual count.

Cards travel from the hand to the discard stack and from the draw stack back to the hand. Opponents' public plays animate from their seats; their hidden card faces are never used. Portrait and landscape have separate camera and hand layouts, with avatar and pile labels anchored to the world.

**Settings** offers Ultra, High, Medium, and Mobile quality, reduced motion, interface text size, mute, and independent master, SFX, music, and ambience volumes. Mobile removes real-time shadows and bloom and reduces resolution, particles, and lights. Ultra adds ambient occlusion. Browser viewport testing is included in the visual checks; real phone performance should also be measured before release.

`AudioManager` includes procedural interaction cues and replaceable clip hooks, separate audio buses, and optional positional sound. Music and ambience remain silent until finished recordings are registered. `AvatarAnimator` supports reaction poses and future sprite atlases; the supplied portraits currently use subtle movement and lighting, rather than fabricated facial frames.

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

## Project status

100 is built with **TypeScript, Three.js, PeerJS, Cloudflare Workers, Durable Objects, HTML, CSS, and Vite**. Settings, statistics, rating, and cosmetic currency live in LocalStorage on each device. Currency and the Ranked Match banner are presentation only: there are no purchases or competitive matchmaking. The supplied card artwork remains unchanged in its source files; optimized copies power the website. The rules retain their original internal rank identifiers for saved/network compatibility. See [GAME_RULES.md](GAME_RULES.md) for complete rules and [ASSET_MANIFEST.md](ASSET_MANIFEST.md) for asset provenance.

Automated checks cover rules, private online views, room reconnection, settings migration, short flick recognition, canceled/inspection gestures, and player-facing card names. Production builds type-check both browser and Worker code.
