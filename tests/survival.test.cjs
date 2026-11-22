const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const load=require('../tools/load-ts.cjs').createLoader();
const catalog = JSON.parse(fs.readFileSync(path.join(root,'assets/resources/data/cards.json'),'utf8'));
for (const [id, name, weight] of [['supply_crate', '物资木箱', 25], ['supply_fuel', '燃料', 8], ['supply_torch', '火把', 4]]) {
    catalog.cards.push({ id, name, weight, role:'supply', tag:'物资', text:'', cost:0,
        initialCount:0, reward:true, art:'cash', color:'#9aaf8c', supplyValue:1, effect:{type:'none',amount:0} });
}
load(path.join(root,'assets/game/core/content/CardCatalog.ts')).installCatalog(catalog);
const {SurvivalGame,CARD,REWARD_POOL}=load(path.join(root,'assets/game/core/SurvivalGame.ts'));
const ok=r=>assert.equal(r.ok,true,r.message);
const owned=(id,kind,zone='base')=>({id,kind,zone,selected:kind!=='cash'&&!kind.startsWith('supply_'),found:true});
function combat(enemy='enemy1',seed=17){const g=new SurvivalGame(seed);g.start();g.fixedDone=true;g.route='A';g.pathIndex=enemy==='enemy1'?0:3;g.enterNode();return g;}
function hand(g,kinds){g.battle.hand=kinds.map((kind,i)=>({id:`fixture-${i}`,kind,temporary:kind==='slash'}));g.battle.draw=[];g.battle.discard=[];}
function playKind(g,kind){const c=g.battle.hand.find(c=>c.kind===kind);assert.ok(c,`missing ${kind}`);return g.play(c.id);}
function shelter(supplies=4,health=5){const g=new SurvivalGame(2);g.start();g.fixedDone=true;g.route='A';g.pathIndex=4;g.phase='map';g.supplies=supplies;g.health=health;g.advanceTime(1);g.continueJournal();return g;}
function winUsingCards(g,basicOnly=false){
    for(let i=0;g.phase==='battle'&&i<40;i++){
        const priorities=basicOnly?['attack','dodge']:['repair','heavy','slash','attack','evade','dodge','knife'];
        for(const kind of priorities){
            if(!g.battle)break;
            for(const c of [...g.battle.hand]){
                if(g.phase!=='battle')break;
                if(c.kind!==kind||g.cardBlocked(c))continue;
                if(kind==='repair'&&g.health>7)continue;
                if(kind==='knife'&&g.battle.hp<=2)continue;
                ok(g.play(c.id));
            }
        }
        if(g.phase==='battle')ok(g.endTurn());
    }
    assert.equal(g.phase,'rewards',g.failureReason);
}

test('day one starts with seven weightless combat cards, cash, supplies and full health',()=>{
    const g=new SurvivalGame(1);assert.equal(g.phase,'journal');assert.equal(g.usableCards.length,7);assert.equal(g.cards.length,8);
    assert.equal(g.supplies,10);assert.equal(g.health,10);assert.equal(g.baseWeight,0);assert.equal(g.overflowWeight,0);
    assert.equal(g.toggleCard(g.cards[0].id).ok,false);assert.equal(g.chooseRoute('B').ok,false);ok(g.start());assert.equal(g.currentNode,'fixed');
});
test('fixed scavenging pays immediately and both points and the battle card are collected in full',()=>{
    const g=new SurvivalGame(1);g.start();g.enterNode();assert.equal(g.supplies,8);assert.equal(g.baseWeight,0);
    assert.deepEqual(g.rewards.cards,['heavy']);assert.equal(g.rewards.supplies,4);ok(g.claimSupplies());ok(g.claimCard(0));
    assert.equal(g.supplies,12);assert.equal(g.baseWeight,0);assert.equal(g.overflowWeight,0);assert.equal(g.usableCards.length,8);
    g.finishRewards();assert.equal(g.currentNode,'choice');ok(g.chooseRoute('A'));assert.equal(g.currentNode,'enemy1');
});
test('both reward claim orders collect all points and deck cards',()=>{
    const g=new SurvivalGame(4);g.start();g.enterNode();g.claimCard(0);assert.equal(g.baseWeight,0);
    g.claimSupplies();assert.equal(g.supplies,12);assert.equal(g.baseWeight,0);assert.equal(g.overflowWeight,0);assert.equal(g.claimSupplies().ok,false);
});
test('cash cannot be discarded during rewards and basic abilities can never be destroyed',()=>{
    const g=new SurvivalGame(4);g.start();g.enterNode();assert.equal(g.discardCard(g.cards.find(c=>c.kind==='cash').id).ok,false);
    assert.equal(g.discardCard(g.cards[0].id).ok,false);assert.equal(g.cards.length,8);
});
test('only supply cards use bag capacity and can exceed the overflow cap',()=>{
    const g=new SurvivalGame(8);g.phase='rewards';g.supplies=13;
    g.cards.push(owned('crate','supply_crate'),owned('overflow1','supply_fuel','overflow'));
    g.rewards={source:'fixed',supplies:4,cards:['supply_fuel','heavy'],supplyTaken:false,cardTaken:false};
    assert.equal(g.baseWeight,25);assert.equal(g.claimCard(0).ok,false);assert.equal(g.overflowWeight,8);
    ok(g.claimCard(1));assert.equal(g.cards.at(-1).zone,'base');assert.equal(g.baseWeight,25);
});
test('discarding a supply card frees space for waiting supply cards',()=>{
    const g=new SurvivalGame(1);g.phase='rewards';g.cards.push(owned('crate','supply_crate'),owned('first','supply_fuel','overflow'));
    assert.equal(g.baseWeight,25);assert.equal(g.discardSupplies(3).ok,false);assert.equal(g.cards.find(c=>c.id==='first').zone,'overflow');
    ok(g.discardCard('crate'));assert.equal(g.cards.find(c=>c.id==='first').zone,'base');assert.equal(g.baseWeight,8);
});
test('ordinary duplicate cards are allowed and reward alternatives are mutually exclusive',()=>{
    const g=combat();hand(g,['heavy','attack']);playKind(g,'heavy');playKind(g,'attack');
    assert.equal(new Set(g.rewards.cards).size,3);g.rewards.cards=['knife','evade','repair'];g.claimCard(0);
    assert.equal(g.cards.filter(c=>c.kind==='knife').length,2);assert.equal(g.claimCard(1).ok,false);
});
test('enemy intent is attack, prepare, strengthened attack; block expires each turn',()=>{
    const g=combat();hand(g,[]);assert.equal(g.incomingDamage,2);g.battle.block=1;g.endTurn();assert.equal(g.health,9);assert.equal(g.battle.block,0);
    assert.equal(g.battle.intent,'prepare');assert.equal(g.incomingDamage,0);g.endTurn();assert.equal(g.incomingDamage,4);g.endTurn();assert.equal(g.health,5);
});
test('hand caps at 6; unplayed cards go to discard; subsequent turns draw 3',()=>{
    const g=combat();assert.equal(g.battle.hand.length,6);const old=g.battle.hand.map(c=>c.id);g.endTurn();
    assert.equal(g.battle.hand.length,3);const all=[...g.battle.hand,...g.battle.draw,...g.battle.discard];assert.equal(all.length,7);assert.equal(new Set(all.map(c=>c.id)).size,7);assert.ok(old.every(id=>all.some(c=>c.id===id)));
});
test('knife equips once, generates slash next turn before draws, and costs are separate from weight',()=>{
    const g=combat('enemy2');hand(g,['knife']);const before=g.baseWeight;playKind(g,'knife');assert.equal(g.supplies,8);assert.equal(g.baseWeight,before);assert.equal(g.battle.hand.length,0);
    g.endTurn();assert.equal(g.battle.hand[0].kind,'slash');assert.equal(g.battle.hand[0].temporary,true);
    const hp=g.battle.hp;playKind(g,'slash');assert.equal(g.battle.hp,hp-4);assert.equal(g.supplies,7);
});
test('battle remains active at zero supplies; free basic cards and victory rewards can rescue the run',()=>{
    const g=combat();g.supplies=1;hand(g,['heavy','attack']);playKind(g,'heavy');assert.equal(g.supplies,0);assert.equal(g.phase,'battle');
    playKind(g,'attack');assert.equal(g.phase,'rewards');assert.equal(g.supplies,0);assert.equal(g.health,10);g.claimSupplies();g.finishRewards();assert.equal(g.phase,'map');assert.equal(g.supplies,2);
});
test('skipping all rewards at zero fails only after node settlement and fully resets the tutorial',()=>{
    const g=combat();g.supplies=0;hand(g,['attack','attack','attack']);for(let i=0;i<3;i++)playKind(g,'attack');
    assert.equal(g.phase,'rewards');g.finishRewards();assert.equal(g.phase,'failure');assert.equal(g.day,1);assert.equal(g.supplies,10);assert.equal(g.health,10);assert.equal(g.cards.length,8);assert.equal(g.settlement,null);
});
test('scavenging can spend the last supplies and its rewards can rescue the run',()=>{
    const g=new SurvivalGame(2);g.start();g.supplies=2;g.enterNode();assert.equal(g.supplies,0);assert.equal(g.phase,'rewards');g.claimSupplies();g.finishRewards();assert.equal(g.supplies,4);assert.equal(g.phase,'map');
});
test('a hit that takes health to zero ends the current battle immediately',()=>{
    const g=combat();g.health=2;hand(g,[]);ok(g.endTurn());
    assert.equal(g.health,0);assert.equal(g.phase,'failure');assert.equal(g.battle,null);
    assert.match(g.failureReason,/血量耗尽/);
    ok(g.retry());assert.equal(g.phase,'shelter');assert.equal(g.health,10);
});
test('block absorbs damage before a final point of damage ends the run',()=>{
    const g=combat();g.health=1;hand(g,[]);g.battle.block=2;g.endTurn();assert.equal(g.phase,'battle');assert.equal(g.health,1);
    g.endTurn();g.battle.block=3;g.endTurn();assert.equal(g.phase,'failure');assert.equal(g.health,0);
});
test('repair restores 3 and caps at 10; ordinary and enhanced blocks have exact effects',()=>{
    const g=combat();g.health=9;hand(g,['repair','dodge','evade']);playKind(g,'repair');assert.equal(g.health,10);playKind(g,'dodge');playKind(g,'evade');assert.equal(g.battle.block,7);
});
test('rest restores health up to its cap and allows deck selection',()=>{
    const g=new SurvivalGame(3);g.phase='map';g.fixedDone=true;g.route='A';g.pathIndex=2;g.health=9;const s=g.supplies;g.enterNode();assert.equal(g.health,10);assert.equal(g.supplies,s);
    const id=g.cards[0].id;ok(g.toggleCard(id));assert.equal(g.cards[0].selected,false);assert.equal(g.baseWeight,0);
});
test('rest also heals at one health and cash can be discarded without changing weight',()=>{
    const g=new SurvivalGame(3);g.phase='map';g.fixedDone=true;g.route='A';g.pathIndex=2;g.health=1;
    ok(g.enterNode());assert.equal(g.health,3);ok(g.discardCard(g.cards.find(c=>c.kind==='cash').id));assert.equal(g.baseWeight,0);
});
test('defeat restores deleted cash and discards acquired rewards without daily consumption',()=>{
    const g=combat();g.cards=g.cards.filter(c=>c.kind!=='cash');g.cards.push(owned('found','heavy'));g.supplies=3;g.health=1;hand(g,[]);g.endTurn();
    assert.equal(g.phase,'failure');assert.equal(g.cards.some(c=>c.id==='found'),false);assert.equal(g.cards.filter(c=>c.kind==='cash').length,1);assert.equal(g.supplies,10);assert.equal(g.day,1);g.reset();assert.equal(g.phase,'journal');
});
test('fixed seeds reproduce random rewards and decks; restarting advances the random stream',()=>{
    const a=combat('enemy1',123),b=combat('enemy1',123);assert.deepEqual(a.battle.hand.map(c=>c.kind),b.battle.hand.map(c=>c.kind));
    const first=a.random.state;a.reset();a.phase='map';a.fixedDone=true;a.route='A';a.pathIndex=0;a.enterNode();assert.notEqual(a.random.state,first);
});
test('random scavenging always pays 4–6 for a fee of 3 and only awards functional cards',()=>{
    for(let seed=1;seed<=64;seed++){const g=new SurvivalGame(seed);g.start();g.fixedDone=true;g.route='B';g.enterNode();assert.equal(g.supplies,7);assert.ok(g.rewards.supplies>=4&&g.rewards.supplies<=6);assert.ok(REWARD_POOL.includes(g.rewards.cards[0]));}
});
test('boss opening includes a functional card and new battles build fresh shuffled decks',()=>{
    for(let seed=1;seed<=32;seed++){const g=combat('enemy2',seed);assert.ok(g.battle.hand.some(c=>REWARD_POOL.includes(c.kind)));assert.equal(g.battle.weapon,null);assert.ok(g.battle.hand.length<=6);}
});
test('consecutive battles rebuild the whole permanent deck, clear temporary cards, and reshuffle',()=>{
    const g=combat('enemy1',17);const original=g.cards.filter(c=>c.selected&&c.kind!=='cash').map(c=>c.id).sort();
    hand(g,['knife']);playKind(g,'knife');g.endTurn();assert.equal(g.battle.hand[0].kind,'slash');
    g.battle.hp=4;playKind(g,'slash');assert.equal(g.phase,'rewards');g.claimSupplies();g.finishRewards();
    g.enterNode();g.claimSupplies();g.finishRewards();g.enterNode();g.finishRest();
    const randomBefore=g.random.state;g.enterNode();assert.equal(g.battle.enemy,'enemy2');assert.notEqual(g.random.state,randomBefore);
    const deck=[...g.battle.hand,...g.battle.draw,...g.battle.discard];assert.deepEqual(deck.map(c=>c.id).sort(),original);
    assert.ok(deck.every(c=>!c.temporary));assert.equal(g.battle.weapon,null);
});
test('one weapon slot rejects a second knife without charging resources',()=>{
    const g=combat('enemy2');hand(g,['knife','knife']);ok(playKind(g,'knife'));const supplies=g.supplies;
    assert.equal(playKind(g,'knife').ok,false);assert.equal(g.supplies,supplies);assert.equal(g.battle.hand.length,1);
});
test('a deliberately basic-only deck remains playable without inventing unselected function cards',()=>{
    const g=new SurvivalGame(22);g.start();g.fixedDone=true;g.route='A';g.pathIndex=2;g.enterNode();
    for(const c of g.cards.filter(c=>REWARD_POOL.includes(c.kind)))g.toggleCard(c.id);
    ok(g.finishRest());ok(g.enterNode());assert.ok(g.battle.hand.every(c=>c.kind==='attack'||c.kind==='dodge'));
    assert.equal(g.battle.hand.length,4);
});
test('enemy one can be defeated using only basic cards',()=>{
    for(const seed of [1,7,17,42]){const g=combat('enemy1',seed);const supplies=g.supplies;winUsingCards(g,true);assert.equal(g.supplies,supplies);assert.ok(g.health>=0);}
});
test('return preserves health and the deck while discarding overflow supply cards',()=>{
    const g=new SurvivalGame(5);g.start();g.fixedDone=true;g.route='B';g.pathIndex=4;g.phase='map';g.health=1;g.cards.push(owned('overflow','supply_torch','overflow'));
    g.advanceTime(0.3);assert.equal(g.phase,'map');g.advanceTime(0.6);assert.equal(g.phase,'journal');assert.equal(g.day,2);
    assert.equal(g.health,1);assert.equal(g.settlement.treatmentCost,1);assert.deepEqual(g.settlement.lostOverflow,['火把']);assert.equal(g.cards.some(c=>c.zone==='overflow'),false);
});
test('shelter treatment costs one supply and fully heals, with no daily fee',()=>{
    for(const health of [6,1]){const g=shelter(5,health);
        ok(g.healAtShelter());assert.equal(g.supplies,4);assert.equal(g.health,10);assert.equal('dailySpent' in g.settlement,false);assert.equal(g.day,2);
        g.advanceTime(10);assert.equal(g.supplies,4);assert.equal(g.phase,'shelter');assert.equal(g.day,2);
    }
});
test('repair can use the last supplies directly now that daily payment is removed',()=>{
    const g=shelter(1,1);const r=g.healAtShelter();assert.equal(r.ok,true);assert.equal(r.warning,false);assert.equal(g.supplies,0);assert.equal(g.health,10);assert.equal(g.day,2);
});
test('insufficient repair fee is rejected; full health is free; skipping repair preserves health',()=>{
    const poor=shelter(0,1);assert.equal(poor.healAtShelter().ok,false);assert.equal(poor.health,1);assert.equal(poor.supplies,0);
    const full=shelter(3,10);assert.equal(full.settlement.treatmentCost,0);assert.equal(full.healAtShelter().ok,false);assert.equal(full.supplies,3);
});
for(const route of ['A','B'])test(`complete teaching route ${route} unlocks a dated key journal and continues into formal play`,()=>{
    for(const seed of [7,17,42,123,2026]){
        const g=new SurvivalGame(seed);g.start();g.enterNode();g.claimSupplies();g.claimCard(0);g.finishRewards();g.chooseRoute(route);
        for(let guard=0;guard<30&&g.phase!=='journal';guard++){
            if(g.phase==='map'){if(g.currentNode==='return')g.advanceTime(1);else ok(g.enterNode());}
            else if(g.phase==='battle')winUsingCards(g);
            else if(g.phase==='rewards'){g.claimSupplies();if(!g.rewardCardBlocked(g.rewards.cards[0]))g.claimCard(0);g.finishRewards();}
            else if(g.phase==='rest'){const cash=g.cards.find(c=>c.kind==='cash');if(cash)g.discardCard(cash.id);g.finishRest();}
            else assert.fail(`unexpected phase ${g.phase}: ${g.failureReason}`);
            assert.ok(g.baseWeight<=30);assert.ok(g.overflowWeight<=10);assert.ok(g.supplies>=0);assert.ok(g.health>=0&&g.health<=10);
        }
        assert.equal(g.phase,'journal');assert.equal(g.day,2);assert.equal(g.visited.length,5);assert.equal(g.currentJournal.id,'tutorial-cleared');
        ok(g.continueJournal());assert.equal(g.phase,'shelter');assert.equal(g.scenario.kind,'expedition');assert.equal('dailySpent' in g.settlement,false);
    }
});
