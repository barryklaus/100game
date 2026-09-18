# Online multiplayer investigation

## What was reproduced

- On the published site, a host and guest in separate browser tabs joined one room and exchanged turns. Each tab displayed its own hand.
- Reloading the host tab immediately ended the guest's room and discarded the round. The invite URL then opened the join form, because the host browser had owned the only authoritative copy of the game.
- A missing room returned a `peer-unavailable` error. Before the connection checks in this update, a WebRTC connection that never opened had no deadline and could stay on **Connecting…** indefinitely.

## Comparison with Settlecoast

Settlecoast's public UI offers private invite games, a game lobby, turn timers, AI seats, and saved online games. Its [privacy policy](https://settlecoast.com/privacy) says it uses Supabase for authentication and database services and Netlify for hosting; it processes online room identifiers, actions, and game state. The exact internal game protocol is not public.

100 currently uses PeerJS Cloud only to introduce browsers. The host browser owns the deck and rules; the players exchange moves through direct WebRTC data channels. PeerJS [documents](https://peerjs.com/client/faq) that some network combinations cannot connect directly and need a TURN relay. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) serves static files and cannot itself run the game service.

## Current repair and remaining work

This update adds a 20-second connection deadline, a retry action, clear errors for rejected or missing rooms, and a 10-second deadline for an unconfirmed guest move. It stops silent hangs and preserves the host's actual rejection message. It does not provide a relay, persist a room, or restore a seat after a disconnect.

For reliable online play, move the authoritative deck, rules, seats, and saved state to a hosted game service. Clients should send `join`, `start`, `play`, and `target` commands; the service validates each command and returns a separate state view to each seat so opponents' cards and the draw pile stay private. Broadcast a room revision, then fetch the correct view for each player. Keep room state across browser refreshes, support reconnection by the same player, and expire abandoned rooms. A hosted database and function or a persistent WebSocket service can do this; either requires a separate deployment and account beyond GitHub Pages. A TURN relay alone helps more networks connect but does not solve host refresh or saved rooms.
