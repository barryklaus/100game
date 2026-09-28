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
const {isPlayGesture,isDoubleCardTap,isCardEdgeGrip}=await load('src/ui/cardGesture.ts');
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
  const seats=[];
  for(let i=1;i<count;i++)seats.push(avatarAnchor((local+i)%count,local,count,portrait));
  seats.forEach((seat,i)=>{
    assert(seat.x>.09&&seat.x<.91&&seat.y>.15&&seat.y<.6,'Seat remains inside the gameplay field');
    assert(Math.abs(seat.x+seats[seats.length-1-i].x-1)<1e-6,'Seat composition stays symmetric for every local player');
  });
}
console.log('Observatory layout checks passed: symmetric 2–8 player tables, including every local seat.');
