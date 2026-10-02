import { RANKS, SUITS, type Rank, type Suit } from '../data/config';
import type { Card } from './types';

export type CardFace = {
  rank: Rank;
  suit: Suit;
  index: string;
  accent: string;
  special: boolean;
  title?: string;
  detail?: string;
};

const accents: Record<Suit, string> = {
  fire: '#f09069', water: '#83d0e9', leaf: '#a5cc82', sun: '#f0c66a',
};

const actions: Partial<Record<Rank, { title: string; detail: string }>> = {
  '7': { title: 'CHOOSE PLAYER', detail: 'Choose who plays next.' },
  '8': { title: 'REVERSE', detail: 'Reverse the turn order.' },
  '9': { title: 'ZERO', detail: 'Keep the total unchanged.' },
  '10': { title: '−10', detail: 'Subtract 10 from the total.' },
};

export function cardFace(card: Pick<Card, 'suit' | 'rank'>): CardFace {
  const action = actions[card.rank];
  return {
    suit: card.suit,
    rank: card.rank,
    index: ({ '7': 'CHOOSE', '8': 'REVERSE', '9': 'ZERO', '10': '-10' } as Partial<Record<Rank, string>>)[card.rank]
      ?? (card.rank === 'A' ? '1' : ['J', 'Q', 'K'].includes(card.rank) ? '10' : card.rank),
    accent: accents[card.suit],
    special: Boolean(action),
    ...action,
  };
}

export function cardFaceFromUrl(url: string): CardFace | null {
  const match = /(?:^|\/)(fire|water|leaf|sun)-(a|[2-9]|10|j|q|k)\.webp(?:[?#]|$)/i.exec(url);
  if (!match) return null;
  const suit = match[1].toLowerCase() as Suit;
  const rank = match[2].toUpperCase() as Rank;
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) return null;
  return cardFace({ suit, rank });
}
