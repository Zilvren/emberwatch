const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createLoader } = require('../tools/load-ts.cjs');

const load = createLoader();
const { battleWindowLayout } = load(resolve(__dirname, '../assets/game/presentation/ui/BattleWindowLayout.ts'));
const graph = JSON.parse(readFileSync(resolve(__dirname, '../assets/prefabs/screens/BattleScreen.prefab'), 'utf8'));
const battle = graph.find(n => n.__type__ === 'cc.Node' && n._name === 'BattleScreen');
const child = (parent, name) => parent._children.map(ref => graph[ref.__id__]).find(node => node._name === name);
const size = node => node._components.map(ref => graph[ref.__id__]).find(c => c.__type__ === 'cc.UITransform')._contentSize;

test('the battle fills the visible window and leaves each hand clear of the controls', () => {
    const turn = size(child(battle, 'end-turn'));
    const pile = size(child(child(battle, 'drawPile'), 'draw-pile'));
    for (const [w, h] of [[613, 767], [390, 844], [800, 800], [1024, 768], [840, 470], [1440, 900], [1920, 720]]) {
        const f = battleWindowLayout(w, h);
        assert.ok(Math.abs(f.width * f.scale - w) < 0.001);
        assert.ok(Math.abs(f.height * f.scale - h) < 0.001);
        assert.ok(f.pileX + pile.width / 2 <= f.width / 2);
        assert.ok(f.pileY - pile.height / 2 >= -f.height / 2);
        if (f.stacked) {
            // A full fan has approximately 145 units below the hand's center.
            assert.ok(f.handY - 145 > f.pileY + pile.height / 2);
            assert.ok(f.endX + turn.width / 2 < f.pileX - pile.width / 2);
            assert.ok(f.energyX - size(child(battle, 'StaminaGauge')).width / 2 > -f.pileX + pile.width / 2);
        } else {
            assert.ok(f.handX + f.handWidth / 2 < f.endX - turn.width / 2);
            assert.ok(f.handX - f.handWidth / 2 > f.energyX + size(child(battle, 'StaminaGauge')).width / 2);
        }
    }
});

test('both native health meters share a baseline, track dimensions and centered values', () => {
    const player = child(battle, 'PlayerVitals'), enemy = child(battle, 'EnemyVitals');
    const heroTrack = child(player, 'healthTrack'), enemyTrack = child(enemy, 'enemyTrack');
    assert.equal(player._lpos.y + heroTrack._lpos.y, enemy._lpos.y + enemyTrack._lpos.y);
    assert.deepEqual(size(heroTrack), size(enemyTrack));
    for (const [group, track, label] of [[player, heroTrack, 'battle-text3'], [enemy, enemyTrack, 'battle-text5']]) {
        assert.equal(child(group, label)._lpos.x, track._lpos.x);
        assert.equal(child(group, label)._lpos.y, track._lpos.y);
    }
});

test('the painted piles fan in opposite directions and their whole silhouette is clickable', () => {
    for (const [name, button, sign] of [['drawPile', 'draw-pile', 1], ['discardPile', 'discard-pile', -1]]) {
        const pile = child(battle, name), stack = child(pile, 'CanvasDeck'), hit = size(child(pile, button));
        const leaves = stack._children.map(ref => graph[ref.__id__]);
        assert.equal(leaves.length, 3);
        assert.ok(leaves[0]._euler.z * sign > leaves[1]._euler.z * sign);
        assert.ok(leaves[1]._euler.z * sign > leaves[2]._euler.z * sign);
        for (const leaf of leaves) {
            const angle = leaf._euler.z * Math.PI / 180, s = Math.abs(Math.sin(angle)), c = Math.abs(Math.cos(angle));
            const { width, height } = size(leaf);
            assert.ok(Math.abs(stack._lpos.x + leaf._lpos.x) + (width * c + height * s) / 2 <= hit.width / 2);
            assert.ok(Math.abs(stack._lpos.y + leaf._lpos.y) + (height * c + width * s) / 2 <= hit.height / 2);
        }
        assert.deepEqual(child(pile, name + '-text0')._lpos, child(pile, name + 'CountSeal')._lpos);
    }
});
