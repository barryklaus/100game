# Online multiplayer

## Why the public version was unreliable

On the published GitHub Pages site, a host and guest could join and exchange turns. Refreshing the host immediately ended the guest's room, because the host browser owned the only copy of the game. PeerJS uses direct WebRTC connections, and its [FAQ](https://peerjs.com/client/faq) explains that some network combinations need a TURN relay. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) serves static files and cannot run the room service.

Settlecoast's public interface offers invite games, a lobby, AI seats, and saved online games. Its [privacy policy](https://settlecoast.com/privacy) names Supabase and Netlify. Its exact internal game protocol is not public.

## Hosted implementation

The new Cloudflare Worker serves the site and routes each room to a [Durable Object](https://developers.cloudflare.com/durable-objects/best-practices/websockets/). The room stores seats, the deck, turn state, and a revision. Players send commands over WebSockets; the room validates whose turn it is, applies the rules, runs CPU turns, and sends each browser a separate view. Other players' card faces and the draw pile remain hidden.

Each player receives a private room token stored in that browser. A refresh reconnects to the same seat, including the host seat. If a player does not return within 30 seconds, a CPU can take over during a round, and an available human becomes host. Rooms expire after 24 hours without activity.

The hosted version passed local rule tests, a Cloudflare Worker build, and a two-browser game in which both players exchanged turns and the host refreshed and rejoined. It is live at **[100game.100game.workers.dev](https://100game.100game.workers.dev/)**. A live HTTPS check created two seats, applied a turn, and restored the host after disconnect. The older GitHub Pages link still uses PeerJS.

## Development and deployment

```bash
pnpm install
pnpm test
pnpm build:cloudflare
pnpm dev:cloudflare
```

To publish a new version, run `pnpm deploy:cloudflare` while signed in to the owner's Cloudflare account. The GitHub Pages workflow can stay as an older demo or be redirected to the hosted version.
