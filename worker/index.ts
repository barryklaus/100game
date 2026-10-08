import { accountForRequest } from './accounts';
import { resetsPoints } from '../src/game/points';
import { newRoundAccounts, recordPlayed, roundDelta, type RoundAccounts } from './roundAccounts';
import {
  advanceCpu, applyCommand, createRoom, joinRoom, ROOM_EXPIRY_MS, roomAlarmAt, scheduleCpuAction,
  RoomError, seatForToken, setConnected, snapshotForSeat, sweepDisconnected, roomParticipants,
  type RoomCommand, type RoomData,
} from '../src/game/hostedCore';

interface Env { ROOMS: DurableObjectNamespace; ASSETS: Fetcher; ACCOUNTS?: DurableObjectNamespace }
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
  private accountRound:RoundAccounts|null=null;

  constructor(private ctx: DurableObjectState, private env: Env) {
    ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get<RoomData>('room') ?? null; this.accountRound=await ctx.storage.get<RoundAccounts>('accountRound')??null;if(this.room&&env.ACCOUNTS)this.room.nextRules=true; });
  }

  private async save(): Promise<void> {
    if (!this.room) return;
    scheduleCpuAction(this.room);
    // The new turn and its next wake-up are committed together, before broadcasting.
    const room = this.room;
    await this.ctx.storage.transaction(async storage => {
      await storage.put('room', room);
      if(this.accountRound)await storage.put('accountRound',this.accountRound);
      await storage.setAlarm(this.accountRound&&!this.accountRound.committed&&room.state?.phase==='ended'?Math.min(Date.now()+5000,roomAlarmAt(room)):roomAlarmAt(room));
    });
  }

  private async saveAccounts():Promise<void> {
    const record=this.accountRound,state=this.room?.state;
    if(!record||record.committed||state?.phase!=='ended'||!this.env.ACCOUNTS)return;
    try {
      const store=this.env.ACCOUNTS.getByName('accounts-v1');
      for(const [seat,userId] of Object.entries(record.accounts)) {
        const response=await store.fetch(new Request('https://accounts.internal/internal/record',{method:'POST',body:JSON.stringify({userId,eventId:record.id,delta:roundDelta(record,state,Number(seat))})}));
        if(!response.ok)throw new Error('Statistics pending.');
      }
      if(this.room!.lifetimeSettledRound!==record.id) {
        for(const member of roomParticipants(this.room!)) if(!member.accountId) {
          member.profile.lifetimePoints=resetsPoints(state,member.seat)?0:(member.profile.lifetimePoints??0)+state.players[member.seat].ratingDelta;
        }
        this.room!.lifetimeSettledRound=record.id;
        await this.ctx.storage.put('room',this.room);
      }
      for(const player of state.players) if(!roomParticipants(this.room!).some(member=>member.seat===player.id)) {
        const response=await store.fetch(new Request('https://accounts.internal/internal/cpu-record',{method:'POST',body:JSON.stringify({eventId:record.id,avatar:player.avatar,delta:player.ratingDelta,reset:resetsPoints(state,player.id)})}));
        if(!response.ok)throw new Error('Character points pending.');
      }
      await this.refreshPoints();
      await this.ctx.storage.put('room',this.room);
      record.committed=true;await this.ctx.storage.put('accountRound',record);
      this.broadcast();
    }catch {/* The persisted pending result retries on the room alarm. */}
  }
  private async refreshPoints():Promise<void> {
    if(!this.room||!this.env.ACCOUNTS)return;
    const room=this.room;
    const participants=roomParticipants(room);
    const response=await this.env.ACCOUNTS.getByName('accounts-v1').fetch(new Request('https://accounts.internal/internal/points',{method:'POST',body:JSON.stringify({accounts:participants.flatMap(member=>member.accountId?[member.accountId]:[]),cpus:room.seats.filter((_,seat)=>!participants.some(member=>member.seat===seat)).map(player=>player.avatar)})}));
    if(!response.ok)throw new Error('Lifetime points unavailable.');
    const points=await response.json() as {accounts:Record<string,number>;cpus:Record<number,number>};
    room.seats.forEach((player,seat)=>{
      const member=participants.find(member=>member.seat===seat);
      player.lifetimePoints=member?.accountId?points.accounts[member.accountId]??0:member?member.profile.lifetimePoints??0:points.cpus[player.avatar]??0;
      if(room.state)room.state.players[seat].lifetimePoints=player.lifetimePoints;
    });
  }
  private broadcast(): void {
    if (!this.room) return;
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment || seatForToken(this.room, attachment.token) !== attachment.seat) continue;
      if(this.room.state&&!this.room.members.some(member=>member.seat===attachment.seat)&&!resetsPoints(this.room.state,attachment.seat))continue;
      try { socket.send(JSON.stringify(snapshotForSeat(this.room, attachment.seat))); }
      catch { /* Closing sockets are handled by webSocketClose. */ }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const action = new URL(request.url).pathname.split('/').at(-1);
    const origin=request.headers.get('Origin');
    if(origin&&origin!==new URL(request.url).origin)return json({error:'Open the room from the game.'},403);
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
        const account=await accountForRequest(request,this.env.ACCOUNTS);
        if(account) input.profile={...(input.profile&&typeof input.profile==='object'?input.profile:{}),name:account.username,lifetimePoints:account.lifetimePoints??0};
        if (action === 'create') {
          if (this.room) throw new RoomError('This room code is already in use. Create a new room.', 409);
          const token = crypto.randomUUID();
          this.room = createRoom(id, input.profile, token);
          this.room.nextRules=!!this.env.ACCOUNTS;
          if(account)this.room.members[0].accountId=account.id;
          await this.refreshPoints();
          await this.save();
          return json({ token, seat: 0 });
        }
        if (action === 'join') {
          if (!this.room) throw new RoomError('Room not found. Check the invite link.', 404);
          const previous=this.room.members.find(member=>member.token===input.token);
          if(previous?.accountId&&previous.accountId!==account?.id)throw new RoomError('Sign in to the account that joined this seat.',403);
          if(account&&this.room.members.some(member=>member.accountId===account.id&&member!==previous))throw new RoomError('This account already has a seat. Rejoin from your original browser.',409);
          if(this.room.state&&previous&&!previous.accountId&&account)throw new RoomError('Finish this guest round before joining with your account.',409);
          if(previous&&!account&&this.room.nextRules)input.profile={...(input.profile&&typeof input.profile==='object'?input.profile:{}),lifetimePoints:previous.profile.lifetimePoints??0};
          const result = joinRoom(this.room, input.profile, typeof input.token === 'string' ? input.token : null, crypto.randomUUID());
          if(account)this.room.members.find(member=>member.seat===result.seat)!.accountId=account.id;
          await this.refreshPoints();
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
        await this.refreshPoints();
        await this.save();
        this.broadcast();
        return;
      }
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment || seatForToken(this.room, attachment.token) !== attachment.seat) { socket.close(1008, 'Join the room first.'); return; }
      try {
        if(input.type==='start'){await this.saveAccounts();if(this.accountRound&&!this.accountRound.committed&&this.room.state?.phase==='ended')throw new RoomError('Saving round statistics. Please retry in a moment.',503);await this.refreshPoints();}
        const before=this.room.state?structuredClone(this.room.state):null;
        applyCommand(this.room, attachment.seat, input as RoomCommand);
        if(input.type==='cpu-count')await this.refreshPoints();
        if(input.type==='start'&&this.env.ACCOUNTS)this.accountRound=newRoundAccounts(Object.fromEntries(this.room.members.filter(member=>member.accountId).map(member=>[member.seat,member.accountId!])));
        else if(before&&this.accountRound&&this.room.state)recordPlayed(this.accountRound,before,this.room.state);
        await this.save();
        this.broadcast();
        await this.saveAccounts();
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
      const disconnected = sweepDisconnected(this.room);
      const before=this.room.state?structuredClone(this.room.state):null;
      const acted = advanceCpu(this.room);
      if(acted&&before&&this.accountRound&&this.room.state)recordPlayed(this.accountRound,before,this.room.state);
      if (this.ctx.getWebSockets().length) this.room.updatedAt = Date.now();
      await this.save();
      if (disconnected || acted) this.broadcast();
      await this.saveAccounts();
    });
  }
}
