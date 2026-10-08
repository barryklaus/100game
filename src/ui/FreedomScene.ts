import type { Player } from '../game/types';
import { masterImage } from './MasterCharacters';

/** Animate one complete character drawing; never split the artwork into body parts. */
export function freedomScene(player:Player,score:number,escape:(s:string)=>string):string {
  return `<section class="freedom-scene" role="dialog" aria-modal="true" aria-labelledby="freedom-title" data-outcome-seat="${player.id}"><div class="freedom-room" aria-hidden="true"></div><header><span class="eyebrow">THE HOUSE LOST YOUR FILE</span><h1 id="freedom-title">FREEDOM</h1><p>${escape(player.name)} made it out · ${score} points</p></header><div class="freedom-stage"><div class="freedom-door"><span class="freedom-exit">EXIT</span><div class="freedom-night"><span>THE REST OF YOUR LIFE</span></div><div class="freedom-door-left"></div><div class="freedom-door-right"></div></div><div class="freedom-road"></div><div class="freedom-character"><img src="${masterImage(player.avatar)}" alt="${escape(player.name)} leaving the club"></div><div class="freedom-paper" aria-hidden="true">DEBT<br>CANCELLED</div><div class="freedom-stamp" aria-hidden="true">NOT OUR PROBLEM<br>ANYMORE</div></div><footer><p>Overall points reset to 0. Your record lives on.</p><button class="primary-button" data-action="dismiss-freedom">Back to the table →</button></footer></section>`;
}
