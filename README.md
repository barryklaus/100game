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
| CHOOSE PLAYER | Make another player play immediately, then continue without an immediate repeat |
| REVERSE | Reverse direction; then pass the turn to the next player |
| ZERO | +0 |
| MINUS TEN | −10 |

Landing **exactly 100** scores a local +3 test-rating event and play continues. A card that takes the total **over 100** busts its player; all others survive. The local test rating also awards +1 for surviving and −5 for busting.

## Play controls

- **Mouse or touch:** a short upward flick plays a card. Start the flick at an edge or corner to spin it. Dragging tilts the physical card; releasing sideways or downward returns it to the hand.
- **Inspect:** hold a card briefly without moving to lift and enlarge it.
- **Double-click or double-tap:** play a card directly. A single tap lifts it for inspection.
- **Keyboard:** focus a card and press Enter or Space to play it.
- **Emotes:** tap or hold the Emote button to open the reaction wheel.

Invalid throws return to your hand. After CHOOSE PLAYER lands, choose a highlighted player.

## 3D presentation

The Arcane Observatory uses a dark stone and blackened-metal table, baked celestial engravings, brass inlays, one overhead spotlight, cool rim lighting and an atmospheric void. The pot, chairs and tavern architecture are retired. A thin Arcane Total Ring hosts the dominant Luckiest Guy total; portrait seats use a symmetric layout for 2–8 players. Separate desktop and portrait compositions keep the local two-card hand at the bottom.

Cards keep the supplied high-resolution artwork, rounded physical edges, traditional corner indices and suit-themed border foil. Mobile hands use original lossless PNGs and retain optional phone tilt. Throws follow a curved trajectory with temporary card flex, spin and a small landing bounce. The single draw deck sits in an engraved cradle. Discarded cards retain stable irregular landing poses; the newest layers show artwork while older paper edges are batched into one mesh. Both piles have contact shadows. Opening deals and replacement draws travel from the deck, and surviving hand cards reflow smoothly.

Reverse, Zero and −10 use brief camera/ring responses with reduced-motion support. Zero still adds zero and keeps the total unchanged. Exact 100 gives a brief pulse and continues play. Overflow retains the number and table, then reveals a compact score panel and portrait deltas. The existing host/local **Next round** action resets and deals; the renderer never advances authoritative game state itself.

Reusable presentation components live in `ObservatoryScene`, `ObservatoryTable`, `ArcaneTotalRing`, `CardPile`, `CardFlex`, `PhysicalHand`, `avatarLayout` and `ScoreTransition`. Gameplay and network protocols remain separate.

**Settings** offers Ultra, High, Medium and Lite / Mobile, reduced motion, phone tilt, interface size, mute and independent audio volumes. High remains the default with a 60 FPS target and adaptive rendering resolution. The new scene removes the full environment geometry. Quality budgets control shadows, reflections, haze, particles and textured discard layers (14 / 10 / 7 / 4); resting cards avoid the extra flight tessellation. Ultra adds bloom/AO while printed cards use a clean render pass. A static observatory fallback remains available without WebGL. Desktop, landscape and portrait browser layouts are checked; physical-phone frame rate and sensor behavior still depend on the device.

`AudioManager` includes supplied card recordings, procedural interaction cues, separate audio buses, and optional positional sound. The supplied Cartoon Suspense recording plays one fresh shot for every displayed total change within 70–99, using the complete original recording without looping. Pitch and intensity follow the new number, rising or falling with it. A short 25 ms fade clears the previous tail before the new shot; unchanged totals and UI renders cannot repeat a cue. At exactly 100, Anxiety-Repeat replaces it at its original pitch; its 40 ms crossfaded seam plays continuously using one native looping source. Sound changes in the same arrival callback as the center number, after the inward table wave; reduced motion and the HTML fallback update both immediately. Zero never restarts the cue; −10 plays a lower-pitched shot when the new total is within 70–99. Above 100, active suspense and Anxiety cut off and the supplied Explosion recording plays once, synchronized with the visible number explosion. Repeated result renders, reconnections to an already-ended game, and returning to a hidden tab cannot replay an old explosion. Music volume controls suspense and Anxiety; SFX volume controls Explosion; mute, a hidden page, leaving the table, and a new round stop active sounds. Unmuting or returning to the page does not replay a consumed 70–99 cue. The three recordings are preloaded and decoded once after the first interaction, with no frame polling. Ambience remains silent until finished recordings are registered. The supplied avatar portraits remain still.

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

Automated checks cover rules, private online views, room reconnection, settings migration, short flick recognition, double taps, edge grips, canceled/inspection gestures, player-facing card names, physical piles, and border-only foil geometry. Production builds type-check both browser and Worker code. With the development server running, open `/100game/scripts/test-game-view.html` to check portrait continuity across 24 turns, hand updates, turn panels, and modal changes. Game updates preserve existing portrait elements and projected chair positions.
