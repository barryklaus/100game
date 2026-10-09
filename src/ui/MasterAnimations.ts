import { conditionAnimations } from './ConditionAnimationData';
import { masterAnimations, type MasterAnimationSet } from './MasterAnimationData';
import { masterHandRect } from './MasterCharacters';
interface CastState { active:number; total:number; overflow:boolean; overflowSeat?:number; target:boolean; reducedMotion:boolean }
interface Seat { element:HTMLElement; image:HTMLImageElement; id:string; condition:number; data:MasterAnimationSet; epoch:number; held:1|2; frame:string; mood:string; fallen:boolean; timer:number; blinkTimer:number; phase:'rest'|'prepare'|'release'|'receive'; warmed:boolean; animation?:{frames:string[];resolve:()=>void} }
export function masterFrameUrl(id:string,frame='rest',condition=0):string { return `${import.meta.env.BASE_URL}assets/social-club/${condition&&conditionAnimations[id]?.[condition]?'condition-animation-v1/'+id+'/'+condition:'master-animation-v2/'+id}/${frame}.webp`; }
export function masterFrameBounds(id:string,frame='rest',condition=0):number[] {
 const data=conditionAnimations[id]?.[condition]??masterAnimations[id], [x,y,w,h]=data.bounds[frame], [scale,dx,dy]=data.registration??[1,0,0], [poseScale,poseX,poseY]=data.poseRegistration?.[frame]??[1,0,0];
 return [(x*poseScale+poseX)*scale+dx,(y*poseScale+poseY)*scale+dy,w*poseScale*scale,h*poseScale*scale];
}
export function masterFrameStyle(id:string,frame='rest',condition=0):string {const [x,y,w,h]=masterFrameBounds(id,frame,condition);return `left:${x/2048*100}%;top:${y/2048*100}%;width:${w/2048*100}%;height:${h/2048*100}%`;}
/** One complete drawing per pose. Only empty pixels are omitted from downloaded files. */
export class MasterAnimations {
 private seats=new Map<number,Seat>();
 private assets=new Map<string,Promise<HTMLImageElement>>();
 private state:CastState={active:0,total:0,overflow:false,target:false,reducedMotion:false};
 private visible=new Set<number>();
 constructor(private root:HTMLElement){}
 has(index:number):boolean{return !!this.root.querySelector(`.seat[data-seat="${index}"] .master-sprite`);}
 private seat(index:number):Seat|undefined {
  const element=this.root.querySelector<HTMLElement>(`.seat[data-seat="${index}"] .master-sprite`),image=element?.querySelector<HTMLImageElement>('.master-frame'),id=element?.dataset.character;
  if(!element||!image||!id||!masterAnimations[id])return;
  const condition=Number(element.dataset.condition??0),data=conditionAnimations[id]?.[condition]??masterAnimations[id];
  let seat=this.seats.get(index);
  if(!seat||seat.element!==element||seat.id!==id){if(seat){clearTimeout(seat.blinkTimer);this.stop(seat);}seat={element,image,id,condition,data,epoch:0,held:2,frame:'',mood:'Normal',fallen:false,timer:0,blinkTimer:0,phase:'rest',warmed:false};this.seats.set(index,seat);}
  if(seat.condition!==condition){this.stop(seat);seat.condition=condition;seat.data=data;seat.warmed=false;seat.frame='';}
  return seat;
 }
 private load(seat:Seat,frame:string):Promise<HTMLImageElement>{
  const url=masterFrameUrl(seat.id,frame,seat.condition);let promise=this.assets.get(url);
  if(promise){this.assets.delete(url);this.assets.set(url,promise);return promise;}
  const image=new Image();image.src=url;promise=image.decode().then(()=>image).catch(error=>{this.assets.delete(url);throw error;});this.assets.set(url,promise);return promise;
 }
 private trim():void{
  const protectedUrls=new Set<string>();this.seats.forEach(seat=>{protectedUrls.add(masterFrameUrl(seat.id,seat.frame,seat.condition));seat.animation?.frames.forEach(frame=>protectedUrls.add(masterFrameUrl(seat.id,frame,seat.condition)));if(seat.phase!=='rest')for(const clip of ['throw','receive-ready','pickup'])seat.data.clips[clip]?.frames.forEach(frame=>protectedUrls.add(masterFrameUrl(seat.id,frame,seat.condition)));});
  for(const key of this.assets.keys()){if(this.assets.size<=24)break;if(!protectedUrls.has(key))this.assets.delete(key);}
 }
 private paint(seat:Seat,frame:string):void{seat.frame=frame;seat.image.src=masterFrameUrl(seat.id,frame,seat.condition);seat.image.style.cssText=masterFrameStyle(seat.id,frame,seat.condition);seat.element.dataset.frame=frame;seat.element.dataset.cards=String(seat.held);}
 private stop(seat:Seat):void{seat.epoch++;clearTimeout(seat.timer);seat.timer=0;seat.animation?.resolve();seat.animation=undefined;delete seat.element.dataset.animation;}
 reset():void{this.visible.clear();this.seats.forEach(seat=>{clearTimeout(seat.blinkTimer);this.stop(seat);});this.seats.clear();this.assets.clear();}
 async warm(index:number,clip?:string):Promise<void>{const seat=this.seat(index);if(!seat)return;const frames=clip?(clip==='throw'?['throw','receive-ready','pickup']:[clip]).flatMap(key=>seat.data.clips[key]?.frames??[]):['rest'];await Promise.all([...new Set(frames)].map(frame=>this.load(seat,frame))).then(()=>undefined).catch(()=>undefined);this.trim();}
 private idleFrame(index:number,seat:Seat):string{
  if(seat.held===1)return seat.data.clips.throw.frames.at(-1)!;
  const emotion=this.state.overflow?'shocked':this.state.total>=90?'panicked':this.state.total>=70?'nervous':index===this.state.active?'focused':({Happy:'amused',Smug:'smug',Angry:'frustrated',Sad:'defeated',Confident:'confident',Scared:'nervous'}[seat.mood]??'calm');
  return seat.data.emotions[emotion]??'rest';
 }
 private async rest(index:number):Promise<void>{
  const seat=this.seat(index);if(!seat||seat.animation||seat.fallen||seat.phase!=='rest')return;
  const frame=this.idleFrame(index,seat),epoch=seat.epoch,state=this.state;
  if(seat.frame===frame)return;
  try{await this.load(seat,frame);if(this.seats.get(index)===seat&&seat.epoch===epoch&&state===this.state&&!seat.animation&&!seat.fallen&&seat.image.isConnected)this.paint(seat,frame);}catch{/* Keep the current complete drawing if a request fails. */}
  this.trim();
 }
 sync(state:CastState):void{
  const previous=this.state;this.state=state;
  this.visible.clear();
  this.root.querySelectorAll<HTMLElement>('.master-seat:not([hidden])').forEach(node=>{const index=Number(node.dataset.seat),seat=this.seat(index);if(!seat)return;seat.mood=node.dataset.mood??'Normal';
   this.visible.add(index);
   if(node.dataset.condition==='4'){clearTimeout(seat.blinkTimer);seat.blinkTimer=0;if(!seat.fallen){this.stop(seat);seat.fallen=true;const epoch=seat.epoch;void this.load(seat,'floor').then(()=>{if(seat.epoch===epoch&&this.seats.get(index)===seat&&seat.image.isConnected)this.paint(seat,'floor');}).catch(()=>{});}return;}
   void this.rest(index);
   if(index===state.active&&!state.overflow&&(!seat.warmed||previous.active!==state.active)){seat.warmed=true;void this.warm(index,'throw');}
   if(!state.reducedMotion&&!state.overflow&&previous.active!==state.active&&!seat.animation&&!seat.fallen&&seat.phase==='rest'&&seat.held===2){
    const pose=this.idleFrame(index,seat),side=this.direction(index,state.active);
    // A glance must retain the current expression, mouth and card pose.
    const clip=seat.data.clips[`look-${side}@${pose}`]?`look-${side}@${pose}`:pose==='rest'?`look-${side}`:undefined;
    if(clip)void this.play(index,clip);
   }
   if(!state.reducedMotion&&!state.overflow&&!seat.fallen&&!seat.blinkTimer)this.scheduleBlink(index,seat,1800+(index%4)*750+Math.random()*600);
  });
  this.seats.forEach((seat,index)=>{if(state.reducedMotion||state.overflow||!this.visible.has(index)||seat.fallen){
   clearTimeout(seat.blinkTimer);seat.blinkTimer=0;
   if(seat.element.dataset.animation?.startsWith('blink-')){this.stop(seat);void this.rest(index);}
  }});
 }
 private scheduleBlink(index:number,seat:Seat,delay:number):void{
  seat.blinkTimer=window.setTimeout(()=>{
   // Keep rearming even if this moment falls during a card gesture or in a background tab.
   // Each character owns its clock; no turn update or continuous render loop is required.
   seat.blinkTimer=0;
   if(this.seats.get(index)!==seat||!this.visible.has(index)||!seat.image.isConnected||seat.fallen||this.state.overflow||this.state.reducedMotion)return;
   if(!seat.animation&&seat.phase==='rest'&&!(typeof document!=='undefined'&&document.hidden)){
    const clip=`blink-${seat.frame}`;
    if(seat.data.clips[clip])void this.play(index,clip);
   }
   this.scheduleBlink(index,seat,3000+Math.random()*2500);
  },delay);
 }
 private direction(index:number,other:number):'left'|'right'{const a=this.root.querySelector<HTMLElement>(`.seat[data-seat="${index}"]`)?.getBoundingClientRect(),b=this.root.querySelector<HTMLElement>(`.seat[data-seat="${other}"]`)?.getBoundingClientRect();return a&&b&&b.left<a.left?'left':'right';}
 async play(index:number,id:string,from=0,end?:number):Promise<void>{
  const seat=this.seat(index),clip=seat?.data.clips[id];if(!seat||!clip)return;
  this.stop(seat);const epoch=seat.epoch;
  // Claim the animation before decoding, so a turn render cannot replace it.
  let done!:()=>void;const finished=new Promise<void>(resolve=>{done=resolve;});seat.animation={frames:clip.frames,resolve:done};seat.element.dataset.animation=id;
  try{
   const ready=await Promise.race([
    Promise.all([...new Set(clip.frames)].map(frame=>this.load(seat,frame))).then(()=>true),
    finished.then(()=>false),
    new Promise<boolean>(resolve=>{seat.timer=window.setTimeout(()=>resolve(false),5000);}),
   ]);
   if(seat.epoch===epoch)clearTimeout(seat.timer);
   if(!ready){if(seat.epoch===epoch)this.stop(seat);return;}
  }catch{if(seat.epoch===epoch)this.stop(seat);return;}
  if(seat.epoch!==epoch||!seat.image.isConnected)return;
  const total=clip.durations.reduce((a,b)=>a+b,0),until=end??total;
  const finalFrame=()=>{let boundary=0;for(let i=0;i<clip.frames.length;i++){boundary+=clip.durations[i];if(boundary>=until)return clip.frames[i];}return clip.frames.at(-1)!;};
  if(this.state.reducedMotion){this.paint(seat,finalFrame());this.stop(seat);if(id==='throw'&&seat.phase==='release')seat.phase='rest';return;}
  const started=performance.now();
  const step=()=>{
   if(seat.epoch!==epoch||!seat.image.isConnected){done();return;}
   const elapsed=from+performance.now()-started;
   if(elapsed>=until){this.paint(seat,finalFrame());seat.timer=0;seat.animation=undefined;delete seat.element.dataset.animation;done();if(id==='throw'&&seat.phase==='release')seat.phase='rest';if(until===total&&!['tumble','defeat'].includes(id))void this.rest(index);this.trim();return;}
   let boundary=0,i=0;for(;i<clip.durations.length-1;i++){boundary+=clip.durations[i];if(elapsed<boundary)break;}
   if(seat.frame!==clip.frames[i])this.paint(seat,clip.frames[i]);
   seat.timer=window.setTimeout(step,Math.max(1,Math.min(clip.durations.slice(0,i+1).reduce((a,b)=>a+b,0),until)-elapsed));
  };step();return finished;
 }
 async prepareThrow(index:number):Promise<DOMRect|undefined>{const seat=this.seat(index);if(!seat)return;seat.held=2;seat.phase='prepare';await this.play(index,'throw',0,seat.data.handoff?.releaseMs??320);return masterHandRect(this.root,index);}
 release(index:number):void{const seat=this.seat(index);if(!seat)return;seat.held=1;seat.phase='release';
  // The flight's onStart callback must remove the painted card in this same
  // task, before any score render or decoding promise can run.
  this.stop(seat);this.paint(seat,seat.data.handoff?.released??'release');
  void this.play(index,'throw',seat.data.handoff?.releaseMs??320);
 }
 async prepareDraw(index:number):Promise<DOMRect|undefined>{const seat=this.seat(index);if(!seat)return;if(seat.held===1){seat.phase='receive';await this.play(index,'receive-ready');}return masterHandRect(this.root,index,true);}
 async received(index:number):Promise<void>{const seat=this.seat(index);if(!seat||seat.held===2||seat.fallen)return;seat.held=2;seat.phase='rest';this.stop(seat);this.paint(seat,seat.data.handoff?.caught??'prepare');await this.play(index,'pickup');}
 cancel(index:number):void{const seat=this.seat(index);if(!seat)return;this.stop(seat);seat.held=2;seat.phase='rest';void this.rest(index);}
 chosen(index:number,target:number):void{const seat=this.seat(index);if(seat?.held===2&&seat.phase==='rest'&&!seat.fallen){const pose=this.idleFrame(index,seat),side=this.direction(index,target),key=`look-${side}@${pose}`;if(seat.data.clips[key])void this.play(index,key);else if(pose==='rest')void this.play(index,`choose-${side}`);}}
 relieved(index:number):void{const seat=this.seat(index);if(seat?.held===2&&seat.phase==='rest'&&!seat.animation&&!seat.fallen)void this.play(index,seat.data.clips.celebrate?'celebrate':'relief');}
 async tumble(index:number):Promise<void>{const seat=this.seat(index);if(!seat)return;seat.held=1;seat.fallen=true;await this.play(index,'tumble');}
}
