export const CONFIG = {
  PLAYER_MIN: 2,
  PLAYER_MAX: 8,
  HAND_SIZE: 2,
  DECK_SIZE: 52,
  RATING_EXACT_100: 3,
  RATING_SURVIVE: 1,
  RATING_BUST: -5,
  CPU_DELAY_MIN: 500,
  CPU_DELAY_MAX: 1500,
  CARD_THROW_MIN_DISTANCE: 18,
  CARD_THROW_MIN_VELOCITY: 0.08,
  TOTAL_WARNING_1: 80,
  TOTAL_WARNING_2: 90,
  TOTAL_WARNING_3: 95,
} as const;

export const SUITS = ['fire', 'water', 'leaf', 'sun'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const MOODS = ['Normal', 'Happy', 'Angry', 'Sad', 'Confident', 'Focused', 'Thinking', 'Bored', 'Excited', 'Scared', 'Smug', 'Confused', 'Tired'] as const;
export type Suit = typeof SUITS[number];
export type Rank = typeof RANKS[number];
export type Mood = typeof MOODS[number];

export const suitSymbols: Record<Suit, string> = { fire: '♨', water: '◆', leaf: '❧', sun: '☼' };
export const moodSymbols: Record<Mood, string> = { Normal:'●', Happy:'☺', Angry:'♨', Sad:'☂', Confident:'★', Focused:'◎', Thinking:'◇', Bored:'—', Excited:'✦', Scared:'!', Smug:'◡', Confused:'?', Tired:'☾' };
