import { MOODS } from './config';
import type { PlayerConfig } from '../game/types';

export interface Stats { rounds: number; exacts: number; survives: number; busts: number; cards: number; sevens: number; eights: number; nines: number; tens: number; rating: number; currency: number }
export interface Settings { volume: number; graphics: 'high' | 'low'; difficulty: 'easy' | 'normal'; playerCount: number; seats: PlayerConfig[] }
const defaultNames = ['You', 'Mira', 'Kai', 'Luma', 'Sol', 'Ren', 'Ari', 'Nova'];
export const defaultSeats: PlayerConfig[] = defaultNames.map((name, i) => ({ name, kind: i ? 'cpu' : 'human', mood: MOODS[i % MOODS.length], avatar: i }));
const statsDefaults: Stats = { rounds: 0, exacts: 0, survives: 0, busts: 0, cards: 0, sevens: 0, eights: 0, nines: 0, tens: 0, rating: 0, currency: 0 };
const settingsDefaults: Settings = { volume: .55, graphics: 'high', difficulty: 'normal', playerCount: 4, seats: defaultSeats };
function read<T>(key: string, fallback: T): T { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return fallback; } }
export const loadStats = (): Stats => read('100.stats.v1', statsDefaults);
export const saveStats = (value: Stats): void => localStorage.setItem('100.stats.v1', JSON.stringify(value));
export const loadSettings = (): Settings => read('100.settings.v1', settingsDefaults);
export const saveSettings = (value: Settings): void => localStorage.setItem('100.settings.v1', JSON.stringify(value));
