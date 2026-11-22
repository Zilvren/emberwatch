// Deterministic design sample through the same commands as the game. Strategies are not players.
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = require('./load-ts.cjs').createLoader();
const content = load(path.join(root, 'assets/game/core/content/CardCatalog.ts'));
content.installCatalog(require('../assets/resources/data/cards.json'));
const { GameSession } = load(path.join(root, 'assets/game/application/GameSession.ts'));
function sample(seed, route, tier, defend) {
    const session = new GameSession(seed);
    const g = session.game;
    const act = (command) => {
        const r = session.execute(command);
        if (!r.ok) throw Error(r.message);
    };
    act({ type: 'start', tier });
    let turns = 0,
        taken = 0;
    for (let step = 0; step < 250; step++) {
        if (g.phase === 'map') {
            if (g.currentNode === 'return') {
                session.advanceTime(1);
                return { won: 1, turns, taken, armor: g.armor };
            }
            if (g.currentNode === 'choice') act({ type: 'choose-route', route });
            else act({ type: 'enter-node' });
        } else if (g.phase === 'rest') act({ type: 'finish-rest' });
        else if (g.phase === 'failure') return { won: 0, turns, taken, armor: 0 };
        else if (g.phase === 'battle') {
            const b = g.battle;
            if (b.discovery) {
                const preference = defend
                    ? ['shield_push', 'scrap_shiv', 'evade']
                    : ['follow_up', 'heavy', 'scrap_shiv'];
                const kind = preference.find((id) => b.discovery.includes(id)) ?? b.discovery[0];
                act({ type: 'discover', kind });
                taken++;
                continue;
            }
            const cards = b.hand.filter((c) => !g.cardBlocked(c));
            const def = (c) => g.content.cards[c.kind];
            const attacks = cards
                .filter((c) => def(c).effect.type === 'damage')
                .sort((a, c) => g.attackDamage(c.kind) - g.attackDamage(a.kind));
            let pick = attacks.find((c) => g.attackDamage(c.kind) >= b.hp);
            if (!pick)
                pick = cards.find((c) => def(c).cost === 0 && def(c).effect.type === 'damage');
            if (!pick && defend && b.block < g.incomingDamage)
                pick = cards
                    .filter((c) => def(c).effect.type === 'block')
                    .sort((a, c) => def(a).cost - def(c).cost)[0];
            if (!pick) pick = attacks[0] ?? cards.find((c) => def(c).effect.type === 'draw');
            if (pick) act({ type: 'play-card', id: pick.id });
            else {
                act({ type: 'end-turn' });
                turns++;
            }
        } else throw Error('Unexpected phase ' + g.phase);
    }
    throw Error('Turn guard exceeded');
}
const rows = [];
for (const route of ['A', 'B'])
    for (const tier of ['emergency', 'standard'])
        for (const defend of [false, true]) {
            const records = Array.from({ length: 64 }, (_, i) =>
                sample(i + 1, route, tier, defend)
            );
            const winners = records.filter((r) => r.won);
            const avg = (rows, key) =>
                rows.length
                    ? +(rows.reduce((n, r) => n + r[key], 0) / rows.length).toFixed(2)
                    : null;
            rows.push({
                route,
                tier,
                strategy: defend ? 'block-and-attack' : 'attack-only',
                runs: 64,
                wins: winners.length,
                meanEndTurns: avg(records, 'turns'),
                meanArmorOnSuccess: avg(winners, 'armor'),
            });
        }
console.log(JSON.stringify({ seeds: '1–64', runs: 512, routes: rows }, null, 2));
