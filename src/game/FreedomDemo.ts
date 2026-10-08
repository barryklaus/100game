import { createDeathDemo } from './DeathDemo';
import type { Card, GameState } from './types';

/** Demonstrate a real final play and CPU Overflow without modifying any history. */
export function createFreedomDemo(character='finn',round=20):GameState {
  const state=createDeathDemo(character,round);
  const pool=[...state.drawPile,...state.played,...state.players.flatMap(player=>player.hand)];
  const take=(id:string):Card=>{const index=pool.findIndex(card=>card.id===id);if(index<0)throw Error('Missing demo card');return pool.splice(index,1)[0];};
  state.players[0].hand=[take('fire-9'),take('water-9')];
  state.players[1].hand=[take('fire-4'),take('water-6')];
  state.played=[take('leaf-6')];
  state.players[2].hand=pool.splice(0,2);state.players[3].hand=pool.splice(0,2);state.drawPile=pool;
  state.players.forEach((player,index)=>{player.lifetimePoints=index===0?28:0;});
  state.match!.scores=[28,6,4,8];state.match!.previous=3;
  state.log=[`${state.players[0].name} has 28 points. Play Zero; the next player’s Overflow earns +2 and Freedom.`, 'The shared total is 99.'];
  return state;
}
