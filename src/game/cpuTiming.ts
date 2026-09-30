import type { GameState } from './types';

/** Allow a remote throw, replacement draw and inward score wave to finish first. */
export function cpuActionDelay(state: Pick<GameState, 'phase' | 'played'>, random = Math.random): number {
  if (!state.played.length) return 3400 + Math.floor(random() * 800);
  if (state.phase === 'target') return 2400 + Math.floor(random() * 600);
  return 2600 + Math.floor(random() * 800);
}
