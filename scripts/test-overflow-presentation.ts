import '../src/style.css';
import '../src/game-presentation.css';
import '../src/observatory.css';
import '../src/characters.css';
import {PlayerRing} from '../src/ui/PlayerRing';
import {updateGameView} from '../src/ui/updateGameView';
import {ObservatoryScene} from '../src/render/ObservatoryScene';

document.documentElement.classList.add('observatory-mode');
const root=document.querySelector<HTMLElement>('#app')!;
const status=document.querySelector<HTMLElement>('#status')!;
const scene=new ObservatoryScene();
scene.configure({quality:'high',reducedMotion:false});
const base=import.meta.env.BASE_URL;
scene.update({active:true,total:105,direction:1,event:'none',eventKey:'fixture',playerCount:8,localSeat:0,activeSeat:7,drawCount:24,discardCount:1,drawCardUrl:`${base}assets/cards/back.webp`});
let completions=0, revision=0, scores=false, count=8, missing=false;
let snapshot={roundKey:'fixture-0',count:8,active:0,total:99,overflow:false,overflowSeat:7,reducedMotion:false,target:false};
const ring=new PlayerRing(root,()=>scene.projectPlayerRing(),()=>{completions++;scores=true;paint();});
function markup(){
  return `<main class="game-page" data-phase="${snapshot.overflow?'ended':'playing'}"><div class="game-layout"><section class="arena"><div class="seat-layer player-ring">${Array.from({length:count},(_,i)=>`<button class="seat sprite-seat" data-seat="${i}"><span class="character"><span class="character-sprite" data-avatar="${i}" data-sprite-url="${base}assets/characters/avatar-${String(i+1).padStart(2,'0')}.webp?v=expanded-v2" style="background-image:url('${base}assets/characters/avatar-${String(i+1).padStart(2,'0')}.webp?v=expanded-v2')"></span><img class="sprite-fallback" src="${base}assets/avatars/avatar-${String(i+1).padStart(2,'0')}.jpg" alt=""><span class="character-tumble" data-tumble-url="${base}assets/characters/tumbles/${missing?'missing.webp':`avatar-${String(i+1).padStart(2,'0')}-tumble.webp?v=1`}"></span><span class="sprite-hand-anchor"></span></span><span class="seat-info"><span class="seat-name">Player ${i+1}</span></span></button>`).join('')}</div><nav class="ring-controls"><button data-ring-step="1">Browse</button></nav></section></div>${scores?'<section class="result-overlay"><div class="result-panel">Scores shown after the tumble</div></section>':''}</main>`;
}
function paint(){updateGameView(root,markup());ring.sync(snapshot);}
function reset(n=8,reduced=false,broken=false){
  count=n;missing=broken;scores=false;
  snapshot={roundKey:`fixture-${++revision}`,count:n,active:0,total:99,overflow:false,overflowSeat:n-1,reducedMotion:reduced,target:false};paint();
}
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(yes:unknown,message:string)=>{if(!yes)throw new Error(message);};
async function overflow(){snapshot={...snapshot,active:count-1,total:105,overflow:true};paint();}
async function run(){
  status.textContent='Running…';
  try{
    for(const n of [8,4]){
      reset(n);await wait(200);const before=completions;
      await overflow();check(!scores,'Scores appeared before the fall');
      // Repeated real view patches must not replace or reset the running sheet.
      const sprite=root.querySelector(`.seat[data-seat="${n-1}"] .character-tumble`);
      await wait(850);
      check(root.querySelector('.overflow-culprit')?.getAttribute('data-seat')===String(n-1),'Wrong overflow player spotlighted');
      const culprit=root.querySelector<HTMLElement>('.overflow-culprit')!;
      check(Math.abs(parseFloat(culprit.style.getPropertyValue('--ring-x'))-50)<.1,'Overflow player not centered');
      let previous=-1;
      for(let i=0;i<4;i++){
        paint();check(root.querySelector(`.seat[data-seat="${n-1}"] .character-tumble`)===sprite,'Sheet node replaced');
        const frame=Number((sprite as HTMLElement).dataset.frame);
        check(frame>=previous,'Tumble frame reset');previous=frame;
        check(!scores,'Scores covered the fall');await wait(140);
      }
      await wait(1200);
      check(completions===before+1&&scores&&ring.scoresReady(snapshot.roundKey),'Sequence did not complete exactly once');
      paint();await wait(100);check(completions===before+1,'Repeated overflow snapshot restarted sequence');
    }
    reset(4,true);const beforeReduced=completions;await overflow();await wait(30);
    check(scores&&completions===beforeReduced+1,'Reduced motion delayed scores');
    check(!root.querySelector('.tumbling'),'Reduced motion played fall');
    reset(8,false,true);await overflow();await wait(850);
    check(!!root.querySelector('.tumble-fallback'),'Missing asset did not use fallback');await wait(1700);check(scores,'Missing asset stranded scores');
    reset();await overflow();await wait(850);const beforeCancel=completions;reset(4);await wait(1600);
    check(completions===beforeCancel&&!scores&&!root.querySelector('.overflow-culprit'),'Old round callback leaked');
    check(root.querySelector<HTMLButtonElement>('[data-ring-step]')?.disabled===false,'New round controls stayed locked');
    status.textContent='PASS · 8/4-player focus · stable frames · delayed scores · one completion · reduced motion · missing image fallback · next-round cancellation';
  }catch(error){status.textContent=`FAIL · ${(error as Error).message}`;throw error;}
}
document.querySelector('#suite')!.addEventListener('click',()=>void run());
document.querySelector('#replay')!.addEventListener('click',()=>{reset();void overflow();});
document.querySelector('#pause')!.addEventListener('click',async ()=>{
  // Static pose uses the runtime sheet/mask for a reviewable screenshot.
  reset();snapshot={...snapshot,reducedMotion:true,overflow:true,total:105};paint();await wait(50);
  scores=false;root.querySelector('.result-overlay')?.remove();
  const seat=root.querySelector<HTMLElement>('.overflow-culprit')!;seat.classList.add('tumbling');
  const sprite=seat.querySelector<HTMLElement>('.character-tumble')!;
  const image=new Image();image.src=sprite.dataset.tumbleUrl!;await image.decode();
  sprite.style.backgroundImage=`url('${sprite.dataset.tumbleUrl}')`;sprite.style.backgroundPosition='0% 100%';
  status.textContent='Static proof · selected player tumbling behind the real table';
});
paint();
