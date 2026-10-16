import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);};
const {TotalImpact}=await load('src/ui/TotalImpact.ts');
const {TotalPresentation}=await load('src/ui/TotalPresentation.ts');
const {CardImpactFlow}=await load('src/render/CardImpactFlow.ts');

class Drawing {
  children=[];animations=[];attributes={};textContent='';removed=false;
  set innerHTML(value){this.markup=value;this.value=new Drawing();this.value.textContent=value.match(/total-value">([^<]+)/)[1];this.children=[this.value];}
  querySelector(){return this.value;}
  setAttribute(key,value){this.attributes[key]=value;}
  append(child){this.children.push(child);}
  remove(){this.removed=true;}
  animate(frames,options){
    let resolve,reject;
    const animation={frames,options,canceled:false,finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),finish:()=>resolve(),cancel(){this.canceled=true;reject(new Error('Canceled'));}};
    this.animations.push(animation);return animation;
  }
}
globalThis.document={createElement:()=>new Drawing()};
const number=new Drawing(),impact=new TotalImpact(),score=new TotalPresentation(),wave=new CardImpactFlow();
score.sync('round-1','',{total:94,caption:''},true);
number.innerHTML='<span class="total-value">94</span>';
score.sync('round-1','card-a',{total:100,caption:'EXACT 100'},true);wave.setCard('card-a');
assert.equal(wave.update(.8,false).arrival,false);assert.equal(number.value.textContent,'94');
assert.equal(score.arrive('stale'),false);
const old=score.visible.total;
assert(wave.update(.02,false).arrival);assert(score.arrive('card-a'));
impact.show(number,old,score.visible.total,false);
assert.equal(number.value.textContent,'100','The actual final total is present immediately, with no fake intermediate counts');
const first=number.value.animations[0],firstGhost=number.children[1];
assert.equal(first.options.duration,380);assert.equal(firstGhost.textContent,'94');
assert.equal(firstGhost.attributes['aria-hidden'],'true','The outgoing drawing is never read as a second total');
impact.show(number,100,90,false);
const second=number.value.animations[0],secondGhost=number.children[1];
await Promise.resolve();
assert(first.canceled&&firstGhost.removed,'A new arrival cancels and removes its predecessor');
assert.equal(second.canceled,false);assert.equal(secondGhost.removed,false,'Stale completion cannot cancel the next impact');
second.finish();await Promise.resolve();
assert(secondGhost.removed,'A settled impact leaves no old drawing behind');
for(const [before,after,reduced] of [[90,90,false],[90,96,true],[99,103,false]]){
  impact.show(number,before,after,reduced);
  assert.equal(number.value.textContent,String(after));
  assert.equal(number.value.animations.length,0,'Unchanged totals, reduced motion and overflow retain their intended presentation');
  assert.equal(number.children.length,1);
}
assert.match(number.markup,/total-shard/,'Overflow retains the existing explosion fragments');
impact.show(number,4,-6,false);
assert.equal(number.value.textContent,'-6','Deduct uses the same impact for legal negative totals');
const last=number.value.animations[0],lastGhost=number.children[1];
impact.cancel();await Promise.resolve();
assert(last.canceled&&lastGhost.removed,'Leaving the table or disabling motion cleans up immediately');
delete globalThis.document;
console.log('Total impact passed: light arrival gating, immediate exact total, decreases/negative totals, stale cancellation, clean settlement, reduced motion and existing overflow explosion.');
