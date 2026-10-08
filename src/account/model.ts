export const ACCOUNT_STAT_KEYS = ['freedoms','deaths','rounds','exacts','survives','busts','cards','sevens','eights','nines','tens','setups'] as const;
export type AccountStats = Record<typeof ACCOUNT_STAT_KEYS[number], number>;
export interface AccountUser { id: string; username: string; lifetimePoints?: number }
export interface AccountSnapshot { user: AccountUser | null; online: AccountStats; practice: AccountStats }
export const emptyAccountStats = (): AccountStats => Object.fromEntries(ACCOUNT_STAT_KEYS.map(key => [key,0])) as AccountStats;
export function totalAccountStats(snapshot: AccountSnapshot): AccountStats {
  return Object.fromEntries(ACCOUNT_STAT_KEYS.map(key => [key,(snapshot.online[key]??0)+(snapshot.practice[key]??0)])) as AccountStats;
}
export function cleanStatDelta(input: unknown, practice: boolean): AccountStats {
  const data = input && typeof input === 'object' ? input as Record<string,unknown> : {};
  const result = emptyAccountStats();
  for (const key of ACCOUNT_STAT_KEYS) {
    const value = data[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10000) result[key]=value;
  }
  // Local outcomes stay in the separate, player-reported practice bucket.
  if (practice) { result.freedoms=data.freedoms===1?1:0; result.deaths=data.deaths===1?1:0; }
  return result;
}
