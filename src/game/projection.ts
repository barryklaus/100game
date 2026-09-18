import type { Card, GameState } from './types';

const hiddenCard = (index: number): Card => ({ id: `hidden-${index}`, rank: 'A', suit: 'fire' });

/** Each player sees their own cards; the server keeps every other hand and the deck private. */
export function projectForSeat(full: GameState, seat: number): GameState {
  return {
    ...full,
    players: full.players.map((player, index) => ({ ...player, hand: index === seat ? [...player.hand] : player.hand.map((_, i) => hiddenCard(i)) })),
    drawPile: full.drawPile.map((_, i) => hiddenCard(i)),
    played: [...full.played],
    pendingSevens: [...full.pendingSevens],
    exactEvents: [...full.exactEvents],
    log: [...full.log],
  };
}
