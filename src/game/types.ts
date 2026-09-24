import type { Mood, Rank, Suit } from '../data/config';

export interface Card { id: string; suit: Suit; rank: Rank }
export interface PlayerConfig { name: string; kind: 'human' | 'cpu'; mood: Mood; avatar: number }
export interface Player extends PlayerConfig { id: number; hand: Card[]; ratingDelta: number; exacts: number }
export type Phase = 'playing' | 'target' | 'ended';
export interface GameState {
  players: Player[];
  drawPile: Card[];
  played: Card[];
  total: number;
  direction: 1 | -1;
  current: number;
  /** Increments after each accepted play or target choice; rejects stale online input. */
  turn: number;
  phase: Phase;
  pendingSevens: number[];
  rootTurn: number;
  forced: boolean;
  round: number;
  exactEvents: { player: number; total: number }[];
  bust: number | null;
  log: string[];
  event: 'none' | 'exact' | 'bust' | 'seven' | 'reverse' | 'zero' | 'minus';
}
