const { readFileSync } = require('node:fs');
const path = require('node:path');

module.exports = function synthesisCatalog() {
    const catalog = JSON.parse(readFileSync(path.join(__dirname, '../../assets/resources/data/cards.json'), 'utf8'));
    const heavy = catalog.cards.find(({ id }) => id === 'heavy');
    const make = (id, name, fields = {}) => ({
        ...heavy, id, name, initialCount: 0, reward: false, effect: { type: 'damage', amount: 6 }, ...fields,
    });
    for (const kind of ['knife', 'attack']) catalog.cards.find(({ id }) => id === kind).canSynthesize = true;
    catalog.cards.push(
        make('wood_stick', '木棍', { cost: 0, weight: 30, canSynthesize: true }),
        make('simple_spear', '简易长矛', { tag: '武器', cost: 0, canSynthesize: true }),
        make('long_spear', '加固长矛', { tag: '武器', cost: 0 }),
        make('spare_parts', '拆解零件', { tag: '技能', cost: 0 }),
        make('cloth_supplies', '布料', { role: 'supply', tag: '物资', weight: 25, cost: 0, reward: true, supplyValue: 3, effect: { type: 'none', amount: 0 } })
    );
    const row = (card, count = 1) => ({ card, count });
    catalog.fixedReward = 'wood_stick';
    catalog.recipes = [
        { id: 'make_spear', materials: [row('wood_stick'), row('knife')], products: [row('simple_spear')] },
        { id: 'reinforce_spear', materials: [row('simple_spear')], products: [row('long_spear'), row('spare_parts', 2)] },
        { id: 'trade_attacks', materials: [row('attack', 2)], products: [row('spare_parts')] },
    ];
    return catalog;
};
