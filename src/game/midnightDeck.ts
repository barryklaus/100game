import type { Card } from './types';

/** J/Q/K remain three distinct +10 cards; they share one ten-object illustration. */
export function midnightCardPath(card: Pick<Card, 'suit' | 'rank'>, original = false): string {
  const rank = ['J', 'Q', 'K'].includes(card.rank) ? 'k' : card.rank.toLowerCase();
  return `assets/cards/midnight-v1/${original ? 'full/' : ''}${card.suit}-${rank}.${original ? 'png' : 'webp'}`;
}
