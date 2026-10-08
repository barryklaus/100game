import { masterCharacterData } from '../ui/MasterSpriteData';
import { createGame } from './rules';
import type { Card, GameState, PlayerConfig } from './types';

/** A disposable late-round fixture; ordinary rules still settle the final card. */
export function createDeathDemo(character = 'finn', round = 20): GameState {
  const found = masterCharacterData.findIndex(item => item.id === character);
  const avatar = found < 0 ? 1 : found;
  const cast = [avatar, ...[0, 2, 7, 3].filter(index => index !== avatar)].slice(0, 4);
  const seats: PlayerConfig[] = cast.map((index, seat) => ({
    name: masterCharacterData[index].name, avatar: index,
    kind: seat === 0 ? 'human' : 'cpu', mood: 'Normal',
  }));
  const state = createGame(seats, round, () => .37, true);
  // Redistribute genuine deck cards, preserving every unique card exactly once.
  const pool = [...state.drawPile, ...state.players.flatMap(player => player.hand)];
  const take = (id: string): Card => {
    const index = pool.findIndex(card => card.id === id);
    if (index < 0) throw new Error(`Missing demo card: ${id}`);
    return pool.splice(index, 1)[0];
  };
  state.players[0].hand = [take('fire-4'), take('water-6')];
  state.played = [take('leaf-6')];
  for (const player of state.players.slice(1)) player.hand = pool.splice(0, 2);
  state.drawPile = pool;
  state.total = 99;
  state.current = state.rootTurn = 0;
  state.match!.scores = [-12, 6, 4, 8];
  state.match!.previous = 3;
  state.log = [`Death demo: ${seats[0].name} has −12 points. Either final card causes Overflow and Death.`, 'The shared total is 99.'];
  return state;
}
