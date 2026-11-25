const { test } = require('node:test'),
    assert = require('node:assert/strict'),
    fs = require('node:fs'),
    path = require('node:path');
const root = path.resolve(__dirname, '..'),
    load = require('../tools/load-ts.cjs').createLoader();
const catalog = load(path.join(root, 'assets/game/core/content/CardCatalog.ts'));
const source = JSON.parse(
    fs.readFileSync(path.join(root, 'assets/resources/data/cards.json'), 'utf8')
);
catalog.installCatalog(source);
const { cardViewModel, cardReferenceViewModel } = load(
    path.join(root, 'assets/game/presentation/cards/CardViewModel.ts')
);
const { SurvivalGame } = load(path.join(root, 'assets/game/core/SurvivalGame.ts'));
const { GameSession } = load(path.join(root, 'assets/game/application/GameSession.ts'));
const { TUTORIAL_SCENARIO } = load(path.join(root, 'assets/game/core/content/GameScenario.ts'));
class LegacySession extends GameSession {
    constructor(seed, saves) {
        super(seed, saves, TUTORIAL_SCENARIO);
    }
}
const { SaveRepository } = load(path.join(root, 'assets/game/infrastructure/SaveRepository.ts'));
test('card fronts keep key effect data and long descriptions remain available in full', () => {
    const def = {
        ...catalog.CARD.attack,
        text: '这是一段用于验证较长卡牌说明的文字。完整内容不能因为卡面空间有限而丢失。'.repeat(4),
    };
    const vm = cardViewModel(def);
    assert.ok(vm.description.length <= 24);
    assert.ok(vm.description.endsWith('…'));
    assert.ok(vm.fullDescription.includes(def.text));
    assert.equal(vm.cost, String(def.cost));
    assert.equal(vm.weight, '');
});
test('equipment presents generated card separately from its start timing', () => {
    const vm = cardViewModel(catalog.CARD.knife);
    assert.equal(vm.effect, '生成「' + catalog.CARD.slash.name + '」');
    assert.match(vm.description, /下回合/);
    assert.match(vm.fullDescription, /下回合/);
    assert.match(vm.fullDescription, /唯一/);
});
test('temporary cards and art fallback retain the correct semantic display', () => {
    const vm = cardViewModel({ ...catalog.CARD.slash, art: 'unknown' });
    assert.equal(vm.weight, '本场临时');
    assert.equal(vm.temporary, true);
    assert.equal(vm.art, 'knife');
    assert.equal(vm.artIndex, 2);
});
test('formal workbook cards use stamina and keep noncombat or unconfigured costs distinct from zero', () => {
    const cards = JSON.parse(
        fs.readFileSync(path.join(root, 'assets/resources/ui/card-reference.json'), 'utf8')
    ).cards;
    const heavy = cardReferenceViewModel(cards.find((c) => c.id === 'heavy_hit'));
    assert.equal(heavy.effect, '造成 5 点伤害');
    assert.equal(heavy.cost, '1');
    assert.equal(heavy.costUnit, '体力');
    const rope = cardReferenceViewModel(cards.find((c) => c.id === 'rope'));
    assert.equal(rope.showCost, false);
    assert.equal(rope.cost, '—');
    assert.match(rope.fullDescription, /兑换物资点/);
    const battery = cardReferenceViewModel(cards.find((c) => c.id === 'battery'));
    assert.equal(battery.cost, '—');
    assert.ok(battery.keywords.includes('消耗品'));
    assert.match(battery.fullDescription, /待配置/);
    assert.equal(
        cardViewModel(catalog.CARD.attack).costUnit,
        '物资',
        'Legacy teaching data must retain its actual cost resource'
    );
});
test('an active run and its saves keep a frozen content snapshot when the editor installs another catalog', () => {
    const data = new Map(),
        storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
    const saves = new SaveRepository(storage),
        session = new LegacySession(17, saves),
        name = session.game.content.cards.attack.name;
    const changed = JSON.parse(JSON.stringify(source));
    changed.cards.find((c) => c.id === 'attack').name = '另一个配置中的攻击';
    catalog.installCatalog(changed);
    try {
        assert.equal(session.game.content.cards.attack.name, name);
        assert.equal(Object.isFrozen(session.game.content.cards.attack.effect), true);
        session.execute({ type: 'start' });
        assert.equal(session.saveStatus, '进度已保存');
        const continued = new LegacySession(1, saves);
        assert.equal(continued.restored, true);
        assert.equal(continued.game.content.cards.attack.name, name);
        assert.equal(new LegacySession(1, new SaveRepository(storage)).restored, false);
    } finally {
        catalog.installCatalog(source);
    }
});
