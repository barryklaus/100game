import { CONFIG } from '../data/config';
import { isOut, FREEDOM_POINTS, DEATH_POINTS } from './conditions';
import { cardDisplayRank, makeDeck, shuffle } from './deckCore';
import type { Card, GameState, PlayerConfig } from './types';

export function cardValue(card: Card): number {
  if (card.rank === '7' || card.rank === '8' || card.rank === '9') return 0;
  if (card.rank === '10') return -10;
  if (card.rank === 'A') return 1;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank);
}

export function nextSeat(state: GameState, from: number): number {
  for(let step=1;step<=state.players.length;step++) {
    const next=(from + step*state.direction + state.players.length*step)%state.players.length;
    if(!isOut(state,next))return next;
  }
  return from;
}

function addLog(state: GameState, message: string): void {
  state.log.unshift(message);
  state.log = state.log.slice(0, 24);
}

export function createGame(configs: PlayerConfig[], round = 1, random = Math.random, nextMatch?: GameState['match']|true): GameState {
  if (configs.length < CONFIG.PLAYER_MIN || configs.length > CONFIG.PLAYER_MAX) throw new Error('Invalid player count');
  const drawPile = shuffle(makeDeck(), random);
  const match=nextMatch===true?{scores:configs.map(()=>0),dead:[],newlyDead:[],freed:[],newlyFreed:[],previous:null,setup:null,complete:false}:nextMatch?{...nextMatch,scores:[...nextMatch.scores],dead:[...nextMatch.dead],freed:[...nextMatch.freed??[]],newlyDead:[],newlyFreed:[],previous:null,setup:null}:undefined;
  if(match?.complete)throw new Error('Start a new match after the table is cleared.');
  const players = configs.map((config, id) => ({ ...config, id, hand: match?.dead.includes(id)||match?.freed?.includes(id)?[]:drawPile.splice(0, CONFIG.HAND_SIZE), ratingDelta: 0, exacts: 0 }));
  const living=players.filter(player=>!match?.dead.includes(player.id)&&!match?.freed?.includes(player.id));
  if(living.length<2)throw new Error('A round needs at least two living players.');
  const start = living[Math.floor(random() * living.length)].id;
  return { ...(match?{match}:{}), players, drawPile, played: [], total: 0, direction: 1, current: start, turn: 0, phase: 'playing', pendingSevens: [], rootTurn: start, forced: false, round, exactEvents: [], bust: null, log: [`Round ${round} begins. ${players[start].name} plays first.`], event: 'none' };
}

function drawReplacement(state: GameState, playerIndex: number, random = Math.random): void {
  const player = state.players[playerIndex];
  if (player.hand.length >= CONFIG.HAND_SIZE) return;
  if (state.drawPile.length === 0 && state.played.length > 1) {
    const top = state.played.pop()!;
    state.drawPile = shuffle(state.played, random);
    state.played = [top];
    addLog(state, 'Draw pile reshuffled.');
  }
  const card = state.drawPile.pop();
  if (card) player.hand.push(card);
}

function finishPlay(state: GameState, actor: number): void {
  drawReplacement(state, actor);
  // Clear each CHOOSE PLAYER in the chain once its chosen player has acted.
  while (state.pendingSevens.length) {
    const chooser = state.pendingSevens.pop()!;
    drawReplacement(state, chooser);
  }
  state.forced = false;
  // Continue from whoever actually played, in the current direction.
  // CHOOSE relocates the turn; REVERSE changes the direction from that seat.
  state.current = nextSeat(state, actor);
  state.rootTurn = state.current;
  state.phase = 'playing';
}

export function playCard(state: GameState, cardId: string): GameState {
  if (state.phase !== 'playing') throw new Error('A card cannot be played now');
  const player = state.players[state.current];
  if(isOut(state,player.id))throw new Error('This player has left the table.');
  const index = player.hand.findIndex(card => card.id === cardId);
  if (index < 0) throw new Error('Card is not in the active hand');
  state.turn = (state.turn ?? 0) + 1;
  const [card] = player.hand.splice(index, 1);
  state.played.push(card);
  const previousTotal = state.total;
  state.total += cardValue(card);
  state.event = 'none';
  addLog(state, `${player.name} played ${cardDisplayRank(card)} ${card.suit.toUpperCase()} · Total ${state.total}`);

  if (previousTotal !== 100 && state.total === 100 && (!state.match || player.exacts===0)) {
    state.exactEvents.push({ player: player.id, total: 100 });
    player.exacts++;
    player.ratingDelta += state.match?1:CONFIG.RATING_EXACT_100;
    state.event = 'exact';
    addLog(state, `✦ ${player.name} hit exactly 100!`);
  }
  if (state.total > 100) {
    state.bust = player.id;
    state.phase = 'ended';
    state.event = 'bust';
    player.ratingDelta += CONFIG.RATING_BUST;
    state.players.forEach(other => { if (other.id !== player.id&&!isOut(state,other.id)) other.ratingDelta += CONFIG.RATING_SURVIVE; });
    if(state.match){
      const match=state.match;
      match.setup=match.previous!==player.id?match.previous:null;
      if(match.setup!==null)state.players[match.setup].ratingDelta++;
      match.freed??=[];match.newlyFreed??=[];match.outcomePoints??={};
      for(const other of state.players){
        if(isOut(state,other.id))continue;
        match.scores[other.id]+=other.ratingDelta;
        if(match.scores[other.id]<=DEATH_POINTS){match.dead.push(other.id);match.newlyDead.push(other.id);match.outcomePoints[other.id]=match.scores[other.id];}
        else {
          if(match.scores[other.id]>=FREEDOM_POINTS){match.freed.push(other.id);match.newlyFreed.push(other.id);match.outcomePoints[other.id]=match.scores[other.id];addLog(state,`${other.name} earned Freedom with ${match.scores[other.id]} table points.`);}
        }
      }
      for(const other of state.players)if(isOut(state,other.id)&&other.hand.length){state.drawPile.push(...other.hand);other.hand=[];}
      match.complete=state.players.filter(other=>!isOut(state,other.id)).length<2;
    }
    addLog(state, `${player.name} busted at ${state.total}.`);
    return state;
  }

  if(state.match)state.match.previous=player.id;

  if (card.rank === '7') {
    // Refill before target selection so every visible hand stays at two cards.
    drawReplacement(state, player.id);
    state.pendingSevens.push(player.id);
    state.phase = 'target';
    state.event = 'seven';
    addLog(state, `${player.name} chooses a player to play now.`);
    return state;
  }
  if (card.rank === '8') {
    state.direction = state.direction === 1 ? -1 : 1;
    state.event = 'reverse';
    addLog(state, 'Direction reversed!');
  }
  if (card.rank === '9') state.event = 'zero';
  if (card.rank === '10') state.event = 'minus';
  finishPlay(state, player.id);
  return state;
}

export function selectTarget(state: GameState, target: number): GameState {
  if (state.phase !== 'target') throw new Error('No target selection now');
  const chooser = state.pendingSevens.at(-1)!;
  if (target === chooser || !state.players[target] || isOut(state,target)) throw new Error('Choose another living player');
  state.turn = (state.turn ?? 0) + 1;
  state.current = target;
  state.forced = true;
  state.phase = 'playing';
  addLog(state, `${state.players[target].name} must play a card.`);
  return state;
}
