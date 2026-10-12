import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/ui/CardKeyboard.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {cardKeyboardAction}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const key=(key,extra={})=>({key,repeat:false,altKey:false,ctrlKey:false,metaKey:false,...extra});
const cards=['left-card','right-card'];
for(const left of ['ArrowLeft','ArrowUp'])for(const right of ['ArrowRight','ArrowDown']){
  assert.deepEqual(cardKeyboardAction(key(left),cards,null),{type:'select',id:cards[0]});
  assert.deepEqual(cardKeyboardAction(key(right),cards,null),{type:'select',id:cards[1]});
  assert.deepEqual(cardKeyboardAction(key(right),cards,cards[0]),{type:'select',id:cards[1]});
  assert.deepEqual(cardKeyboardAction(key(left),cards,cards[1]),{type:'select',id:cards[0]});
  assert.deepEqual(cardKeyboardAction(key(right),cards,cards[1]),{type:'select',id:cards[0]},'Selection wraps within this hand');
  assert.deepEqual(cardKeyboardAction(key(left),cards,cards[0]),{type:'select',id:cards[1]});
}
for(const play of [' ','Enter']){
  assert.deepEqual(cardKeyboardAction(key(play),cards,cards[1]),{type:'play',id:cards[1]});
  assert.deepEqual(cardKeyboardAction(key(play),cards,null,cards[0]),{type:'play',id:cards[0]},'Tab focus also plays its highlighted card');
  assert.deepEqual(cardKeyboardAction(key(play),cards,cards[0],cards[1]),{type:'play',id:cards[1]},'Current focus wins over an older selection');
  assert.deepEqual(cardKeyboardAction(key(play,{repeat:true}),cards,cards[0]),{type:'consume'},'Held play keys cannot play twice or leak scrolling');
  assert.deepEqual(cardKeyboardAction(key(play),cards,'old-turn-card','opponent-card'),{type:'consume'},'Stale selections cannot play another hand');
  assert.deepEqual(cardKeyboardAction(key(play),cards,null),{type:'consume'},'Space does not guess an unselected card');
}
for(const code of ['ArrowLeft','ArrowRight',' ','Enter']){
  assert.equal(cardKeyboardAction(key(code),[],cards[0]),undefined,'No actionable cards means no keyboard action');
  for(const modifier of ['ctrlKey','metaKey','altKey'])assert.equal(cardKeyboardAction(key(code,{[modifier]:true}),cards,cards[0]),undefined,'Browser shortcuts remain available');
}
assert.deepEqual(cardKeyboardAction(key('ArrowRight'),['only-card'],'only-card'),{type:'select',id:'only-card'});
assert.equal(cardKeyboardAction(key('Escape'),cards,cards[0]),undefined);
assert.deepEqual(cards,['left-card','right-card'],'Keyboard selection never changes hand or deck order');
console.log('Card keyboard passed: directional selection, wrapping, focused/selected play, repeat protection, stale hands, browser shortcuts and no deck mutation.');
