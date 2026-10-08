import type { Player } from '../game/types';
import { masterFrameUrl } from './MasterAnimations';
import { masterCharacter, masterImage } from './MasterCharacters';
const epitaphs=[
 'A strong hand. A weak grasp of arithmetic.',
 'Asked for another round. Got a plot.',
 'The odds were terrible. So was the attitude.',
 'Finally stopped making it everyone else’s problem.',
 'Never folded. The undertaker did.',
 'Kept pushing their luck. It pushed back.',
 'Thought the limit was a suggestion.',
 'Their debt is now somebody else’s paperwork.',
];
export function deathScene(player:Player,score:number,round:number,escape:(s:string)=>string):string {
 const quote=epitaphs[(player.avatar+round)%epitaphs.length];
 return `<section class="death-scene" role="dialog" aria-modal="true" aria-labelledby="death-title" data-outcome-seat="${player.id}"><div class="death-sky"></div><header><span class="eyebrow">THE HOUSE COLLECTED</span><h1 id="death-title">DEATH</h1><p>${escape(player.name)} · ${score} points</p></header><div class="death-stage"><div class="death-grave"><div class="grave-inscription"><div class="grave-portrait"><img src="${masterImage(player.avatar,true)}" alt=""></div><h2>${escape(player.name)}</h2><p>${escape(quote)}</p><strong>100</strong></div></div><div class="death-soil" aria-hidden="true"></div><div class="death-ghost"><img src="${masterFrameUrl(masterCharacter(player.avatar).id)}" alt="${escape(player.name)}’s ghost"></div><div class="death-dust" aria-hidden="true"></div><span class="death-receipt" aria-hidden="true">PAID</span></div><footer><p>Out of the game. Into the lore. Overall points reset to 0.</p><button class="primary-button" data-action="dismiss-death">Back to the table →</button></footer></section>`;
}
