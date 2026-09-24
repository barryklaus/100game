import './style.css';
import './game-presentation.css';
import './premium.css';
import { CONFIG, MOODS, moodSymbols, suitSymbols } from './data/config';
import { defaultSeats, loadSettings, loadStats, saveSettings, saveStats, type Settings, type Stats } from './data/storage';
import { backImage, cardDisplayRank, cardImage, cardImageLossless, prefersLosslessHand } from './game/deck';
import { cardFace } from './game/cardFace';
import { chooseCpuCard, chooseCpuTarget } from './game/cpu';
import { createGame, playCard, selectTarget } from './game/rules';
import type { Card, GameState, PlayerConfig } from './game/types';
import { AudioManager } from './audio/AudioManager';
import { TavernScene } from './render/TavernScene';
import { HoloShader } from './render/HoloShader';
import { OnlineRoom, newRoomId } from './game/online';
import { HostedRoom } from './game/hosted';
import { isCardEdgeGrip, isDoubleCardTap, isPlayGesture, type CardTap } from './ui/cardGesture';
import { updateGameView } from './ui/updateGameView';
import { GyroHand } from './ui/GyroHand';

const app = document.querySelector<HTMLDivElement>('#app')!;
let settings: Settings = loadSettings();
let stats: Stats = loadStats();
let state: GameState | null = null;
let selectedCard: string | null = null;
let locked = false;
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
let tavern: TavernScene | undefined;
try { tavern = new TavernScene(); tavern.configure({quality:settings.graphics,reducedMotion:settings.reducedMotion}); } catch { /* Keep the accessible HTML game if WebGL is unavailable. */ }

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]!);
const avatarNames = ['Ember Scout', 'Tide Scholar', 'Grove Guardian', 'Sun Knight', 'Storm Pilot', 'Coral Bard', 'Mushroom Alchemist', 'Desert Ranger', 'Moon Seer', 'River Courier', 'Thorn Duelist', 'Forge Captain', 'Cloud Mechanic', 'Marsh Mystic', 'Wildwood Archer', 'Dawn Dancer'];
const avatarImage = (index: number): string => `${import.meta.env.BASE_URL}assets/avatars/avatar-${String((index % 16 + 16) % 16 + 1).padStart(2,'0')}.jpg`;
const localSeat = (): number => online?.localSeat ?? Math.max(0, settings.seats.findIndex(seat => seat.kind === 'human'));
const canControlActor = (): boolean => !!state && !awaitingNetwork && state.players[state.phase === 'target' ? state.pendingSevens.at(-1)! : state.current]?.kind === 'human' && (!online || (state.phase === 'target' ? state.pendingSevens.at(-1) : state.current) === online.localSeat);
function closeOnline(): void {
  online?.close(); online = null; state = null; onlineMode = null; selectedCard = null; recordedRound = 0; awaitingNetwork = false; pendingLog = ''; observedOnlineHand.clear(); observedOnlineRound = 0; clearCpu();
  history.replaceState(null, '', location.pathname);
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
  const previous = state;
  const incoming=online.state;
  const incomingTop=incoming?.played.at(-1);
  const remoteKey=incoming?`${incoming.round}:${incoming.log[0]}`:'';
  if(remoteFlight && online.status==='playing')return;
  if(tavern && !settings.reducedMotion && incomingTop && previous && incoming?.round===previous.round && incoming.log[0]!==previous.log[0] && incomingTop.id!==previous.played.at(-1)?.id && previous.current!==online.localSeat && remoteKey!==remoteFlightKey){
    const seat=document.querySelector<HTMLElement>(`.seat[data-seat="${previous.current}"]`);
    if(seat){const room=online;remoteFlight=true;remoteFlightKey=remoteKey;void tavern.playCardToDiscard(cardImage(incomingTop),seat.getBoundingClientRect()).catch(()=>undefined).finally(()=>{remoteFlight=false;if(online===room)roomChanged();});return;}
  }
  state = online.state;
  const drawnForLocal = state && observedOnlineRound === state.round
    ? state.players[online.localSeat]?.hand.find(card => !observedOnlineHand.has(card.id))
    : undefined;
  observedOnlineHand = new Set(state?.players[online.localSeat]?.hand.map(card => card.id) ?? []);
  observedOnlineRound = state?.round ?? 0;
  if (previous?.phase === 'ended' && state?.phase === 'playing') recordedRound = 0;
  const key = state ? `${state.round}-${state.phase}-${state.current}-${state.pendingSevens.length}` : '';
  if (key !== lastTurnKey) { selectedCard = null; lastTurnKey = key; }
  if (state && previous && state.log[0] !== previous.log[0] && state.played.length) {
    if (state.event === 'bust') { audio.play('bust'); flash(`${state.players[state.bust!].name.toUpperCase()} BUSTED!`, 'bust'); }
    else if (state.event === 'exact') { audio.play('exact'); flash('EXACT 100!  +3', 'exact'); }
    else if (state.event === 'reverse') { audio.play('reverse'); flash('DIRECTION REVERSED', 'reverse'); }
    else if (state.event === 'seven') { audio.play('target'); flash('CHOOSE A PLAYER', 'seven'); }
    else if(state.event==='zero')audio.play('zero');
    else if(state.event==='minus')audio.play('minus');
    else audio.play('total-increase',{position:{x:0,y:1,z:-3}});
  }
  if (state?.phase === 'ended' && recordedRound !== state.round) { recordedRound = state.round; finishRound(); }
  render();
  if (drawnForLocal) void animateDrawToHand(drawnForLocal);
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
  const Room = import.meta.env.MODE === 'cloudflare' ? HostedRoom : OnlineRoom;
  online = new Room(mode === 'join' ? 'guest' : 'host', code, { name, avatar, mood: settings.seats[0].mood }, roomChanged);
  onlineMode = mode; recordedRound = 0;
  if (mode === 'host') { online.setCpuCount(roomCpuCount); history.replaceState(null, '', `${location.pathname}?room=${code}`); }
  render();
}
function applyPreferences(): void {
  audio.configure(settings);
  tavern?.configure({quality:settings.graphics,reducedMotion:settings.reducedMotion});
  holo.enabled = !settings.reducedMotion;
  document.documentElement.classList.toggle('reduce-motion',settings.reducedMotion);
  if (settings.reducedMotion) gyro.stop();
  document.documentElement.style.setProperty('--ui-scale',String(settings.uiScale));
}
function save(): void { saveSettings(settings); saveStats(stats); applyPreferences(); }
applyPreferences();
function clearCpu(): void { if (cpuTimer) clearTimeout(cpuTimer); cpuTimer = undefined; }
function flash(text: string, kind = ''): void {
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

async function animateDrawToHand(card: Card): Promise<void> {
  audio.play('draw-pile');
  const pile = document.querySelector<HTMLElement>('.draw-stack .card-back');
  const target = document.querySelector<HTMLElement>(`.local-hand .hand-card[data-card="${card.id}"]`);
  if (!pile || !target || settings.reducedMotion) { audio.play('card-draw'); return; }
  const start = pile.getBoundingClientRect();
  const end = target.getBoundingClientRect();
  if (start.width < 2 || end.width < 2) { audio.play('card-draw'); return; }

  target.classList.add('receiving-card');
  if (tavern) {
    try {
      await tavern.drawCardToHand(cardImage(card), end);
      if (target.isConnected) {
        target.classList.remove('receiving-card');
        target.animate([{ opacity: 0, filter: 'brightness(1.7)' }, { opacity: 1, filter: 'brightness(1)' }], { duration: 170, easing: 'ease-out' });
      }
      audio.play('card-draw');
      return;
    } catch {
      target.classList.remove('receiving-card');
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
  flight.remove();
  audio.play('card-draw');
  if (target.isConnected) {
    target.classList.remove('receiving-card');
    target.animate([{ opacity: 0, filter: 'brightness(1.7)' }, { opacity: 1, filter: 'brightness(1)' }], { duration: 170, easing: 'ease-out' });
  }
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
  if (!state || state.phase !== 'playing') return;
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
    selectedCard = null; awaitingNetwork = !online.isHost || online instanceof HostedRoom; pendingLog = state.log[0]; online.play(cardId); return;
  }
  const previousLocalHand = new Set(state.players[localSeat()].hand.map(item => item.id));
  playCard(state, cardId);
  const drawnForLocal = state.players[localSeat()].hand.find(item => !previousLocalHand.has(item.id));
  stats.cards++;
  if (card.rank === '7') stats.sevens++;
  if (card.rank === '8') stats.eights++;
  if (card.rank === '9') stats.nines++;
  if (card.rank === '10') stats.tens++;
  save();
  selectedCard = null;
  const ev = state.event;
  if (ev === 'exact') { audio.play('exact'); flash('EXACT 100!  +3', 'exact'); react([actor], '✦ YES!'); }
  else if (ev === 'bust') { audio.play('bust'); flash(`${state.players[actor].name.toUpperCase()} BUSTED!`, 'bust'); react([actor], 'OH NO!'); }
  else if (ev === 'seven') { audio.play('target'); flash('CHOOSE A PLAYER', 'seven'); react([actor], 'YOUR TURN!'); }
  else if (ev === 'reverse') { audio.play('reverse'); flash('DIRECTION REVERSED', 'reverse'); react(state.players.map(p => p.id), '↺'); }
  else if (ev === 'zero') { audio.play('zero'); flash('+0  ·  ZERO', 'zero'); react([actor], '…'); }
  else if (ev === 'minus') { audio.play('minus'); flash('−10  ·  REWIND', 'minus'); react([actor], 'PHEW!'); }
  else audio.play('total-increase',{position:{x:0,y:1,z:-3}});
  if ((state as GameState).phase === 'ended') finishRound();
  render();
  if (drawnForLocal) void animateDrawToHand(drawnForLocal);
  scheduleCpu();
}
async function animatePlay(cardId: string, source?: HTMLElement, spin = 0): Promise<void> {
  if (!state || locked || state.phase !== 'playing') return;
  locked = true; clearCpu();
  const card = state.players[state.current].hand.find(item => item.id === cardId);
  if (!card) { locked = false; return; }
  if(settings.reducedMotion){audio.play('slap');locked=false;resolveCard(cardId);return;}
  const origin = source || document.querySelector<HTMLElement>(`.seat[data-seat="${state.current}"]`) || document.querySelector<HTMLElement>('.draw-stack')!;
  const start = origin.getBoundingClientRect();
  if (tavern && !settings.reducedMotion) {
    source?.classList.add('card-departing');
    try {
      await tavern.playCardToDiscard(cardImage(card), start, spin);
      audio.play('slap');
      locked = false;
      resolveCard(cardId);
      return;
    } catch {
      source?.classList.remove('card-departing');
    }
  }
  let flying: HTMLElement;
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
  await flying.animate([
    { transform:'translate(0, 0) scale(1) rotate(0deg)', offset:0 },
    { transform:`translate(${dx*.62}px, ${dy*.62 - 28}px) scale(1.13) rotate(${spin*235+(dx > 0 ? 7 : -7)}deg)`, offset:.65 },
    { transform:`translate(${dx}px, ${dy + 7}px) scale(.97) rotate(${spin*340+2}deg)`, offset:.9 },
    { transform:`translate(${dx}px, ${dy}px) scale(1) rotate(${spin*360}deg)`, offset:1 },
  ], { duration: 410, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards' }).finished.catch(() => undefined);
  audio.play('slap'); flying.remove();
  locked = false; resolveCard(cardId);
}
function chooseTarget(target: number): void {
  if (!state || state.phase !== 'target' || locked) return;
  const chooser = state.pendingSevens.at(-1)!;
  if (online) { awaitingNetwork = !online.isHost || online instanceof HostedRoom; pendingLog = state.log[0]; online.target(target); render(); return; }
  selectTarget(state, target);
  react([target], ['WHAT?!','HEY!','ME?'][Math.floor(Math.random()*3)]);
  flash(`${state.players[chooser].name} chose ${state.players[target].name}`, 'seven');
  render(); scheduleCpu();
}
function scheduleCpu(): void {
  clearCpu();
  if (!state || locked || state.phase === 'ended') return;
  if (online && !online.runsCpuLocally) return;
  const actor = state.phase === 'target' ? state.pendingSevens.at(-1)! : state.current;
  if (state.players[actor].kind !== 'cpu') return;
  const delay = 420 + Math.random() * 440;
  cpuTimer = window.setTimeout(() => {
    if (!state) return;
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
  return `<div class="playing-card suit-${face.suit} ${special ? 'special' : 'standard'} ${selected ? 'selected' : ''} ${extra}" data-card="${card.id}" role="${interactive?'button':'img'}" ${interactive?'tabindex="0"':''} aria-label="${rank} of ${card.suit}${special ? ', special card' : ''}"><img src="${image}"${handSources} alt="${rank} of ${card.suit}" draggable="false"><span class="card-print" aria-hidden="true"><span class="card-index top">${face.index}</span>${special ? `<span class="card-action"><strong>${face.title}</strong><small>${face.detail}</small></span>` : ''}<span class="card-index bottom">${face.index}</span></span></div>`;
}
function setupView(): string {
  return `<main class="setup-page">
    <div class="setup-hero"><div class="brand-mark"><span class="crown">♛</span><strong>100</strong></div><div class="eyebrow">THE CARD GAME</div><h1>Simple numbers.<br><em>Big reactions.</em></h1><p>Look at your two cards. Make your move. Don't be the one who goes over 100.</p><div class="hero-cards">${cardElement({id:'fire-7',suit:'fire',rank:'7'},false,'hero-card one')}${cardElement({id:'water-8',suit:'water',rank:'8'},false,'hero-card two')}${cardElement({id:'sun-10',suit:'sun',rank:'10'},false,'hero-card three')}</div><div class="hero-footer">PLAY. BLUFF. SURVIVE.</div></div>
    <section class="setup-panel"><div class="panel-top"><span class="eyebrow">GATHER ROUND</span><div class="top-links"><button data-action="rules">How to play</button><button data-action="stats">Stats</button><button data-action="settings">⚙ Settings</button></div></div><h2>Set the table</h2><p class="muted">Choose 2–8 players. Any seat can be Human or CPU.</p>
      <div class="setup-controls"><label>PLAYERS<select id="player-count">${Array.from({length:7},(_,i)=>`<option value="${i+2}" ${settings.playerCount===i+2?'selected':''}>${i+2} players${i+2===4?' · recommended':''}</option>`).join('')}</select></label><label>CPU DIFFICULTY<select id="difficulty"><option value="easy" ${settings.difficulty==='easy'?'selected':''}>Easy</option><option value="normal" ${settings.difficulty==='normal'?'selected':''}>Normal</option></select></label></div>
      <div class="seat-editor">${settings.seats.slice(0,settings.playerCount).map((seat,i)=>`<div class="seat-row"><div class="seat-number">${String(i+1).padStart(2,'0')}</div><div class="avatar-tiny"><img src="${avatarImage(seat.avatar)}" alt=""></div><input aria-label="Player ${i+1} name" data-seat-name="${i}" maxlength="15" value="${escapeHtml(seat.name)}"><select aria-label="Player ${i+1} type" data-seat-kind="${i}"><option value="human" ${seat.kind==='human'?'selected':''}>Human</option><option value="cpu" ${seat.kind==='cpu'?'selected':''}>CPU</option></select><select aria-label="Player ${i+1} avatar" data-seat-avatar="${i}">${avatarNames.map((name,v)=>`<option value="${v}" ${seat.avatar===v?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select><select aria-label="Player ${i+1} mood" data-seat-mood="${i}">${MOODS.map(m=>`<option ${seat.mood===m?'selected':''}>${m}</option>`).join('')}</select></div>`).join('')}</div>
      <button class="primary-button start-button" data-action="start">START LOCAL GAME <span>➜</span></button><button class="secondary-button online-entry" data-action="online-setup">PLAY ONLINE WITH FRIENDS</button><p class="setup-note">Local: pass one device · Online: share a room link, one Human per device</p>
    </section></main>`;
}
function avatarPicker(): string {
  return `<div class="avatar-picker" role="group" aria-label="Choose a character">${avatarNames.map((name, index) => `<button class="avatar-choice ${settings.seats[0].avatar === index ? 'chosen' : ''}" data-avatar-choice="${index}" aria-label="${escapeHtml(name)}" aria-pressed="${settings.seats[0].avatar === index}"><img src="${avatarImage(index)}" alt=""><span>${escapeHtml(name)}</span></button>`).join('')}</div>`;
}
function onlineView(): string {
  return `<main class="online-page"><section class="online-panel"><div class="brand-mark"><span class="crown">♛</span><strong>100</strong></div><div class="eyebrow">PLAY TOGETHER</div><h1>Online table</h1><p>Each friend plays from their own browser. Share a room link to play together.</p><div class="online-tabs"><button class="${onlineMode === 'host' ? 'current' : ''}" data-action="host-tab">Create room</button><button class="${onlineMode === 'join' ? 'current' : ''}" data-action="join-tab">Join room</button></div><label class="online-field">YOUR NAME<input id="online-name" maxlength="15" value="${escapeHtml(settings.seats[0].name)}"></label><div class="online-avatar-heading">YOUR CHARACTER <span>${escapeHtml(avatarNames[settings.seats[0].avatar % 16])}</span></div>${avatarPicker()}${onlineMode === 'join' ? `<label class="online-field">ROOM CODE OR INVITE LINK<input id="room-code" autocomplete="off" value="${escapeHtml(joinCode)}" placeholder="100-abc123…"></label>` : ''}<button class="primary-button start-button" data-action="${onlineMode === 'join' ? 'join-room' : 'create-room'}">${onlineMode === 'join' ? 'JOIN ROOM' : 'CREATE ROOM'} ➜</button><button class="text-button" data-action="back-setup">Back to local setup</button></section></main>`;
}
function lobbyView(): string {
  if (!online) return onlineView();
  const invite = `${location.origin}${location.pathname}?room=${online.roomId}`;
  return `<main class="online-page"><section class="online-panel"><div class="eyebrow">${online.isHost ? 'YOUR ROOM' : 'JOINING A ROOM'}</div><h1>${online.status === 'disconnected' ? 'Connection ended' : online.status === 'connecting' ? 'Connecting…' : 'Gather your players'}</h1><p role="status">${online.error ? escapeHtml(online.error) : online.isHost ? 'Share this link. Each friend joins from a separate browser.' : 'Waiting for the host to start the round.'}</p>${online.isHost && online.status === 'lobby' ? `<div class="invite-box"><input readonly aria-label="Invite link" value="${escapeHtml(invite)}"><button data-action="copy-invite">COPY LINK</button></div>` : ''}<div class="lobby-seats">${online.seats.map((seat,i)=>`<div><img src="${avatarImage(seat.avatar)}" alt=""><strong>${escapeHtml(seat.name)}${i === online!.localSeat ? ' · You' : ''}</strong><span>${seat.kind === 'cpu' ? 'CPU' : i === online!.hostSeat ? 'Host' : 'Online'}</span></div>`).join('')}</div>${online.isHost && online.status === 'lobby' ? `<label class="online-field">CPU PLAYERS <select id="room-cpus">${Array.from({length:Math.max(0,9-online.seats.filter(s=>s.kind==='human').length)},(_,i)=>`<option value="${i}" ${online!.cpuCount===i?'selected':''}>${i}</option>`).join('')}</select></label><button class="primary-button start-button" data-action="start-online" ${online.seats.length<2?'disabled':''}>START ONLINE ROUND ➜</button><p class="setup-note">${online.seats.length}/8 seats · At least two players needed</p>` : ''}${online.status === 'disconnected' ? `<button class="primary-button start-button" data-action="retry-room">${online instanceof HostedRoom ? 'RECONNECT TO ROOM' : online.isHost ? 'CREATE NEW ROOM' : 'TRY JOINING AGAIN'} ➜</button>` : ''}<button class="text-button" data-action="leave-room">Leave room</button></section></main>`;
}
function seatHtml(player: GameState['players'][number], index: number, count: number): string {
  if (!state) return '';
  const angle = Math.PI/2 + ((index - localSeat() + count) % count)*2*Math.PI/count;
  const x = 50 + 39*Math.cos(angle), y = 31 + 23*Math.sin(angle);
  const active = state.phase === 'target' ? state.pendingSevens.at(-1) === index : state.current === index;
  const targetable = state.phase === 'target' && canControlActor() && index !== state.pendingSevens.at(-1);
  const suit = ['fire','water','leaf','sun'][index%4] as keyof typeof suitSymbols;
  return `<button class="seat ${index===localSeat()?'local-seat':''} ${active?'active':''} ${targetable?'targetable':''} ${reaction[index]?'reacting':''} suit-${suit} mood-${player.mood.toLowerCase()}" data-seat="${index}" style="--seat-x:${x}%;--seat-y:${y}%;--seat-index:${index}" ${targetable?'data-target="'+index+'"':''} aria-label="${escapeHtml(player.name)}, ${player.kind}, ${player.hand.length} cards, mood ${player.mood}"><span class="reaction-bubble">${reaction[index]||''}</span><span class="character"><span class="character-head" ><img src="${avatarImage(player.avatar)}" alt=""></span><span class="seat-count" aria-hidden="true">${player.hand.length}</span></span><span class="seat-info"><span class="seat-name">${escapeHtml(player.name)}</span><span class="seat-meta">★ ${player.kind==='cpu'?'CPU':'PLAYER'}</span></span><span class="seat-suit" aria-hidden="true">${suitSymbols[suit]}</span></button>`;
}
function gameLogLine(item: string): string {
  const playerIndex = state?.players.findIndex(player => item.startsWith(`${player.name} `)) ?? -1;
  const suit = playerIndex < 0 ? 'sun' : ['fire','water','leaf','sun'][playerIndex % 4];
  return `<li><span class="log-suit suit-${suit}" aria-hidden="true">${suitSymbols[suit as keyof typeof suitSymbols]}</span><span>${escapeHtml(item)}</span></li>`;
}
function gameView(): string {
  if (!state) return '';
  const top = state.played.at(-1);
  const actor = state.phase === 'target' ? state.pendingSevens.at(-1)! : state.current;
  const active = state.players[actor];
  const mine = state.players[localSeat()];
  const myTurn = state.phase !== 'ended' && active.kind === 'human' && actor === localSeat();
  const otherLocalTurn = !online && active.kind === 'human' && actor !== localSeat();
  const hand = mine?.kind === 'human' ? mine.hand : [];
  const totalClass = state.total>100?'busted':state.total===100?'at100':state.total>=CONFIG.TOTAL_WARNING_3?'danger':state.total>=CONFIG.TOTAL_WARNING_2?'warning-2':state.total>=CONFIG.TOTAL_WARNING_1?'warning-1':'';
  const energy = Math.max(0, Math.min(100, state.total));
  return `<main class="game-page" data-event="${state.event}"><header class="game-header"><div class="game-logo"><span class="game-crown">♛</span><strong>100</strong><small>SIMPLE NUMBERS.<br>BIG REACTIONS.</small></div><div class="match-plaque"><span class="plaque-crown">♛</span><div><strong>Ranked Match</strong><small>Good friends. Higher numbers.</small></div></div><div class="header-wallet" aria-label="Player rewards"><span class="wallet-pill"><b>★</b>${stats.currency.toLocaleString()}</span><span class="wallet-pill gem"><b>◆</b>${stats.rating.toLocaleString()}</span></div><div class="header-status"><span class="round-pill">Round ${state.round} / Unlimited</span><span class="turn-pill">${escapeHtml(active.name)}'s ${state.phase==='target'?'choice':'turn'}</span></div><div class="header-actions"><button data-action="history" aria-label="Game history">▤</button><button data-action="settings" aria-label="Settings">⚙</button><button data-action="menu" aria-label="Menu">☰</button></div></header>${online?.error ? `<div class="online-alert" role="status">${escapeHtml(online.error)}</div>` : ''}
    <div class="game-layout"><section class="arena" aria-label="Game table"><div class="table-rim"><div class="table-felt"><div class="energy-system ${totalClass}" style="--energy-angle:${energy * 3.6}deg;--energy-level:${energy / 100}"><div class="cauldron"><div class="cauldron-steam"><i></i><i></i><i></i></div><div class="cauldron-liquid"></div><div class="cauldron-body"><span class="cauldron-eye left"></span><span class="cauldron-eye right"></span><span class="cauldron-mouth"></span></div><span class="cauldron-handle left"></span><span class="cauldron-handle right"></span><span class="cauldron-foot left"></span><span class="cauldron-foot right"></span></div><div class="total-wrap ${totalClass}"><span class="total-caption">CURRENT TOTAL</span><div class="total-number" role="status" aria-live="polite" aria-label="Shared total">${state.total}</div><div class="total-max">/ 100</div></div></div><div class="table-cards"><div class="pile-wrap"><div class="draw-stack"><div class="playing-card card-back" role="img" aria-label="Draw pile"><img src="${backImage}" alt="Draw pile" draggable="false"></div></div></div><div class="pile-wrap"><div class="played-slot">${top?cardElement(top,false,'last-card'):'<span class="empty-slot">PLAY HERE</span>'}</div></div></div></div></div>
      <div class="seat-layer">${state.players.map((player,i)=>seatHtml(player,i,state!.players.length)).join('')}</div>
      ${state.phase==='target'&&canControlActor()?'<div class="target-hint">Choose another player to take a forced turn</div>':''}
    </section><aside class="side-panel"><div class="side-card"><div class="eyebrow">AT THE TABLE</div><h3>${state.phase==='target'?'Choosing a target: ':state.forced?'Forced play: ':'Now playing: '}${escapeHtml(active.name)}</h3></div><div class="side-card log-card"><div class="card-heading"><h3>Game Log</h3><span>RECENT MOVES</span></div><ul>${state.log.slice(0,7).map(gameLogLine).join('')}</ul></div></aside></div>
    ${otherLocalTurn ? `<div class="shared-turn" role="region" aria-label="${escapeHtml(active.name)}'s local turn"><strong>Pass the device to ${escapeHtml(active.name)}</strong><span>${state.phase === 'target' ? 'Tap a highlighted player at the table.' : 'Double-tap a card or flick it toward the table.'}</span><div class="shared-hand">${state.phase === 'playing' ? active.hand.map(card=>cardElement(card,selectedCard===card.id,'hand-card')).join('') : ''}</div></div>` : ''}
    <footer class="hand-dock"><div class="dock-prompt ${myTurn?'my-turn':''}">${myTurn?'<span class="your-turn-bubble">YOUR TURN!</span>':''}<img class="dock-avatar" src="${avatarImage(mine?.avatar ?? 0)}" alt=""><div class="dock-person"><span class="eyebrow">${mine?.kind==='human'?'YOUR SEAT':'SPECTATOR'}</span><strong>${escapeHtml(mine?.name || 'Player')}</strong><small>${hand.length} cards · ${mine ? `${moodSymbols[mine.mood]} ${mine.mood}` : 'Watching'}</small></div></div><div class="local-hand">${hand.length?hand.map(card=>cardElement(card,selectedCard===card.id,`hand-card ${myTurn ? '' : 'waiting-hand'}`)).join(''):`<div class="waiting-cards"><img src="${backImage}" alt="face-down card"><img src="${backImage}" alt="face-down card"></div>`}</div><div class="dock-controls"><small class="dock-hint">${myTurn ? state.phase === 'target' ? 'Choose a highlighted player.' : 'Double-tap a card or flick it upward' : `${escapeHtml(active.name)} is ${state.phase==='target'?'choosing a player':'playing'}…`}</small></div><div class="emote-menu ${emotesOpen?'open':''}"><button class="emote-trigger" data-action="emotes" aria-label="Choose emote" aria-expanded="${emotesOpen}">☺<small>EMOTE</small></button><div class="emote-wheel" aria-label="Emotes" ${emotesOpen?'':'inert aria-hidden="true"'}>${(['Happy','Excited','Confused','Angry','Sad','Smug','Scared','Thinking'] as const).map(m=>`<button data-emote="${m}" title="${m}" aria-label="${m}">${moodSymbols[m]}</button>`).join('')}</div></div><button class="info-fab" data-action="rules" aria-label="Game information">i<small>INFO</small></button><div class="dock-quote">GOOD PEOPLE.<br>RISKY DECISIONS.</div></footer>
    ${state.phase==='ended'?resultView():''}</main>`;
}
function resultView(): string {
  if (!state) return '';
  const loser = state.players[state.bust!];
  return `<div class="overlay result-overlay"><section class="result-panel"><div class="eyebrow">ROUND ${state.round} COMPLETE</div><div class="result-icon">☄</div><h2>${escapeHtml(loser.name)} busted!</h2><p>The shared total reached <strong>${state.total}</strong>. Everyone else survives.</p><div class="result-grid"><div><span>SURVIVORS</span><strong>${state.players.filter(p=>p.id!==state!.bust).map(p=>escapeHtml(p.name)).join(', ')}</strong></div><div><span>EXACT 100 EVENTS</span><strong>${state.exactEvents.length?state.exactEvents.map(e=>escapeHtml(state!.players[e.player].name)).join(', '):'None this round'}</strong></div></div><div class="rating-list">${state.players.map(p=>`<span>${escapeHtml(p.name)} <strong class="${p.ratingDelta<0?'negative':''}">${p.ratingDelta>=0?'+':''}${p.ratingDelta}</strong></span>`).join('')}</div><div class="result-actions">${!online || online.isHost ? '<button class="primary-button" data-action="again">PLAY AGAIN</button>' : '<p>Waiting for the host to start the next round.</p>'}<button class="secondary-button" data-action="${online?'leave-room':'new-game'}">${online?'LEAVE ROOM':'NEW GAME'}</button></div></section></div>`;
}
function modalView(): string {
  if (!modal) return '';
  const body = modal==='rules' ? `<h2>How to play</h2><p>Keep the shared total at or below 100. Play one of your two cards every turn, then draw a replacement. The player who takes the total over 100 busts; everyone else survives.</p><div class="rules-grid"><div><strong>1–6</strong><span>Add face value</span></div><div><strong>10</strong><span>Add 10</span></div><div><strong>CHOOSE PLAYER</strong><span>Make another player play immediately. Their normal turn stays in place.</span></div><div><strong>REVERSE</strong><span>Reverse direction. In a two-player game, play again.</span></div><div><strong>ZERO</strong><span>Add nothing.</span></div><div><strong>MINUS TEN</strong><span>Subtract 10.</span></div></div><p>Hit exactly 100 for +3 rating; play continues. Survive for +1. Bust for −5. Suits are visual only.</p><p><strong>Controls:</strong> drag or flick a card toward the center. On touch screens, swipe it. Double-tap or double-click a card to play it. Flick from an edge or corner to spin it into the discard pile.</p>`
  : modal==='settings' ? `<h2>Make yourself at home</h2><div class="modal-setting"><label for="graphics">Visual quality</label><select id="graphics">${(['ultra','high','medium','mobile'] as const).map(tier=>`<option value="${tier}" ${settings.graphics===tier?'selected':''}>${tier.charAt(0).toUpperCase()+tier.slice(1)}</option>`).join('')}</select><small>Ultra adds richer shadows, reflections and glow. Mobile keeps the same world with lighter effects.</small></div>${[['volume','Master volume',settings.volume],['sfxVolume','Sound effects',settings.sfxVolume],['musicVolume','Music',settings.musicVolume],['ambienceVolume','Ambience',settings.ambienceVolume]].map(([id,label,value])=>`<div class="modal-setting"><label for="${id}">${label}<output for="${id}">${Math.round(Number(value)*100)}%</output></label><input id="${id}" type="range" min="0" max="1" step=".01" value="${value}"></div>`).join('')}<label class="setting-toggle"><input id="muted" type="checkbox" ${settings.muted?'checked':''}>Mute all sounds</label><label class="setting-toggle"><input id="reducedMotion" type="checkbox" ${settings.reducedMotion?'checked':''}>Reduced motion</label><div class="modal-setting gyro-setting"><label>Phone tilt</label><button class="secondary-button" data-action="gyro-enable" ${!gyro.available || settings.reducedMotion ? 'disabled' : ''}>${gyro.status === 'on' ? 'Recenter phone tilt' : gyro.status === 'waiting' ? 'Waiting for motion…' : 'Enable phone tilt'}</button><small id="gyro-status">${settings.reducedMotion ? 'Turn off Reduced motion to use phone tilt.' : gyro.status === 'on' ? 'Move your phone gently to tilt the cards. Dragging a card takes control.' : gyro.status === 'denied' ? 'Motion access was denied. You can still drag cards to tilt them.' : gyro.available ? 'Available on supported phones.' : 'Motion sensors are unavailable in this browser.'}</small></div><div class="modal-setting"><label for="uiScale">Interface size <output for="uiScale">${Math.round(settings.uiScale*100)}%</output></label><input id="uiScale" type="range" min=".85" max="1.2" step=".05" value="${settings.uiScale}"></div><p>Settings save on this device.</p>`
  : modal==='stats' ? `<h2>Local statistics</h2><div class="stats-grid">${[['Rounds',stats.rounds],['Exact 100s',stats.exacts],['Survivals',stats.survives],['Busts',stats.busts],['Cards played',stats.cards],['Choose Player',stats.sevens],['Reverse',stats.eights],['Zero',stats.nines],['Minus Ten',stats.tens],['Test rating',stats.rating],['Currency',stats.currency]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><p>Statistics, rating, and currency are local to this device. Currency does not affect gameplay.</p>`
  : modal==='history' ? `<h2>Game history</h2><p>Recent moves at this table.</p><ul class="history-list">${state?.log.length ? state.log.map(gameLogLine).join('') : '<li>No cards have been played yet.</li>'}</ul>`
  : `<h2>Game menu</h2><p>Round ${state?.round || 1} · ${state?.players.length || settings.playerCount} players</p><div class="menu-actions">${!online || (online.isHost && !(online instanceof HostedRoom)) ? '<button class="secondary-button" data-action="restart">Restart round</button>' : ''}<button class="secondary-button" data-action="${online?'leave-room':'new-game'}">${online?'Leave online room':'Return to setup'}</button><button class="secondary-button" data-action="settings">Sound & display</button><button class="secondary-button" data-action="history">Table activity</button><button class="secondary-button" data-action="stats">Local statistics</button></div>`;
  return `<div class="overlay modal-overlay" data-action="close-modal"><section class="modal-panel" role="dialog" aria-modal="true"><button class="close-button" data-action="close-modal" aria-label="Close">×</button>${body}</section></div>`;
}
function render(): void {
  updateGameView(app, (online && online.status !== 'playing' ? lobbyView() : state ? gameView() : onlineMode ? onlineView() : setupView()) + modalView());
  const discard = state?.played.at(-1);
  tavern?.update({
    active: !!state && (!online || online.status === 'playing'),
    total: state?.total ?? 0,
    direction: state?.direction ?? 1,
    event: state?.event ?? 'none',
    eventKey: state ? `${state.round}:${state.log[0]}` : '',
    activeSeat: state?.current??0,
    drawCount: state?.drawPile.length??0,
    discardCount: state?.played.length??0,
    playerCount: state?.players.length ?? 0,
    localSeat: state ? localSeat() : 0,
    drawCardUrl: backImage,
    discardCardUrl: discard ? cardImage(discard) : undefined,
    discardCards: state?.played.map(cardImage)??[],
  });
}
render();
if (import.meta.env.MODE === 'cloudflare' && onlineMode === 'join' && /^100-[a-z0-9]{12}$/.test(joinCode) && localStorage.getItem(`100game:room:${joinCode}`)) connectOnline('join');

app.addEventListener('click', event => {
  const target = event.target as HTMLElement;
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action) {
    if (action === 'close-modal' && target.closest('.modal-panel') && !target.closest('.close-button')) return;
    audio.play('click');
    if (action === 'start') startGame();
    if (action === 'online-setup') { onlineMode = 'host'; render(); }
    if (action === 'host-tab' || action === 'join-tab') { onlineMode = action === 'host-tab' ? 'host' : 'join'; render(); }
    if (action === 'back-setup') { onlineMode = null; history.replaceState(null, '', location.pathname); render(); }
    if (action === 'create-room' || action === 'join-room') connectOnline(action === 'create-room' ? 'host' : 'join');
    if (action === 'retry-room' && online) { if (online instanceof HostedRoom) online.retry(); else connectOnline(online.isHost ? 'host' : 'join'); }
    if (action === 'start-online') online?.startRound();
    if (action === 'leave-room') { modal = null; closeOnline(); }
    if (action === 'copy-invite' && online) void navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${online.roomId}`).then(()=>flash('Invite link copied')).catch(()=>flash('Select and copy the invite link.'));
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

type CardDrag = {element:HTMLElement;id:string;x:number;y:number;time:number;lastX:number;lastY:number;lastTime:number;vx:number;vy:number;moved:boolean;inspecting:boolean;edgeGrip:boolean;pointerId:number;holdTimer:number;baseTransform:string};
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
  if(!card||card.classList.contains('waiting-hand')||!state||locked||drag||event.button!==0)return;
  const now=performance.now();
  const current:CardDrag={element:card,id:card.dataset.card!,x:event.clientX,y:event.clientY,time:now,lastX:event.clientX,lastY:event.clientY,lastTime:now,vx:0,vy:0,moved:false,inspecting:false,edgeGrip:isCardEdgeGrip(card.getBoundingClientRect(),event.clientX,event.clientY),pointerId:event.pointerId,holdTimer:0,baseTransform:getComputedStyle(card).transform};
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
  drag.element.classList.toggle('flick-ready',dy<=-18 && Math.abs(dy)>Math.abs(dx)*.32 && canControlActor());
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
  const shouldPlay=isPlayGesture({dx,dy,duration:performance.now()-current.time,canceled,inspecting:current.inspecting,canPlay:canControlActor()&&state?.phase==='playing'});
  if(current.element.hasPointerCapture(event.pointerId))current.element.releasePointerCapture(event.pointerId);
  current.element.classList.remove('dragging','flick-ready','inspecting');
  if(shouldPlay){
    lastCardTap=null;
    audio.play('card-flick');
    const spin=current.edgeGrip?(dx>3?1:dx< -3?-1:current.x<current.element.getBoundingClientRect().left+current.element.offsetWidth/2?-1:1):0;
    void animatePlay(current.id,current.element,spin);
  }
  else{
    const from=current.element.style.transform;
    current.element.style.transform='';
    delete current.element.dataset.tiltX;delete current.element.dataset.tiltY;delete current.element.dataset.turn;
    if(!canceled && dist<12 && !current.inspecting && canControlActor() && state?.phase==='playing'){
      const tap={id:current.id,x:event.clientX,y:event.clientY,time:performance.now()};
      if(isDoubleCardTap(lastCardTap,tap)){lastCardTap=null;audio.play('card-flick');void animatePlay(current.id,current.element);}
      else {lastCardTap=tap;selectedCard=current.id;render();}
    }
    else if(!canceled && current.inspecting){lastCardTap=null;selectedCard=current.id;render();}
    else if(current.element.isConnected && !settings.reducedMotion)current.element.animate([{transform:from||current.baseTransform},{transform:current.baseTransform}],{duration:340,easing:'cubic-bezier(.18,.85,.25,1.12)'});
  }
}
app.addEventListener('pointerup',endDrag);
app.addEventListener('pointercancel',endDrag);
