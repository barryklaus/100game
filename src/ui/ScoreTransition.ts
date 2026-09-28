import type { GameState } from '../game/types';

/** Round deltas are supplied by the rules engine, never inferred by the renderer. */
export function scoreTransition(state:GameState,canAdvance:boolean,online:boolean,escape:(text:string)=>string):string {
  const cause=state.players[state.bust!];
  return `<div class="result-overlay"><section class="result-panel" role="region" aria-label="Round scores"><div class="score-heading"><div><span class="eyebrow">ROUND ${state.round} · SCORES</span><h2>${escape(cause.name)} caused Overflow</h2></div><span class="score-mark">✧</span></div><div class="rating-list">${state.players.map(player=>`<div class="score-entry"><span>${escape(player.name)}<small>${player.id===state.bust?'Overflow −5':'Survived +1'}${player.exacts?` · Exact 100 +${player.exacts*3}`:''}</small></span><strong class="${player.ratingDelta<0?'negative':''}">${player.ratingDelta>=0?'+':''}${player.ratingDelta}</strong></div>`).join('')}</div><div class="result-actions">${canAdvance?'<button class="primary-button" data-action="again">Next round <span>→</span></button>':'<p>Waiting for the host to start the next round.</p>'}<button class="text-button" data-action="${online?'leave-room':'new-game'}">${online?'Leave room':'Leave table'}</button></div></section></div>`;
}
