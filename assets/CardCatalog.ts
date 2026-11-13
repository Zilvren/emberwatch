/** Shared by the game, local editor server and browser editor. No engine dependencies. */
export type CardKind = string;
export type EffectType = 'damage' | 'block' | 'heal' | 'equip' | 'none';
export type CardRole = 'basic' | 'normal' | 'temporary' | 'cash';
export interface CardDefinition {
    id: string;
    name: string;
    tag: string;
    cost: number;
    weight: number;
    text: string;
    color: string;
    art: string;
    role: CardRole;
    initialCount: number;
    reward: boolean;
    effect: { type: EffectType; amount: number; generatedCard?: string };
}
export interface Catalog { version: number; fixedReward: string; cards: CardDefinition[] }
export const ART_IDS = ['attack', 'dodge', 'knife', 'evade', 'repair', 'heavy', 'slash', 'cash'];
export const EFFECT_NAMES: Record<EffectType, string> = { damage: '伤害', block: '格挡', heal: '修复', equip: '装备', none: '遗物' };
export const SYSTEM_ROLES: Record<string, CardRole> = { attack: 'basic', dodge: 'basic', cash: 'cash', slash: 'temporary' };
export const CARD: Record<CardKind, CardDefinition> = Object.create(null);
export const REWARD_POOL: CardKind[] = [];
export const INITIAL_DECK: CardKind[] = [];
let current: Catalog | null = null;

export class CatalogError extends Error {
    constructor(public readonly issues: string[]) { super(issues.join('\n')); this.name = 'CatalogError'; }
}

export function validateCatalog(raw: unknown): Catalog {
    const issues: string[] = [];
    if (!raw || typeof raw !== 'object') throw new CatalogError(['卡牌配置必须是对象。']);
    const input = raw as Record<string, any>;
    if (input.version !== 1) issues.push('不支持的配置版本。');
    if (!Array.isArray(input.cards) || input.cards.length < 4 || input.cards.length > 200) {
        throw new CatalogError(['卡牌数量必须为 4～200 张。']);
    }
    const seen = new Set<string>();
    const cards: CardDefinition[] = [];
    const integer = (value: unknown, min: number, max: number) => Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
    for (let index = 0; index < input.cards.length; index++) {
        const card = input.cards[index];
        if (!card || typeof card !== 'object') { issues.push(`第 ${index + 1} 张牌格式错误。`); continue; }
        const label = typeof card.name === 'string' && card.name ? card.name : `第 ${index + 1} 张牌`;
        if (typeof card.id !== 'string' || !/^[a-z][a-z0-9_-]{1,47}$/.test(card.id) || card.id in Object.prototype) issues.push(`${label}：ID 需为 2～48 位小写字母、数字、下划线或短横线，首位为字母。`);
        if (seen.has(card.id)) issues.push(`${label}：ID「${card.id}」重复。`);
        seen.add(card.id);
        if (typeof card.name !== 'string' || !card.name.trim() || card.name.length > 18) issues.push(`${label}：名称需为 1～18 个字符。`);
        if (typeof card.tag !== 'string' || card.tag.length > 32) issues.push(`${label}：分类说明不能超过 32 个字符。`);
        if (typeof card.text !== 'string' || card.text.length > 80) issues.push(`${label}：补充说明不能超过 80 个字符。`);
        if (!integer(card.cost, 0, 99)) issues.push(`${label}：费用需为 0～99 的整数。`);
        if (!integer(card.weight, 0, 30)) issues.push(`${label}：重量需为 0～30 的整数。`);
        if (!integer(card.initialCount, 0, 8)) issues.push(`${label}：初始数量需为 0～8 的整数。`);
        if (typeof card.reward !== 'boolean') issues.push(`${label}：奖励池设置无效。`);
        if (ART_IDS.indexOf(card.art) < 0) issues.push(`${label}：请选择现有插画。`);
        if (typeof card.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(card.color)) issues.push(`${label}：颜色格式无效。`);
        if (['basic', 'normal', 'temporary', 'cash'].indexOf(card.role) < 0) issues.push(`${label}：卡牌身份无效。`);
        if (Object.prototype.hasOwnProperty.call(SYSTEM_ROLES, card.id)) {
            if (card.role !== SYSTEM_ROLES[card.id]) issues.push(`${label}：系统卡牌的身份不能更改。`);
        } else if (card.role === 'basic' || card.role === 'cash') issues.push(`${label}：新卡请选择普通牌或临时牌。`);
        const effect = card.effect;
        if (!effect || typeof effect !== 'object' || !Object.prototype.hasOwnProperty.call(EFFECT_NAMES, effect.type)) {
            issues.push(`${label}：效果类型无效。`); continue;
        }
        if (['damage', 'block', 'heal'].indexOf(effect.type) >= 0 && !integer(effect.amount, 1, 999)) issues.push(`${label}：效果数值需为 1～999 的整数。`);
        if (['equip', 'none'].indexOf(effect.type) >= 0 && effect.amount !== 0) issues.push(`${label}：此类型的效果数值应为 0。`);
        if (card.role === 'temporary' && (card.initialCount !== 0 || card.reward || card.weight !== 0 || ['damage', 'block', 'heal'].indexOf(effect.type) < 0)) issues.push(`${label}：临时牌重量为 0，不进入初始卡组或奖励池，效果限于伤害、格挡和修复。`);
        if (card.role !== 'normal' && card.reward) issues.push(`${label}：只有普通牌能进入奖励池。`);
        if (effect.type === 'none' && card.role !== 'cash') issues.push(`${label}：普通牌需要可执行的效果。`);
        if (card.id === 'attack' && (effect.type !== 'damage' || card.cost !== 0 || card.weight !== 0 || card.initialCount < 1)) issues.push('基础攻击必须保留免费、零重量的伤害能力，并至少初始携带一张。');
        if (card.id === 'dodge' && (effect.type !== 'block' || card.cost !== 0 || card.weight !== 0 || card.initialCount < 1)) issues.push('基础躲避必须保留免费、零重量的格挡能力，并至少初始携带一张。');
        if (card.id === 'cash' && (effect.type !== 'none' || card.cost !== 0 || card.initialCount !== 1)) issues.push('现金必须保留一张初始遗物，费用为 0。');
        if (card.id === 'slash' && effect.type !== 'damage') issues.push('挥砍必须保留伤害效果。');
        cards.push({ id: card.id, name: typeof card.name === 'string' ? card.name.trim() : '', tag: card.tag, cost: card.cost, weight: card.weight, text: card.text, color: card.color, art: card.art, role: card.role, initialCount: card.initialCount, reward: card.reward,
            effect: { type: effect.type, amount: effect.amount, ...(effect.type === 'equip' ? { generatedCard: effect.generatedCard } : {}) } });
    }
    for (const id of Object.keys(SYSTEM_ROLES)) if (!seen.has(id)) issues.push(`系统卡牌「${id}」不能删除。`);
    const definitions: Record<string, CardDefinition> = Object.create(null);
    for (const card of cards) definitions[card.id] = card;
    for (const card of cards) if (card.effect.type === 'equip' && definitions[card.effect.generatedCard ?? '']?.role !== 'temporary') issues.push(`${card.name}：装备必须引用一张存在的临时牌。`);
    if (typeof input.fixedReward !== 'string' || definitions[input.fixedReward]?.role !== 'normal') issues.push('固定搜刮奖励必须引用一张存在的普通牌。');
    if (!cards.some(card => card.reward)) issues.push('奖励池至少需要一张普通牌。');
    const weight = cards.reduce((sum, card) => sum + card.weight * card.initialCount, 10);
    if (weight > 30) issues.push(`初始负重为 ${weight}/30，请减少初始数量或重量（含 10 点物资）。`);
    if (cards.reduce((sum, card) => sum + card.initialCount, 0) > 30) issues.push('初始卡牌数量不能超过 30 张。');
    if (issues.length) throw new CatalogError(issues);
    return { version: 1, fixedReward: input.fixedReward, cards };
}

export function installCatalog(raw: unknown): Catalog {
    const next = validateCatalog(raw);
    for (const id of Object.keys(CARD)) delete CARD[id];
    REWARD_POOL.length = 0;
    INITIAL_DECK.length = 0;
    for (const card of next.cards) {
        CARD[card.id] = card;
        if (card.reward) REWARD_POOL.push(card.id);
        for (let count = 0; count < card.initialCount; count++) INITIAL_DECK.push(card.id);
    }
    current = next;
    return next;
}
export function getCatalog(): Catalog {
    if (!current) throw new Error('卡牌配置尚未加载。');
    return current;
}
export function effectSummary(card: CardDefinition, definitions: Record<string, CardDefinition> = CARD): string {
    const effect = card.effect;
    if (effect.type === 'damage') return `造成 ${effect.amount} 点伤害`;
    if (effect.type === 'block') return `获得 ${effect.amount} 点格挡`;
    if (effect.type === 'heal') return `恢复 ${effect.amount} 点护甲`;
    if (effect.type === 'equip') return `下回合起每回合生成「${definitions[effect.generatedCard ?? '']?.name ?? effect.generatedCard}」`;
    return '只能在休整时丢弃';
}
/** Dark ink derived from the chosen accent keeps names legible on the paper card. */
export function titleColor(accent: string): string {
    return '#' + [1, 3, 5].map(offset => ('0' + Math.round(parseInt(accent.slice(offset, offset + 2), 16) * 0.45).toString(16)).slice(-2)).join('');
}
export function cardReferences(catalog: Catalog, id: string): string[] {
    const card = catalog.cards.find(card => card.id === id), refs: string[] = [];
    if (card?.initialCount) refs.push(`初始卡组 ${card.initialCount} 张`);
    if (card?.reward) refs.push('随机奖励池');
    if (catalog.fixedReward === id) refs.push('固定搜刮奖励');
    for (const source of catalog.cards) if (source.effect.generatedCard === id) refs.push(`${source.name}的生成牌`);
    return refs;
}
