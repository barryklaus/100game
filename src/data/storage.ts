import { MOODS } from './config';
import type { PlayerConfig } from '../game/types';
import { defaultQuality, normalizeQuality, type QualityPreset } from '../render/quality';

export interface Stats { rounds: number; exacts: number; survives: number; busts: number; cards: number; sevens: number; eights: number; nines: number; tens: number; rating: number; currency: number }
export interface Settings {
  volume: number;
  sfxVolume: number;
  musicVolume: number;
  ambienceVolume: number;
  muted: boolean;
  reducedMotion: boolean;
  uiScale: number;
  graphics: QualityPreset;
  difficulty: 'easy' | 'normal';
  playerCount: number;
  seats: PlayerConfig[];
}
const defaultNames = ['You', 'Mira', 'Kai', 'Luma', 'Sol', 'Ren', 'Ari', 'Nova'];
export const defaultSeats: PlayerConfig[] = defaultNames.map((name, i) => ({ name, kind: i ? 'cpu' : 'human', mood: MOODS[i % MOODS.length], avatar: i }));
const statsDefaults: Stats = { rounds: 0, exacts: 0, survives: 0, busts: 0, cards: 0, sevens: 0, eights: 0, nines: 0, tens: 0, rating: 0, currency: 0 };
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function read(key: string): Record<string, unknown> {
  try { return record(JSON.parse(localStorage.getItem(key) || '{}')); } catch { return {}; }
}
function write(key: string, value: unknown): void {
  // Private browsing, disabled storage and a full quota must never interrupt a game.
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Keep settings in memory. */ }
}
function clamp(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function normalizeSettings(value: unknown): Settings {
  const data = record(value);
  const suppliedSeats = Array.isArray(data.seats) ? data.seats : [];
  const seats = defaultSeats.map((fallback, index): PlayerConfig => {
    const seat = record(suppliedSeats[index]);
    return {
      name: typeof seat.name === 'string' ? seat.name.trim().slice(0, 15) || fallback.name : fallback.name,
      kind: seat.kind === 'human' || seat.kind === 'cpu' ? seat.kind : fallback.kind,
      mood: MOODS.includes(seat.mood as PlayerConfig['mood']) ? seat.mood as PlayerConfig['mood'] : fallback.mood,
      avatar: Math.floor(clamp(seat.avatar, fallback.avatar, 0, 15)),
    };
  });
  return {
    volume: clamp(data.volume, .55, 0, 1),
    sfxVolume: clamp(data.sfxVolume, .8, 0, 1),
    musicVolume: clamp(data.musicVolume, .45, 0, 1),
    ambienceVolume: clamp(data.ambienceVolume, .3, 0, 1),
    muted: data.muted === true,
    reducedMotion: typeof data.reducedMotion === 'boolean' ? data.reducedMotion : typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    uiScale: clamp(data.uiScale, 1, .85, 1.2),
    graphics: normalizeQuality(data.graphics, defaultQuality()),
    difficulty: data.difficulty === 'easy' ? 'easy' : 'normal',
    playerCount: Math.round(clamp(data.playerCount, 4, 2, 8)),
    seats,
  };
}

export function loadStats(): Stats {
  const data = read('100.stats.v1');
  return Object.fromEntries(Object.entries(statsDefaults).map(([key, fallback]) => [key, Math.round(clamp(data[key], fallback, key === 'rating' ? -1e9 : 0, 1e9))])) as unknown as Stats;
}
export const saveStats = (value: Stats): void => write('100.stats.v1', value);
export const loadSettings = (): Settings => normalizeSettings(read('100.settings.v1'));
export const saveSettings = (value: Settings): void => write('100.settings.v1', normalizeSettings(value));
