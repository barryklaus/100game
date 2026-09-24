import type { RoomCommand, Profile } from './hostedCore';
import type { GameState, PlayerConfig } from './types';

type Snapshot = { type: 'snapshot'; roomId: string; seat: number; hostSeat: number; seats: PlayerConfig[]; cpuCount: number; revision: number; state: GameState | null };
type ServerMessage = Snapshot | { type: 'error'; message: string };

/** One hosted room per Cloudflare Durable Object. No player needs to keep a host tab open. */
export class HostedRoom {
  readonly roomId: string;
  readonly runsCpuLocally = false;
  localSeat = -1;
  hostSeat = -1;
  seats: PlayerConfig[] = [];
  state: GameState | null = null;
  cpuCount = 0;
  status: 'connecting' | 'lobby' | 'playing' | 'disconnected' = 'connecting';
  error = '';
  private socket: WebSocket | null = null;
  private token = '';
  private closed = false;
  private reconnects = 0;
  private reconnectTimer: number | null = null;
  private connectTimer: number | null = null;
  private commandTimer: number | null = null;
  private revision = 0;

  get isHost(): boolean { return this.localSeat >= 0 && this.localSeat === this.hostSeat; }

  constructor(private initialMode: 'host' | 'guest', roomId: string, private profile: Profile, private onUpdate: () => void) {
    this.roomId = roomId;
    void this.open(initialMode);
  }

  private get storageKey(): string { return `100game:room:${this.roomId}`; }
  private notify(): void { this.onUpdate(); }
  private clearCommandTimer(): void { if (this.commandTimer !== null) clearTimeout(this.commandTimer); this.commandTimer = null; }

  private async open(mode: 'host' | 'guest'): Promise<void> {
    try {
      const response = await fetch(`/api/rooms/${this.roomId}/${mode === 'host' ? 'create' : 'join'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ profile: this.profile, token: mode === 'guest' ? localStorage.getItem(this.storageKey) : null }),
      });
      const result = await response.json() as { token?: string; seat?: number; error?: string };
      if (!response.ok || !result.token || !Number.isInteger(result.seat)) throw new Error(result.error || 'Could not open the room.');
      if (this.closed) return;
      this.token = result.token;
      this.localSeat = result.seat!;
      localStorage.setItem(this.storageKey, this.token);
      this.connect();
    } catch (error) {
      if (this.closed) return;
      this.status = 'disconnected';
      this.error = error instanceof Error && error.name === 'TimeoutError'
        ? 'The game service took too long to respond. Please retry.'
        : error instanceof Error ? error.message : 'Could not reach the game service.';
      this.notify();
    }
  }

  private connect(): void {
    if (this.closed) return;
    const url = new URL(`/api/rooms/${this.roomId}/connect`, location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    this.socket = socket;
    this.connectTimer = window.setTimeout(() => {
      if (this.socket === socket) socket.close();
    }, 15_000);
    socket.onopen = () => {
      if (this.closed || this.socket !== socket) return;
      socket.send(JSON.stringify({ type: 'hello', token: this.token }));
    };
    socket.onmessage = event => {
      if (this.closed || this.socket !== socket) return;
      let message: ServerMessage;
      try { message = JSON.parse(event.data) as ServerMessage; } catch { return; }
      if (message.type === 'error') {
        this.clearCommandTimer(); this.error = message.message; this.notify(); return;
      }
      if (message.type !== 'snapshot' || message.roomId !== this.roomId || message.seat !== this.localSeat || message.revision < this.revision) return;
      this.clearCommandTimer();
      if (this.connectTimer !== null) clearTimeout(this.connectTimer);
      this.connectTimer = null;
      this.revision = message.revision;
      this.reconnects = 0;
      this.hostSeat = message.hostSeat;
      this.seats = message.seats;
      this.cpuCount = message.cpuCount;
      this.state = message.state;
      this.status = message.state ? 'playing' : 'lobby';
      this.error = '';
      this.notify();
    };
    socket.onclose = () => {
      if (this.closed || this.socket !== socket) return;
      this.clearCommandTimer();
      if (this.connectTimer !== null) clearTimeout(this.connectTimer);
      this.connectTimer = null;
      if (this.reconnects >= 6) {
        this.status = 'disconnected';
        this.error = 'Connection to the game service was lost. Try joining again.';
        this.notify(); return;
      }
      this.status = 'connecting';
      this.error = 'Reconnecting to the game service…';
      this.notify();
      const delay = Math.min(10_000, 1000 * 2 ** this.reconnects++);
      this.reconnectTimer = window.setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
    };
    socket.onerror = () => { /* The close handler retries or shows an error. */ };
  }

  private send(command: RoomCommand): void {
    if (this.socket?.readyState !== WebSocket.OPEN) { this.error = 'Reconnecting. Please try that action again shortly.'; this.notify(); return; }
    this.clearCommandTimer();
    this.socket.send(JSON.stringify(command));
    this.commandTimer = window.setTimeout(() => {
      this.commandTimer = null;
      if (this.status === 'playing' || this.status === 'lobby') {
        this.error = 'The game service has not confirmed that action. Check your connection and try again.';
        this.notify();
      }
    }, 10_000);
  }

  setCpuCount(count: number): void { if (this.isHost && this.status === 'lobby') this.send({ type: 'cpu-count', count }); }
  startRound(round?: number): void { if (this.isHost) this.send({ type: 'start', round }); }
  play(cardId: string): void { if (this.state?.phase === 'playing' && this.state.current === this.localSeat) this.send({ type: 'play', cardId, turn: this.state.turn ?? 0 }); }
  target(seat: number): void { if (this.state?.phase === 'target' && this.state.pendingSevens.at(-1) === this.localSeat) this.send({ type: 'target', seat, turn: this.state.turn ?? 0 }); }
  setMood(seat: number, mood: PlayerConfig['mood']): void { if (seat === this.localSeat) this.send({ type: 'mood', mood }); }
  retry(): void {
    if (this.closed || this.status !== 'disconnected') return;
    this.reconnects = 0;
    this.status = 'connecting';
    this.error = '';
    this.notify();
    void this.open(this.token ? 'guest' : this.initialMode);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    if (this.connectTimer !== null) clearTimeout(this.connectTimer);
    this.clearCommandTimer();
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'leave' }));
    this.socket?.close();
    this.status = 'disconnected';
    localStorage.removeItem(this.storageKey);
  }
}
