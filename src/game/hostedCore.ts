import { cpuActionDelay } from './cpuTiming';
import { isOut } from './conditions';
import { CONFIG, MOODS } from '../data/config';
import { chooseCpuCard, chooseCpuTarget } from './cpu';
import { projectForSeat } from './projection';
import { createGame, playCard, selectTarget } from './rules';
import type { GameState, PlayerConfig } from './types';

export type Profile = Pick<PlayerConfig, 'name' | 'avatar' | 'mood' | 'lifetimePoints'>;
export type RoomCommand =
  | { type: 'cpu-count'; count: number }
  | { type: 'start'; round?: number }
  | { type: 'play'; cardId: string; turn?: number }
  | { type: 'target'; seat: number; turn?: number }
  | { type: 'mood'; mood: PlayerConfig['mood'] }
  | { type: 'leave' };
export interface Member { token: string; seat: number; profile: Profile; disconnectedAt: number | null; accountId?: string; left?:boolean }
export interface RoomData {
  lifetimeSettledRound?: string;
  nextRules?:boolean;
  id: string;
  seats: PlayerConfig[];
  members: Member[];
  /** Outcome delivery/account history only; these are no longer room members. */
  retiredMembers?:Member[];
  cpuCount: number;
  hostSeat: number;
  state: GameState | null;
  revision: number;
  updatedAt: number;
  /** Persisted across worker sleep/restarts; absent in rooms created by older versions. */
  cpuAction?: { key: string; dueAt: number } | null;
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
    ...(Number.isSafeInteger(profile.lifetimePoints) ? {lifetimePoints:Math.max(-1e9,Math.min(1e9,profile.lifetimePoints!))} : {}),
  };
}

const human = (profile: Profile): PlayerConfig => ({ ...profile, kind: 'human' });
const cpu = (index: number): PlayerConfig => ({ name: CPU_NAMES[index % CPU_NAMES.length], avatar: (index + 1) % 16, mood: 'Normal', kind: 'cpu' });

function rebuildLobby(room: RoomData): void {
  room.seats = [...room.members.map(member => human(member.profile)), ...Array.from({ length: room.cpuCount }, (_, i) => cpu(i))];
}

export function roomParticipants(room:RoomData):Member[]{return [...room.members,...room.retiredMembers??[]];}
function retireOutcomes(room:RoomData):void {
  if(!room.state?.match)return;
  const leaving=room.members.filter(member=>isOut(room.state!,member.seat));
  if(leaving.length){
    room.retiredMembers??=[];room.retiredMembers.push(...leaving);
    room.members=room.members.filter(member=>!isOut(room.state!,member.seat));
  }
  if(room.hostSeat>=0&&isOut(room.state,room.hostSeat))promoteHost(room);
  room.cpuCount=room.seats.filter((player,seat)=>player.kind==='cpu'&&!isOut(room.state!,seat)).length;
}
function touch(room: RoomData, now: number): void { retireOutcomes(room);room.revision++; room.updatedAt = now; scheduleCpuAction(room, now); }

export function createRoom(id: string, profile: unknown, token: string, now = Date.now()): RoomData {
  const first = cleanProfile(profile);
  return { id, seats: [human(first)], members: [{ token, seat: 0, profile: first, disconnectedAt: null }], cpuCount: 0, hostSeat: 0, state: null, revision: 1, updatedAt: now };
}

export function seatForToken(room: RoomData, token: string): number | null {
  return token?roomParticipants(room).find(member => !member.left&&member.token === token)?.seat ?? null:null;
}

export function joinRoom(room: RoomData, profile: unknown, token: string | null, newToken: string, now = Date.now()): { seat: number; token: string } {
  retireOutcomes(room);
  if(token&&room.retiredMembers?.some(member=>member.token===token))throw new RoomError('You have left this game after Freedom or Death. Join a new room.',403);
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
      room.state.players[existing.seat].lifetimePoints = existing.profile.lifetimePoints;
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
  const next = room.members.find(member => member.disconnectedAt === null && room.seats[member.seat]?.kind === 'human'&&(!room.state||!isOut(room.state,member.seat)));
  room.hostSeat = next?.seat ?? -1;
}

function removeLobbyMember(room: RoomData, seat: number): void {
  room.members = room.members.filter(member => member.seat !== seat);
  for (const member of room.members) if (member.seat > seat) member.seat--;
  if (room.hostSeat === seat) promoteHost(room);
  else if (room.hostSeat > seat) room.hostSeat--;
  rebuildLobby(room);
}

function cpuTurnKey(room: RoomData): string | null {
  const state = room.state;
  if (!state || state.phase === 'ended' || !state.players.some(player => player.kind === 'human'&&!isOut(state,player.id))) return null;
  const actor = state.phase === 'target' ? state.pendingSevens.at(-1)! : state.current;
  return state.players[actor]?.kind === 'cpu' ? `${state.round}:${state.turn ?? 0}:${state.phase}:${actor}` : null;
}

/** Repeated snapshots, moods and reconnects must not restart a CPU's thinking time. */
export function scheduleCpuAction(room: RoomData, now = Date.now()): void {
  const key = cpuTurnKey(room);
  if (!key) { room.cpuAction = null; return; }
  if (room.cpuAction?.key !== key) room.cpuAction = { key, dueAt: now + cpuActionDelay() };
}

/** Exactly one action per deadline, including a separate pause for choosing a player. */
export function advanceCpu(room: RoomData, now = Date.now()): boolean {
  scheduleCpuAction(room, now);
  if (!room.cpuAction || room.cpuAction.dueAt > now) return false;
  room.cpuAction = null;
  const state = room.state!;
  if (state.phase === 'target') selectTarget(state, chooseCpuTarget(state, 'normal'));
  else playCard(state, chooseCpuCard(state, 'normal').id);
  touch(room, now);
  return true;
}

/** CPU actions share the room alarm with reconnect grace and room expiry. */
export function roomAlarmAt(room: RoomData, now = Date.now()): number {
  const deadlines = room.members
    .filter(member => member.disconnectedAt !== null && (!room.state || room.seats[member.seat]?.kind === 'human'))
    .map(member => member.disconnectedAt! + DISCONNECT_GRACE_MS);
  deadlines.push(room.updatedAt + ROOM_EXPIRY_MS);
  if (room.cpuAction) deadlines.push(room.cpuAction.dueAt);
  return Math.max(now + 100, Math.min(...deadlines));
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
  }
  if (room.hostSeat >= 0 && room.members.find(member => member.seat === room.hostSeat)?.disconnectedAt !== null) promoteHost(room);
  touch(room, now);
  return true;
}

export function applyCommand(room: RoomData, seat: number, command: RoomCommand, now = Date.now()): void {
  retireOutcomes(room);
  const retired=room.retiredMembers?.find(member=>member.seat===seat);
  if(retired){
    if(command.type==='leave'){retired.left=true;touch(room,now);return;}
    throw new RoomError('You have left this game after Freedom or Death.',403);
  }
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
    if(room.state?.match?.complete)throw new RoomError('This table is finished. Create a new room.',409);
    const nextRound = room.state&&!room.state.match?.complete ? room.state.round + 1 : 1;
    room.state = createGame(room.seats, nextRound, Math.random, room.nextRules?(room.state?.match?.complete?true:room.state?.match??true):undefined);
  } else if (command.type === 'play') {
    if (!room.state || room.state.phase !== 'playing' || room.state.current !== seat || typeof command.cardId !== 'string') throw new RoomError('It is not your turn.', 409);
    if (command.turn !== undefined && command.turn !== (room.state.turn ?? 0)) throw new RoomError('That turn has already changed. Wait for the updated table.', 409);
    playCard(room.state, command.cardId);
  } else if (command.type === 'target') {
    if (!room.state || room.state.phase !== 'target' || room.state.pendingSevens.at(-1) !== seat || !Number.isInteger(command.seat)) throw new RoomError('You cannot choose a target now.', 409);
    if (command.turn !== undefined && command.turn !== (room.state.turn ?? 0)) throw new RoomError('That turn has already changed. Wait for the updated table.', 409);
    selectTarget(room.state, command.seat);
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
