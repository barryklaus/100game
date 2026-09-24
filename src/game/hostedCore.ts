import { CONFIG, MOODS } from '../data/config';
import { chooseCpuCard, chooseCpuTarget } from './cpu';
import { projectForSeat } from './projection';
import { createGame, playCard, selectTarget } from './rules';
import type { GameState, PlayerConfig } from './types';

export type Profile = Pick<PlayerConfig, 'name' | 'avatar' | 'mood'>;
export type RoomCommand =
  | { type: 'cpu-count'; count: number }
  | { type: 'start'; round?: number }
  | { type: 'play'; cardId: string; turn?: number }
  | { type: 'target'; seat: number; turn?: number }
  | { type: 'mood'; mood: PlayerConfig['mood'] }
  | { type: 'leave' };
export interface Member { token: string; seat: number; profile: Profile; disconnectedAt: number | null }
export interface RoomData {
  id: string;
  seats: PlayerConfig[];
  members: Member[];
  cpuCount: number;
  hostSeat: number;
  state: GameState | null;
  revision: number;
  updatedAt: number;
}

const CPU_NAMES = ['Mira', 'Kai', 'Luma', 'Sol', 'Ren', 'Ari', 'Nova'];
export const DISCONNECT_GRACE_MS = 30_000;
export const ROOM_EXPIRY_MS = 24 * 60 * 60 * 1000;

export class RoomError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function cleanProfile(input: unknown): Profile {
  const profile = input && typeof input === 'object' ? input as Partial<Profile> : {};
  return {
    name: String(profile.name || 'Player').trim().slice(0, 15) || 'Player',
    avatar: Number.isInteger(profile.avatar) ? Math.max(0, Math.min(15, profile.avatar!)) : 0,
    mood: profile.mood && MOODS.includes(profile.mood) ? profile.mood : 'Normal',
  };
}

const human = (profile: Profile): PlayerConfig => ({ ...profile, kind: 'human' });
const cpu = (index: number): PlayerConfig => ({ name: CPU_NAMES[index % CPU_NAMES.length], avatar: (index + 1) % 16, mood: 'Normal', kind: 'cpu' });

function rebuildLobby(room: RoomData): void {
  room.seats = [...room.members.map(member => human(member.profile)), ...Array.from({ length: room.cpuCount }, (_, i) => cpu(i))];
}

function touch(room: RoomData, now: number): void { room.revision++; room.updatedAt = now; }

export function createRoom(id: string, profile: unknown, token: string, now = Date.now()): RoomData {
  const first = cleanProfile(profile);
  return { id, seats: [human(first)], members: [{ token, seat: 0, profile: first, disconnectedAt: null }], cpuCount: 0, hostSeat: 0, state: null, revision: 1, updatedAt: now };
}

export function seatForToken(room: RoomData, token: string): number | null {
  return room.members.find(member => member.token === token)?.seat ?? null;
}

export function joinRoom(room: RoomData, profile: unknown, token: string | null, newToken: string, now = Date.now()): { seat: number; token: string } {
  const existing = token ? room.members.find(member => member.token === token) : undefined;
  if (existing) {
    existing.disconnectedAt = null;
    existing.profile = cleanProfile(profile);
    room.seats[existing.seat] = human(existing.profile);
    if (room.state) {
      room.state.players[existing.seat].kind = 'human';
      room.state.players[existing.seat].name = existing.profile.name;
      room.state.players[existing.seat].mood = existing.profile.mood;
      room.state.players[existing.seat].avatar = existing.profile.avatar;
    }
    if (room.hostSeat < 0) room.hostSeat = existing.seat;
    touch(room, now);
    return { seat: existing.seat, token: existing.token };
  }
  if (room.state) throw new RoomError('A round is already underway. Ask for a new room or rejoin from your original browser.', 409);
  if (room.seats.length >= CONFIG.PLAYER_MAX) throw new RoomError('This room is full.', 409);
  const seat = room.members.length;
  const member = { token: newToken, seat, profile: cleanProfile(profile), disconnectedAt: null };
  room.members.push(member);
  if (room.cpuCount + room.members.length > CONFIG.PLAYER_MAX) room.cpuCount = CONFIG.PLAYER_MAX - room.members.length;
  rebuildLobby(room);
  if (room.hostSeat < 0) room.hostSeat = seat;
  touch(room, now);
  return { seat, token: newToken };
}

export function setConnected(room: RoomData, seat: number, connected: boolean, now = Date.now()): void {
  const member = room.members.find(item => item.seat === seat);
  if (!member) return;
  member.disconnectedAt = connected ? null : now;
  if (connected && room.hostSeat < 0) room.hostSeat = seat;
  touch(room, now);
}

function promoteHost(room: RoomData): void {
  const next = room.members.find(member => member.disconnectedAt === null && room.seats[member.seat]?.kind === 'human');
  room.hostSeat = next?.seat ?? -1;
}

function removeLobbyMember(room: RoomData, seat: number): void {
  room.members = room.members.filter(member => member.seat !== seat);
  for (const member of room.members) if (member.seat > seat) member.seat--;
  if (room.hostSeat === seat) promoteHost(room);
  else if (room.hostSeat > seat) room.hostSeat--;
  rebuildLobby(room);
}

export function runCpuTurns(room: RoomData): void {
  if (!room.state) return;
  if (!room.state.players.some(player => player.kind === 'human')) return;
  let steps = 0;
  while (room.state.phase !== 'ended' && steps++ < 500) {
    const actor = room.state.phase === 'target' ? room.state.pendingSevens.at(-1)! : room.state.current;
    if (room.state.players[actor].kind !== 'cpu') return;
    if (room.state.phase === 'target') selectTarget(room.state, chooseCpuTarget(room.state, 'normal'));
    else playCard(room.state, chooseCpuCard(room.state, 'normal').id);
  }
  if (steps >= 500) throw new RoomError('The automatic turn limit was reached.', 500);
}

export function sweepDisconnected(room: RoomData, now = Date.now()): boolean {
  const expired = room.members.filter(member => member.disconnectedAt !== null && now - member.disconnectedAt >= DISCONNECT_GRACE_MS && (!room.state || room.seats[member.seat]?.kind === 'human'));
  if (!expired.length) return false;
  if (!room.state) {
    for (const member of [...expired].sort((a, b) => b.seat - a.seat)) removeLobbyMember(room, member.seat);
  } else {
    for (const member of expired) {
      if (room.seats[member.seat]?.kind === 'cpu') continue;
      room.seats[member.seat].kind = 'cpu';
      room.state.players[member.seat].kind = 'cpu';
      room.state.log.unshift(`${room.state.players[member.seat].name} disconnected; CPU takes over.`);
      room.state.log = room.state.log.slice(0, 24);
    }
    runCpuTurns(room);
  }
  if (room.hostSeat >= 0 && room.members.find(member => member.seat === room.hostSeat)?.disconnectedAt !== null) promoteHost(room);
  touch(room, now);
  return true;
}

export function applyCommand(room: RoomData, seat: number, command: RoomCommand, now = Date.now()): void {
  const member = room.members.find(item => item.seat === seat);
  if (!member || room.seats[seat]?.kind !== 'human') throw new RoomError('Your seat is no longer active.', 403);
  if (command.type === 'leave') {
    if (room.state) { member.disconnectedAt = now - DISCONNECT_GRACE_MS; sweepDisconnected(room, now); }
    else { removeLobbyMember(room, seat); touch(room, now); }
    return;
  }
  if (command.type === 'mood') {
    if (!MOODS.includes(command.mood)) throw new RoomError('Choose a valid mood.');
    member.profile.mood = command.mood;
    room.seats[seat].mood = command.mood;
    if (room.state) room.state.players[seat].mood = command.mood;
  } else if (command.type === 'cpu-count') {
    if (seat !== room.hostSeat || room.state) throw new RoomError('Only the host can set CPU seats before a round.', 403);
    if (!Number.isInteger(command.count) || command.count < 0 || command.count > CONFIG.PLAYER_MAX - room.members.length) throw new RoomError('Choose a valid CPU count.');
    room.cpuCount = command.count;
    rebuildLobby(room);
  } else if (command.type === 'start') {
    if (seat !== room.hostSeat || room.seats.length < CONFIG.PLAYER_MIN) throw new RoomError('Only the host can start a table with at least two players.', 403);
    if (room.state && room.state.phase !== 'ended') throw new RoomError('Finish the current round first.', 409);
    const nextRound = room.state ? room.state.round + 1 : 1;
    room.state = createGame(room.seats, nextRound);
    runCpuTurns(room);
  } else if (command.type === 'play') {
    if (!room.state || room.state.phase !== 'playing' || room.state.current !== seat || typeof command.cardId !== 'string') throw new RoomError('It is not your turn.', 409);
    if (command.turn !== undefined && command.turn !== (room.state.turn ?? 0)) throw new RoomError('That turn has already changed. Wait for the updated table.', 409);
    playCard(room.state, command.cardId);
    runCpuTurns(room);
  } else if (command.type === 'target') {
    if (!room.state || room.state.phase !== 'target' || room.state.pendingSevens.at(-1) !== seat || !Number.isInteger(command.seat)) throw new RoomError('You cannot choose a target now.', 409);
    if (command.turn !== undefined && command.turn !== (room.state.turn ?? 0)) throw new RoomError('That turn has already changed. Wait for the updated table.', 409);
    selectTarget(room.state, command.seat);
    runCpuTurns(room);
  } else throw new RoomError('Unknown command.');
  touch(room, now);
}

export function snapshotForSeat(room: RoomData, seat: number) {
  return {
    type: 'snapshot' as const, roomId: room.id, seat, hostSeat: room.hostSeat,
    seats: room.seats, cpuCount: room.cpuCount, revision: room.revision,
    state: room.state ? projectForSeat(room.state, seat) : null,
  };
}
