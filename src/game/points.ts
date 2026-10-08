import type { AccountStats } from '../account/model';
import type { GameState, PlayerConfig } from './types';

/** Lifetime points use the same awards and penalty as settled 100next rounds. */
export function accountPoints(stats: Partial<AccountStats>): number {
  return (stats.survives ?? 0) + (stats.exacts ?? 0) + (stats.setups ?? 0) - 5 * (stats.busts ?? 0);
}
/** Older account snapshots fall back to their existing cumulative score. */
export function overallAccountPoints(snapshot: {user:{lifetimePoints?:number}|null; online:Partial<AccountStats>; practice:Partial<AccountStats>}):number {
  return snapshot.user?.lifetimePoints ?? accountPoints(snapshot.online)+accountPoints(snapshot.practice);
}
export function resetsPoints(state:GameState,seat:number):boolean {
  return !!(state.match?.newlyDead?.includes(seat)||state.match?.newlyFreed?.includes(seat));
}
export function gamePoints(state: GameState, seat: number): number {
  return (state.match?.scores[seat] ?? 0) + (state.phase === 'ended' && state.match ? 0 : state.players[seat].ratingDelta);
}
export function localPointsKey(player: PlayerConfig, cast: string): string {
  return player.kind === 'cpu' ? `cpu:${cast}:${player.avatar}` : `guest:${player.name.trim().toLowerCase()}`;
}

/** Guest/CPU history for local tables. Account history lives in the account service. */
export class LocalPoints {
  private points: Record<string, number> = {};
  private settled = new WeakSet<GameState>();
  constructor(private storage: { getItem(key: string): string | null; setItem(key: string, value: string): void }) {
    try {
      const value = JSON.parse(storage.getItem('100next.points.v1') ?? '{}');
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [key, amount] of Object.entries(value)) if (Number.isSafeInteger(amount)) this.points[key] = amount as number;
      }
    } catch { /* Guest play works without persistent storage. */ }
  }
  get(key: string): number { return Object.hasOwn(this.points, key) ? this.points[key] : 0; }
  set(key: string, value: number): void {
    if (!Number.isSafeInteger(value)) return;
    this.points[key] = value;
    try { this.storage.setItem('100next.points.v1', JSON.stringify(this.points)); } catch { /* Keep the current history in memory. */ }
  }
  settle(state: GameState, cast: string, accountSeat = -1): void {
    if (state.phase !== 'ended' || this.settled.has(state)) return;
    this.settled.add(state);
    // Aggregate seats sharing one identity instead of silently overwriting its history.
    const deltas = new Map<string, number>();
    for (const player of state.players) if (player.id !== accountSeat) {
      const key = localPointsKey(player, cast);
      deltas.set(key, (deltas.get(key) ?? 0) + player.ratingDelta);
    }
    const resetKeys=new Set(state.players.filter(player=>player.id!==accountSeat&&resetsPoints(state,player.id)).map(player=>localPointsKey(player,cast)));
    for (const [key, delta] of deltas) this.set(key, resetKeys.has(key)?0:this.get(key) + delta);
    for (const player of state.players) {
      player.lifetimePoints = player.id === accountSeat
        ? resetsPoints(state,player.id)?0:(player.lifetimePoints ?? 0) + player.ratingDelta
        : this.get(localPointsKey(player, cast));
    }
  }
}
