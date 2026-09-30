import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);};
const {normalizeSettings}=await load('src/data/storage.ts');
assert.equal(normalizeSettings({}).graphics,'high','High fidelity is the default');
globalThis.matchMedia=()=>({matches:true});
assert.equal(normalizeSettings({}).graphics,'high','Touch devices also start in High fidelity');
delete globalThis.matchMedia;
const old=normalizeSettings({graphics:'low',volume:.3,playerCount:8,seats:[{name:'Host',kind:'human',avatar:4,mood:'Happy'}]});
assert.equal(old.graphics,'mobile');assert.equal(old.volume,.3);assert.equal(old.seats[0].name,'Host');assert.equal(old.seats.length,8);assert.equal(old.playerCount,8);
const malformed=normalizeSettings({graphics:'broken',volume:Infinity,playerCount:99,seats:[null],uiScale:-1});
assert.equal(malformed.playerCount,8);assert.equal(malformed.volume,.55);assert.equal(malformed.uiScale,.85);assert.equal(malformed.seats[0].kind,'human');
const {isPlayGesture,isDoubleCardTap,isCardEdgeGrip,cardGrip,cardFlickSpin}=await load('src/ui/cardGesture.ts');
const sample={dx:2,dy:-22,duration:180,canceled:false,inspecting:false,canPlay:true};
assert(isPlayGesture(sample));
for(const override of [{canceled:true},{inspecting:true},{canPlay:false},{dx:90,dy:-2},{dx:3,dy:40},{dx:1,dy:-5}])assert.equal(isPlayGesture({...sample,...override}),false);
const firstTap={id:'card-a',x:120,y:210,time:1000};
assert(isDoubleCardTap(firstTap,{id:'card-a',x:125,y:212,time:1300}));
assert.equal(isDoubleCardTap(firstTap,{id:'card-b',x:125,y:212,time:1300}),false);
assert.equal(isDoubleCardTap(firstTap,{id:'card-a',x:125,y:212,time:1350}),false);
assert.equal(isDoubleCardTap(firstTap,{id:'card-a',x:165,y:212,time:1300}),false);
const cardRect={left:100,top:100,width:100,height:140};
assert(isCardEdgeGrip(cardRect,105,170));
assert(isCardEdgeGrip(cardRect,150,108));
assert(isCardEdgeGrip(cardRect,195,232));
assert.equal(isCardEdgeGrip(cardRect,150,170),false);
const right=cardGrip(cardRect,195,170),left=cardGrip(cardRect,105,170),top=cardGrip(cardRect,150,105);
assert.equal(cardFlickSpin(right,-70,0).y,-1,'Right-to-left flick turns left around the vertical axis');
assert.equal(cardFlickSpin(left,70,0).y,1,'Left-to-right flick turns right around the vertical axis');
assert.equal(cardFlickSpin(top,0,-40).x,-1,'Top-edge flick somersaults forward');
assert.equal(cardFlickSpin(top,0,0).x,-1,'Top-edge double tap somersaults without a drag');
assert.equal(cardFlickSpin({x:0,y:0},70,0),undefined,'Center grip stays a clean throw');
const corner=cardFlickSpin({x:.95,y:-.95},-50,-35,2);
assert(corner.x<0&&corner.y<0&&corner.z>0,'Corner impulse combines a flip with diagonal torque');
assert(Math.abs(Math.hypot(corner.x,corner.y,corner.z)-1)<1e-9,'Tumble axis is normalized so a whole turn lands flat');
assert.equal(corner.turns,2,'Fast release gives two controlled turns');
assert.equal(cardFlickSpin(right,-70,0,.4).turns,1,'Gentle flick gives one turn');
const sideways={...sample,dx:-40,dy:0,grip:right,releaseVX:-.5};
assert(isPlayGesture(sideways),'A deliberate inward edge flick plays horizontally');
assert(isPlayGesture({...sideways,dx:40,grip:left,releaseVX:.5}),'Both sides work symmetrically');
for(const override of [{releaseVX:0},{releaseVX:-.1},{releaseVX:.5},{grip:{x:0,y:0}},{grip:left},{dx:-10},{canceled:true},{canPlay:false},{inspecting:true}])assert.equal(isPlayGesture({...sideways,...override}),false,'A sway, outward drag, stopped gesture, canceled input, or wrong turn cannot play');
const {makeDeck,cardDisplayRank}=await load('src/game/deckCore.ts');
const {cardFace,cardFaceFromUrl}=await load('src/game/cardFace.ts');
const labels=new Set(makeDeck().map(cardDisplayRank));
assert.deepEqual([...labels],['1','2','3','4','5','6','CHOOSE PLAYER','REVERSE','ZERO','MINUS TEN','10']);
assert.equal(cardFace({rank:'A',suit:'sun'}).index,'1');
assert.equal(cardFace({rank:'K',suit:'sun'}).index,'10');
assert.deepEqual(['7','8','9','10'].map(rank=>cardFace({rank,suit:'fire'}).title),['CHOOSE A PLAYER','REVERSE','ZERO','−10']);
assert.equal(cardFaceFromUrl('/assets/cards/water-9.webp')?.detail,'Total stays the same · +0');
assert.equal(cardFaceFromUrl('/assets/cards/back.webp'),null);
const {CardPile,CARD_TABLE_HEIGHT}=await load('src/render/CardPile.ts');
const {CARD_THICKNESS,CLEAN_CARD_LAYER,createCardMesh,disposeCardMesh}=await load('src/render/CardMesh.ts');
const texture={image:{width:511,height:711},isTexture:true};
for(const special of [false,true]) {
  const card=createCardMesh(texture,texture,special);
  assert.deepEqual(card.children.map(surface=>surface.name),['card-paper-edge','card-front','card-back','card-border-foil']);
  for(const surface of card.children.slice(0,3)) {
    const material=surface.material;
    assert.equal(material.isMeshBasicMaterial,true,`${surface.name} must show clean, unlit card color`);
    assert.equal(material.toneMapped,false,'Room tone mapping must not change printed artwork');
    assert.equal(material.fog,false,'Room fog must not wash out printed artwork');
    assert.equal(material.envMap,null,'Cards must not receive environment reflection overlays');
    assert.equal(material.emissive,undefined,'Cards must not emit added glow');
    assert.equal(material.clearcoat,undefined,'Cards must not receive reflective clearcoat');
    assert.equal(surface.userData.cleanCard,true,'Every card surface must be excluded from room effects');
    assert(surface.layers.isEnabled(CLEAN_CARD_LAYER),'Every card surface must render in the clean card pass');
  }
  const foil=card.children[3];
  assert.equal(foil.material.isShaderMaterial,true,'Foil uses a cheap border-only shader');
  assert.equal(foil.userData.cardFoil,true);
  assert.equal(foil.userData.cleanCard,true,'Foil renders in the clean card pass');
  assert.equal(foil.material.uniforms.uSpecial.value,special?1:0);
  const foilPositions=foil.geometry.getAttribute('position');
  const foilTriangles=foil.geometry.getIndex();
  assert(foilTriangles?.count,'Foil must be a triangulated ring');
  for(let i=0;i<foilTriangles.count;i+=3){
    const a=foilTriangles.getX(i),b=foilTriangles.getX(i+1),c=foilTriangles.getX(i+2);
    const x=(foilPositions.getX(a)+foilPositions.getX(b)+foilPositions.getX(c))/3;
    const y=(foilPositions.getY(a)+foilPositions.getY(b)+foilPositions.getY(c))/3;
    assert(Math.abs(x)>card.userData.cardWidth*.4||Math.abs(y)>card.userData.cardHeight*.42,'Foil must leave the card illustration unobscured');
  }
  const face=card.children[1];
  const vertices=face.geometry.getAttribute('position');
  const halfWidth=card.userData.cardWidth/2,halfHeight=card.userData.cardHeight/2;
  assert(vertices.count>40,'Rounded corners need enough geometry for a smooth outline');
  for(let i=0;i<vertices.count;i++){
    assert(!(Math.abs(vertices.getX(i))>halfWidth-.001&&Math.abs(vertices.getY(i))>halfHeight-.001),'Square corners must be clipped from the artwork');
  }
  assert.equal(face.material.alphaTest,0,'Card edges must not use a jagged hard alpha cutoff');
  disposeCardMesh(card);
}
for (const [suit, index] of [['fire',0],['water',1],['leaf',2],['sun',3]]) {
  const themed={image:{width:511,height:711},isTexture:true,userData:{cardFace:{suit,special:true}}};
  const card=createCardMesh(themed,texture);
  assert.equal(card.children[3].material.uniforms.uSuit.value,index,`${suit} foil must use its own palette and motif`);
  disposeCardMesh(card);
}
const pile=new CardPile(false,async()=>texture);
await pile.setCards([], 'back');
assert.equal(pile.group.children.length,0,'An empty discard has no platform');
await pile.setCards(['one'], 'back');
assert.equal(pile.group.children.length,1,'A single discard is exactly one physical card');
assert(Math.abs(pile.cardPose().position.y-CARD_THICKNESS/2-CARD_TABLE_HEIGHT)<1e-6,'First card rests on the cloth');
const landing=pile.cardPose(pile.count);
await pile.setCards(['one','two'],'back');
assert(pile.cardPose().position.distanceTo(landing.position)<1e-6,'Flight lands at the next card surface');
await pile.setCards(Array.from({length:35},(_,i)=>String(i)),'back');
assert.equal(pile.group.children.length,15,'Discard retains fourteen textured layers and one batched group of buried edges');
assert.equal(pile.group.children.filter(child=>child.name==='pile-paper-body').length,0,'Discard must never use a rectangular body');
assert(pile.cardPose(8).position.distanceTo(pile.cardPose(9).position)>.1,'Discard edges have visible irregular offsets');
assert(pile.cardPose(8).quaternion.angleTo(pile.cardPose(9).quaternion)>.1,'Discard orientations vary');
assert(pile.cardPose(1).quaternion.angleTo(landing.quaternion)<1e-6,'A buried card retains its landing rotation');
const previousTop=pile.cardPose();
await pile.setCards(Array.from({length:34},(_,i)=>String(i)),'back');
assert(pile.cardPose().position.y<previousTop.position.y,'Deck height falls after drawing');
assert(pile.cardPose(pile.count).position.distanceTo(previousTop.position)<1e-6,'Draw flight starts at the removed top card');
await pile.setCards(['recycled-top'],'back');
assert.equal(pile.group.children.length,1,'Recycling removes old layers');
pile.dispose();
const deck=new CardPile(true,async()=>texture);
await deck.setCards(Array(35).fill('back'),'back');
assert.equal(deck.group.children.length,4,'Draw deck retains efficient aligned paper body');
const drawn=deck.cardPose();
await deck.setCards(Array(34).fill('back'),'back');
assert(deck.cardPose().position.y<drawn.position.y,'Draw deck shrinks after drawing');
assert(deck.cardPose(deck.count).position.distanceTo(drawn.position)<1e-6,'Draw animation starts at the removed card');
deck.dispose();
console.log('Presentation checks passed: settings migration, short flicks, canceled gestures, inspection, card language, and observatory seat and score presentation.');
console.log('Card input checks passed: quick same-card double taps and edge/corner spin grips.');
console.log('Physical pile checks passed: empty, single, multiple cards, landing/draw alignment, and recycling.');
console.log('Card face checks passed: rank indices, special instructions, clean art, and border-only normal/special foil.');

const {avatarAnchor}=await load('src/ui/avatarLayout.ts');
for(const portrait of [false,true])for(let count=2;count<=8;count++)for(let local=0;local<count;local++){
  const seats=Array.from({length:count},(_,i)=>avatarAnchor(i,local,count,portrait)).sort((a,b)=>a.x-b.x);
  seats.forEach((seat,i)=>{
    assert(seat.x>=.069&&seat.x<=.931&&seat.y>.15&&seat.y<.33,'Every portrait remains inside the upper gameplay field');
    const mirror=seats[count-1-i];
    assert(Math.abs(seat.x+mirror.x-1)<1e-6&&Math.abs(seat.y-mirror.y)<1e-6,'All players, including the local player, form a symmetric arc');
    if(i)assert(seat.x-seats[i-1].x>.1,'Eight portraits retain distinct horizontal slots');
  });
  assert(Math.max(...seats.map(s=>s.y))-Math.min(...seats.map(s=>s.y))<.07,'The portrait arc stays shallow');
}
const {separatedHandDepths}=await load('src/render/HandDepth.ts');
for(const rear of [0,.015,.08,.3,.65])for(const front of [0,.015,.08,.3,.65]){
  const distances=separatedHandDepths([rear,front]);
  assert(distances.every(d=>d>0),'Tilted cards stay in front of the camera');
  assert(distances[1]*(1+front)<distances[0]*(1-rear)-.04,'Complete tilted card volumes cannot intersect, in either stacking order');
}
console.log('Observatory layout checks passed: symmetric 2–8 player arcs including the local player; separate hand-card depth volumes.');

const {CardHandoff}=await load('src/render/CardHandoff.ts');
const handoff=new CardHandoff();
let releases=0;
handoff.retain('turn-1',()=>releases++);
await handoff.sync('turn-1',true,Promise.resolve());
assert.equal(releases,0,'A landed card stays visible while its play awaits the server');
let ready;
const pileReady=new Promise(resolve=>ready=resolve);
const committing=handoff.sync('turn-2',false,pileReady);
await Promise.resolve();
assert.equal(releases,0,'Changing state cannot remove the flight before the pile texture is ready');
ready();await committing;
assert.equal(releases,1,'The landed flight is released only once its replacement is ready');
handoff.retain('turn-2',()=>releases++);
await handoff.sync('turn-2',false,Promise.resolve());
assert.equal(releases,2,'Rejected moves clear the temporary landing when the hand is restored');
let obsoleteReady;
const obsolete=handoff.sync('turn-2',false,new Promise(resolve=>obsoleteReady=resolve));
handoff.retain('turn-2',()=>releases++);
obsoleteReady();await obsolete;
assert.equal(releases,2,'An old render cannot release a later flight');
handoff.clear();
assert.equal(releases,3,'Leaving a game releases retained cards');
let loadReady;
const delayed=new CardPile(false,()=>new Promise(resolve=>loadReady=resolve));
const first=delayed.setCards(['one'],'back');
const repeated=delayed.setCards(['one'],'back');
assert.equal(first,repeated,'Repeated renders must await the same unfinished pile update');
loadReady(texture);await Promise.resolve();loadReady(texture);await first;delayed.dispose();
console.log('Card handoff checks passed: delayed pile loading, online acknowledgment, rejected moves, repeated renders, and cleanup.');

const {totalDanger,totalMarkup,overflowQuake}=await load('src/ui/totalFeedback.ts');
assert.deepEqual([-10,0,25,50,75,100,108].map(totalDanger),[0,0,.25,.5,.75,1,1],'Gold-to-red progression clamps safely at both ends');
assert(!totalMarkup(100).includes('total-shard'),'Exactly 100 is tense, not exploded');
assert.equal((totalMarkup(108).match(/aria-hidden="true"/g)||[]).length,6,'Overflow has six decorative fragments without duplicate announcements');
for(const age of [0,.1,.5,1,2,2.4,4]){
  const quiet=overflowQuake(age,true);assert.deepEqual(quiet,{x:0,y:0,z:0,roll:0},'Reduced motion suppresses earthquake');
  const quake=overflowQuake(age,false);assert(Math.abs(quake.x)<=.34&&Math.abs(quake.y)<=.17&&Math.abs(quake.roll)<=.023,'Earthquake stays bounded');
}
assert.deepEqual(overflowQuake(2.4,false),{x:0,y:0,z:0,roll:0},'Earthquake returns completely to rest');
const {OverflowFireworks}=await load('src/render/OverflowFireworks.ts');
const fireworks=new OverflowFireworks();assert.equal(fireworks.points.visible,false);
fireworks.configure('high');assert.equal(fireworks.points.geometry.drawRange.count,144);
fireworks.trigger(false);assert.equal(fireworks.points.visible,true);fireworks.update(3,false);assert.equal(fireworks.points.visible,false,'Fireworks have no persistent idle effect');
fireworks.trigger(true);assert.equal(fireworks.points.visible,false,'Reduced motion suppresses fireworks');
fireworks.points.geometry.dispose();fireworks.points.material.dispose();
console.log('Total feedback checks passed: danger progression, overflow fragments, bounded earthquake, reduced motion, and finite fireworks.');
