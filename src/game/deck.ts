import type { Card } from './types';
import { midnightCardPath } from './midnightDeck';
export { makeDeck, shuffle, cardDisplayRank } from './deckCore';

export function cardImage(card: Card): string {
  if (import.meta.env.MODE === '100next') return `${import.meta.env.BASE_URL}${midnightCardPath(card)}`;
  return `${import.meta.env.BASE_URL}assets/cards/${card.suit}-${card.rank.toLowerCase()}.webp`;
}

/** Original lossless artwork is loaded only for the two visible mobile hand cards. */
export function cardImageLossless(card: Card): string {
  if (import.meta.env.MODE === '100next') return `${import.meta.env.BASE_URL}${midnightCardPath(card, true)}`;
  return `${import.meta.env.BASE_URL}assets/cards/full/${card.suit}-${card.rank.toLowerCase()}.png`;
}

export function prefersLosslessHand(): boolean {
  return matchMedia('(max-width: 720px), (pointer: coarse) and (max-width: 1100px)').matches;
}

export const backImage = `${import.meta.env.BASE_URL}assets/cards/back.webp`;
