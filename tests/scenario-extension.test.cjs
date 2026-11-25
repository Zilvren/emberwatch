const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),load=require('../tools/load-ts.cjs').createLoader(),file=p=>path.join(root,'assets/game',p);
load(file('core/content/CardCatalog.ts')).installCatalog(JSON.parse(fs.readFileSync(path.join(root,'assets/resources/data/cards.json'),'utf8')));
const {STAMINA_SCENARIO,registerScenario,getScenario,validateScenario}=load(file('core/content/GameScenario.ts'));
const {SurvivalGame}=load(file('core/SurvivalGame.ts'));
const {routeMapModel}=load(file('presentation/map/RouteMapModel.ts'));
const ok=r=>assert.equal(r.ok,true,r.message);
const fixture=()=>({...structuredClone(STAMINA_SCENARIO),id:'extension-fixture',fixedNodeId:'cache',nodes:{cache:{type:'scavenge',title:'测试补给',icon:'supply',cost:0,supplies:[4,4],cardReward:'fixed'},ambush:{type:'battle',title:'测试遭遇',icon:'elite',enemyId:'raider'},camp:{type:'rest',title:'测试营地',icon:'rest',restoreHealth:1}},routes:{C:['ambush','camp']},scavengeFees:{},enemies:{raider:{title:'测试敌人',actorId:'wanderer',hp:2,attack:1,strongAttack:2,rewardSupplies:5,rewardChoices:2}},routeDescriptions:{C:'测试路径'}});
test('new route, node and enemy IDs work through rules, map, save/resume and configured rewards',()=>{
 const scenario=registerScenario(fixture()), game=new SurvivalGame(17,scenario);
 ok(game.start('standard'));ok(game.enterNode());assert.equal(game.rewards.source,'cache');ok(game.claimSupplies());ok(game.finishRewards());
 assert.equal(game.chooseRoute('unknown').ok,false);
 assert.ok(routeMapModel(game).points.some(p=>p.action==='route-C'&&p.state==='available'),'Even a single route must expose its native route-choice action');
 ok(game.chooseRoute('C'));
 const map=routeMapModel(game);assert.ok(map.points.some(p=>p.kind==='ambush'&&p.title==='测试遭遇'&&p.icon==='elite'));
 ok(game.enterNode());assert.equal(game.battle.enemy,'raider');
 const restored=SurvivalGame.fromState(game.exportState());assert.equal(restored.route,'C');assert.equal(restored.battle.enemy,'raider');
 for(let turn=0;restored.phase==='battle'&&turn<20;turn++){
  for(const card of [...restored.battle.hand])if(!restored.cardBlocked(card)){ok(restored.play(card.id));if(restored.phase!=='battle')break;}
  if(restored.phase==='battle')ok(restored.endTurn());
 }
 assert.equal(restored.phase,'rewards');assert.equal(restored.rewards.source,'ambush');assert.equal(restored.rewards.supplies,5);assert.equal(restored.rewards.cards.length,2);
 ok(restored.claimSupplies());ok(restored.finishRewards());ok(restored.enterNode());assert.equal(restored.phase,'rest');ok(restored.finishRest());assert.equal(restored.currentNode,'return');assert.ok(restored.visited.includes('camp'));
 assert.equal(SurvivalGame.fromState(restored.exportState()).currentNode,'return');
});
test('registered scenario versions are immutable; invalid definitions and dangling IDs cannot register',()=>{
 const source=fixture();source.id='immutable-fixture';const snapshot=registerScenario(source);source.enemies.raider.hp=99;
 assert.equal(getScenario(source.id,1).enemies.raider.hp,2);assert.ok(Object.isFrozen(snapshot.nodes));assert.throws(()=>registerScenario(source),/already exists/);
 const invalid=fixture();invalid.routes.C.push('missing');assert.throws(()=>validateScenario(invalid),/route nodes/);
 const invalidEnemy=fixture();invalidEnemy.nodes.ambush.enemyId='missing';assert.throws(()=>validateScenario(invalidEnemy),/enemy reference/);
 const repeat=fixture();repeat.routes.C.push('ambush');assert.throws(()=>validateScenario(repeat),/unique route steps/);
});
