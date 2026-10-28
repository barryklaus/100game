import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['src/ui/MasterAnimations.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
const {MasterAnimations,masterSpecialThrowFrames}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const characters=Object.keys(JSON.parse(readFileSync('public/assets/social-club/special-throw-v1/manifest.json')).characters);
const registrations=JSON.parse(readFileSync('public/assets/social-club/special-throw-registration-v2.json')).characters;
const conditionSets=JSON.parse(readFileSync('public/assets/social-club/condition-animation-v1/manifest.json')).characters;
let clock=0,timerId=0,failSpecial=false,deferCondition='';
const deferred=[],painted=[];
const timers=new Map();
globalThis.window=globalThis;globalThis.document={hidden:true};globalThis.performance={now:()=>clock};
globalThis.setTimeout=(fn,ms)=>{timers.set(++timerId,{fn,at:clock+ms});return timerId;};globalThis.clearTimeout=id=>timers.delete(id);
globalThis.Image=class{naturalWidth=400;naturalHeight=400;decode(){if(failSpecial&&this.src.includes('/special-'))return Promise.reject(new Error('Test decode failure'));if(deferCondition&&this.src.includes(deferCondition))return new Promise(resolve=>deferred.push(resolve));return Promise.resolve();}};
globalThis.DOMRect=class{constructor(x=0,y=0,width=100,height=100){Object.assign(this,{x,y,left:x,top:y,width,height,right:x+width,bottom:y+height});}};
const image={isConnected:true,style:{},_src:'',get src(){return this._src;},set src(value){this._src=value;painted.push(value);}},element={dataset:{},querySelector:()=>image,getBoundingClientRect:()=>new DOMRect(0,0,512,512)};
const node={dataset:{},getBoundingClientRect:()=>new DOMRect(0,0,256,256)};
const root={querySelector:selector=>selector.includes('master-sprite')?element:node,querySelectorAll:()=>[node]};
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const advance=async ms=>{const end=clock+ms;for(;;){const next=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;clock=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}clock=end;await flush();};
const controller=new MasterAnimations(root),state={active:0,total:0,overflow:false,target:false,reducedMotion:false};
function select(id,condition=0){element.dataset={character:id,condition:String(condition)};node.dataset={seat:'0',condition:String(condition)};controller.sync(state);}

for(const id of characters){
 select(id);await flush();controller.armSpecialThrow(0);await flush();await advance(111);
 assert.equal(element.dataset.frame,'special-02');
 const preparing=controller.prepareThrow(0,true);
 assert.equal(element.dataset.frame,'special-02',`${id}: playing while arming cannot restart special-01`);
 await advance(280);const anchor=await preparing;assert(anchor,`${id}: completing the existing wind-up yields its release anchor`);
 const [x,y,w,h]=registrations[id].transformedRelease;
 for(const [actual,expected] of [[anchor.left,(x-w/2)/4],[anchor.top,(y-h/2)/4],[anchor.width,w/4],[anchor.height,h/4]])assert(Math.abs(actual-expected)<.001,`${id}: the flying card uses the same calibrated drawing coordinates`);
 assert.equal(element.dataset.frame,'special-04');
 const held=controller.prepareThrow(0,true);await flush();assert(await held);
 assert.equal(element.dataset.frame,'special-04',`${id}: playing after the armed hold cannot rewind`);
 assert.equal(element.dataset.animation,undefined,'Reusing a completed hold does not start another animation');
 controller.release(0,true);assert.equal(element.dataset.frame,'special-05');assert.equal(element.dataset.cards,'1');
 controller.reset();await flush();
}

select('finn');await flush();controller.armSpecialThrow(0);await flush();
const canceled=controller.prepareThrow(0,true);controller.cancelSpecialThrow(0);await advance(500);
assert.equal(await canceled,undefined,'Canceling an in-flight preparation never returns a stale anchor');
assert(!element.dataset.frame.startsWith('special-'));
controller.armSpecialThrow(0);await flush();await advance(391);
assert(await controller.prepareThrow(0,true),'A canceled arm can be prepared again');
controller.reset();await flush();

failSpecial=true;select('finn');await flush();
const failed=controller.prepareThrow(0,true);await flush();
assert.equal(await failed,undefined,'A failed frame decode never reports a successful ready pose');
assert(!element.dataset.frame.startsWith('special-'),'Failed preparation returns to a complete idle drawing');
failSpecial=false;controller.armSpecialThrow(0);await flush();await advance(391);
assert(await controller.prepareThrow(0,true),'A failed load does not leave the character stuck in prepare');
controller.reset();await flush();

select('finn');await flush();const reset=controller.prepareThrow(0,true);await flush();controller.reset();await flush();
assert.equal(await reset,undefined,'Leaving/resetting the table invalidates the pending handoff');
select('finn');await flush();const replaced=controller.prepareThrow(0,true);await flush();select('bianca');await flush();
assert.equal(await replaced,undefined,'A replacement character cannot inherit the previous character release anchor');
controller.reset();await flush();

select('finn');controller.sync({...state,reducedMotion:true});await flush();
const reduced=controller.prepareThrow(0,true);await flush();assert(await reduced,'Reduced motion retains a valid held-card handoff');
assert.equal(element.dataset.frame,'special-04');assert.equal(element.dataset.cards,'2');
controller.reset();assert.equal(timers.size,0);

for(const id of characters)for(let condition=1;condition<=3;condition++){
 const data=conditionSets[id][condition],prefix=`/condition-animation-v1/${id}/${condition}/`;
 select(id,condition);await flush();painted.length=0;
 assert.deepEqual(masterSpecialThrowFrames(id,condition),data.clips.throw.frames,`${id}/${condition}: Special Throw retains condition-native whole drawings`);
 controller.armSpecialThrow(0);await flush();await advance(111);
 const before=element.dataset.frame,preparing=controller.prepareThrow(0,true);
 assert.equal(element.dataset.frame,before,`${id}/${condition}: the scoring flag still reuses the armed preparation`);
 await advance(data.handoff.releaseMs+1);assert(await preparing);
 const held=controller.prepareThrow(0,true);assert.equal(held,preparing,'An injured Special Throw reuses the completed hold too');
 assert(await held);assert.equal(element.dataset.animation,undefined);
 controller.release(0,true);assert.equal(element.dataset.cards,'1');
 assert.equal(element.dataset.frame,data.handoff.released,'The release drawing remains injured');
 await flush();await advance(600);
 const draw=controller.prepareDraw(0);await flush();await advance(250);await draw;
 assert.equal(element.dataset.cards,'1');
 const received=controller.received(0);await flush();await advance(400);await received;
 assert.equal(element.dataset.cards,'2','Receiving restores both cards without changing condition');
 controller.armSpecialThrow(0);await flush();await advance(80);controller.cancelSpecialThrow(0);await advance(400);
 assert.equal(element.dataset.frame,data.emotions.focused??'rest',`${id}/${condition}: unarming returns to the current injured idle`);
 assert.equal(element.dataset.cards,'2');assert.equal(element.dataset.animation,undefined);
 assert(painted.length>5,'The test observed preparation, release, receive and cancellation paintings');
 for(const url of painted){assert(url.includes(prefix),`${id}/${condition}: ${url} must retain the condition artwork`);assert(!url.includes('/special-throw-'),'Injured Special Throw cannot briefly paint healthy special artwork');}
 controller.reset();await flush();assert.equal(timers.size,0);
}

deferCondition='/condition-animation-v1/finn/1/';select('finn',1);await flush();
assert(deferred.length>0,'The adversarial test holds actual pending condition image decodes');
const oldCondition=controller.prepareThrow(0,true);await flush();
select('finn',2);painted.length=0;await flush();
assert.equal(await oldCondition,undefined,'Changing injury condition while decoding invalidates the old release anchor');
deferCondition='';for(const resolve of deferred.splice(0))resolve();await flush();await advance(500);
assert(image.src.includes('/condition-animation-v1/finn/2/'),'The new condition reaches its own complete idle');
assert(painted.every(url=>url.includes('/condition-animation-v1/finn/2/')),'Late old-condition decodes cannot overwrite the new condition');
controller.armSpecialThrow(0);await flush();await advance(391);assert(await controller.prepareThrow(0,true),'The new condition can prepare normally after stale loads resolve');
controller.reset();await flush();assert.equal(timers.size,0);
console.log('Special Throw preparation passed: all 16 healthy characters, all 48 injured sets, no armed replay, condition-native release/receive/cancel, failed/reset/replaced/stale-condition preparation and reduced motion.');
