export interface MatchLimits { freedom: number; death: number }
export const DEFAULT_MATCH_LIMITS: Readonly<MatchLimits> = Object.freeze({ freedom: 15, death: -15 });
export const MAX_MATCH_LIMIT = 1000;
export const MAX_DEATH_LIMIT = Math.floor(MAX_MATCH_LIMIT / 3) * 3;

/** Whole table points; opposite signs keep a fresh table at zero in play. */
export function validMatchLimits(value: unknown): value is MatchLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { freedom, death } = value as Partial<MatchLimits>;
  return Number.isInteger(freedom) && freedom! >= 1 && freedom! <= MAX_MATCH_LIMIT
    && Number.isInteger(death) && death! <= -3 && death! >= -MAX_DEATH_LIMIT && death! % 3 === 0;
}

/** Older saves and rooms use the original limits, independent of new preferences. */
export function normalizeMatchLimits(value: unknown): MatchLimits {
  return validMatchLimits(value) ? { freedom: value.freedom, death: value.death } : { ...DEFAULT_MATCH_LIMITS };
}
