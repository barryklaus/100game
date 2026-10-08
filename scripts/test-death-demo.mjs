import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({entryPoints: ['src/game/DeathDemo.ts','src/game/FreedomDemo.ts','src/game/rules.ts','src/game/deckCore.ts','src/ui/MasterSpriteData.ts'], bundle:true, format:'esm', platform:'node', write:false, outdir:'/tmp/death-demo-test'});
const modules = await Promise.all(result.outputFiles.map(file => import(`data:text/javascript;base64,${Buffer.from(file.text).toString('base64')}`)));
const {createDeathDemo} = modules.find(module => module.createDeathDemo);
const {createFreedomDemo} = modules.find(module => module.createFreedomDemo);
const {playCard} = modules.find(module => module.playCard);
const {makeDeck} = modules.find(module => module.makeDeck);
const {masterCharacterData} = modules.find(module => module.masterCharacterData);
const deckIds = makeDeck().map(card => card.id).sort();
for (const character of masterCharacterData) {
  for (const index of [0,1]) {
    const game = createDeathDemo(character.id);
    assert.equal(game.players[0].name, character.name);
    assert.equal(game.total,99);
    assert.equal(game.current,0);
    assert.equal(game.players.length,4);
    assert.equal(game.match.scores[0],-12);
    assert.deepEqual([...game.drawPile,...game.played,...game.players.flatMap(player => player.hand)].map(card => card.id).sort(),deckIds);
    playCard(game,game.players[0].hand[index].id);
    assert.equal(game.phase,'ended');
    assert.equal(game.event,'bust');
    assert(game.total > 100);
    assert.equal(game.players[0].ratingDelta,-5);
    assert.equal(game.match.scores[0],-17);
    assert.deepEqual(game.match.newlyDead,[0]);
    assert.equal(game.match.setup,3);
    assert.throws(() => playCard(game,game.players[0].hand[0].id));
  }
}
assert.deepEqual(createDeathDemo(),createDeathDemo(),'Replay fixture is deterministic and independent');
assert.equal(createDeathDemo('unknown').players[0].name,createDeathDemo().players[0].name);
assert.equal(createDeathDemo('finn',21).round,21);
for(const character of masterCharacterData){
 for(const index of [0,1]){
  const game=createFreedomDemo(character.id);
  assert.deepEqual([...game.drawPile,...game.played,...game.players.flatMap(player=>player.hand)].map(card=>card.id).sort(),deckIds);
  playCard(game,game.players[0].hand[index].id);assert.equal(game.current,1);assert.equal(game.phase,'playing');
  playCard(game,game.players[1].hand[0].id);
  assert.equal(game.phase,'ended');assert.deepEqual(game.match.newlyFreed,[0]);assert.equal(game.match.scores[0],30);assert.equal(game.match.outcomePoints[0],30);
 }
}
console.log('Last-card demo checks passed: all 16 characters, both final cards, unique deck conservation, ordinary Overflow and Death rules, duplicate-play rejection and fresh replay.');
