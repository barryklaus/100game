import '../src/style.css';import '../src/game-presentation.css';import '../src/premium.css';import '../src/observatory.css';import '../src/characters.css';
import {ObservatoryScene} from '../src/render/ObservatoryScene';
import {PlayerRing} from '../src/ui/PlayerRing';
import {cardFace} from '../src/game/cardFace';
import {totalMarkup} from '../src/ui/totalFeedback';
import type {Card} from '../src/game/types';
const root=document.querySelector<HTMLElement>('#app')!,status=document.querySelector('#status')!;
const base=import.meta.env.BASE_URL;
document.documentElement.classList.add('observatory-mode');
function card(rank:Card['rank'],slot:number){
  const face=cardFace({rank,suit:slot?'sun':'water'}),url=`${base}assets/cards/${face.suit}-${rank.toLowerCase()}.webp`;
  return `<div class="playing-card suit-${face.suit} special hand-card waiting-hand" data-card="${face.suit}-${rank}" role="img"><img src="${url}" data-standard-src="${url}" data-full-src="${base}assets/cards/full/${face.suit}-${rank.toLowerCase()}.png" alt="${face.index}"><span class="card-print"><span class="card-index top ${face.index.length>3?'word-index':''}" data-index="${face.index}">${face.index}</span><span class="card-action"><strong>${face.title}</strong><small>${face.detail}</small></span><span class="card-index bottom ${face.index.length>3?'word-index':''}" data-index="${face.index}">${face.index}</span></span></div>`;
}
root.innerHTML=`<main class="game-page" data-phase="playing"><div class="game-layout"><section class="arena"><div class="table-rim"><div class="table-felt"><div class="energy-system"><div class="total-wrap"><span class="total-caption">SHARED TOTAL</span><div class="total-number">${totalMarkup(85)}</div></div></div></div></div><div class="seat-layer player-ring">${Array.from({length:4},(_,i)=>`<button class="seat sprite-seat ${i===0?'active':''}" data-seat="${i}"><span class="character"><span class="character-sprite" data-avatar="${i}" data-sprite-url="${base}assets/characters/avatar-${String(i+1).padStart(2,'0')}.webp?v=expanded-v2" style="background-image:url('${base}assets/characters/avatar-${String(i+1).padStart(2,'0')}.webp?v=expanded-v2')"></span><span class="sprite-hand-anchor"></span></span><span class="seat-info"><span class="seat-name">${['You','Mira','Kai','Luma'][i]}</span><span class="seat-meta">2 cards</span></span></button>`).join('')}</div></section></div><footer class="hand-dock"><div class="local-hand">${card('8',0)+card('10',1)}</div></footer></main>`;
const scene=new ObservatoryScene();scene.configure({quality:'high',reducedMotion:false});
const ring=new PlayerRing(root,()=>scene.projectPlayerRing());
ring.sync({roundKey:'fixture',count:4,active:0,total:85,overflow:false,reducedMotion:false,target:false});
scene.update({active:true,total:85,direction:1,event:'none',eventKey:'mobile-check',playerCount:4,localSeat:0,activeSeat:0,drawCount:30,discardCount:1,drawCardUrl:`${base}assets/cards/back.webp`,discardCardUrl:`${base}assets/cards/leaf-3.webp`});
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(yes:unknown,message:string)=>{if(!yes)throw new Error(message);};
async function run(){
  status.textContent='Checking…';
  try{
    await wait(500);
    for(let i=0;i<4;i++){
      let arrived=0;
      await scene.drawCardToHand(`${base}assets/cards/back.webp`,ring.handRect(i)!,undefined,()=>{arrived++;ring.received(i);});
      check(arrived===1,'Draw arrival fired more than once');
      check(!scene['foreground'].scene.children.some(card=>card.name==='card-flight'),'Draw card remained in scene');
    }
    let rejected=false;
    try{await scene.drawCardToHand(`${base}assets/cards/back.webp`,ring.handRect(1)!,undefined,()=>{throw new Error('simulated arrival failure');});}catch{rejected=true;}
    check(rejected,'Arrival failure left a pending draw promise');
    check(!scene['foreground'].scene.children.some(card=>card.name==='card-flight'),'Failed arrival stranded a card');
    if(innerHeight>innerWidth*1.08){
      const cards=Array.from(root.querySelectorAll<HTMLElement>('.local-hand .hand-card'));
      check(cards.every(card=>{const r=card.getBoundingClientRect();return r.left>=8&&r.right<=innerWidth-8;}),'Hand card touches or crosses a screen edge');
      const total=root.querySelector<HTMLElement>('.total-number')!.getBoundingClientRect();
      const nameBottom=Math.max(...Array.from(root.querySelectorAll('.seat-info')).map(node=>node.getBoundingClientRect().bottom));
      check(total.top>=nameBottom+4,'Total overlaps character names');
      check(document.querySelector<HTMLCanvasElement>('.foreground-cards-canvas')!.hidden,'Empty mobile card canvas stayed visible');
    }
    status.textContent='PASS · four draws removed · failed arrival cleaned up · mobile hand inset · total below characters';
  }catch(error){status.textContent=`FAIL · ${(error as Error).message}`;throw error;}
}
document.querySelector('#run')!.addEventListener('click',()=>void run());
