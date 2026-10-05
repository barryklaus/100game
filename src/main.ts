import { TotalPresentation } from './ui/TotalPresentation';
import { totalMarkup } from './ui/totalFeedback';
import { PlayerRing } from './ui/PlayerRing';
import { CHARACTER_SPRITE_VERSION } from './ui/CharacterSpriteLayout';
import { scoreTransition } from './ui/ScoreTransition';
import './style.css';
import './game-presentation.css';
import './premium.css';
import './observatory.css';
import './characters.css';
import './celestial.css';
import { CONFIG, MOODS, moodSymbols, suitSymbols } from './data/config';
import { defaultSeats, loadSettings, loadStats, saveSettings, saveStats, type Settings, type Stats } from './data/storage';
import { backImage, cardDisplayRank, cardImage, cardImageLossless, prefersLosslessHand } from './game/deck';
import { cardFace } from './game/cardFace';
import { cpuActionDelay } from './game/cpuTiming';
import { chooseCpuCard, chooseCpuTarget } from './game/cpu';
import { createGame, playCard, selectTarget } from './game/rules';
import type { Card, GameState, PlayerConfig } from './game/types';
import { AudioManager } from './audio/AudioManager';
import { ObservatoryScene } from './render/ObservatoryScene';
import { HoloShader } from './render/HoloShader';
import { OnlineRoom, newRoomId } from './game/online';
import { HostedRoom } from './game/hosted';
import { cardGrip, cardFlickSpin, isDoubleCardTap, isPlayGesture, type CardTap, type CardGrip, type CardSpin } from './ui/cardGesture';
import { updateGameView } from './ui/updateGameView';
import { GyroHand } from './ui/GyroHand';
import { masterNames, masterCharacter, masterImage } from './ui/MasterCharacters';

const app = document.querySelector<HTMLDivElement>('#app')!;
const isNextVersion = import.meta.env.MODE === '100next';
const isHostedVersion = isNextVersion || import.meta.env.MODE === 'cloudflare';
if (isNextVersion) document.title = '100next — Simple Numbers. Big Reactions.';
const playerRing = new PlayerRing(app, () => observatory?.projectPlayerRing(), () => render());
let settings: Settings = loadSettings();
let trialCast=isNextVersion&&new URLSearchParams(location.search).get('characters')==='finn-june';
let masterCast=isNextVersion&&!['observatory','finn-june'].includes(new URLSearchParams(location.search).get('characters')??'');
if(trialCast){settings.playerCount=2;settings.seats[0]={...settings.seats[0],name:'Finn',avatar:0,kind:'human',mood:'Normal'};settings.seats[1]={...settings.seats[1],name:'June',avatar:1,kind:'cpu',mood:'Normal'};}
function useMasterSeats(reset=false):void{settings.seats=settings.seats.map((seat,index)=>({...seat,name:reset||seat.name===defaultSeats[index].name?masterNames[index]:seat.name,avatar:reset?index:seat.avatar%8}));}
if(masterCast){useMasterSeats();if(new URLSearchParams(location.search).get('characters')==='midnight-eight'&&new URLSearchParams(location.search).get('play')==='1')settings.playerCount=8;}
let stats: Stats = loadStats();
let state: GameState | null = null;
let selectedCard: string | null = null;
let locked = false;
let departingCardId: string | null = null;
const receivingCardIds = new Set<string>();
let modal: 'rules' | 'settings' | 'stats' | 'history' | 'menu' | null = null;
let emotesOpen = false;
let emoteHoldTimer:number|undefined;
let emoteHeld=false;
let cpuTimer: number | undefined;
let reaction: Record<number, string> = {};
let toastTimer: number | undefined;
let online: OnlineRoom | HostedRoom | null = null;
let onlineMode: 'host' | 'join' | null = new URLSearchParams(location.search).has('room') ? 'join' : null;
let joinCode = new URLSearchParams(location.search).get('room') || '';
let roomCpuCount = 0;
let hostedLobbyInitialized = false;
let recordedRound = 0;
let lastTurnKey = '';
let awaitingNetwork = false;
let pendingLog = '';
let remoteFlight=false;
let remoteFlightKey='';
let snapshotRoom: OnlineRoom | HostedRoom | null = null;
const remoteSnapshots: GameState[] = [];
let observedOnlineHand = new Set<string>();
let observedOnlineRound = 0;
const audio = new AudioManager();
const holo = new HoloShader();
const gyro = new GyroHand();
gyro.onStatusChange = () => {
  const button = document.querySelector<HTMLButtonElement>('[data-action="gyro-enable"]');
  if (button) {
    button.textContent = gyro.status === 'on' ? 'Recenter phone tilt' : gyro.status === 'waiting' ? 'Waiting for motion…' : 'Enable phone tilt';
    button.disabled = gyro.status === 'waiting';
  }
  const message = document.querySelector<HTMLElement>('#gyro-status');
  if (message) message.textContent = gyro.status === 'denied' ? 'Motion access was denied. You can still drag cards to tilt them.' : gyro.status === 'unavailable' ? 'Motion sensors are unavailable in this browser.' : gyro.status === 'on' ? 'Move your phone gently to tilt the cards. Dragging a card takes control.' : 'Available on supported phones.';
};
audio.configure(settings);
audio.setBackgrounded(document.hidden);
document.addEventListener('visibilitychange',()=>audio.setBackgrounded(document.hidden));
document.documentElement.classList.add('observatory-mode');
document.documentElement.classList.toggle('midnight-mode', isNextVersion);
const presentedTotal = new TotalPresentation();
let observatory: ObservatoryScene | undefined;
try { observatory = new ObservatoryScene(isNextVersion ? 'midnight' : 'observatory'); observatory.configure({quality:settings.graphics,reducedMotion:settings.reducedMotion}); } catch { /* Keep the accessible HTML game if WebGL is unavailable. */ }

if (observatory) observatory.onCardArrival = key => {
  if (!presentedTotal.arrive(key)) return;
  // Update only the score, preserving an in-progress card drag and draw animation.
  const total = document.querySelector('.total-number');
  if (total) total.innerHTML = totalMarkup(presentedTotal.visible.total);
  for (const selector of ['energy-system', 'total-wrap']) {
    const element = document.querySelector(`.${selector}`);
    if (element) element.className = `${selector} ${totalClass(presentedTotal.visible.total)}`;
  }
  const caption = document.querySelector('.total-event');
  if (caption) caption.textContent = presentedTotal.visible.caption;
  audio.setPresentedTotal(presentedTotal.visible.total);
  syncPlayerRing();
  if (state?.phase === 'ended') render();
  if (remoteSnapshots.length) queueMicrotask(() => roomChanged());
};

function totalClass(total: number): string {
  return total>100?'busted':total===100?'at100':total>=CONFIG.TOTAL_WARNING_3?'danger':total>=CONFIG.TOTAL_WARNING_2?'warning-2':total>=CONFIG.TOTAL_WARNING_1?'warning-1':'';
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]!);
const observatoryAvatarNames = ['Ember Scout', 'Tide Scholar', 'Grove Guardian', 'Sun Knight', 'Storm Pilot', 'Coral Bard', 'Mushroom Alchemist', 'Desert Ranger', 'Moon Seer', 'River Courier', 'Thorn Duelist', 'Forge Captain', 'Cloud Mechanic', 'Marsh Mystic', 'Wildwood Archer', 'Dawn Dancer'];
let avatarNames=masterCast?masterNames:trialCast?['Finn','June']:observatoryAvatarNames;
const trialCharacter=(index:number):'finn'|'june'=>index%2===0?'finn':'june';
const avatarImage = (index: number): string => masterCast?masterImage(index,true):trialCast?`${import.meta.env.BASE_URL}assets/social-club/${trialCharacter(index)}-portrait${trialCharacter(index)==='june'?'-v2':''}.webp`:`${import.meta.env.BASE_URL}assets/avatars/avatar-${String((index % 16 + 16) % 16 + 1).padStart(2,'0')}.jpg`;
function castPath(room?:string):string{const params=new URLSearchParams();if(room)params.set('room',room);if(masterCast)params.set('characters','midnight-eight');else if(trialCast)params.set('characters','finn-june');else if(isNextVersion)params.set('characters','observatory');return location.pathname+(params.size?'?'+params:'');}
const characterSheet = (index: number): string => `${import.meta.env.BASE_URL}assets/characters/avatar-${String((index % 16 + 16) % 16 + 1).padStart(2,'0')}.webp?v=${CHARACTER_SPRITE_VERSION}`;
const tumbleSheet = (index: number): string => `${import.meta.env.BASE_URL}assets/characters/tumbles/avatar-${String((index % 16 + 16) % 16 + 1).padStart(2,'0')}-tumble.webp?v=1`;
const gameRoundKey = (): string => state ? `${state.round}:${state.players.map(player=>player.name).join(':')}` : '';
const localSeat = (): number => online?.localSeat ?? Math.max(0, settings.seats.findIndex(seat => seat.kind === 'human'));
const canControlActor = (): boolean => !!state && !awaitingNetwork && (!online || state.turn === online.state?.turn) && state.players[state.phase === 'target' ? state.pendingSevens.at(-1)! : state.current]?.kind === 'human' && (!online || (state.phase === 'target' ? state.pendingSevens.at(-1) : state.current) === online.localSeat);
function closeOnline(): void {
  online?.close(); online = null; state = null; onlineMode = null; selectedCard = null; recordedRound = 0; awaitingNetwork = false; pendingLog = ''; observedOnlineHand.clear(); observedOnlineRound = 0; clearCpu();
  history.replaceState(null, '', castPath());
  render();
}
function roomChanged(): void {
  if (!online) return;
  if (!awaitingNetwork || online.error || online.status === 'disconnected' || online.state?.log[0] !== pendingLog) awaitingNetwork = false;
  if (online.isHost && online.status === 'lobby') {
    if (online instanceof HostedRoom && !hostedLobbyInitialized) {
      roomCpuCount = online.cpuCount;
      hostedLobbyInitialized = true;
    }
    roomCpuCount = Math.min(roomCpuCount, CONFIG.PLAYER_MAX - online.seats.filter(seat => seat.kind === 'human').length);
    if (online.cpuCount !== roomCpuCount) { online.setCpuCount(roomCpuCount); return; }
  }
  if (snapshotRoom !== online || online.status !== 'playing') {
    snapshotRoom = online;remoteSnapshots.length = 0;remoteFlightKey = '';
  }
  if (online.status === 'playing' && online.state && online.state !== state && !remoteSnapshots.includes(online.state)) remoteSnapshots.push(online.state);
  const previous = state;
  const incoming=remoteSnapshots[0] ?? online.state;
  const incomingTop=incoming?.played.at(-1);
  const remoteKey=incoming?`${incoming.round}:${incoming.log[0]}`:'';
  if(remoteFlight && online.status==='playing')return;
  // A delayed connection must not skip a CPU card or overwrite an unfinished score wave.
  if (presentedTotal.pending && incomingTop && previous?.round === incoming?.round && incomingTop.id !== previous?.played.at(-1)?.id) return;
  if(observatory?.canAnimate && !settings.reducedMotion && incomingTop && previous && incoming?.round===previous.round && incoming.log[0]!==previous.log[0] && incomingTop.id!==previous.played.at(-1)?.id && previous.current!==online.localSeat && remoteKey!==remoteFlightKey){
    const seat=document.querySelector<HTMLElement>(`.seat[data-seat="${previous.current}"]`);
    if(seat){const room=online,actor=previous.current;remoteFlight=true;remoteFlightKey=remoteKey;void observatory.playCardToDiscard(cardImage(incomingTop),seat.getBoundingClientRect(),undefined,undefined,()=>playerRing.release(actor),()=>playerRing.prepareThrow(actor)).catch(()=>playerRing.cancelThrow(actor)).finally(()=>{remoteFlight=false;if(online===room)roomChanged();});return;}
  }
  state = incoming;
  if (previous && state && previous.played.at(-1)?.id !== state.played.at(-1)?.id) playerRing.played(previous.current, ['seven','reverse','zero','minus'].includes(state.event));
  if (remoteSnapshots[0] === incoming) remoteSnapshots.shift();
  const drawnForLocal = state && observedOnlineRound === state.round
    ? state.players[online.localSeat]?.hand.find(card => !observedOnlineHand.has(card.id))
    : undefined;
  observedOnlineHand = new Set(state?.players[online.localSeat]?.hand.map(card => card.id) ?? []);
  observedOnlineRound = state?.round ?? 0;
  if (previous?.phase === 'ended' && state?.phase === 'playing') recordedRound = 0;
  const key = state ? `${state.round}-${state.phase}-${state.current}-${state.pendingSevens.length}` : '';
  if (key !== lastTurnKey) { selectedCard = null; lastTurnKey = key; }
  if (state && previous && state.log[0] !== previous.log[0] && state.played.length) {
    if (state.event === 'bust') { flash(`${state.players[state.bust!].name.toUpperCase()} caused Overflow`, 'bust'); }
    else if (state.event === 'exact') { flash('EXACT 100!  +3', 'exact'); }
    else if (state.event === 'reverse') { audio.play('reverse'); flash('DIRECTION REVERSED', 'reverse'); }
    else if (state.event === 'seven') { audio.play('target'); flash('CHOOSE A PLAYER', 'seven'); }
    else if(state.event==='zero')audio.play('zero');
    else if(state.event==='minus')audio.play('minus');
    else audio.play('total-increase',{position:{x:0,y:1,z:-3}});
  }
  if (state?.phase === 'ended' && recordedRound !== state.round) { recordedRound = state.round; finishRound(); }
  render();
  if (drawnForLocal) void animateDrawToHand(drawnForLocal);
  if (previous && state && previous.round === state.round && previous.played.at(-1)?.id !== state.played.at(-1)?.id && state.phase !== 'ended') {
    const actor = previous.current;
    if (actor !== online.localSeat && state.players[actor]?.hand.length >= previous.players[actor].hand.length) animateOpponentDraw(actor);
  }
  scheduleCpu();
}
function connectOnline(mode: 'host' | 'join'): void {
  const name = (document.querySelector<HTMLInputElement>('#online-name')?.value || settings.seats[0].name).trim().slice(0,15) || 'Player';
  const avatar = settings.seats[0].avatar;
  settings.seats[0] = { ...settings.seats[0], name, avatar, kind: 'human' }; save();
  const code = mode === 'host' ? newRoomId() : joinCode.trim().replace(/^.*[?&]room=/, '').split('&')[0];
  if (!/^100-[a-z0-9]{12}$/.test(code)) { flash('Enter a valid room code or invite link.', 'bust'); return; }
  online?.close(); online = null; state = null; awaitingNetwork = false; selectedCard = null; lastTurnKey = ''; observedOnlineHand.clear(); observedOnlineRound = 0;
  hostedLobbyInitialized = false;
  const Room = isHostedVersion ? HostedRoom : OnlineRoom;
  online = new Room(mode === 'join' ? 'guest' : 'host', code, { name, avatar, mood: settings.seats[0].mood }, roomChanged);
  onlineMode = mode; recordedRound = 0;
  if (mode === 'host') { online.setCpuCount(roomCpuCount); history.replaceState(null, '', castPath(code)); }
  render();
}
function applyPreferences(): void {
  audio.configure(settings);
  observatory?.configure({quality:settings.graphics,reducedMotion:settings.reducedMotion});
  holo.enabled = !settings.reducedMotion;
  document.documentElement.classList.toggle('reduce-motion',settings.reducedMotion);
  if (settings.reducedMotion) gyro.stop();
  document.documentElement.style.setProperty('--ui-scale',String(settings.uiScale));
}
function save(): void { saveSettings(settings); saveStats(stats); applyPreferences(); }
applyPreferences();
function clearCpu(): void { if (cpuTimer) clearTimeout(cpuTimer); cpuTimer = undefined; }
function flash(text: string, kind = ''): void {
  if (['exact','seven','reverse','zero','minus'].includes(kind) || (kind==='bust' && state?.phase==='ended')) return;
  document.querySelector('.event-toast')?.remove();
  const el = document.createElement('div'); el.className = `event-toast ${kind}`; el.textContent = text;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 1600);
}
function react(ids: number[], text: string): void {
  ids.forEach(id => reaction[id] = text);
  render();
  window.setTimeout(() => { ids.forEach(id => delete reaction[id]); if (!locked) render(); }, 1500);
}

async function animateOpponentDraw(seatIndex: number): Promise<void> {
  if (!observatory?.canAnimate || settings.reducedMotion) { playerRing.received(seatIndex); return; }
  const roundKey=gameRoundKey();
  const target = await playerRing.prepareDraw(seatIndex);
  if(roundKey!==gameRoundKey()||!state||state.phase==='ended')return;
  if (!target) { playerRing.received(seatIndex); return; }
  // Both sides use the back artwork: other players' replacement cards stay private.
  audio.play('draw-pile');
  void observatory.drawCardToHand(backImage, target, undefined, () => playerRing.received(seatIndex)).catch(() => playerRing.received(seatIndex));
}

async function animateDrawToHand(card: Card): Promise<void> {
  audio.play('draw-pile');
  const pile = document.querySelector<HTMLElement>('.draw-stack .card-back');
  const target = document.querySelector<HTMLElement>(`.local-hand .hand-card[data-card="${card.id}"]`);
  if (!pile || !target || settings.reducedMotion) { playerRing.received(localSeat()); audio.play('card-draw'); return; }
  const start = pile.getBoundingClientRect();
  const end = target.getBoundingClientRect();
  if (start.width < 2 || end.width < 2) { playerRing.received(localSeat()); audio.play('card-draw'); return; }

  receivingCardIds.add(card.id);
  target.classList.add('receiving-card');
  const reveal=()=>{
    playerRing.received(localSeat());
    receivingCardIds.delete(card.id);
    document.querySelector<HTMLElement>(`.local-hand .hand-card[data-card="${card.id}"]`)?.classList.remove('receiving-card');
  };
  if (observatory) {
    try {
      await target.querySelector<HTMLImageElement>('img')?.decode().catch(()=>undefined);
      await observatory.drawCardToHand(cardImage(card), end, card.id, reveal);
      audio.play('card-draw');
      return;
    } catch {
      reveal();
    }
  }
  const flight = document.createElement('div');
  flight.className = 'draw-flight';
  flight.setAttribute('aria-hidden', 'true');
  flight.innerHTML = `<img class="draw-face draw-back" src="${backImage}" alt="">${cardElement(card, false, 'draw-face draw-front')}`;
  Object.assign(flight.style, {
    left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px`,
  });
  document.body.append(flight);

  const dx = end.left + end.width / 2 - (start.left + start.width / 2);
  const dy = end.top + end.height / 2 - (start.top + start.height / 2);
  const scale = end.width / start.width;
  await flight.animate([
    { transform: 'translate(0, 0) scale(1) rotateY(0deg) rotateZ(0deg)', offset: 0 },
    { transform: `translate(${dx * .48}px, ${dy * .48 - 34}px) scale(${1 + (scale - 1) * .45}) rotateY(86deg) rotateZ(-6deg)`, offset: .48 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotateY(180deg) rotateZ(0deg)`, offset: 1 },
  ], { duration: 520, easing: 'cubic-bezier(.2,.76,.22,1)', fill: 'forwards' }).finished.catch(() => undefined);
  reveal();
  flight.remove();
  audio.play('card-draw');
}
function setSeat(index: number, update: Partial<PlayerConfig>): void {
  settings.seats[index] = { ...settings.seats[index], ...update };
  save(); render();
}
function startGame(round = 1): void {
  clearCpu(); selectedCard = null; locked = false; reaction = {};
  const seats = settings.seats.slice(0, settings.playerCount).map((seat, i) => ({ ...seat, name: seat.name.trim() || defaultSeats[i].name }));
  state = createGame(seats, round);
  save(); render(); scheduleCpu();
}
function finishRound(): void {
  if (!state) return;
  const humans = (online ? [state.players[online.localSeat]] : [state.players[localSeat()]]).filter(player => player?.kind === 'human');
  stats.rounds++;
  stats.exacts += humans.reduce((sum, player) => sum + player.exacts, 0);
  stats.survives += humans.filter(player => player.id !== state!.bust).length;
  stats.busts += humans.filter(player => player.id === state!.bust).length;
  stats.rating += humans.reduce((sum, player) => sum + player.ratingDelta, 0);
  save();
}
function resolveCard(cardId: string): void {
  if (!state || state.phase !== 'playing' || awaitingNetwork) return;
  const actor = state.current;
  const card = state.players[actor].hand.find(item => item.id === cardId);
  if (!card) return;
  if (online) {
    if (actor === online.localSeat) {
      stats.cards++;
      if (card.rank === '7') stats.sevens++;
      if (card.rank === '8') stats.eights++;
      if (card.rank === '9') stats.nines++;
      if (card.rank === '10') stats.tens++;
      save();
    }
    selectedCard = null; awaitingNetwork = !online.isHost || online instanceof HostedRoom; pendingLog = state.log[0];
    if (awaitingNetwork) render();
    online.play(cardId); return;
  }
  const previousLocalHand = new Set(state.players[localSeat()].hand.map(item => item.id));
  playCard(state, cardId);
  playerRing.played(actor, ['seven','reverse','zero','minus'].includes(state.event));
  const drawnForLocal = state.players[localSeat()].hand.find(item => !previousLocalHand.has(item.id));
  stats.cards++;
  if (card.rank === '7') stats.sevens++;
  if (card.rank === '8') stats.eights++;
  if (card.rank === '9') stats.nines++;
  if (card.rank === '10') stats.tens++;
  save();
  selectedCard = null;
  const ev = state.event;
  if (ev === 'exact') { flash('EXACT 100!  +3', 'exact'); react([actor], '+3'); }
  else if (ev === 'bust') { flash(`${state.players[actor].name.toUpperCase()} caused Overflow`, 'bust'); react([actor], '−5'); }
  else if (ev === 'seven') { audio.play('target'); flash('CHOOSE A PLAYER', 'seven'); react([actor], '✧'); }
  else if (ev === 'reverse') { audio.play('reverse'); flash('DIRECTION REVERSED', 'reverse'); react(state.players.map(p => p.id), '↺'); }
  else if (ev === 'zero') { audio.play('zero'); flash('+0  ·  ZERO', 'zero'); react([actor], '…'); }
  else if (ev === 'minus') { audio.play('minus'); flash('−10  ·  REWIND', 'minus'); react([actor], '−10'); }
  else audio.play('total-increase',{position:{x:0,y:1,z:-3}});
  if ((state as GameState).phase === 'ended') finishRound();
  render();
  if (drawnForLocal) void animateDrawToHand(drawnForLocal);
  if (actor !== localSeat() && (state as GameState).phase !== 'ended' && state.players[actor].hand.length === CONFIG.HAND_SIZE) animateOpponentDraw(actor);
  scheduleCpu();
}
async function animatePlay(cardId: string, source?: HTMLElement, spin?: CardSpin): Promise<void> {
  if(openingDeal)return;
  if (!state || locked || awaitingNetwork || state.phase !== 'playing' || (online && state.turn !== online.state?.turn)) return;
  locked = true; clearCpu();
  const playState = state, playTurn = state.turn;
  const card = state.players[state.current].hand.find(item => item.id === cardId);
  const throwingSeat = state.current;
  if (!card) { locked = false; return; }
  if(settings.reducedMotion){audio.play('slap');locked=false;resolveCard(cardId);return;}
  const origin = source || document.querySelector<HTMLElement>(`.seat[data-seat="${state.current}"]`) || document.querySelector<HTMLElement>('.draw-stack')!;
  let start = origin.getBoundingClientRect();
  if (observatory?.canAnimate && !settings.reducedMotion) {
    try {
      await observatory.playCardToDiscard(cardImage(card), start, spin, source?cardId:undefined,()=>{
        departingCardId=source?cardId:null;
        source?.classList.add('card-departing');
        playerRing.release(throwingSeat);
      }, async () => {
        const hand = await playerRing.prepareThrow(throwingSeat);
        if (state !== playState || state.turn !== playTurn) throw new Error('The turn changed before the card left.');
        return source ? undefined : hand;
      });
      if (state !== playState || state.turn !== playTurn) { playerRing.cancelThrow(throwingSeat); locked = false; return; }
      audio.play('slap');
      locked = false;
      resolveCard(cardId);
      return;
    } catch {
      departingCardId=null;
      source?.classList.remove('card-departing');
      playerRing.cancelThrow(throwingSeat);
      if (state !== playState || state.turn !== playTurn) { locked = false; return; }
    }
  }
  let flying: HTMLElement;
  try {
    const hand = await playerRing.prepareThrow(throwingSeat);
    if (state !== playState || state.turn !== playTurn) throw new Error('The turn changed before the card left.');
    if (!source && hand) start = hand;
  } catch { playerRing.cancelThrow(throwingSeat); locked = false; return; }
  playerRing.release(throwingSeat);
  if (source) {
    flying = source.cloneNode(true) as HTMLElement;
    flying.classList.remove('selected', 'dragging', 'waiting-hand', 'card-departing');
    flying.removeAttribute('data-card-hover');
    flying.removeAttribute('data-card-pressed');
    flying.style.cssText = '';
    source.classList.add('card-departing');
  }
  else {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = cardElement(card);
    flying = wrapper.firstElementChild as HTMLElement;
  }
  flying.classList.add('flying-card');
  Object.assign(flying.style, { position:'fixed', left:`${start.left}px`, top:`${start.top}px`, width:`${start.width || 76}px`, height:`${start.height || 108}px`, margin:'0', transform:'none' });
  document.body.append(flying);
  const target = document.querySelector<HTMLElement>('.played-slot')!.getBoundingClientRect();
  const dx = target.left + target.width / 2 - (start.left + start.width / 2);
  const dy = target.top + target.height / 2 - (start.top + start.height / 2);
  const landingScale = target.width / Math.max(1, start.width);
  const rotation=(t:number)=>spin?`rotate3d(${-spin.x},${spin.y},${-spin.z},${spin.turns*360*t}deg)`:`rotate(${Math.sin(t*Math.PI)*8}deg)`;
  const frames=Array.from({length:25},(_,i)=>{
    const t=i/24;
    return {transform:`perspective(900px) translate(${dx*t}px,${dy*t-Math.sin(t*Math.PI)*35}px) scale(${1+(landingScale-1)*t+Math.sin(t*Math.PI)*.1}) ${rotation(t)}`,offset:t};
  });
  await flying.animate(frames, { duration:spin?(spin.turns===2?720:560):410, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards' }).finished.catch(() => undefined);
  audio.play('slap'); flying.remove();
  if (state !== playState || state.turn !== playTurn) { playerRing.cancelThrow(throwingSeat); locked = false; return; }
  locked = false; resolveCard(cardId);
}
function chooseTarget(target: number): void {
  if (!state || state.phase !== 'target' || locked || awaitingNetwork || (online && state.turn !== online.state?.turn)) return;
  const chooser = state.pendingSevens.at(-1)!;
  playerRing.chosen(chooser,target);
  if (online) { awaitingNetwork = !online.isHost || online instanceof HostedRoom; pendingLog = state.log[0]; online.target(target); render(); return; }
  selectTarget(state, target);
  react([target], '✧');
  flash(`${state.players[chooser].name} chose ${state.players[target].name}`, 'seven');
  render(); scheduleCpu();
}
function scheduleCpu(): void {
  clearCpu();
  if (!state || locked || state.phase === 'ended') return;
  if (online && !online.runsCpuLocally) return;
  const actor = state.phase === 'target' ? state.pendingSevens.at(-1)! : state.current;
  if (state.players[actor].kind !== 'cpu') return;
  const delay = cpuActionDelay();
  const scheduledState = state, turn = state.turn, phase = state.phase;
  cpuTimer = window.setTimeout(() => {
    if (state !== scheduledState || state.turn !== turn || state.phase !== phase || locked || awaitingNetwork) return;
    if (state.phase === 'target') chooseTarget(chooseCpuTarget(state, settings.difficulty));
    else if (state.phase === 'playing') void animatePlay(chooseCpuCard(state, settings.difficulty).id);
  }, delay);
}
function cardElement(card: Card, selected = false, extra = ''): string {
  const face = cardFace(card);
  const special = face.special;
  const interactive = extra.includes('hand-card') && !extra.includes('waiting-hand');
  const rank = cardDisplayRank(card);
  const hand = extra.includes('hand-card');
  const handSources = hand ? ` data-standard-src="${cardImage(card)}" data-full-src="${cardImageLossless(card)}"` : '';
  const image = hand && prefersLosslessHand() ? cardImageLossless(card) : cardImage(card);
  return `<div class="playing-card suit-${face.suit} ${special ? 'special' : 'standard'} ${selected ? 'selected' : ''} ${extra}" data-card="${card.id}" role="${interactive?'button':'img'}" ${interactive?'tabindex="0"':''} aria-label="${rank} of ${card.suit}${special ? ', special card' : ''}"><img src="${image}"${handSources} alt="${rank} of ${card.suit}" draggable="false"><span class="card-print" aria-hidden="true"><span class="card-index top ${face.index.length>3?'word-index':''}" data-index="${face.index}">${face.index}</span>${special ? `<span class="card-action"><strong>${face.title}</strong><small>${face.detail}</small></span>` : ''}<span class="card-index bottom ${face.index.length>3?'word-index':''}" data-index="${face.index}">${face.index}</span></span></div>`;
}
function setupView(): string {
  return `<main class="setup-page">
    <div class="setup-hero"><div class="brand-mark"><span class="crown">♛</span><strong>100</strong></div><div class="eyebrow">THE CARD GAME</div><h1>Simple numbers.<br><em>Big reactions.</em></h1><p>Look at your two cards. Make your move. Don't be the one who goes over 100.</p><div class="hero-cards">${cardElement({id:'fire-7',suit:'fire',rank:'7'},false,'hero-card one')}${cardElement({id:'water-8',suit:'water',rank:'8'},false,'hero-card two')}${cardElement({id:'sun-10',suit:'sun',rank:'10'},false,'hero-card three')}</div><div class="hero-footer">PLAY. BLUFF. SURVIVE.</div></div>
    <section class="setup-panel"><div class="panel-top"><span class="eyebrow">GATHER ROUND</span><div class="top-links"><button data-action="rules">How to play</button><button data-action="stats">Stats</button><button data-action="settings">⚙ Settings</button></div></div><h2>Set the table</h2><p class="muted">Choose 2–8 players. Any seat can be Human or CPU.</p>
      ${isNextVersion ? `<label class="cast-choice">CHARACTERS<select id="character-cast"><option value="observatory" ${!trialCast&&!masterCast?'selected':''}>Observatory</option><option value="finn-june" ${trialCast?'selected':''}>Finn &amp; June</option><option value="midnight-eight" ${masterCast?'selected':''}>Midnight Social Club · All 8</option></select></label>` : ''}
      <div class="setup-controls"><label>PLAYERS<select id="player-count">${Array.from({length:7},(_,i)=>`<option value="${i+2}" ${settings.playerCount===i+2?'selected':''}>${i+2} players${i+2===4?' · recommended':''}</option>`).join('')}</select></label><label>CPU DIFFICULTY<select id="difficulty"><option value="easy" ${settings.difficulty==='easy'?'selected':''}>Easy</option><option value="normal" ${settings.difficulty==='normal'?'selected':''}>Normal</option></select></label></div>
      <div class="seat-editor">${settings.seats.slice(0,settings.playerCount).map((seat,i)=>`<div class="seat-row"><div class="seat-number">${String(i+1).padStart(2,'0')}</div><div class="avatar-tiny"><img src="${avatarImage(seat.avatar)}" alt=""></div><input aria-label="Player ${i+1} name" data-seat-name="${i}" maxlength="15" value="${escapeHtml(seat.name)}"><select aria-label="Player ${i+1} type" data-seat-kind="${i}"><option value="human" ${seat.kind==='human'?'selected':''}>Human</option><option value="cpu" ${seat.kind==='cpu'?'selected':''}>CPU</option></select><select aria-label="Player ${i+1} avatar" data-seat-avatar="${i}">${avatarNames.map((name,v)=>`<option value="${v}" ${seat.avatar===v?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select><select aria-label="Player ${i+1} mood" data-seat-mood="${i}">${MOODS.map(m=>`<option ${seat.mood===m?'selected':''}>${m}</option>`).join('')}</select></div>`).join('')}</div>
      <button class="primary-button start-button" data-action="start">START LOCAL GAME <span>➜</span></button><button class="secondary-button online-entry" data-action="online-setup">PLAY ONLINE WITH FRIENDS</button><p class="setup-note">Local: pass one device · Online: share a room link, one Human per device</p>
    </section></main>`;
}
function avatarPicker(): string {
  return `<div class="avatar-picker" role="group" aria-label="Choose a character">${avatarNames.map((name, index) => `<button class="avatar-choice ${settings.seats[0].avatar === index ? 'chosen' : ''}" data-avatar-choice="${index}" aria-label="${escapeHtml(name)}" aria-pressed="${settings.seats[0].avatar === index}"><img src="${avatarImage(index)}" alt=""><span>${escapeHtml(name)}</span></button>`).join('')}</div>`;
}
function onlineView(): string {
  return `<main class="online-page"><section class="online-panel"><div class="brand-mark"><span class="crown">♛</span><strong>100</strong></div><div class="eyebrow">PLAY TOGETHER</div><h1>Online table</h1><p>Each friend plays from their own browser. Share a room link to play together.</p><div class="online-tabs"><button class="${onlineMode === 'host' ? 'current' : ''}" data-action="host-tab">Create room</button><button class="${onlineMode === 'join' ? 'current' : ''}" data-action="join-tab">Join room</button></div><label class="online-field">YOUR NAME<input id="online-name" maxlength="15" value="${escapeHtml(settings.seats[0].name)}"></label><div class="online-avatar-heading">YOUR CHARACTER <span>${escapeHtml(avatarNames[settings.seats[0].avatar % avatarNames.length])}</span></div>${avatarPicker()}${onlineMode === 'join' ? `<label class="online-field">ROOM CODE OR INVITE LINK<input id="room-code" autocomplete="off" value="${escapeHtml(joinCode)}" placeholder="100-abc123…"></label>` : ''}<button class="primary-button start-button" data-action="${onlineMode === 'join' ? 'join-room' : 'create-room'}">${onlineMode === 'join' ? 'JOIN ROOM' : 'CREATE ROOM'} ➜</button><button class="text-button" data-action="back-setup">Back to local setup</button></section></main>`;
}
function lobbyView(): string {
  if (!online) return onlineView();
  const invite = `${location.origin}${castPath(online.roomId)}`;
  return `<main class="online-page"><section class="online-panel"><div class="eyebrow">${online.isHost ? 'YOUR ROOM' : 'JOINING A ROOM'}</div><h1>${online.status === 'disconnected' ? 'Connection ended' : online.status === 'connecting' ? 'Connecting…' : 'Gather your players'}</h1><p role="status">${online.error ? escapeHtml(online.error) : online.isHost ? 'Share this link. Each friend joins from a separate browser.' : 'Waiting for the host to start the round.'}</p>${online.isHost && online.status === 'lobby' ? `<div class="invite-box"><input readonly aria-label="Invite link" value="${escapeHtml(invite)}"><button data-action="copy-invite">COPY LINK</button></div>` : ''}<div class="lobby-seats">${online.seats.map((seat,i)=>`<div><img src="${avatarImage(seat.avatar)}" alt=""><strong>${escapeHtml(seat.name)}${i === online!.localSeat ? ' · You' : ''}</strong><span>${seat.kind === 'cpu' ? 'CPU' : i === online!.hostSeat ? 'Host' : 'Online'}</span></div>`).join('')}</div>${online.isHost && online.status === 'lobby' ? `<label class="online-field">CPU PLAYERS <select id="room-cpus">${Array.from({length:Math.max(0,9-online.seats.filter(s=>s.kind==='human').length)},(_,i)=>`<option value="${i}" ${online!.cpuCount===i?'selected':''}>${i}</option>`).join('')}</select></label><button class="primary-button start-button" data-action="start-online" ${online.seats.length<2?'disabled':''}>START ONLINE ROUND ➜</button><p class="setup-note">${online.seats.length}/8 seats · At least two players needed</p>` : ''}${online.status === 'disconnected' ? `<button class="primary-button start-button" data-action="retry-room">${online instanceof HostedRoom ? 'RECONNECT TO ROOM' : online.isHost ? 'CREATE NEW ROOM' : 'TRY JOINING AGAIN'} ➜</button>` : ''}<button class="text-button" data-action="leave-room">Leave room</button></section></main>`;
}
function seatHtml(player: GameState['players'][number], index: number, count: number): string {
  if (!state) return '';
  const x = (index + .5) / count * 100, y = 30;
  const active = state.phase !== 'ended' && (state.phase === 'target' ? state.pendingSevens.at(-1) === index : state.current === index);
  const targetable = state.phase === 'target' && canControlActor() && index !== state.pendingSevens.at(-1);
  const suit = ['fire','water','leaf','sun'][index%4] as keyof typeof suitSymbols;
  return `<button class="seat sprite-seat ${index===localSeat()?'local-seat':''} ${masterCast?'traditional-seat master-seat':trialCast?'traditional-seat':''} ${active?'active':''} ${targetable?'targetable':''} ${reaction[index]?'reacting':''} suit-${suit}" data-seat="${index}" ${masterCast?`data-traditional="${masterCharacter(player.avatar).id}"`:trialCast?`data-traditional="${trialCharacter(player.avatar)}"`:''} data-mood="${player.mood}" style="--seat-x:${x}%;--seat-y:${y}%;--seat-index:${index}" ${targetable?'data-target="'+index+'"':''} aria-label="${escapeHtml(player.name)}, ${player.kind}, ${player.hand.length} cards"><span class="reaction-bubble">${reaction[index]||''}</span>${masterCast?`<span class="character"><canvas class="traditional-sprite" data-character="${masterCharacter(player.avatar).id}" data-sprite-set="simple-v2" width="512" height="512" aria-hidden="true"></canvas><img class="master-sprite sprite-fallback simple-fallback" src="${import.meta.env.BASE_URL}assets/social-club/simple-v2/${masterCharacter(player.avatar).id}-rest.webp" alt="" loading="lazy" decoding="async"></span>`:trialCast?`<span class="character"><canvas class="traditional-sprite" data-character="${trialCharacter(player.avatar)}" width="512" height="512" aria-hidden="true"></canvas><img class="sprite-fallback" src="${avatarImage(player.avatar)}" alt="" loading="lazy"><span class="sprite-hand-anchor" aria-hidden="true"></span>`:`<span class="character"><span class="character-sprite" data-avatar="${player.avatar}" data-sprite-url="${characterSheet(player.avatar)}" style="background-image:url('${characterSheet(player.avatar)}')" aria-hidden="true"></span><img class="sprite-fallback" src="${avatarImage(player.avatar)}" alt="" loading="lazy"><span class="character-tumble" data-tumble-url="${tumbleSheet(player.avatar)}" aria-hidden="true"></span><span class="sprite-hand-anchor" aria-hidden="true"></span>`}</span><span class="seat-info"><span class="seat-name">${escapeHtml(player.name)} <span class="seat-count" aria-hidden="true">${player.hand.length}</span></span><span class="seat-meta">★ ${player.ratingDelta>=0?'+':''}${player.ratingDelta} · ${index===localSeat()?'YOU':player.kind==='cpu'?'CPU':'PLAYER'}</span>${state.phase==='ended'?`<span class="seat-score ${player.ratingDelta<0?'negative':''}">${player.ratingDelta>=0?'+':''}${player.ratingDelta}</span>`:''}</span></button>`;
}
function gameLogLine(item: string): string {
  const playerIndex = state?.players.findIndex(player => item.startsWith(`${player.name} `)) ?? -1;
  const suit = playerIndex < 0 ? 'sun' : ['fire','water','leaf','sun'][playerIndex % 4];
  return `<li><span class="log-suit suit-${suit}" aria-hidden="true">${suitSymbols[suit as keyof typeof suitSymbols]}</span><span>${escapeHtml(item.replace(/busted/gi,'caused Overflow').replace(/busts/gi,'causes Overflow'))}</span></li>`;
}
function gameView(): string {
  if (!state) return '';
  const top = state.played.at(-1);
  const actor = state.phase === 'target' ? state.pendingSevens.at(-1)! : state.current;
  const active = state.players[actor];
  const mine = state.players[localSeat()];
  const myTurn = state.phase !== 'ended' && !awaitingNetwork && active.kind === 'human' && actor === localSeat();
  const otherLocalTurn = state.phase !== 'ended' && !online && active.kind === 'human' && actor !== localSeat();
  const hand = state.phase !== 'ended' && mine?.kind === 'human' ? mine.hand : [];
  const totalStyle = totalClass(presentedTotal.visible.total);

  return `<main class="game-page" data-event="${state.event}" data-phase="${state.phase}"><header class="game-header"><div class="game-logo"><span class="game-crown">♛</span><strong>100</strong><small>SIMPLE NUMBERS.<br>BIG REACTIONS.</small></div><div class="match-plaque"><span class="plaque-crown">♛</span><div><strong>100 <span>OBSERVATORY</span></strong><small>${online?'Private online table':'Local table'} · Round ${state.round}</small></div></div><div class="header-wallet" aria-label="Player rewards"><span class="wallet-pill"><b>★</b>${stats.currency.toLocaleString()}</span><span class="wallet-pill gem"><b>◆</b>${stats.rating.toLocaleString()}</span></div><div class="header-status"><span class="round-pill">Round ${state.round}</span><span class="turn-pill">${state.phase==='ended'?'Round scores':`${actor===localSeat()?'Your':escapeHtml(active.name)+'’s'} ${state.phase==='target'?'choice':'turn'}`}</span></div><div class="header-actions"><button data-action="history" aria-label="Game history">▤</button><button data-action="settings" aria-label="Settings">⚙</button><button data-action="menu" aria-label="Menu">☰</button></div></header>${online?.error ? `<div class="online-alert" role="status">${escapeHtml(online.error)}</div>` : ''}
    <div class="game-layout"><section class="arena" aria-label="Game table"><div class="table-rim"><div class="table-felt"><div class="energy-system ${totalStyle}"><div class="total-wrap ${totalStyle}"><span class="total-caption">SHARED TOTAL</span><div class="total-number" role="status" aria-live="polite" aria-label="Shared total">${totalMarkup(presentedTotal.visible.total)}</div><div class="total-event">${presentedTotal.visible.caption}</div><div class="ring-direction" aria-label="${state.direction===1?'Clockwise':'Counterclockwise'} turn order">${state.direction===1?'› · › · ›':'‹ · ‹ · ‹'}</div></div></div><div class="table-cards"><div class="pile-wrap"><div class="draw-stack"><div class="playing-card card-back" role="img" aria-label="Draw pile"><img src="${backImage}" alt="Draw pile" draggable="false"></div></div></div><div class="pile-wrap"><div class="played-slot">${top?cardElement(top,false,'last-card'):'<span class="empty-slot">PLAY HERE</span>'}</div></div></div></div></div>
      <div class="seat-layer player-ring" aria-label="Players around the table" style="--player-count:${state.players.length}">${state.players.map((player,i)=>seatHtml(player,i,state!.players.length)).join('')}</div>
      <nav class="ring-controls" aria-label="Browse players"><button data-ring-step="-1" aria-label="Previous players" ${state.players.length<=4?'hidden':''}>‹</button><div class="ring-markers">${state.players.map((player,i)=>`<button data-ring-focus="${i}" class="ring-marker ${i===actor?'current':''} ${state!.phase==='target'&&canControlActor()&&i!==actor?'eligible':''}" aria-label="Show ${escapeHtml(player.name)}${i===actor?', active player':''}" title="${escapeHtml(player.name)}">${i+1}</button>`).join('')}</div><button data-ring-step="1" aria-label="Next players" ${state.players.length<=4?'hidden':''}>›</button></nav>
      ${state.phase==='target'&&canControlActor()?'<div class="target-hint">Tap a highlighted player · Use the seat markers to browse</div>':''}
    </section><aside class="side-panel"><div class="side-card"><div class="eyebrow">AT THE TABLE</div><h3>${state.phase==='target'?'Choosing a target: ':state.forced?'Forced play: ':'Now playing: '}${escapeHtml(active.name)}</h3></div><div class="side-card log-card"><div class="card-heading"><h3>Game Log</h3><span>RECENT MOVES</span></div><ul>${state.log.slice(0,7).map(gameLogLine).join('')}</ul></div></aside></div>
    ${otherLocalTurn ? `<div class="shared-turn" role="region" aria-label="${escapeHtml(active.name)}'s local turn"><strong>Pass the device to ${escapeHtml(active.name)}</strong><span>${state.phase === 'target' ? 'Tap a highlighted player at the table.' : 'Double-tap a card or flick it toward the table.'}</span><div class="shared-hand">${state.phase === 'playing' ? active.hand.map(card=>cardElement(card,selectedCard===card.id,'hand-card')).join('') : ''}</div></div>` : ''}
    <footer class="hand-dock"><div class="dock-prompt ${myTurn?'my-turn':''}">${myTurn?'<span class="your-turn-bubble">YOUR TURN</span>':''}<img class="dock-avatar" src="${avatarImage(mine?.avatar ?? 0)}" alt=""><div class="dock-person"><span class="eyebrow">${mine?.kind==='human'?'YOUR SEAT':'SPECTATOR'}</span><strong>${escapeHtml(mine?.name || 'Player')}</strong><small>${mine ? `${mine.ratingDelta>=0?'+':''}${mine.ratingDelta} · Round score` : 'Watching'}</small></div></div><div class="local-hand">${hand.length?hand.map(card=>cardElement(card,selectedCard===card.id,`hand-card ${myTurn ? '' : 'waiting-hand'}`)).join(''):`<div class="waiting-cards"><img src="${backImage}" alt="face-down card"><img src="${backImage}" alt="face-down card"></div>`}</div><div class="dock-controls"><small class="dock-hint">${myTurn ? state.phase === 'target' ? 'Choose a highlighted player.' : 'Double-tap a card or flick it upward' : awaitingNetwork ? 'Confirming your move…' : `${escapeHtml(active.name)} is ${state.phase==='target'?'choosing a player':'playing'}…`}</small></div><div class="emote-menu ${emotesOpen?'open':''}"><button class="emote-trigger" data-action="emotes" aria-label="Choose emote" aria-expanded="${emotesOpen}">☺<small>EMOTE</small></button><div class="emote-wheel" aria-label="Emotes" ${emotesOpen?'':'inert aria-hidden="true"'}>${(['Happy','Excited','Confused','Angry','Sad','Smug','Scared','Thinking'] as const).map(m=>`<button data-emote="${m}" title="${m}" aria-label="${m}">${moodSymbols[m]}</button>`).join('')}</div></div><button class="info-fab" data-action="rules" aria-label="Game information">i<small>INFO</small></button><div class="dock-quote">GOOD PEOPLE.<br>RISKY DECISIONS.</div></footer>
    ${state.phase==='ended'&&!presentedTotal.pending&&playerRing.scoresReady(gameRoundKey())?resultView():''}</main>`;
}
function resultView(): string {
  if (!state) return '';
  return scoreTransition(state,!online||online.isHost,!!online,escapeHtml);
}
function modalView(): string {
  if (!modal) return '';
  const body = modal==='rules' ? `<h2>How to play</h2><p>Keep the shared total at or below 100. Play one of your two cards every turn, then draw a replacement. The player who takes the total over 100 causes Overflow; everyone else survives.</p><div class="rules-grid"><div><strong>1–6</strong><span>Add face value</span></div><div><strong>10</strong><span>Add 10</span></div><div><strong>CHOOSE PLAYER</strong><span>Make another player play now. They cannot play twice in a row.</span></div><div><strong>REVERSE</strong><span>Reverse direction. Then pass the turn to the next player.</span></div><div><strong>ZERO</strong><span>Add nothing.</span></div><div><strong>MINUS TEN</strong><span>Subtract 10.</span></div></div><p>Hit exactly 100 for +3 rating; play continues. Survive for +1. Overflow for −5. Suits are visual only.</p><p><strong>Controls:</strong> drag or flick a card toward the center. On touch screens, swipe it. Double-tap or double-click a card to play it. Flick the right edge left or the left edge right to flip it. Flick upward from the top edge or double-tap the top edge for a somersault. Corners tumble diagonally; slow sideways drags stay in your hand.</p>`
  : modal==='settings' ? `<h2>Table settings</h2><div class="modal-setting"><label for="graphics">Visual quality</label><select id="graphics">${(['ultra','high','medium','mobile'] as const).map(tier=>`<option value="${tier}" ${settings.graphics===tier?'selected':''}>${tier==='mobile'?'Lite / Mobile':tier.charAt(0).toUpperCase()+tier.slice(1)}</option>`).join('')}</select><small>Ultra adds richer shadows, reflections and glow. Mobile keeps the same world with lighter effects.</small></div>${[['volume','Master volume',settings.volume],['sfxVolume','Sound effects',settings.sfxVolume],['musicVolume','Music',settings.musicVolume],['ambienceVolume','Ambience',settings.ambienceVolume]].map(([id,label,value])=>`<div class="modal-setting"><label for="${id}">${label}<output for="${id}">${Math.round(Number(value)*100)}%</output></label><input id="${id}" type="range" min="0" max="1" step=".01" value="${value}"></div>`).join('')}<label class="setting-toggle"><input id="muted" type="checkbox" ${settings.muted?'checked':''}>Mute all sounds</label><label class="setting-toggle"><input id="reducedMotion" type="checkbox" ${settings.reducedMotion?'checked':''}>Reduced motion</label><div class="modal-setting gyro-setting"><label>Phone tilt</label><button class="secondary-button" data-action="gyro-enable" ${!gyro.available || settings.reducedMotion ? 'disabled' : ''}>${gyro.status === 'on' ? 'Recenter phone tilt' : gyro.status === 'waiting' ? 'Waiting for motion…' : 'Enable phone tilt'}</button><small id="gyro-status">${settings.reducedMotion ? 'Turn off Reduced motion to use phone tilt.' : gyro.status === 'on' ? 'Move your phone gently to tilt the cards. Dragging a card takes control.' : gyro.status === 'denied' ? 'Motion access was denied. You can still drag cards to tilt them.' : gyro.available ? 'Available on supported phones.' : 'Motion sensors are unavailable in this browser.'}</small></div><div class="modal-setting"><label for="uiScale">Interface size <output for="uiScale">${Math.round(settings.uiScale*100)}%</output></label><input id="uiScale" type="range" min=".85" max="1.2" step=".05" value="${settings.uiScale}"></div><p>Settings save on this device.</p>`
  : modal==='stats' ? `<h2>Local statistics</h2><div class="stats-grid">${[['Rounds',stats.rounds],['Exact 100s',stats.exacts],['Survivals',stats.survives],['Overflows',stats.busts],['Cards played',stats.cards],['Choose Player',stats.sevens],['Reverse',stats.eights],['Zero',stats.nines],['Minus Ten',stats.tens],['Test rating',stats.rating],['Currency',stats.currency]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><p>Statistics, rating, and currency are local to this device. Currency does not affect gameplay.</p>`
  : modal==='history' ? `<h2>Game history</h2><p>Recent moves at this table.</p><ul class="history-list">${state?.log.length ? state.log.map(gameLogLine).join('') : '<li>No cards have been played yet.</li>'}</ul>`
  : `<h2>Game menu</h2><p>Round ${state?.round || 1} · ${state?.players.length || settings.playerCount} players</p><div class="menu-actions">${!online || (online.isHost && !(online instanceof HostedRoom)) ? '<button class="secondary-button" data-action="restart">Restart round</button>' : ''}<button class="secondary-button" data-action="${online?'leave-room':'new-game'}">${online?'Leave online room':'Return to setup'}</button><button class="secondary-button" data-action="settings">Sound & display</button><button class="secondary-button" data-action="history">Table activity</button><button class="secondary-button" data-action="stats">Local statistics</button></div>`;
  return `<div class="overlay modal-overlay" data-action="close-modal"><section class="modal-panel" role="dialog" aria-modal="true"><button class="close-button" data-action="close-modal" aria-label="Close">×</button>${body}</section></div>`;
}
let presentedRound='';
let openingDeal=false;
let dealEpoch=0;
async function dealOpeningHand(snapshot:GameState):Promise<void>{
  const epoch=++dealEpoch;
  openingDeal=true;clearCpu();
  const hand=snapshot.players[localSeat()]?.hand??[];
  document.querySelectorAll('.local-hand .hand-card').forEach(card=>card.classList.add('receiving-card'));
  try {
    for(const card of hand){if(state!==snapshot)break;await animateDrawToHand(card);}
  } finally {
    if(epoch===dealEpoch){
      openingDeal=false;
      document.querySelectorAll('.local-hand .receiving-card').forEach(card=>card.classList.remove('receiving-card'));
      scheduleCpu();
    }
  }
}
function syncPlayerRing(): void {
  const active = !!state && (!online || online.status === 'playing');
  playerRing.sync({ roundKey: active ? `${state!.round}:${state!.players.map(player=>player.name).join(':')}` : '', count: active ? state!.players.length : 0, active: state?.phase === 'target' ? state.pendingSevens.at(-1)! : state?.current ?? 0, total: presentedTotal.visible.total, overflow: active && presentedTotal.visible.total > 100, overflowSeat: state?.bust ?? undefined, reducedMotion: settings.reducedMotion, target: state?.phase === 'target' });
}
function render(): void {
  const discard = state?.played.at(-1);
  const playKey = state&&discard?`${state.round}:${discard.id}:${state.played.length}`:'';
  const active = !!state && (!online || online.status === 'playing');
  presentedTotal.sync(active?`${state!.round}:${state!.players.map(player=>player.name).join(':')}`:'', playKey, {
    total: state?.total ?? 0,
    caption: !state?'':state.total>100?'OVERFLOW':state.event==='exact'?'EXACT 100 · +3':state.event==='zero'?'ZERO · TOTAL HELD':state.event==='minus'?'−10':state.phase==='target'?'CHOOSE A PLAYER':'',
  }, !!observatory?.canAnimate && !settings.reducedMotion);
  updateGameView(app, (online && online.status !== 'playing' ? lobbyView() : state ? gameView() : onlineMode ? onlineView() : setupView()) + modalView());
  syncPlayerRing();
  // Use the held score during the wave, and the immediate score in motion/HTML fallback.
  audio.setPresentedTotal(active?presentedTotal.visible.total:null);
  if(!locked&&!awaitingNetwork)departingCardId=null;
  for(const element of Array.from(document.querySelectorAll<HTMLElement>('.local-hand .hand-card'))){
    if(element.dataset.card===departingCardId)element.classList.add('card-departing');
    if(receivingCardIds.has(element.dataset.card!))element.classList.add('receiving-card');
  }
  observatory?.update({
    roundEnded: state?.phase === 'ended',
    pendingPlay: locked || awaitingNetwork || remoteFlight,
    playKey,
    totalPending: presentedTotal.pending,
    active: !!state && (!online || online.status === 'playing'),
    total: state?.total ?? 0,
    direction: state?.direction ?? 1,
    event: state?.event ?? 'none',
    eventKey: state ? `${state.round}:${state.log[0]}` : '',
    activeSeat: state?.phase==='target'?state.pendingSevens.at(-1):state?.current??0,
    drawCount: state?.drawPile.length??0,
    discardCount: state?.played.length??0,
    playerCount: state?.players.length ?? 0,
    localSeat: state ? localSeat() : 0,
    drawCardUrl: backImage,
    discardCardUrl: discard ? cardImage(discard) : undefined,
    discardCards: state?.played.map(cardImage)??[],
  });
  const roundKey=state?`${state.round}:${state.players.map(player=>player.name).join(':')}`:'';
  if(roundKey!==presentedRound){
    presentedRound=roundKey;
    ++dealEpoch;openingDeal=false;
    if(state&&state.phase!=='ended'&&!settings.reducedMotion&&(!online||online.status==='playing')){
      const snapshot=state;requestAnimationFrame(()=>{if(state===snapshot)void dealOpeningHand(snapshot);});
    }
  }
  if (remoteSnapshots.length && !presentedTotal.pending && !remoteFlight) queueMicrotask(() => roomChanged());
}
render();
if(masterCast&&!onlineMode&&new URLSearchParams(location.search).get('play')==='1')startGame();
if (isHostedVersion && onlineMode === 'join' && /^100-[a-z0-9]{12}$/.test(joinCode) && localStorage.getItem(`100game:room:${joinCode}`)) connectOnline('join');

app.addEventListener('click', event => {
  const target = event.target as HTMLElement;
  const ringStep = target.closest<HTMLElement>('[data-ring-step]');
  if (ringStep) { playerRing.browse(Number(ringStep.dataset.ringStep)); return; }
  const ringFocus = target.closest<HTMLElement>('[data-ring-focus]');
  if (ringFocus) { playerRing.show(Number(ringFocus.dataset.ringFocus)); return; }
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action) {
    if (action === 'close-modal' && target.closest('.modal-panel') && !target.closest('.close-button')) return;
    audio.play('click');
    if (action === 'start') startGame();
    if (action === 'online-setup') { onlineMode = 'host'; render(); }
    if (action === 'host-tab' || action === 'join-tab') { onlineMode = action === 'host-tab' ? 'host' : 'join'; render(); }
    if (action === 'back-setup') { onlineMode = null; history.replaceState(null, '', castPath()); render(); }
    if (action === 'create-room' || action === 'join-room') connectOnline(action === 'create-room' ? 'host' : 'join');
    if (action === 'retry-room' && online) { if (online instanceof HostedRoom) online.retry(); else connectOnline(online.isHost ? 'host' : 'join'); }
    if (action === 'start-online') online?.startRound();
    if (action === 'leave-room') { modal = null; closeOnline(); }
    if (action === 'copy-invite' && online) void navigator.clipboard.writeText(`${location.origin}${castPath(online.roomId)}`).then(()=>flash('Invite link copied')).catch(()=>flash('Select and copy the invite link.'));
    if (action === 'again' && state) { modal = null; if (online) online.startRound(state.round + 1); else startGame(state.round + 1); }
    if (action === 'restart' && state) { modal = null; if (online) online.startRound(state.round); else startGame(state.round); }
    if (action === 'new-game') { clearCpu(); state = null; selectedCard = null; render(); }
    if (action === 'rules' || action === 'settings' || action === 'stats' || action === 'history') { modal = action; emotesOpen = false; render(); }
    if (action === 'menu') { modal = 'menu'; render(); }
    if (action === 'emotes') { if(emoteHeld){emoteHeld=false;}else{emotesOpen = !emotesOpen; render();} }
    if (action === 'close-modal') { modal = null; render(); }
    if (action === 'gyro-enable') {
      if (gyro.status === 'on') gyro.recenter();
      else void gyro.enable();
    }
    return;
  }
  const emote = target.closest<HTMLElement>('[data-emote]')?.dataset.emote as PlayerConfig['mood'] | undefined;
  if (emote && state) {
    const seat = localSeat();
    audio.play('emote');
    emotesOpen = false;
    if (online) online.setMood(seat, emote);
    else { state.players[seat].mood = emote; settings.seats[seat].mood = emote; save(); render(); }
    react([seat], moodSymbols[emote]);
    return;
  }
  const seat = target.closest<HTMLElement>('[data-target]');
  if (seat?.dataset.target) { chooseTarget(Number(seat.dataset.target)); return; }
  const avatar = target.closest<HTMLElement>('[data-avatar-choice]');
  if (avatar?.dataset.avatarChoice) { settings.seats[0].avatar = Number(avatar.dataset.avatarChoice); save(); render(); }
});
app.addEventListener('change', event => {
  const el = event.target as HTMLInputElement | HTMLSelectElement;
  if(el.id==='character-cast'&&isNextVersion){
    trialCast=el.value==='finn-june';masterCast=el.value==='midnight-eight';avatarNames=masterCast?masterNames:trialCast?['Finn','June']:observatoryAvatarNames;
    if(masterCast)useMasterSeats(true);
    if(trialCast){settings.playerCount=2;settings.seats[0]={...settings.seats[0],name:'Finn',avatar:0,kind:'human',mood:'Normal'};settings.seats[1]={...settings.seats[1],name:'June',avatar:1,kind:'cpu',mood:'Normal'};}
    history.replaceState(null,'',castPath());save();render();return;
  }
  if (el.id === 'player-count') { settings.playerCount = Number(el.value); save(); render(); }
  if (el.id === 'difficulty') { settings.difficulty = el.value as Settings['difficulty']; save(); }
  if (el.id === 'room-cpus') { roomCpuCount = Number(el.value); online?.setCpuCount(roomCpuCount); }
  if (el.id === 'room-code') joinCode = el.value;
  if (el.id === 'online-name') { settings.seats[0].name = el.value.trim().slice(0,15); save(); }
  if (el.dataset.seatKind) setSeat(Number(el.dataset.seatKind), { kind: el.value as PlayerConfig['kind'] });
  if (el.dataset.seatAvatar) setSeat(Number(el.dataset.seatAvatar), { avatar: Number(el.value) });
  if (el.dataset.seatMood) setSeat(Number(el.dataset.seatMood), { mood: el.value as PlayerConfig['mood'] });
  if (el.dataset.seatName) setSeat(Number(el.dataset.seatName), { name: el.value });
  if (el.id === 'live-mood' && state) { const seat = localSeat(); if (online) online.setMood(seat, el.value as PlayerConfig['mood']); else { state.players[seat].mood = el.value as PlayerConfig['mood']; settings.seats[seat].mood = el.value as PlayerConfig['mood']; save(); render(); } }
  if (el.id === 'graphics') { settings.graphics = el.value as Settings['graphics']; save(); }
  if (el.id === 'muted' || el.id === 'reducedMotion') { settings[el.id]=(el as HTMLInputElement).checked;save(); if (el.id === 'reducedMotion') render(); }
});
app.addEventListener('input', event => {
  const el = event.target as HTMLInputElement;
  if (el.id === 'room-code') joinCode = el.value;
  if (['volume','sfxVolume','musicVolume','ambienceVolume','uiScale'].includes(el.id)) { const key=el.id as 'volume'|'sfxVolume'|'musicVolume'|'ambienceVolume'|'uiScale';settings[key]=Number(el.value);save();const output=document.querySelector(`output[for="${el.id}"]`);if(output)output.textContent=`${Math.round(Number(el.value)*100)}%`; }
});
app.addEventListener('keydown', event => {
  audio.unlock(); void audio.loadCardClips();
  const target = event.target as HTMLElement;
  if ((event.key === 'Enter'||event.key===' ') && target.matches('.hand-card:not(.waiting-hand)') && canControlActor()) { event.preventDefault();void animatePlay(target.dataset.card!, target); }
  if (event.key === 'Escape' && modal) { modal = null; render(); }
});

type CardDrag = {element:HTMLElement;id:string;x:number;y:number;time:number;lastX:number;lastY:number;lastTime:number;vx:number;vy:number;moved:boolean;inspecting:boolean;grip:CardGrip;pointerId:number;holdTimer:number;baseTransform:string};
let drag:CardDrag|null=null;
let lastCardTap:CardTap|null=null;
let lastHover='';
app.addEventListener('pointerover',event=>{
  const card=(event.target as HTMLElement).closest<HTMLElement>('.hand-card');
  if(card && card.dataset.card!==lastHover && !card.classList.contains('waiting-hand')){lastHover=card.dataset.card!;audio.play('card-hover');}
});
app.addEventListener('pointerdown',event=>{
  audio.unlock();
  void audio.loadCardClips();
  if((event.target as HTMLElement).closest('[data-action="emotes"]')){emoteHeld=false;emoteHoldTimer=window.setTimeout(()=>{emoteHeld=true;emotesOpen=true;render();},350);}
  const card=(event.target as HTMLElement).closest<HTMLElement>('.hand-card');
  if(openingDeal||!card||card.classList.contains('waiting-hand')||!state||locked||awaitingNetwork||drag||event.button!==0)return;
  const now=performance.now();
  const current:CardDrag={element:card,id:card.dataset.card!,x:event.clientX,y:event.clientY,time:now,lastX:event.clientX,lastY:event.clientY,lastTime:now,vx:0,vy:0,moved:false,inspecting:false,grip:cardGrip(card.getBoundingClientRect(),event.clientX,event.clientY),pointerId:event.pointerId,holdTimer:0,baseTransform:getComputedStyle(card).transform};
  current.holdTimer=window.setTimeout(()=>{if(drag!==current||current.moved)return;current.inspecting=true;card.classList.add('inspecting');card.classList.remove('dragging');},380);
  drag=current;card.setPointerCapture(event.pointerId);audio.play('pickup');
});
app.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y,now=performance.now();
  if(Math.hypot(dx,dy)>8){drag.moved=true;clearTimeout(drag.holdTimer);drag.inspecting=false;drag.element.classList.remove('inspecting');drag.element.classList.add('dragging');}
  if(!drag.moved)return;
  const elapsed=Math.max(8,now-drag.lastTime);drag.vx=(event.clientX-drag.lastX)/elapsed;drag.vy=(event.clientY-drag.lastY)/elapsed;
  const tx=settings.reducedMotion?0:Math.max(-17,Math.min(17,-dy*.07+drag.vy*-3));
  const ty=settings.reducedMotion?0:Math.max(-20,Math.min(20,dx*.07+drag.vx*3));
  const turn=settings.reducedMotion?0:Math.max(-9,Math.min(9,dx*.025));
  drag.element.dataset.tiltX=String(tx*Math.PI/180);drag.element.dataset.tiltY=String(ty*Math.PI/180);drag.element.dataset.turn=String(turn*Math.PI/180);
  drag.element.classList.toggle('flick-ready',isPlayGesture({dx,dy,duration:now-drag.time,canceled:false,inspecting:false,canPlay:canControlActor(),grip:drag.grip,releaseVX:drag.vx}));
  const crispTilt=document.documentElement.classList.contains('crisp-mobile-hand') ? ` rotateX(${-tx}deg) rotateY(${-ty}deg) rotateZ(${-turn}deg)` : '';
  drag.element.style.transform=`translate3d(${dx}px,${dy}px,24px) ${drag.baseTransform==='none'?'':drag.baseTransform}${crispTilt}`;
  drag.lastX=event.clientX;drag.lastY=event.clientY;drag.lastTime=now;
});
function endDrag(event:PointerEvent):void{
  clearTimeout(emoteHoldTimer);
  if(!drag||event.pointerId!==drag.pointerId)return;
  const current=drag;drag=null;clearTimeout(current.holdTimer);
  const dx=event.clientX-current.x,dy=event.clientY-current.y,dist=Math.hypot(dx,dy);
  const canceled=event.type==='pointercancel'||!current.element.isConnected;
  const releasedAt=performance.now();
  const freshVelocity=releasedAt-current.lastTime<100;
  const vx=freshVelocity?current.vx:0,vy=freshVelocity?current.vy:0;
  const shouldPlay=isPlayGesture({dx,dy,duration:releasedAt-current.time,canceled,inspecting:current.inspecting,canPlay:canControlActor()&&state?.phase==='playing',grip:current.grip,releaseVX:vx});
  if(current.element.hasPointerCapture(event.pointerId))current.element.releasePointerCapture(event.pointerId);
  current.element.classList.remove('dragging','flick-ready','inspecting');
  if(shouldPlay){
    lastCardTap=null;
    audio.play('card-flick');
    const spin=cardFlickSpin(current.grip,dx,dy,Math.hypot(vx,vy));
    void animatePlay(current.id,current.element,spin);
  }
  else{
    const from=current.element.style.transform;
    current.element.style.transform='';
    delete current.element.dataset.tiltX;delete current.element.dataset.tiltY;delete current.element.dataset.turn;
    if(!canceled && dist<12 && !current.inspecting && canControlActor() && state?.phase==='playing'){
      const tap={id:current.id,x:event.clientX,y:event.clientY,time:performance.now(),grip:current.grip};
      if(isDoubleCardTap(lastCardTap,tap)){const spin=cardFlickSpin(lastCardTap?.grip??current.grip,0,0);lastCardTap=null;audio.play('card-flick');void animatePlay(current.id,current.element,spin);}
      else {lastCardTap=tap;selectedCard=current.id;render();}
    }
    else if(!canceled && current.inspecting){lastCardTap=null;selectedCard=current.id;render();}
    else if(current.element.isConnected && !settings.reducedMotion)current.element.animate([{transform:from||current.baseTransform},{transform:current.baseTransform}],{duration:340,easing:'cubic-bezier(.18,.85,.25,1.12)'});
  }
}
app.addEventListener('pointerup',endDrag);
app.addEventListener('pointercancel',endDrag);
