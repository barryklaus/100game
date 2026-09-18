import { cardValue, nextSeat } from './rules';
import type { Card, GameState } from './types';

export function chooseCpuCard(state: GameState, difficulty: 'easy' | 'normal', random = Math.random): Card {
  const hand = state.players[state.current].hand;
  const safe = hand.filter(card => state.total + cardValue(card) <= 100);
  if (difficulty === 'easy') return (safe.length ? safe : hand)[Math.floor(random() * (safe.length ? safe.length : hand.length))];
  return [...hand].sort((a, b) => score(b) - score(a))[0];
  function score(card: Card): number {
    const result = state.total + cardValue(card);
    if (result > 100) return -1000 - result;
    if (result === 100) return 1000;
    if (card.rank === '10') return state.total >= 80 ? 80 : 5;
    if (card.rank === '7') return state.total >= 85 ? 55 : 12;
    if (card.rank === '9') return state.total >= 90 ? 46 : 8;
    if (card.rank === '8') {
      const next = nextSeat(state, state.current);
      return state.total >= 85 || state.players[next].kind === 'human' ? 34 : 9;
    }
    return result >= 90 ? -result : result / 5 + random() * 6;
  }
}

export function chooseCpuTarget(state: GameState, difficulty: 'easy' | 'normal', random = Math.random): number {
  const chooser = state.pendingSevens.at(-1)!;
  const others = state.players.filter(player => player.id !== chooser);
  if (difficulty === 'easy') return others[Math.floor(random() * others.length)].id;
  // Uses only public seat/kind information; never examines hidden hands.
  return [...others].sort((a,b) => (b.kind === 'human' ? 1 : 0) - (a.kind === 'human' ? 1 : 0) || random() - .5)[0].id;
}
