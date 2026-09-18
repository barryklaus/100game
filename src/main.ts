import './style.css';
import { CONFIG, MOODS, moodSymbols, suitSymbols } from './data/config';
import { defaultSeats, loadSettings, loadStats, saveSettings, saveStats, type Settings, type Stats } from './data/storage';
import { backImage, cardImage, makeDeck } from './game/deck';
import { chooseCpuCard, chooseCpuTarget } from './game/cpu';
import { createGame, playCard, selectTarget } from './game/rules';
import type { Card, GameState, PlayerConfig } from './game/types';
import { AudioManager } from './audio/AudioManager';
import { HoloShader } from './render/HoloShader';

const app = document.querySelector<HTMLDivElement>('#app')!;
let settings: Settings = loadSettings();
let stats: Stats = loadStats();
let state: GameState | null = null;
let selectedCard: string | null = null;
let locked = false;
let modal: 'rules' | 'settings' | 'stats' | 'menu' | null = null;
let cpuTimer: number | undefined;
let reaction: Record<number, string> = {};
let toastTimer: number | undefined;
const audio = new AudioManager();
audio.volume = settings.volume;
let holo: HoloShader | undefined;
try { holo = new HoloShader(); holo.enabled = settings.graphics === 'high'; } catch { /* CSS glow remains if WebGL is unavailable. */ }

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]!);
const avatarCards = ['fire-J','water-J','leaf-Q','sun-K','sun-8','fire-Q','water-K','leaf-J'];
const avatarImage = (index: number): string => `${import.meta.env.BASE_URL}assets/cards/${avatarCards[index % avatarCards.length].toLowerCase()}.webp`;
function save(): void { saveSettings(settings); saveStats(stats); audio.volume = settings.volume; if (holo) holo.enabled = settings.graphics === 'high'; }
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
function setSeat(index: number, update: Partial<PlayerConfig>): void {
  settings.seats[index] = { ...settings.seats[index], ...update };
  save(); render();
}
function startGame(round = 1): void {
  clearCpu(); selectedCard = null; locked = false; reaction = {};
  const seats = settings.seats.slice(0, settings.playerCount).map((seat, i) => ({ ...seat, name: seat.name.trim() || defaultSeats[i].name }));
  state = createGame(seats, round);
  save(); render(); scheduleCpu();
  // Core textures load into the browser cache after the first frame.
  requestAnimationFrame(() => makeDeck().forEach(card => { const image = new Image(); image.src = cardImage(card); }));
}
function finishRound(): void {
  if (!state) return;
  const humans = state.players.filter(player => player.kind === 'human');
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
  playCard(state, cardId);
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
  else audio.play('draw');
  if ((state as GameState).phase === 'ended') finishRound();
  render(); scheduleCpu();
}
async function animatePlay(cardId: string, source?: HTMLElement): Promise<void> {
  if (!state || locked || state.phase !== 'playing') return;
  locked = true; clearCpu();
  const card = state.players[state.current].hand.find(item => item.id === cardId);
  if (!card) { locked = false; return; }
  let flying: HTMLElement;
  let start: DOMRect;
  if (source) { start = source.getBoundingClientRect(); flying = source.cloneNode(true) as HTMLElement; }
  else {
    const seat = document.querySelector<HTMLElement>(`.seat[data-seat="${state.current}"]`) || document.querySelector<HTMLElement>('.draw-stack')!;
    start = seat.getBoundingClientRect();
    flying = document.createElement('div');
    flying.className = `playing-card ${['7','8','9','10'].includes(card.rank) ? 'special' : ''}`;
    flying.innerHTML = `<img src="${cardImage(card)}" alt="${card.rank} of ${card.suit}">`;
  }
  flying.classList.add('flying-card');
  Object.assign(flying.style, { position:'fixed', left:`${start.left}px`, top:`${start.top}px`, width:`${start.width || 76}px`, height:`${start.height || 108}px`, margin:'0', transform:'none' });
  document.body.append(flying);
  const target = document.querySelector<HTMLElement>('.played-slot')!.getBoundingClientRect();
  const dx = target.left + target.width / 2 - (start.left + start.width / 2);
  const dy = target.top + target.height / 2 - (start.top + start.height / 2);
  await flying.animate([
    { transform:'translate(0, 0) scale(1) rotate(0deg)', offset:0 },
    { transform:`translate(${dx*.62}px, ${dy*.62 - 28}px) scale(1.13) rotate(${dx > 0 ? 7 : -7}deg)`, offset:.65 },
    { transform:`translate(${dx}px, ${dy + 7}px) scale(.97) rotate(2deg)`, offset:.9 },
    { transform:`translate(${dx}px, ${dy}px) scale(1) rotate(0deg)`, offset:1 },
  ], { duration: 410, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards' }).finished.catch(() => undefined);
  audio.play('slap'); flying.remove();
  locked = false; resolveCard(cardId);
}
function chooseTarget(target: number): void {
  if (!state || state.phase !== 'target' || locked) return;
  const chooser = state.pendingSevens.at(-1)!;
  selectTarget(state, target);
  react([target], ['WHAT?!','HEY!','ME?'][Math.floor(Math.random()*3)]);
  flash(`${state.players[chooser].name} chose ${state.players[target].name}`, 'seven');
  render(); scheduleCpu();
}
function scheduleCpu(): void {
  clearCpu();
  if (!state || locked || state.phase === 'ended') return;
  const actor = state.phase === 'target' ? state.pendingSevens.at(-1)! : state.current;
  if (state.players[actor].kind !== 'cpu') return;
  const delay = CONFIG.CPU_DELAY_MIN + Math.random() * (CONFIG.CPU_DELAY_MAX - CONFIG.CPU_DELAY_MIN);
  cpuTimer = window.setTimeout(() => {
    if (!state) return;
    if (state.phase === 'target') chooseTarget(chooseCpuTarget(state, settings.difficulty));
    else if (state.phase === 'playing') void animatePlay(chooseCpuCard(state, settings.difficulty).id);
  }, delay);
}
function cardElement(card: Card, selected = false, extra = ''): string {
  const special = ['7','8','9','10'].includes(card.rank);
  return `<div class="playing-card ${special ? 'special' : ''} ${selected ? 'selected' : ''} ${extra}" data-card="${card.id}" role="button" tabindex="0" aria-label="${card.rank} of ${card.suit}${special ? ', special card' : ''}"><img src="${cardImage(card)}" alt="${card.rank} of ${card.suit}" draggable="false"></div>`;
}
function setupView(): string {
  return `<main class="setup-page">
    <div class="setup-hero"><div class="brand-mark"><span class="crown">♛</span><strong>100</strong></div><div class="eyebrow">THE CARD GAME</div><h1>Simple numbers.<br><em>Big reactions.</em></h1><p>Look at your two cards. Make your move. Don't be the one who goes over 100.</p><div class="hero-cards">${cardElement({id:'fire-7',suit:'fire',rank:'7'},false,'hero-card one')}${cardElement({id:'water-8',suit:'water',rank:'8'},false,'hero-card two')}${cardElement({id:'sun-10',suit:'sun',rank:'10'},false,'hero-card three')}</div><div class="hero-footer">PLAY. BLUFF. SURVIVE.</div></div>
    <section class="setup-panel"><div class="panel-top"><span class="eyebrow">GATHER ROUND</span><div class="top-links"><button data-action="rules">How to play</button><button data-action="stats">Stats</button><button data-action="settings">⚙ Settings</button></div></div><h2>Set the table</h2><p class="muted">Choose 2–8 players. Any seat can be Human or CPU.</p>
      <div class="setup-controls"><label>PLAYERS<select id="player-count">${Array.from({length:7},(_,i)=>`<option value="${i+2}" ${settings.playerCount===i+2?'selected':''}>${i+2} players${i+2===4?' · recommended':''}</option>`).join('')}</select></label><label>CPU DIFFICULTY<select id="difficulty"><option value="easy" ${settings.difficulty==='easy'?'selected':''}>Easy</option><option value="normal" ${settings.difficulty==='normal'?'selected':''}>Normal</option></select></label></div>
      <div class="seat-editor">${settings.seats.slice(0,settings.playerCount).map((seat,i)=>`<div class="seat-row"><div class="seat-number">${String(i+1).padStart(2,'0')}</div><div class="avatar-tiny"><img src="${avatarImage(seat.avatar)}" alt=""></div><input aria-label="Player ${i+1} name" data-seat-name="${i}" maxlength="15" value="${escapeHtml(seat.name)}"><select aria-label="Player ${i+1} type" data-seat-kind="${i}"><option value="human" ${seat.kind==='human'?'selected':''}>Human</option><option value="cpu" ${seat.kind==='cpu'?'selected':''}>CPU</option></select><select aria-label="Player ${i+1} avatar" data-seat-avatar="${i}">${avatarCards.map((_,v)=>`<option value="${v}" ${seat.avatar===v?'selected':''}>Look ${v+1}</option>`).join('')}</select><select aria-label="Player ${i+1} mood" data-seat-mood="${i}">${MOODS.map(m=>`<option ${seat.mood===m?'selected':''}>${m}</option>`).join('')}</select></div>`).join('')}</div>
      <button class="primary-button start-button" data-action="start">START GAME <span>➜</span></button><p class="setup-note">No account needed · Pass the device for Human turns</p>
    </section></main>`;
}
function seatHtml(player: GameState['players'][number], index: number, count: number): string {
  if (!state) return '';
  const angle = Math.PI/2 + index*2*Math.PI/count;
  const x = 50 + 42*Math.cos(angle), y = 50 + 39*Math.sin(angle);
  const active = state.phase === 'target' ? state.pendingSevens.at(-1) === index : state.current === index;
  const targetable = state.phase === 'target' && state.players[state.pendingSevens.at(-1)!].kind === 'human' && index !== state.pendingSevens.at(-1);
  return `<button class="seat ${active?'active':''} ${targetable?'targetable':''} ${reaction[index]?'reacting':''}" data-seat="${index}" style="--seat-x:${x}%;--seat-y:${y}%" ${targetable?'data-target="'+index+'"':''} aria-label="${player.name}, ${player.kind}, ${player.hand.length} cards, mood ${player.mood}"><div class="reaction-bubble">${reaction[index]||''}</div><div class="character"><div class="character-head"><img src="${avatarImage(player.avatar)}" alt=""></div><div class="character-body"></div></div><div class="seat-info"><span class="seat-name">${escapeHtml(player.name)}</span><span class="seat-meta">${suitSymbols[['fire','water','leaf','sun'][index%4] as keyof typeof suitSymbols]} ${player.kind==='cpu'?'CPU':'HUMAN'} · ${moodSymbols[player.mood]} ${player.mood}</span></div><div class="opponent-hand"><img src="${backImage}" alt="face-down card"><img src="${backImage}" alt="face-down card"></div></button>`;
}
function gameView(): string {
  if (!state) return '';
  const top = state.played.at(-1);
  const actor = state.phase === 'target' ? state.pendingSevens.at(-1)! : state.current;
  const active = state.players[actor];
  const humanTurn = active.kind === 'human';
  const hand = state.phase === 'playing' && humanTurn ? state.players[state.current].hand : [];
  const totalClass = state.total>100?'busted':state.total===100?'at100':state.total>=CONFIG.TOTAL_WARNING_3?'danger':state.total>=CONFIG.TOTAL_WARNING_2?'warning-2':state.total>=CONFIG.TOTAL_WARNING_1?'warning-1':'';
  return `<main class="game-page"><header class="game-header"><div class="game-logo"><span>♛</span><strong>100</strong><small>SIMPLE NUMBERS. BIG REACTIONS.</small></div><div class="header-status"><span class="round-pill">ROUND ${state.round}</span><span class="turn-pill">${escapeHtml(active.name)}'s ${state.phase==='target'?'choice':'turn'}</span></div><div class="header-actions"><button data-action="rules" aria-label="Rules">?</button><button data-action="settings" aria-label="Settings">⚙</button><button data-action="menu" aria-label="Menu">☰</button></div></header>
    <div class="game-layout"><section class="arena" aria-label="Game table"><div class="arena-glow"></div><div class="table-rim"><div class="table-felt"><div class="table-lines"></div><div class="direction-indicator ${state.direction===-1?'ccw':''}"><span>➜</span> ${state.direction===1?'CLOCKWISE':'COUNTER-CLOCKWISE'}</div><div class="total-wrap ${totalClass}"><span class="total-caption">SHARED TOTAL</span><div class="total-number">${state.total}</div><div class="total-max">/ 100</div></div><div class="table-cards"><div class="pile-wrap"><div class="draw-stack"><img src="${backImage}" alt="Draw pile"></div><span>DRAW · ${state.drawPile.length}</span></div><div class="pile-wrap"><div class="played-slot">${top?cardElement(top,false,'last-card'):'<span class="empty-slot">PLAY HERE</span>'}</div><span>LAST PLAYED</span></div></div></div></div>
      <div class="seat-layer">${state.players.map((player,i)=>seatHtml(player,i,state!.players.length)).join('')}</div>
      ${state.phase==='target'&&humanTurn?'<div class="target-hint">Choose another player to take a forced turn</div>':''}
    </section><aside class="side-panel"><div class="side-card"><div class="eyebrow">AT THE TABLE</div><h3>${state.phase==='target'?'Choosing a target: ':state.forced?'Forced play: ':'Now playing: '}${escapeHtml(active.name)}</h3><div class="side-direction">${state.direction===1?'↻':'↺'} ${state.direction===1?'Clockwise':'Counter-clockwise'} · ${state.players.length} players</div></div><div class="side-card log-card"><div class="card-heading"><h3>Game log</h3><span>RECENT MOVES</span></div><ul>${state.log.slice(0,7).map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></div><div class="side-foot">GOOD PEOPLE. RISKY DECISIONS.</div></aside></div>
    <footer class="hand-dock"><div class="dock-prompt"><span class="eyebrow">${state.phase==='target'?'CHOOSE A TARGET':humanTurn?'YOUR TWO CARDS':'WATCH THE TABLE'}</span><strong>${state.phase==='target'&&humanTurn?'Tap a highlighted player':humanTurn?`It's your turn, ${escapeHtml(active.name)}!`:`${escapeHtml(active.name)} is thinking…`}</strong><small>${state.phase==='playing'&&humanTurn?'Drag or flick a card to the table, or select it below.':''}</small></div><div class="local-hand">${hand.length?hand.map(card=>cardElement(card,selectedCard===card.id,'hand-card')).join(''):`<div class="waiting-cards"><img src="${backImage}" alt="face-down card"><img src="${backImage}" alt="face-down card"></div>`}</div><div class="dock-controls"><button class="primary-button play-button" data-action="play-selected" ${!selectedCard||!humanTurn||state.phase!=='playing'?'disabled':''}>PLAY CARD <span>➜</span></button><label class="mood-label">MOOD <select id="live-mood" ${!humanTurn?'disabled':''}>${MOODS.map(m=>`<option ${active.mood===m?'selected':''}>${m}</option>`).join('')}</select></label></div></footer>
    ${state.phase==='ended'?resultView():''}</main>`;
}
function resultView(): string {
  if (!state) return '';
  const loser = state.players[state.bust!];
  return `<div class="overlay result-overlay"><section class="result-panel"><div class="eyebrow">ROUND ${state.round} COMPLETE</div><div class="result-icon">☄</div><h2>${escapeHtml(loser.name)} busted!</h2><p>The shared total reached <strong>${state.total}</strong>. Everyone else survives.</p><div class="result-grid"><div><span>SURVIVORS</span><strong>${state.players.filter(p=>p.id!==state!.bust).map(p=>escapeHtml(p.name)).join(', ')}</strong></div><div><span>EXACT 100 EVENTS</span><strong>${state.exactEvents.length?state.exactEvents.map(e=>escapeHtml(state!.players[e.player].name)).join(', '):'None this round'}</strong></div></div><div class="rating-list">${state.players.map(p=>`<span>${escapeHtml(p.name)} <strong class="${p.ratingDelta<0?'negative':''}">${p.ratingDelta>=0?'+':''}${p.ratingDelta}</strong></span>`).join('')}</div><div class="result-actions"><button class="primary-button" data-action="again">PLAY AGAIN</button><button class="secondary-button" data-action="new-game">NEW GAME</button></div></section></div>`;
}
function modalView(): string {
  if (!modal) return '';
  const body = modal==='rules' ? `<h2>How to play</h2><p>Keep the shared total at or below 100. Play one of your two cards every turn, then draw a replacement. The player who takes the total over 100 busts; everyone else survives.</p><div class="rules-grid"><div><strong>A, 2–6</strong><span>Add face value</span></div><div><strong>J, Q, K</strong><span>Add 10</span></div><div><strong>7 · CHOOSE</strong><span>Make another player play immediately. Their normal turn stays in place.</span></div><div><strong>8 · REVERSE</strong><span>Reverse direction. In a two-player game, play again.</span></div><div><strong>9 · ZERO</strong><span>Add nothing.</span></div><div><strong>10 · MINUS</strong><span>Subtract 10.</span></div></div><p>Hit exactly 100 for +3 rating; play continues. Survive for +1. Bust for −5. Suits are visual only.</p><p><strong>Controls:</strong> drag or flick a card toward the center. On touch screens, swipe it. You can also tap a card, then press Play Card.</p>`
  : modal==='settings' ? `<h2>Settings</h2><div class="modal-setting"><label for="volume">Sound volume <strong>${Math.round(settings.volume*100)}%</strong></label><input id="volume" type="range" min="0" max="1" step="0.01" value="${settings.volume}"></div><div class="modal-setting"><label for="graphics">Graphics</label><select id="graphics"><option value="high" ${settings.graphics==='high'?'selected':''}>High · holographic shine</option><option value="low" ${settings.graphics==='low'?'selected':''}>Low · static cards</option></select></div><p>Settings save on this device.</p>`
  : modal==='stats' ? `<h2>Local statistics</h2><div class="stats-grid">${[['Rounds',stats.rounds],['Exact 100s',stats.exacts],['Survivals',stats.survives],['Busts',stats.busts],['Cards played',stats.cards],['7s used',stats.sevens],['8s used',stats.eights],['9s used',stats.nines],['10s used',stats.tens],['Test rating',stats.rating],['Currency',stats.currency]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><p>Statistics, rating, and currency are local to this device. Currency does not affect gameplay.</p>`
  : `<h2>Game menu</h2><p>Round ${state?.round || 1} · ${state?.players.length || settings.playerCount} players</p><div class="menu-actions"><button class="secondary-button" data-action="restart">Restart round</button><button class="secondary-button" data-action="new-game">Return to setup</button><button class="secondary-button" data-action="stats">Local statistics</button></div>`;
  return `<div class="overlay modal-overlay" data-action="close-modal"><section class="modal-panel" role="dialog" aria-modal="true"><button class="close-button" data-action="close-modal" aria-label="Close">×</button>${body}</section></div>`;
}
function render(): void {
  app.innerHTML = (state ? gameView() : setupView()) + modalView();
}
render();

app.addEventListener('click', event => {
  const target = event.target as HTMLElement;
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action) {
    if (action === 'close-modal' && target.closest('.modal-panel') && !target.closest('.close-button')) return;
    audio.play('click');
    if (action === 'start') startGame();
    if (action === 'again' && state) startGame(state.round + 1);
    if (action === 'restart' && state) { modal = null; startGame(state.round); }
    if (action === 'new-game') { clearCpu(); state = null; selectedCard = null; render(); }
    if (action === 'rules' || action === 'settings' || action === 'stats') { modal = action; render(); }
    if (action === 'menu') { modal = 'menu'; render(); }
    if (action === 'close-modal') { modal = null; render(); }
    if (action === 'play-selected' && selectedCard) void animatePlay(selectedCard, document.querySelector<HTMLElement>(`.hand-card[data-card="${selectedCard}"]`) || undefined);
    return;
  }
  const seat = target.closest<HTMLElement>('[data-target]');
  if (seat?.dataset.target) { chooseTarget(Number(seat.dataset.target)); return; }
});
app.addEventListener('change', event => {
  const el = event.target as HTMLInputElement | HTMLSelectElement;
  if (el.id === 'player-count') { settings.playerCount = Number(el.value); save(); render(); }
  if (el.id === 'difficulty') { settings.difficulty = el.value as Settings['difficulty']; save(); }
  if (el.dataset.seatKind) setSeat(Number(el.dataset.seatKind), { kind: el.value as PlayerConfig['kind'] });
  if (el.dataset.seatAvatar) setSeat(Number(el.dataset.seatAvatar), { avatar: Number(el.value) });
  if (el.dataset.seatMood) setSeat(Number(el.dataset.seatMood), { mood: el.value as PlayerConfig['mood'] });
  if (el.dataset.seatName) setSeat(Number(el.dataset.seatName), { name: el.value });
  if (el.id === 'live-mood' && state) { state.players[state.current].mood = el.value as PlayerConfig['mood']; settings.seats[state.current].mood = el.value as PlayerConfig['mood']; save(); render(); }
  if (el.id === 'graphics') { settings.graphics = el.value as Settings['graphics']; save(); }
});
app.addEventListener('input', event => {
  const el = event.target as HTMLInputElement;
  if (el.id === 'volume') { settings.volume = Number(el.value); save(); document.querySelector('.modal-setting strong')!.textContent = `${Math.round(settings.volume*100)}%`; }
});
app.addEventListener('keydown', event => {
  const target = event.target as HTMLElement;
  if (event.key === 'Enter' && target.matches('.hand-card')) { selectedCard = target.dataset.card || null; render(); }
  if (event.key === 'Escape' && modal) { modal = null; render(); }
});

let drag: { element: HTMLElement; id: string; x: number; y: number; time: number; lastX: number; lastY: number; lastTime: number; moved: boolean } | null = null;
app.addEventListener('pointerdown', event => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('.hand-card');
  if (!card || !state || locked || state.phase !== 'playing' || state.players[state.current].kind !== 'human') return;
  drag = { element: card, id: card.dataset.card!, x: event.clientX, y: event.clientY, time: performance.now(), lastX: event.clientX, lastY: event.clientY, lastTime: performance.now(), moved: false };
  card.setPointerCapture(event.pointerId); card.classList.add('dragging'); audio.play('pickup');
});
app.addEventListener('pointermove', event => {
  if (!drag) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  drag.moved ||= Math.hypot(dx,dy) > 8;
  drag.element.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.max(-12,Math.min(12,dx*.045))}deg) scale(1.08)`;
  drag.lastX = event.clientX; drag.lastY = event.clientY; drag.lastTime = performance.now();
});
function endDrag(event: PointerEvent): void {
  if (!drag) return;
  const current = drag; drag = null;
  const dx = event.clientX-current.x, dy = event.clientY-current.y;
  const dist = Math.hypot(dx,dy);
  const elapsed = Math.max(1,performance.now()-current.time);
  const velocity = dist / elapsed;
  const zone = document.querySelector<HTMLElement>('.table-felt')?.getBoundingClientRect();
  const towardX = (zone?.left || innerWidth/2)+(zone?.width || 0)/2-current.x;
  const towardY = (zone?.top || innerHeight/2)+(zone?.height || 0)/2-current.y;
  const toward = (dx*towardX+dy*towardY)/(Math.max(1,dist)*Math.max(1,Math.hypot(towardX,towardY)));
  const inZone = !!zone && event.clientX>zone.left && event.clientX<zone.right && event.clientY>zone.top && event.clientY<zone.bottom;
  current.element.classList.remove('dragging');
  if (dist >= CONFIG.CARD_THROW_MIN_DISTANCE && toward > .5 && (inZone || velocity >= CONFIG.CARD_THROW_MIN_VELOCITY)) {
    current.element.style.transform = '';
    void animatePlay(current.id, current.element);
  } else {
    current.element.style.transform = '';
    if (dist < 12) { selectedCard = current.id; render(); }
    else current.element.animate([{transform:`translate(${dx}px, ${dy}px) rotate(${Math.max(-12,Math.min(12,dx*.045))}deg) scale(1.08)`},{transform:'translate(0,0) rotate(0deg) scale(1)'}],{duration:240,easing:'ease-out'});
  }
}
app.addEventListener('pointerup', endDrag);
app.addEventListener('pointercancel', endDrag);
