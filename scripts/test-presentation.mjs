import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Group, Matrix4, Vector3, Quaternion} from 'three';
const load=async path=>{const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);};
const {normalizeSettings,loadStats,saveStats}=await load('src/data/storage.ts');
// Existing installs retain their history; wallet totals are not match outcomes.
const saved=new Map([['100.stats.v1',JSON.stringify({rounds:20,rating:-4,currency:99,exacts:7})]]);
globalThis.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
const existingStats=loadStats();
assert.equal(existingStats.freedoms,0);assert.equal(existingStats.deaths,0);
assert.equal(existingStats.rounds,20);assert.equal(existingStats.exacts,7);assert.equal(existingStats.rating,-4);
saveStats({...existingStats,freedoms:3,deaths:2});
assert.equal(loadStats().freedoms,3);assert.equal(loadStats().deaths,2);
assert.equal(loadStats().rounds,20,'Outcome counters must preserve existing round history');
delete globalThis.localStorage;
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
for(const suit of ['fire','water','leaf','sun'])assert.deepEqual(['7','8','9','10'].map(rank=>cardFace({rank,suit}).index),['CHOOSE','REVERSE','ZERO','-10'],'Action corner labels are consistent in every suit without changing ranks');
assert.deepEqual(['7','8','9','10'].map(rank=>cardFace({rank,suit:'fire'}).title),['CHOOSE PLAYER','REVERSE','ZERO','−10']);
assert.equal(cardFaceFromUrl('/assets/cards/water-9.webp')?.detail,'Keep the total unchanged.');
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

// Test the visible geometry handoff under the actual oval surface transform.
const {CardFlightFit}=await load('src/render/CardFlightFit.ts');
for(const widthScale of [1.30,1.38]){
  const world=new Group(),surface=new Group();
  world.rotation.x=.18;surface.scale.set(widthScale,1,.70);world.add(surface);
  const discards=new CardPile(false,async()=>texture);
  discards.group.position.x=3.65/widthScale;
  discards.group.scale.set(1/widthScale,1,1/widthScale);surface.add(discards.group);
  await discards.setCards(['a','b','c'],'back');
  const destination=discards.cardPose(discards.count);
  const source={position:new Vector3(0,1,5),quaternion:new Quaternion(),scale:1.25};
  const target={...destination,scale:1};
  const fit=new CardFlightFit(source,target),flight=new Group();flight.matrixAutoUpdate=false;
  const place=(t)=>{
    flight.position.copy(source.position).lerp(target.position,t);
    flight.quaternion.slerpQuaternions(source.quaternion,target.quaternion,t);
    flight.scale.setScalar(source.scale+(target.scale-source.scale)*t);
    fit.apply(flight,t);
    assert(flight.matrix.elements.every(Number.isFinite)&&flight.matrix.determinant()>0,'Surface fitting cannot collapse or flip a flying card');
  };
  place(0);
  const handMatrix=new Matrix4().compose(source.position,source.quaternion,new Vector3().setScalar(source.scale));
  assert(flight.matrix.elements.every((v,i)=>Math.abs(v-handMatrix.elements[i])<1e-9),'Throw starts at the undistorted hand pose');
  for(const t of [.25,.5,.75,1])place(t);
  await discards.setCards(['a','b','c','d'],'back');
  discards.group.updateWorldMatrix(true,true);
  const top=discards.group.children.filter(child=>child.userData.cardHeight).at(-1);
  for(const corner of [[-.5,-.71,0],[.5,-.71,0],[-.5,.71,0],[.5,.71,0]]){
    const incoming=new Vector3(...corner).applyMatrix4(flight.matrix);
    const settled=new Vector3(...corner).applyMatrix4(top.matrixWorld);
    assert(incoming.distanceTo(settled)<1e-9,'Every incoming corner meets the same settled surface, including shear from a scattered discard');
  }
  const drawn=discards.cardPose();
  await discards.setCards(['a','b','c'],'back');
  const removed=discards.cardPose(discards.count);
  assert(drawn.matrix.elements.every((v,i)=>Math.abs(v-removed.matrix.elements[i])<1e-9),'Removed top retains its full perspective transform');
  const drawFit=new CardFlightFit({...removed,scale:1},source);
  flight.position.copy(removed.position);flight.quaternion.copy(removed.quaternion);flight.scale.setScalar(1);drawFit.apply(flight,0);
  assert(flight.matrix.elements.every((v,i)=>Math.abs(v-removed.matrix.elements[i])<1e-9),'Replacement starts at the exact projected pile surface');
  discards.dispose();
}
console.log('Pile perspective checks passed: desktop/mobile surface coordinates, smooth fitting, exact throw corners and replacement origins.');
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

const {cardScreenScale}=await load('src/render/CardScreenFit.ts');
for(const [viewportHeight,fov,distance] of [[844,46,4.85],[800,42,5.15]])for(const rect of [{width:14,height:20},{width:24,height:35},{width:120,height:160},{width:290,height:410}]){
  const scale=cardScreenScale(rect,viewportHeight,fov,distance);
  const projectedHeight=1.43*scale/(2*distance*Math.tan(fov*Math.PI/360))*viewportHeight;
  const projectedWidth=projectedHeight*1064/1478;
  assert(projectedHeight<=rect.height+1e-9 && projectedWidth<=rect.width+1e-9,'Both card dimensions fit the receiving hand, even small mobile sprite targets');
  assert(Math.abs(projectedHeight-rect.height)<1e-9 || Math.abs(projectedWidth-rect.width)<1e-9,'At least one card dimension meets the target without an oversized minimum');
}
console.log('Card screen fitting checks passed: tiny character hands and full-size player cards on desktop/mobile.');

const {totalDanger,totalMarkup}=await load('src/ui/totalFeedback.ts');
assert.deepEqual([-10,0,25,50,75,100,108].map(totalDanger),[0,0,.25,.5,.75,1,1],'Gold-to-red progression clamps safely at both ends');
assert(!totalMarkup(100).includes('total-shard'),'Exactly 100 is tense, not exploded');
assert.equal((totalMarkup(108).match(/aria-hidden="true"/g)||[]).length,6,'Overflow has six decorative fragments without duplicate announcements');
const {OverflowFireworks}=await load('src/render/OverflowFireworks.ts');
const fireworks=new OverflowFireworks();assert.equal(fireworks.points.visible,false);
fireworks.configure('high');assert.equal(fireworks.points.geometry.drawRange.count,144);
fireworks.trigger(false);assert.equal(fireworks.points.visible,true);fireworks.update(3,false);assert.equal(fireworks.points.visible,false,'Fireworks have no persistent idle effect');
fireworks.trigger(true);assert.equal(fireworks.points.visible,false,'Reduced motion suppresses fireworks');
fireworks.points.geometry.dispose();fireworks.points.material.dispose();
console.log('Total feedback checks passed: danger progression, overflow fragments, reduced motion, and finite fireworks.');

const {CardImpactFlow}=await load('src/render/CardImpactFlow.ts');
const flow=new CardImpactFlow();
assert.equal(flow.update(0,false).strength,0,'Table has no idle impact animation');
flow.setCard('1:fire-4:1');assert.equal(flow.update(0,false).strength,1,'Every newly committed card starts a glow');
const middle=flow.update(.4,false);flow.setCard('1:fire-4:1');assert.equal(flow.update(0,false).progress,middle.progress,'Renders and target selections cannot restart the same drop');
assert.equal(flow.update(.43,false).arrival,true,'Inward wave reaches the number once');assert.equal(flow.update(.01,false).arrival,false);
assert.equal(flow.update(1,false).strength,0,'Wave finishes with no lingering glow');
flow.setCard('1:leaf-9:2');assert.equal(flow.update(0,false).strength,1,'A Zero card triggers even when the total is unchanged');
assert.equal(flow.update(1,true).arrival,false,'Reduced motion suppresses the number pulse');assert.equal(flow.update(0,true).strength,0);
flow.setCard('');assert.equal(flow.update(0,false).strength,0,'Leaving or starting a round clears the wave');
console.log('Card impact flow checks passed: each discard, stable rerenders, unchanged totals, center arrival, cleanup, and reduced motion.');

const {TotalPresentation}=await load('src/ui/TotalPresentation.ts');
const score=new TotalPresentation();
score.sync('round-1','',{total:94,caption:''},true);
score.sync('round-1','card-1',{total:100,caption:'EXACT 100'},true);
assert.equal(score.visible.total,94,'The previous total remains visible during the wave');
score.sync('round-1','card-1',{total:100,caption:'EXACT 100'},true);
assert.equal(score.visible.total,94,'Menu and target rerenders cannot reveal the total early');
assert.equal(score.arrive('obsolete-card'),false,'Stale arrivals cannot commit a newer total');
assert.equal(score.arrive('card-1'),true);
assert.deepEqual(score.visible,{total:100,caption:'EXACT 100'},'Number and warning change together on arrival');
assert.equal(score.arrive('card-1'),false,'Each arrival commits once');
score.sync('round-1','card-2',{total:110,caption:'OVERFLOW'},true);
assert.equal(score.visible.total,100,'Overflow waits for the wave');
score.arrive('card-2');assert.equal(score.visible.total,110);
score.sync('round-1','card-3',{total:100,caption:'−10'},true);
score.arrive('card-3');assert.equal(score.visible.total,100,'Decreases also wait for arrival');
score.sync('round-1','card-4',{total:100,caption:'ZERO'},true);
assert.equal(score.pending,true,'Unchanged totals still wait for the card effect');
score.arrive('card-4');assert.equal(score.visible.caption,'ZERO');
score.sync('round-1','card-5',{total:102,caption:'OVERFLOW'},true);
score.sync('round-2','',{total:0,caption:''},true);
assert.equal(score.arrive('card-5'),false,'New rounds cancel old pending totals');
assert.equal(score.visible.total,0);
score.sync('round-2','card-6',{total:6,caption:''},false);
assert.equal(score.visible.total,6,'Reduced motion and WebGL fallback update immediately');
score.sync('round-2','card-7',{total:10,caption:''},true);
score.sync('round-2','card-7',{total:10,caption:''},false);
assert.equal(score.visible.total,10,'Disabling motion midway flushes a pending total');
const waveClock=new CardImpactFlow();
score.sync('round-2','card-8',{total:12,caption:''},true);waveClock.setCard('card-8');
assert.equal(waveClock.update(.80,false).arrival,false);assert.equal(score.visible.total,10);
if(waveClock.update(.02,false).arrival)score.arrive('card-8');
assert.equal(score.visible.total,12,'Displayed total uses the wave arrival rather than an independent timer');
console.log('Total arrival checks passed: held score, rerenders, exact 100, overflow, zero, decreases, resets, and motion fallback.');
