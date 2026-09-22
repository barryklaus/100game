import type { Card } from './types';
export { makeDeck, shuffle, cardDisplayRank } from './deckCore';

export function cardImage(card: Card): string {
  return `${import.meta.env.BASE_URL}assets/cards/${card.suit}-${card.rank.toLowerCase()}.webp`;
}

export const backImage = `${import.meta.env.BASE_URL}assets/cards/back.webp`;
