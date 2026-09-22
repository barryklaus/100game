import { CONFIG } from '../data/config';
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
  return (from + state.direction + state.players.length) % state.players.length;
}

function addLog(state: GameState, message: string): void {
  state.log.unshift(message);
  state.log = state.log.slice(0, 24);
}

export function createGame(configs: PlayerConfig[], round = 1, random = Math.random): GameState {
  if (configs.length < CONFIG.PLAYER_MIN || configs.length > CONFIG.PLAYER_MAX) throw new Error('Invalid player count');
  const drawPile = shuffle(makeDeck(), random);
  const players = configs.map((config, id) => ({ ...config, id, hand: drawPile.splice(0, CONFIG.HAND_SIZE), ratingDelta: 0, exacts: 0 }));
  const start = Math.floor(random() * players.length);
  return { players, drawPile, played: [], total: 0, direction: 1, current: start, phase: 'playing', pendingSevens: [], rootTurn: start, forced: false, round, exactEvents: [], bust: null, log: [`Round ${round} begins. ${players[start].name} plays first.`], event: 'none' };
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
  // A forced card completes the newest 7, then any earlier 7 in the chain.
  while (state.pendingSevens.length) {
    const chooser = state.pendingSevens.pop()!;
    drawReplacement(state, chooser);
  }
  state.forced = false;
  state.current = state.players.length === 2 && actor === state.rootTurn && state.played.at(-1)?.rank === '8'
    ? state.rootTurn
    : nextSeat(state, state.rootTurn);
  state.rootTurn = state.current;
  state.phase = 'playing';
}

export function playCard(state: GameState, cardId: string): GameState {
  if (state.phase !== 'playing') throw new Error('A card cannot be played now');
  const player = state.players[state.current];
  const index = player.hand.findIndex(card => card.id === cardId);
  if (index < 0) throw new Error('Card is not in the active hand');
  const [card] = player.hand.splice(index, 1);
  state.played.push(card);
  const previousTotal = state.total;
  state.total += cardValue(card);
  state.event = 'none';
  addLog(state, `${player.name} played ${cardDisplayRank(card)} ${card.suit.toUpperCase()} · Total ${state.total}`);

  if (previousTotal !== 100 && state.total === 100) {
    state.exactEvents.push({ player: player.id, total: 100 });
    player.exacts++;
    player.ratingDelta += CONFIG.RATING_EXACT_100;
    state.event = 'exact';
    addLog(state, `✦ ${player.name} hit exactly 100!`);
  }
  if (state.total > 100) {
    state.bust = player.id;
    state.phase = 'ended';
    state.event = 'bust';
    player.ratingDelta += CONFIG.RATING_BUST;
    state.players.forEach(other => { if (other.id !== player.id) other.ratingDelta += CONFIG.RATING_SURVIVE; });
    addLog(state, `${player.name} busted at ${state.total}.`);
    return state;
  }

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
  if (target === chooser || !state.players[target]) throw new Error('Choose another player');
  state.current = target;
  state.forced = true;
  state.phase = 'playing';
  addLog(state, `${state.players[target].name} must play a card.`);
  return state;
}
