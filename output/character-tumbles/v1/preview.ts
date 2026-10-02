import '../../../src/style.css';
import '../../../src/game-presentation.css';
import '../../../src/observatory.css';
import '../../../src/characters.css';
import './preview.css';
import {ObservatoryScene} from '../../../src/render/ObservatoryScene';

type Character = {id:number;name:string;sheet:string};
const manifest = await fetch('./manifest.json').then(response=>response.json());
const characters:Character[] = manifest.characters;
const character = document.querySelector<HTMLSelectElement>('#character')!;
const pose = document.querySelector<HTMLInputElement>('#pose')!;
const labels = ['Startled','Leaning back','Losing balance','Cards fly','Reclining','Knees rise','Tumbling','Boots up','Fallen'];
character.innerHTML=characters.map((item,i)=>`<option value="${i}">${item.name}</option>`).join('');
document.documentElement.classList.add('observatory-mode');
const scene = new ObservatoryScene();
scene.configure({quality:'high',reducedMotion:false});
const back=`${import.meta.env.BASE_URL}assets/cards/back.webp`;
scene.update({active:true,total:0,direction:1,event:'none',eventKey:'tumble-preview',playerCount:3,localSeat:1,activeSeat:1,drawCount:32,discardCount:0,drawCardUrl:back});
let timer=0;
let generation=0;
const seats=document.querySelector('#seats')!;
const replay=document.querySelector<HTMLButtonElement>('#replay')!;
async function showCharacter(){
  const current=++generation;
  clearTimeout(timer);replay.disabled=true;
  const selected=characters[Number(character.value)];
  const image=new Image();image.src=`./${selected.sheet}`;await image.decode();
  if(current!==generation)return;
  const side=(id:number,x:number)=>`<button class="seat sprite-seat background-seat" data-seat="${id}" style="--ring-x:${x}vw;--ring-scale:.9"><span class="character"><span class="character-sprite sprite-ready" style="background-image:url('${import.meta.env.BASE_URL}assets/characters/avatar-${String((selected.id+id+1)%16+1).padStart(2,'0')}.webp?v=expanded-v2');background-position:100% 50%"></span></span></button>`;
  seats.innerHTML=side(0,20)+`<button class="seat sprite-seat tumble-seat" data-seat="1" style="--ring-x:50vw;--ring-scale:1"><span class="character"><span class="character-sprite sprite-ready" style="background-image:url('./${selected.sheet}')"></span></span><span class="seat-info"><span class="seat-name">${selected.name}</span></span></button>`+side(2,80);
  document.querySelector<HTMLAnchorElement>('#sheet-link')!.href=`./${selected.sheet}`;
  document.querySelector('#status')!.textContent=`${characters.length} characters · 9 poses each · existing artwork references`;
  pose.value='0';paint();scene.projectPlayerRing();replay.disabled=false;
}
function paint(){
  const frame=Number(pose.value);
  const sprite=document.querySelector<HTMLElement>('.tumble-seat .character-sprite');
  if(sprite){sprite.style.backgroundPosition=`${frame%3*50}% ${Math.floor(frame/3)*50}%`;sprite.style.translate=`0 ${Math.max(0,frame-5)*4}%`;}
  document.querySelector('#pose-name')!.textContent=labels[frame];
  document.querySelector('.tumble-seat')?.classList.toggle('spotlight',frame>0);
  seats.classList.toggle('tumbling',frame>0);
}
replay.addEventListener('click',()=>{
  clearTimeout(timer);replay.disabled=true;pose.value='0';paint();
  const step=()=>{pose.value=String(Number(pose.value)+1);paint();if(Number(pose.value)<8)timer=window.setTimeout(step,150);else replay.disabled=false;};
  timer=window.setTimeout(step,300);
});
pose.addEventListener('input',()=>{clearTimeout(timer);replay.disabled=false;paint();});
character.addEventListener('change',()=>void showCharacter());
window.addEventListener('resize',()=>scene.projectPlayerRing());
window.addEventListener('pagehide',()=>{clearTimeout(timer);scene.dispose();});
await showCharacter();
