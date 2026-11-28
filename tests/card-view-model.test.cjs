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
test('authored card summaries and detailed descriptions are independent and retain their text', () => {
    const summary = '这是一段超过二十四个字符的卡面简述，直到最后一个字符都保留。';
    const def = {
        ...catalog.CARD.attack,
        summary,
        text: '这是一段用于验证较长卡牌说明的文字。完整内容不能因为卡面空间有限而丢失。'.repeat(4),
    };
    const vm = cardViewModel(def);
    assert.equal(vm.description, summary);
    assert.ok(vm.fullDescription.includes(def.text));
    assert.ok(!vm.fullDescription.includes(summary));
    assert.equal(cardViewModel({ ...def, summary: undefined }).description, def.text);
    assert.equal(vm.cost, String(def.cost));
    assert.equal(vm.weight, '');
});
test('a supply face keeps the complete name and description with its unit value and carried weight', () => {
    const item = { ...catalog.CARD.cash, role: 'supply', name: '门前仓储站签发的旧城配给证明',
        text: '配给证明的背面写着粮站的地址，旁边还有前任持有者按下的一枚手印。', weight: 30, supplyValue: 999 };
    const preview = cardViewModel(item);
    assert.equal(preview.displayTitle, item.name);
    assert.equal(preview.description, item.text);
    assert.equal(preview.effect, '价值 999 物资点');
    assert.equal(preview.supplyWeight, 30);
    assert.equal(cardViewModel(item, catalog.CARD, '体力', { packedWeight: 1 }).supplyWeight, 1);
    assert.equal(cardViewModel(catalog.CARD.attack).supplyWeight, undefined);
});
test('reward rules keep the complete condition without repeating the base shield-spear effect', () => {
    const vm = cardViewModel(catalog.CARD.shield_spear_guard, catalog.CARD, '体力', { labyrinth: true });
    assert.equal(vm.description, '满蓄势时复制防御效果 3 次');
    assert.equal(vm.fullDescription, '造成 1 点伤害，获得 5 点格挡\n\n满蓄势时，复制本回合最近一次防御牌的完整效果3次。');
});
test('adding card summaries is compatible with an earlier catalog save', () => {
    const data = new Map();
    const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    catalog.installCatalog({ ...source, cards: source.cards.map(({ summary, ...card }) => card) });
    try {
        const earlier = new GameSession(17, new SaveRepository(storage));
        assert.ok(earlier.execute({ type: 'start', tier: 'standard' }).ok);
        catalog.installCatalog(source);
        const resumed = new GameSession(17, new SaveRepository(storage));
        assert.ok(resumed.restored, resumed.startupMessage);
        assert.deepEqual(resumed.game.exportState(), earlier.game.exportState());
        assert.equal(resumed.view.content.cards.shield_spear_guard.summary, '满蓄势时复制防御效果 3 次');
    } finally {
        catalog.installCatalog(source);
    }
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
