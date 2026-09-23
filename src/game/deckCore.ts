import { RANKS, SUITS } from '../data/config';
import type { Card } from './types';

export function makeDeck(): Card[] {
  return SUITS.flatMap(suit => RANKS.map(rank => ({ id: `${suit}-${rank}`, suit, rank })));
}

export function cardDisplayRank(card: Card): string {
  if (card.rank === 'A') return '1';
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return '10';
  const special: Partial<Record<Card['rank'], string>> = {'7':'CHOOSE PLAYER','8':'REVERSE','9':'ZERO','10':'MINUS TEN'};
  return special[card.rank] ?? card.rank;
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
