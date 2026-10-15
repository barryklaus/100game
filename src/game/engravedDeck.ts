import type { Card } from './types';

/** All 52 physical cards share 44 full-bleed prints. J/Q/K stay distinct +10 cards. */
export function engravedCardKey(card: Pick<Card, 'suit' | 'rank'>): string {
  return `${card.suit}-${['J', 'Q', 'K'].includes(card.rank) ? 'k' : card.rank.toLowerCase()}`;
}

export function engravedCardPath(card: Pick<Card, 'suit' | 'rank'>): string {
  return `assets/cards/engraved-v1/${engravedCardKey(card)}.webp`;
}

export function engravedFoilMaskPath(card: Pick<Card, 'suit' | 'rank'>): string {
  return `assets/cards/engraved-v1/foil/${engravedCardKey(card)}.png`;
}
