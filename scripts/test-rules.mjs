import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false, define: { 'import.meta.env.BASE_URL': '"/100game/"' } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
  const { makeDeck } = await load('src/game/deck.ts');
  const { createGame, playCard, selectTarget, cardValue } = await load('src/game/rules.ts');
  const { chooseCpuCard, chooseCpuTarget } = await load('src/game/cpu.ts');
  const deck = makeDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(c => c.id)).size, 52);
  for (const suit of ['fire','water','leaf','sun']) assert.equal(deck.filter(c=>c.suit===suit).length, 13);
  const value = rank => cardValue({ id:`fire-${rank}`, suit:'fire', rank });
  assert.deepEqual(['A','2','3','4','5','6','7','8','9','10','J','Q','K'].map(value),[1,2,3,4,5,6,0,0,0,-10,10,10,10]);
  const players = count => Array.from({length:count},(_,i)=>({name:`P${i}`,kind:i?'cpu':'human',mood:'Normal',avatar:i}));
  const card = (rank,suit='fire') => ({id:`${suit}-${rank}`,suit,rank});
  for (let count=2;count<=8;count++) {
    const game = createGame(players(count),1,()=>.1);
    assert.equal(game.drawPile.length,52-count*2);
    assert(game.players.every(p=>p.hand.length===2));
  }
  {
    const game=createGame(players(4),1,()=>0);
    game.current=0;game.rootTurn=0;game.players[0].hand=[card('7'),card('A')];
    game.players[2].hand=[card('7','water'),card('2','water')];
    game.players[3].hand=[card('8'),card('3')];
    playCard(game,'fire-7');
    assert.equal(game.phase,'target'); assert.equal(game.players[0].hand.length,2);
    selectTarget(game,2); playCard(game,'water-7');
    assert.equal(game.phase,'target'); assert.equal(game.players[2].hand.length,2);
    selectTarget(game,3); playCard(game,'fire-8');
    assert.equal(game.direction,-1);
    assert.equal(game.phase,'playing');
    assert.equal(game.current,2); // The final chosen player played the turn; direction now runs backward from P3.
    assert(game.players.every(p=>p.hand.length===2));
  }
  {
    const game=createGame(players(2),1,()=>0);
    game.current=0;game.rootTurn=0;game.players[0].hand=[card('8'),card('A')];
    playCard(game,'fire-8');
    assert.equal(game.direction,-1);assert.equal(game.current,1);
    assert.equal(game.players[0].hand.length,2);
  }
  {
    const game=createGame(players(3),1,()=>0);
    game.current=0;game.rootTurn=0;
    game.players[0].hand=[card('7'),card('2')];
    game.players[1].hand=[card('3'),card('4')];
    playCard(game,'fire-7');
    selectTarget(game,1);
    playCard(game,'fire-3');
    assert.equal(game.current,2,'A chosen player must not immediately get a second ordinary play');
  }
  {
    const game=createGame(players(4),1,()=>0);
    game.current=0;game.rootTurn=0;
    game.players[0].hand=[card('7'),card('2')];
    game.players[2].hand=[card('3'),card('4')];
    playCard(game,'fire-7');
    selectTarget(game,2);
    playCard(game,'fire-3');
    assert.equal(game.current,1,'A distant target must not skip the other seats in normal order');
  }
  {
    const game=createGame(players(2),1,()=>0);
    game.current=0;game.rootTurn=0;game.total=99;game.players[0].hand=[card('A'),card('10')];
    playCard(game,'fire-A');
    assert.equal(game.total,100);assert.equal(game.phase,'playing');assert.equal(game.exactEvents.length,1);
    const next=game.current;game.players[next].hand=[card('9','water'),card('10','water')];
    playCard(game,'water-9');assert.equal(game.exactEvents.length,1);
    game.players[game.current].hand=[card('10','water'),card('J')];
    playCard(game,'water-10');assert.equal(game.total,90);
    game.players[game.current].hand=[card('J'),card('2')];
    playCard(game,'fire-J');assert.equal(game.total,100);assert.equal(game.exactEvents.length,2);
    game.players[game.current].hand=[card('4'),card('9')];
    const loser=game.current;playCard(game,'fire-4');
    assert.equal(game.phase,'ended');assert.equal(game.bust,loser);assert.equal(game.total,104);
    assert.equal(game.players[loser].ratingDelta,-2); // +3 exact event, then -5 bust.
  }
  {
    const game=createGame(players(2),1,()=>0);
    game.current=0;game.rootTurn=0;game.drawPile=[];game.played=[card('A'),card('2'),card('3')];
    game.players[0].hand=[card('4'),card('5')];playCard(game,'fire-4');
    assert.equal(game.played.length,1);assert.equal(game.played[0].rank,'4');
    assert.equal(game.drawPile.length,2);assert.equal(game.players[0].hand.length,2);
  }
  {
    const game=createGame(players(2),1,()=>0);
    game.current=1;game.total=98;game.players[1].hand=[card('4'),card('9')];
    assert.equal(chooseCpuCard(game,'normal',()=>0).rank,'9');
  }
  for (const count of [2,4,8]) {
    const game=createGame(players(count).map(p=>({...p,kind:'cpu'})),1);
    let moves=0;
    while (game.phase!=='ended' && moves<500) {
      if (game.phase==='target') selectTarget(game,chooseCpuTarget(game,'normal'));
      else playCard(game,chooseCpuCard(game,'normal').id);
      if (game.phase!=='ended') assert(game.players.every(p=>p.hand.length===2));
      moves++;
    }
    assert.equal(game.phase,'ended',`${count}-player CPU game did not finish`);
    assert(game.total>100);
  }
  console.log('Rule checks passed: 52 cards, 2–8 players, chained 7s, reverse, exact 100, bust, recycle, CPU.');
