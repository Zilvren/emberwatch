const assert = require('node:assert/strict');
const path = require('node:path');
const { createLoader } = require('./load-ts.cjs');
const root = path.resolve(__dirname, '..');
const load = createLoader();
const game = (file) => load(path.join(root, 'assets/game', file + '.ts'));
const { installCatalog } = game('core/content/CardCatalog');
const { GameSession } = game('application/GameSession');
installCatalog(require('../assets/resources/data/cards.json'));

function run(seed, route, tier, strategy) {
    const session = new GameSession(seed);
    const g = session.game;
    const doIt = (command) => {
        const result = session.execute(command);
        assert.ok(result.ok, result.message);
    };
    doIt({ type: 'start', tier });
    doIt({ type: 'enter-node' });
    doIt({ type: 'choose-route', route });
    let turns = 0, encounters = 0;
    for (let step = 0; step < 240 && g.phase !== 'failure'; step++) {
        if (g.phase === 'map' && g.currentNode === 'return') {
            session.advanceTime(1);
            return { success: g.day === 2, health: g.health, turns, encounters };
        }
        if (g.phase === 'map') {
            doIt({ type: 'enter-node' });
            if (g.battle) encounters++;
        } else if (g.phase === 'rest') doIt({ type: 'finish-rest' });
        else if (g.phase === 'rewards') doIt({ type: 'discover', kind: null });
        else if (g.battle.cardChoice) doIt({ type: 'resolve-combat-choice', id: null });
        else {
            const b = g.battle;
            const options = b.hand.filter((card) => !g.cardBlocked(card));
            const byType = (type) => options.filter((c) => g.content.cards[c.kind].effect.type === type);
            const attacks = byType('damage').sort((a, b) => g.attackDamage(b.kind) - g.attackDamage(a.kind));
            const defense = g.incomingDamage > b.block && !b.calm.deferred
                ? byType('block').sort((a, b) => g.cardCost(a.kind) - g.cardCost(b.kind))[0] : undefined;
            const play = options.find((c) => c.kind === 'lab_cell')
                ?? attacks.find((c) => g.attackDamage(c.kind) >= b.hp)
                ?? (strategy === 'cover' ? defense : undefined)
                ?? attacks[0] ?? defense ?? byType('draw')[0];
            if (play) doIt({ type: 'play-card', id: play.id });
            else {
                turns++;
                doIt({ type: 'end-turn' });
            }
        }
    }
    return { success: false, health: 0, turns, encounters };
}
const samples = [];
for (const tier of ['emergency', 'low', 'standard']) {
    for (const route of ['A', 'B']) for (const strategy of ['attack', 'cover']) {
        const runs = Array.from({ length: 64 }, (_, seed) => run(seed + 1, route, tier, strategy));
        const victories = runs.filter((result) => result.success);
        samples.push({ tier, route, strategy, runs: runs.length, cleared: victories.length,
            averageHealth: +(victories.reduce((n, r) => n + r.health, 0) / (victories.length || 1)).toFixed(2),
            meanEndTurns: +(runs.reduce((n, r) => n + r.turns, 0) / runs.length).toFixed(2) });
    }
}
console.log(JSON.stringify({ seedsPerGroup: 64, total: samples.length * 64, samples }, null, 2));
