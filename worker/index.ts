import {
  applyCommand, createRoom, DISCONNECT_GRACE_MS, joinRoom, ROOM_EXPIRY_MS,
  RoomError, seatForToken, setConnected, snapshotForSeat, sweepDisconnected,
  type RoomCommand, type RoomData,
} from '../src/game/hostedCore';

interface Env { ROOMS: DurableObjectNamespace; ASSETS: Fetcher }
type SocketAttachment = { token: string; seat: number };

const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const roomPath = /^\/api\/rooms\/(100-[a-f0-9]{12})\/(create|join|connect)$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = roomPath.exec(url.pathname);
    if (!match) return env.ASSETS.fetch(request);
    return env.ROOMS.getByName(match[1]).fetch(request);
  },
};

export class GameRoom {
  private room: RoomData | null = null;

  constructor(private ctx: DurableObjectState, _env: Env) {
    ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get<RoomData>('room') ?? null; });
  }

  private async save(): Promise<void> {
    if (this.room) await this.ctx.storage.put('room', this.room);
    await this.scheduleAlarm();
  }

  private async scheduleAlarm(): Promise<void> {
    if (!this.room) return;
    const deadlines = this.room.members
      .filter(member => member.disconnectedAt !== null && (!this.room!.state || this.room!.seats[member.seat]?.kind === 'human'))
      .map(member => member.disconnectedAt! + DISCONNECT_GRACE_MS);
    deadlines.push(this.room.updatedAt + ROOM_EXPIRY_MS);
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, Math.min(...deadlines)));
  }

  private broadcast(): void {
    if (!this.room) return;
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment || seatForToken(this.room, attachment.token) !== attachment.seat) continue;
      try { socket.send(JSON.stringify(snapshotForSeat(this.room, attachment.seat))); }
      catch { /* Closing sockets are handled by webSocketClose. */ }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const action = new URL(request.url).pathname.split('/').at(-1);
    if (action === 'connect') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket required.' }, 426);
      if (!this.room) return json({ error: 'Room not found.' }, 404);
      if (this.ctx.getWebSockets().length >= 16) return json({ error: 'Too many connections.' }, 429);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method !== 'POST') return json({ error: 'POST required.' }, 405);
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: 'Request is too large.' }, 413);
    let input: { profile?: unknown; token?: unknown };
    try { input = JSON.parse(raw) as typeof input; }
    catch { return json({ error: 'Invalid request.' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Invalid request.' }, 400);
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const id = new URL(request.url).pathname.split('/')[3];
        if (action === 'create') {
          if (this.room) throw new RoomError('This room code is already in use. Create a new room.', 409);
          const token = crypto.randomUUID();
          this.room = createRoom(id, input.profile, token);
          await this.save();
          return json({ token, seat: 0 });
        }
        if (action === 'join') {
          if (!this.room) throw new RoomError('Room not found. Check the invite link.', 404);
          const result = joinRoom(this.room, input.profile, typeof input.token === 'string' ? input.token : null, crypto.randomUUID());
          await this.save();
          this.broadcast();
          return json(result);
        }
        return json({ error: 'Unknown action.' }, 404);
      } catch (error) {
        return json({ error: error instanceof RoomError ? error.message : 'Could not open the room.' }, error instanceof RoomError ? error.status : 500);
      }
    });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > 2048) { socket.close(1009, 'Message too large.'); return; }
    let input: Record<string, unknown>;
    try { input = JSON.parse(message) as Record<string, unknown>; }
    catch { socket.send(JSON.stringify({ type: 'error', message: 'Invalid message.' })); return; }
    if (!input || typeof input !== 'object' || Array.isArray(input)) { socket.send(JSON.stringify({ type: 'error', message: 'Invalid message.' })); return; }
    await this.ctx.blockConcurrencyWhile(async () => {
      if (!this.room) { socket.close(1008, 'Room not found.'); return; }
      if (input.type === 'hello') {
        const token = typeof input.token === 'string' ? input.token : '';
        const seat = seatForToken(this.room, token);
        if (seat === null) { socket.close(1008, 'This seat is not available.'); return; }
        socket.serializeAttachment({ token, seat } satisfies SocketAttachment);
        for (const other of this.ctx.getWebSockets()) {
          if (other !== socket && (other.deserializeAttachment() as SocketAttachment | null)?.token === token) other.close(1000, 'Reconnected in another tab.');
        }
        setConnected(this.room, seat, true);
        await this.save();
        this.broadcast();
        return;
      }
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment || seatForToken(this.room, attachment.token) !== attachment.seat) { socket.close(1008, 'Join the room first.'); return; }
      try {
        applyCommand(this.room, attachment.seat, input as RoomCommand);
        await this.save();
        this.broadcast();
      } catch (error) {
        socket.send(JSON.stringify({ type: 'error', message: error instanceof RoomError ? error.message : 'That move was rejected.' }));
      }
    });
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;
    await this.ctx.blockConcurrencyWhile(async () => {
      if (!this.room || seatForToken(this.room, attachment.token) !== attachment.seat) return;
      const replacement = this.ctx.getWebSockets().some(other => other !== socket && (other.deserializeAttachment() as SocketAttachment | null)?.token === attachment.token);
      if (replacement) return;
      setConnected(this.room, attachment.seat, false);
      await this.save();
      this.broadcast();
    });
  }

  async webSocketError(socket: WebSocket): Promise<void> { await this.webSocketClose(socket); }

  async alarm(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (!this.room) return;
      if (Date.now() - this.room.updatedAt >= ROOM_EXPIRY_MS && this.ctx.getWebSockets().length === 0) {
        await this.ctx.storage.deleteAll();
        this.room = null;
        return;
      }
      if (sweepDisconnected(this.room)) { await this.save(); this.broadcast(); }
      else {
        if (this.ctx.getWebSockets().length) {
          this.room.updatedAt = Date.now();
          await this.ctx.storage.put('room', this.room);
        }
        await this.scheduleAlarm();
      }
    });
  }
}
