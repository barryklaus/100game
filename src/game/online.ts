import Peer, { type DataConnection } from 'peerjs';
import { CONFIG, MOODS } from '../data/config';
import { defaultSeats } from '../data/storage';
import { createGame, playCard, selectTarget } from './rules';
import type { Card, GameState, PlayerConfig } from './types';

type Profile = Pick<PlayerConfig, 'name' | 'avatar' | 'mood'>;
type GuestCommand = { type: 'hello'; profile: Profile } | { type: 'play'; cardId: string } | { type: 'target'; seat: number } | { type: 'mood'; mood: PlayerConfig['mood'] };
type HostMessage = { type: 'snapshot'; seat: number; seats: PlayerConfig[]; state: GameState | null; roomId: string; cpuCount: number } | { type: 'error'; message: string };

const hiddenCard = (index: number): Card => ({ id: `hidden-${index}`, rank: 'A', suit: 'fire' });
const cleanProfile = (input: unknown): Profile => {
  const profile = input && typeof input === 'object' ? input as Partial<Profile> : {};
  return {
    name: String(profile.name || 'Guest').trim().slice(0, 15) || 'Guest',
    avatar: Number.isInteger(profile.avatar) ? Math.max(0, Math.min(15, profile.avatar!)) : 0,
    mood: profile.mood && MOODS.includes(profile.mood) ? profile.mood : 'Normal',
  };
};

/** The host keeps the deck and all hands. A guest receives only their own real cards. */
export function projectForSeat(full: GameState, seat: number): GameState {
  return {
    ...full,
    players: full.players.map((player, index) => ({ ...player, hand: index === seat ? [...player.hand] : player.hand.map((_, i) => hiddenCard(i)) })),
    drawPile: full.drawPile.map((_, i) => hiddenCard(i)),
    played: [...full.played],
    pendingSevens: [...full.pendingSevens],
    exactEvents: [...full.exactEvents],
    log: [...full.log],
  };
}

export class OnlineRoom {
  readonly isHost: boolean;
  readonly roomId: string;
  localSeat = 0;
  seats: PlayerConfig[] = [];
  state: GameState | null = null;
  cpuCount = 0;
  status: 'connecting' | 'lobby' | 'playing' | 'disconnected' = 'connecting';
  error = '';
  private peer: Peer;
  private hostConnection: DataConnection | null = null;
  private guests = new Map<string, { connection: DataConnection; seat: number }>();
  private humanSeats: PlayerConfig[] = [];
  private onUpdate: () => void;

  constructor(mode: 'host' | 'guest', roomId: string, profile: Profile, onUpdate: () => void) {
    this.isHost = mode === 'host';
    this.roomId = roomId;
    this.onUpdate = onUpdate;
    this.humanSeats = [{ ...cleanProfile(profile), kind: 'human' }];
    this.peer = this.isHost ? new Peer(roomId) : new Peer();
    this.peer.on('open', () => {
      if (this.isHost) {
        if (this.status === 'connecting') { this.status = 'lobby'; this.rebuildSeats(); }
        this.error = ''; this.notify();
      } else {
        if (this.hostConnection?.open) { this.error = ''; this.notify(); return; }
        const connection = this.peer.connect(roomId, { reliable: true, serialization: 'json' });
        this.hostConnection = connection;
        connection.on('open', () => connection.send({ type: 'hello', profile: cleanProfile(profile) } satisfies GuestCommand));
        connection.on('data', data => this.receiveHost(data));
        connection.on('close', () => this.disconnect('The host left the room.'));
        connection.on('error', () => this.disconnect('Could not connect to the host.'));
      }
    });
    this.peer.on('connection', connection => { if (this.isHost) this.acceptGuest(connection); else connection.close(); });
    this.peer.on('error', error => this.disconnect(error.type === 'peer-unavailable' ? 'Room not found. Check the invite link and keep the host tab open.' : `Connection failed: ${error.type}`));
    this.peer.on('disconnected', () => {
      if (this.status !== 'disconnected' && !this.peer.destroyed) {
        this.error = 'Signaling disconnected. Existing players may continue; new players cannot join until it reconnects.';
        this.notify();
        try { this.peer.reconnect(); } catch { /* A direct connection may still be live. */ }
      }
    });
  }

  private notify(): void { this.onUpdate(); }
  private disconnect(message: string): void { this.status = 'disconnected'; this.error = message; this.notify(); }
  private rebuildSeats(): void {
    this.seats = [...this.humanSeats, ...Array.from({ length: this.cpuCount }, (_, i) => ({ ...defaultSeats[(i + this.humanSeats.length) % defaultSeats.length], avatar: (i + this.humanSeats.length) % 16, kind: 'cpu' as const }))];
  }
  private snapshot(seat: number): HostMessage {
    return { type: 'snapshot', seat, seats: this.seats, state: this.state ? projectForSeat(this.state, seat) : null, roomId: this.roomId, cpuCount: this.cpuCount };
  }
  private broadcast(): void {
    this.status = this.state ? 'playing' : 'lobby';
    for (const { connection, seat } of this.guests.values()) if (connection.open) connection.send(this.snapshot(seat));
    this.notify();
  }
  private acceptGuest(connection: DataConnection): void {
    if (this.status !== 'lobby' || this.humanSeats.length + this.cpuCount >= CONFIG.PLAYER_MAX) {
      connection.on('open', () => { connection.send({ type: 'error', message: 'This room is full or a round is already underway.' } satisfies HostMessage); window.setTimeout(() => connection.close(), 250); });
      return;
    }
    connection.on('data', data => this.receiveGuest(connection, data));
    connection.on('close', () => {
      const guest = this.guests.get(connection.peer);
      if (!guest) return;
      this.guests.delete(connection.peer);
      if (this.state) {
        // A departed seat becomes a CPU so an active round cannot stall.
        this.state.players[guest.seat].kind = 'cpu';
        this.seats[guest.seat].kind = 'cpu';
        this.state.log.unshift(`${this.state.players[guest.seat].name} disconnected; CPU takes over.`);
      } else {
        this.humanSeats.splice(guest.seat, 1);
        for (const item of this.guests.values()) if (item.seat > guest.seat) item.seat--;
        this.rebuildSeats();
      }
      this.broadcast();
    });
  }
  private receiveGuest(connection: DataConnection, raw: unknown): void {
    if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
    const command = raw as GuestCommand;
    if (command.type === 'hello') {
      if (this.guests.has(connection.peer) || this.status !== 'lobby' || this.humanSeats.length + this.cpuCount >= CONFIG.PLAYER_MAX) return;
      const seat = this.humanSeats.length;
      this.humanSeats.push({ ...cleanProfile(command.profile), kind: 'human' });
      this.guests.set(connection.peer, { connection, seat });
      this.rebuildSeats(); this.broadcast();
      return;
    }
    const seat = this.guests.get(connection.peer)?.seat;
    if (seat === undefined) return;
    if (command.type === 'mood') { this.setMood(seat, command.mood); return; }
    if (!this.state || this.state.players[seat]?.kind !== 'human') return;
    try {
      if (command.type === 'play' && this.state.phase === 'playing' && this.state.current === seat && typeof command.cardId === 'string') {
        playCard(this.state, command.cardId); this.broadcast();
      } else if (command.type === 'target' && this.state.phase === 'target' && this.state.pendingSevens.at(-1) === seat && Number.isInteger(command.seat)) {
        selectTarget(this.state, command.seat); this.broadcast();
      }
    } catch { connection.send({ type: 'error', message: 'That move was rejected. Please check the current turn.' } satisfies HostMessage); }
  }
  private receiveHost(raw: unknown): void {
    if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
    const message = raw as HostMessage;
    if (message.type === 'error') { this.error = message.message; this.notify(); return; }
    if (message.type === 'snapshot') {
      this.localSeat = message.seat;
      this.seats = message.seats;
      this.state = message.state;
      this.cpuCount = message.cpuCount;
      this.status = message.state ? 'playing' : 'lobby';
      this.error = '';
      this.notify();
    }
  }
  setCpuCount(count: number): void {
    if (!this.isHost || this.status !== 'lobby') return;
    this.cpuCount = Math.max(0, Math.min(CONFIG.PLAYER_MAX - this.humanSeats.length, Math.floor(count)));
    this.rebuildSeats(); this.broadcast();
  }
  startRound(round = 1): void {
    if (!this.isHost || (this.status !== 'lobby' && this.status !== 'playing') || this.seats.length < CONFIG.PLAYER_MIN) return;
    this.state = createGame(this.seats, round);
    this.broadcast();
  }
  play(cardId: string): void {
    if (!this.state || this.state.phase !== 'playing') return;
    if (this.isHost ? this.state.current !== this.localSeat && this.state.players[this.state.current].kind !== 'cpu' : this.state.current !== this.localSeat) return;
    if (!this.isHost) { this.hostConnection?.send({ type: 'play', cardId } satisfies GuestCommand); return; }
    try { playCard(this.state, cardId); this.broadcast(); } catch { this.error = 'That card is no longer available.'; this.notify(); }
  }
  target(seat: number): void {
    if (!this.state || this.state.phase !== 'target') return;
    const chooser = this.state.pendingSevens.at(-1);
    if (chooser !== this.localSeat && !(this.isHost && this.state.players[chooser!].kind === 'cpu')) return;
    if (!this.isHost) { this.hostConnection?.send({ type: 'target', seat } satisfies GuestCommand); return; }
    try { selectTarget(this.state, seat); this.broadcast(); } catch { this.error = 'Choose another player.'; this.notify(); }
  }
  setMood(seat: number, mood: PlayerConfig['mood']): void {
    if (!MOODS.includes(mood) || seat !== this.localSeat && !this.isHost) return;
    if (!this.isHost) { this.hostConnection?.send({ type: 'mood', mood } satisfies GuestCommand); return; }
    const player = this.state?.players[seat] ?? this.seats[seat];
    if (!player) return;
    player.mood = mood;
    this.seats[seat].mood = mood;
    this.broadcast();
  }
  close(): void { this.status = 'disconnected'; this.peer.destroy(); }
}

export const newRoomId = (): string => `100-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
