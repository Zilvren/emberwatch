/** Teaching-catalog v1 compatibility schema. Shared by its game/editor; no engine dependencies.
 * Formal display references are kept separate until the formal resource rules are implemented.
 */
import { RecipeDefinition, validateRecipes } from './RecipeCatalog';
import { isFistBattleReward, validateFistCard, validateFistSet, withFistVariants, type FistCard } from './FistCards';
import { isLabyrinthEnemy, validEnemyActions, type EnemyActionPlan, type LabyrinthEnemyId } from './LabyrinthEnemies';

export type CardKind = string;
export type EffectType = 'damage' | 'block' | 'heal' | 'equip' | 'draw' | 'strength' | 'skill' | 'power' | 'none';
export type CardRole = 'basic' | 'normal' | 'temporary' | 'cash' | 'supply';
export const CARD_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type CardRarity = (typeof CARD_RARITIES)[number];
export const BLOOD_EROSION_PERCENT = 10;
const LABYRINTH_RULES = {
    'blood-erosion': ['damage'],
    calm: ['damage', 'block', 'skill'],
    'temporary-calm': ['block', 'skill'],
    'gain-stamina': ['skill'],
    'next-skill-free': ['skill'],
    'calm-block': ['block'],
    'discard-to-top': ['block'],
    'draw-on-defer': ['power'],
    'temporary-to-block': ['skill'],
    'raise-calm-limit': ['power'],
    'calibrate-attack': ['skill'],
    'block-per-spent-calm': ['skill'],
    'deferred-damage': ['damage'],
    'deferred-draw': ['block'],
    'retain-hand': ['skill'],
    'deferred-counter': ['block'],
} as const;
export type LabyrinthRule = keyof typeof LABYRINTH_RULES;
export interface LabyrinthEffect {
    rule: LabyrinthRule;
    amount: number;
    threshold?: number;
}
export interface LabyrinthCatalog {
    starter: Readonly<Record<string, number>>;
    discoveryPool: readonly string[];
    enemyActions?: Partial<Record<LabyrinthEnemyId, EnemyActionPlan>>;
}
export interface RageEffect {
    threshold: number;
    damage?: number;
    damagePercentMaxHp?: number;
    copyDefenseTimes?: number;
}
export interface CardDefinition {
    id: string;
    name: string;
    tag: string;
    cost: number;
    weight: number;
    text: string;
    summary?: string;
    color: string;
    art: string;
    role: CardRole;
    initialCount: number;
    reward: boolean;
    rewardWeight?: number;
    rarity?: CardRarity;
    weaponSlots?: number;
    supplyValue?: number;
    canSynthesize?: boolean;
    synthesisOnly?: true;
    oncePerBattle?: true;
    chapter?: 'ashen-labyrinth';
    fist?: FistCard;
    effect: {
        type: EffectType;
        amount: number;
        hits?: number;
        equippedStrength?: number;
        generatedCard?: string;
        generatedCards?: readonly string[];
        block?: number;
        bonusWhen?: 'after-attack' | 'behind-cover';
        bonus?: number;
        extraDraw?: number;
        rage?: RageEffect;
        labyrinth?: LabyrinthEffect;
    };
}
export interface Catalog {
    version: number;
    fixedReward: string;
    cards: CardDefinition[];
    recipes: RecipeDefinition[];
    expedition?: {
        starter: Record<string, number>;
        discoveryGroups: string[][];
        faces?: Record<string, { name: string; text: string }>;
    };
    labyrinth?: LabyrinthCatalog;
}
export function isBattleCard(card: Pick<CardDefinition, 'role'>): boolean {
    return card.role === 'basic' || card.role === 'normal';
}
export function isLabyrinthRewardCard(card?: CardDefinition): boolean {
    return card?.role === 'normal' && (!card.fist || isFistBattleReward(card));
}
export function labyrinthCardRarity(
    card: CardDefinition,
    profile?: Pick<LabyrinthCatalog, 'starter' | 'discoveryPool'>
): CardRarity | undefined {
    if (card.role === 'supply') return card.rarity ?? 'common';
    if (card.role !== 'normal') return undefined;
    if ((profile?.discoveryPool.indexOf(card.id) ?? -1) >= 0 || card.fist?.type === 'finisher')
        return card.rarity ?? 'common';
    return profile?.starter[card.id] ? undefined : card.rarity;
}
export function carriedWeight(card: Pick<CardDefinition, 'role' | 'weight'>, packedWeight?: number): number {
    return card.role === 'supply' ? packedWeight ?? card.weight : 0;
}

/** Keep the authored v1 catalog available for old save signatures. Only supply
 * items have an effective weight, and old medical cards use the current terms. */
export function playableCard(card: CardDefinition): CardDefinition {
    const weight = carriedWeight(card);
    if (card.effect.type !== 'heal') return weight === card.weight ? card : { ...card, weight };
    const name = card.name === '修复' ? '急救' : card.name === '盐封修补' ? '应急包扎' : card.name;
    const text = card.text === '护甲为 0 时无法使用' || card.text === '护甲已满或降到 0 时无法使用。'
        ? '血量已满时无法使用。' : card.text.replace(/护甲/g, '血量');
    return { ...card, weight, name, text };
}
export const ART_IDS = ['attack', 'dodge', 'knife', 'evade', 'repair', 'heavy', 'slash', 'cash', 'rope', 'battery'];
export const EFFECT_NAMES: Record<EffectType, string> = {
    damage: '伤害',
    block: '格挡',
    heal: '修复',
    equip: '装备',
    draw: '抽牌',
    strength: '获得力量',
    skill: '技能',
    power: '能力',
    none: '遗物',
};
export const SYSTEM_ROLES: Record<string, CardRole> = {
    attack: 'basic',
    dodge: 'basic',
    cash: 'cash',
    slash: 'temporary',
};
export const CARD: Record<CardKind, CardDefinition> = Object.create(null);
export const REWARD_POOL: CardKind[] = [];
export const INITIAL_DECK: CardKind[] = [];
let current: Catalog | null = null;

export function generatedCards(effect: CardDefinition['effect']): string[] {
    if (effect.generatedCard && Array.isArray(effect.generatedCards) && effect.generatedCards.length === 1 && effect.generatedCards[0] !== effect.generatedCard)
        return [effect.generatedCard];
    if (Array.isArray(effect.generatedCards)) return effect.generatedCards.slice();
    return effect.generatedCard ? [effect.generatedCard] : [];
}

export function blockAmount(effect: CardDefinition['effect']): number {
    return effect.type === 'block' ? effect.amount : effect.block ?? 0;
}

export function hasBlockEffect(effect: CardDefinition['effect']): boolean {
    return blockAmount(effect) > 0;
}

export class CatalogError extends Error {
    constructor(public readonly issues: string[]) {
        super(issues.join('\n'));
        this.name = 'CatalogError';
    }
}

function legacyDiscoveryPool(
    profile: { decks?: unknown; enabledDecks?: unknown } | undefined,
    eligible: (id: unknown) => boolean,
    issues: string[]
): string[] {
    const decks = profile?.decks;
    if (!Array.isArray(decks)) {
        issues.push('焦土迷宫的旧奖励配置格式无效。');
        return [];
    }
    const byId = new Map<string, string[]>();
    for (const deck of decks) {
        if (!deck || typeof deck.id !== 'string' || !/^[a-z][a-z0-9-]{1,39}$/.test(deck.id) ||
            byId.has(deck.id) || typeof deck.name !== 'string' || !deck.name.trim() || deck.name.length > 24 ||
            !Array.isArray(deck.cards) || new Set(deck.cards).size !== deck.cards.length || !deck.cards.every(eligible)) {
            issues.push('旧发现牌组的 ID、名称或卡牌引用无效。');
            continue;
        }
        byId.set(deck.id, deck.cards);
    }
    const enabled = profile?.enabledDecks;
    if (!Array.isArray(enabled) || new Set(enabled).size !== enabled.length || !enabled.every(id => byId.has(id))) {
        issues.push('旧发现牌组的启用配置无效。');
        return [];
    }
    const selected = new Set(enabled), pool = new Set<string>();
    for (const [id, cards] of byId)
        if (selected.has(id)) for (const card of cards) pool.add(card);
    return [...pool];
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
    const integer = (value: unknown, min: number, max: number) =>
        Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
    for (let index = 0; index < input.cards.length; index++) {
        const card = input.cards[index];
        if (!card || typeof card !== 'object') {
            issues.push(`第 ${index + 1} 张牌格式错误。`);
            continue;
        }
        const label =
            typeof card.name === 'string' && card.name ? card.name : `第 ${index + 1} 张牌`;
        if (
            typeof card.id !== 'string' ||
            !/^[a-z][a-z0-9_-]{1,47}$/.test(card.id) ||
            card.id in Object.prototype
        )
            issues.push(`${label}：ID 需为 2～48 位小写字母、数字、下划线或短横线，首位为字母。`);
        if (seen.has(card.id)) issues.push(`${label}：ID「${card.id}」重复。`);
        seen.add(card.id);
        if (typeof card.name !== 'string' || !card.name.trim() || card.name.length > 18)
            issues.push(`${label}：名称需为 1～18 个字符。`);
        if (typeof card.tag !== 'string' || card.tag.length > 32)
            issues.push(`${label}：分类说明不能超过 32 个字符。`);
        if (typeof card.text !== 'string' || card.text.length > 80)
            issues.push(`${label}：详细描述需为 80 字以内的文本。`);
        if (card.summary !== undefined && typeof card.summary !== 'string')
            issues.push(`${label}：简述需为文本。`);
        if (!integer(card.cost, 0, 99)) issues.push(`${label}：费用需为 0～99 的整数。`);
        if (!integer(card.weight, 0, 30)) issues.push(`${label}：重量需为 0～30 的整数。`);
        if (!integer(card.initialCount, 0, 8)) issues.push(`${label}：初始数量需为 0～8 的整数。`);
        if (typeof card.reward !== 'boolean') issues.push(`${label}：奖励池设置无效。`);
        if (card.rarity !== undefined &&
            (CARD_RARITIES.indexOf(card.rarity) < 0 || (card.role !== 'normal' && card.role !== 'supply')))
            issues.push(`${label}：战斗卡与物资卡的稀有度须为普通、稀有、史诗或传说。`);
        if (card.rewardWeight !== undefined &&
            (typeof card.rewardWeight !== 'number' || !Number.isFinite(card.rewardWeight) ||
                card.rewardWeight < 0.01 || card.rewardWeight > 100))
            issues.push(`${label}：奖励权重需为 0.01～100 的数值。`);
        if (card.weaponSlots !== undefined && !integer(card.weaponSlots, 1, 2))
            issues.push(`${label}：武器槽占用数需为 1～2 的整数。`);
        if (card.chapter !== undefined && (card.chapter !== 'ashen-labyrinth' || card.initialCount !== 0 ||
            !(card.role === 'supply' || (card.role === 'normal' && !card.reward))))
            issues.push(`${label}：焦土迷宫战斗牌通过起手和发现牌组投放，物资卡通过搜刮投放。`);
        if (ART_IDS.indexOf(card.art) < 0) issues.push(`${label}：请选择现有插画。`);
        if (typeof card.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(card.color))
            issues.push(`${label}：颜色格式无效。`);
        if (['basic', 'normal', 'temporary', 'cash', 'supply'].indexOf(card.role) < 0)
            issues.push(`${label}：卡牌身份无效。`);
        if (card.canSynthesize !== undefined && typeof card.canSynthesize !== 'boolean')
            issues.push(`${label}：合成材料设置无效。`);
        if (card.canSynthesize && (card.chapter || !isBattleCard(card)))
            issues.push(`${label}：只有合成探索可用的战斗卡可以作为材料。`);
        if (card.synthesisOnly !== undefined &&
            (card.synthesisOnly !== true || card.chapter || card.initialCount ||
                (card.role !== 'normal' && card.role !== 'temporary')))
            issues.push(`${label}：合成探索专用牌应为普通牌或临时牌，且不加入初始牌组。`);
        if (card.oncePerBattle !== undefined &&
            (card.oncePerBattle !== true || !isBattleCard(card) ||
                (card.effect?.type !== 'heal' && card.effect?.type !== 'strength')))
            issues.push(`${label}：每场限用一次适用于回复血量或获得力量的战斗牌。`);
        if (card.supplyValue !== undefined && !integer(card.supplyValue, 1, 999))
            issues.push(`${label}：兑换物资点需为 1～999 的整数。`);
        if (Object.prototype.hasOwnProperty.call(SYSTEM_ROLES, card.id)) {
            if (card.role !== SYSTEM_ROLES[card.id])
                issues.push(`${label}：系统卡牌的身份不能更改。`);
        } else if (card.role === 'basic' || card.role === 'cash')
            issues.push(`${label}：新卡请选择普通牌、临时牌或物资牌。`);
        const effect = card.effect;
        if (
            !effect ||
            typeof effect !== 'object' ||
            !Object.prototype.hasOwnProperty.call(EFFECT_NAMES, effect.type)
        ) {
            issues.push(`${label}：效果类型无效。`);
            continue;
        }
        if (
            ['damage', 'block', 'heal', 'draw', 'strength'].indexOf(effect.type) >= 0 &&
            !integer(effect.amount, 1, 999)
        )
            issues.push(`${label}：效果数值需为 1～999 的整数。`);
        if (effect.block !== undefined && !integer(effect.block, 1, 999))
            issues.push(`${label}：复合格挡数值需为 1～999 的整数。`);
        if (['equip', 'none', 'skill', 'power'].indexOf(effect.type) >= 0 && effect.amount !== 0)
            issues.push(`${label}：此类型的效果数值应为 0。`);
        if (effect.block !== undefined && effect.type !== 'damage')
            issues.push(`${label}：只有伤害牌可以同时配置格挡效果。`);
        if (effect.hits !== undefined && (effect.type !== 'damage' || !integer(effect.hits, 2, 20)))
            issues.push(`${label}：多段攻击的段数需为 2～20。`);
        if (effect.equippedStrength !== undefined &&
            (effect.type !== 'equip' || !integer(effect.equippedStrength, 1, 999)))
            issues.push(`${label}：武器的装备力量需为 1～999 的整数。`);
        const fist = validateFistCard(card, issues);
        const addition = effect.labyrinth;
        if (addition !== undefined) {
            const types = addition && Object.prototype.hasOwnProperty.call(LABYRINTH_RULES, addition.rule)
                ? LABYRINTH_RULES[addition.rule as LabyrinthRule] as readonly string[]
                : [];
            if (card.chapter !== 'ashen-labyrinth' || types.indexOf(effect.type) < 0 ||
                !integer(addition?.amount, 1, 12) ||
                (addition.rule === 'calm-block' ? !integer(addition.threshold, 1, 12) : addition.threshold !== undefined))
                issues.push(`${label}：焦土迷宫的附加效果、数值或条件无效。`);
        } else if ((effect.type === 'skill' || effect.type === 'power') && !fist)
            issues.push(`${label}：技能和能力需要配置可执行的效果。`);
        if (
            (effect.bonusWhen !== undefined || effect.bonus !== undefined) &&
            (effect.type !== 'damage' ||
                ['after-attack', 'behind-cover'].indexOf(effect.bonusWhen) < 0 ||
                !integer(effect.bonus, 1, 99))
        )
            issues.push(`${label}：攻击加成的触发条件或数值无效。`);
        if (
            effect.extraDraw !== undefined &&
            (effect.type !== 'damage' || !integer(effect.extraDraw, 1, 6))
        )
            issues.push(`${label}：追加抽牌须为攻击效果，数量为 1～6。`);
        if (effect.rage !== undefined) {
            const rage = effect.rage;
            if (effect.type !== 'damage' || !integer(rage.threshold, 1, 20))
                issues.push(`${label}：蓄势效果必须配置在伤害牌上，并设置有效阈值。`);
            if (rage.damage !== undefined && !integer(rage.damage, 1, 999))
                issues.push(`${label}：蓄势强化伤害需为 1～999 的整数。`);
            if (
                rage.damagePercentMaxHp !== undefined &&
                (typeof rage.damagePercentMaxHp !== 'number' || rage.damagePercentMaxHp <= 0 || rage.damagePercentMaxHp > 1)
            )
                issues.push(`${label}：蓄势百分比伤害需为 0～1 之间的小数。`);
            if (rage.copyDefenseTimes !== undefined && !integer(rage.copyDefenseTimes, 1, 9))
                issues.push(`${label}：防御复制次数需为 1～9 的整数。`);
        }
        if (
            card.role === 'temporary' &&
            (card.initialCount !== 0 ||
                card.reward ||
                card.weight !== 0 ||
                ['damage', 'block', 'heal'].indexOf(effect.type) < 0)
        )
            issues.push(
                `${label}：临时牌重量为 0，不进入初始卡组或奖励池，效果限于伤害、格挡和修复。`
            );
        if (card.role !== 'normal' && card.role !== 'supply' && card.reward)
            issues.push(`${label}：只有普通牌和物资牌能进入奖励池。`);
        if (card.role === 'supply' && (card.initialCount || card.cost || effect.type !== 'none'))
            issues.push(`${label}：物资牌只从搜刮获得，初始数量和费用为 0，效果请选择“无”。`);
        if (card.role === 'supply' && !integer(card.weight, 1, 30))
            issues.push(`${label}：物资卡重量需为 1～30 的整数。`);
        if (card.role === 'supply' && !integer(card.supplyValue ?? 1, 1, 999))
            issues.push(`${label}：物资牌必须设置 1～999 点兑换值。`);
        if (effect.type === 'none' && card.role !== 'cash' && card.role !== 'supply')
            issues.push(`${label}：普通牌需要可执行的效果。`);
        if (card.weaponSlots !== undefined && effect.type !== 'equip')
            issues.push(`${label}：只有武器牌可以配置武器槽占用数。`);
        if (
            card.id === 'attack' &&
            (effect.type !== 'damage' ||
                card.cost !== 0 ||
                card.weight !== 0 ||
                card.initialCount < 1)
        )
            issues.push('基础攻击必须保留免费、零重量的伤害能力，并至少初始携带一张。');
        if (
            card.id === 'dodge' &&
            (effect.type !== 'block' ||
                card.cost !== 0 ||
                card.weight !== 0 ||
                card.initialCount < 1)
        )
            issues.push('基础躲避必须保留免费、零重量的格挡能力，并至少初始携带一张。');
        if (
            card.id === 'cash' &&
            (effect.type !== 'none' || card.cost !== 0 || card.initialCount !== 1)
        )
            issues.push('现金必须保留一张初始遗物，费用为 0。');
        if (card.id === 'slash' && effect.type !== 'damage') issues.push('挥砍必须保留伤害效果。');
        cards.push({
            id: card.id,
            name: typeof card.name === 'string' ? card.name.trim() : '',
            tag: card.tag,
            cost: card.cost,
            weight: card.weight,
            text: card.text,
            ...(typeof card.summary === 'string' && card.summary.trim()
                ? { summary: card.summary.trim() }
                : {}),
            color: card.color,
            art: card.art,
            role: card.role,
            initialCount: card.initialCount,
            reward: card.reward,
            ...(card.rarity !== undefined ? { rarity: card.rarity } : {}),
            ...(card.rewardWeight !== undefined ? { rewardWeight: card.rewardWeight } : {}),
            ...(card.synthesisOnly ? { synthesisOnly: true } : {}),
            ...(card.oncePerBattle ? { oncePerBattle: true } : {}),
            ...(effect.type === 'equip' ? { weaponSlots: card.weaponSlots ?? 1 } : {}),
            ...(card.role === 'supply' ? { supplyValue: card.supplyValue ?? 1 } : {}),
            ...(card.canSynthesize === true ? { canSynthesize: true } : {}),
            ...(card.chapter ? { chapter: card.chapter } : {}),
            ...(fist ? { fist } : {}),
            effect: {
                type: effect.type,
                amount: effect.amount,
                ...(effect.hits !== undefined ? { hits: effect.hits } : {}),
                ...(effect.equippedStrength !== undefined ? { equippedStrength: effect.equippedStrength } : {}),
                ...(effect.type === 'equip'
                    ? {
                          ...(Array.isArray(effect.generatedCards)
                              ? { generatedCards: effect.generatedCards.slice() }
                              : {}),
                          ...(effect.generatedCard ? { generatedCard: effect.generatedCard } : {}),
                      }
                    : {}),
                ...(effect.block !== undefined ? { block: effect.block } : {}),
                ...(effect.bonusWhen ? { bonusWhen: effect.bonusWhen, bonus: effect.bonus } : {}),
                ...(effect.extraDraw ? { extraDraw: effect.extraDraw } : {}),
                ...(effect.rage ? { rage: { ...effect.rage } } : {}),
                ...(addition ? { labyrinth: {
                    rule: addition.rule,
                    amount: addition.amount,
                    ...(addition.threshold === undefined ? {} : { threshold: addition.threshold }),
                } } : {}),
            },
        });
    }
    for (const id of Object.keys(SYSTEM_ROLES))
        if (!seen.has(id)) issues.push(`系统卡牌「${id}」不能删除。`);
    const definitions: Record<string, CardDefinition> = Object.create(null);
    for (const card of cards) definitions[card.id] = card;
    validateFistSet(cards, issues);
    for (const card of cards) {
        if (card.effect.type !== 'equip') continue;
        const generated = generatedCards(card.effect);
        if (!generated.length) issues.push(`${card.name}：装备至少需要引用一张临时生成牌。`);
        if (new Set(generated).size !== generated.length)
            issues.push(`${card.name}：装备生成牌不能重复配置。`);
        for (const id of generated)
            if (definitions[id]?.role !== 'temporary')
                issues.push(`${card.name}：装备必须引用存在的临时牌「${id}」。`);
    }
    if (typeof input.fixedReward !== 'string' || definitions[input.fixedReward]?.role !== 'normal' ||
        definitions[input.fixedReward]?.chapter || definitions[input.fixedReward]?.synthesisOnly || definitions[input.fixedReward]?.fist)
        issues.push('固定搜刮奖励必须引用一张存在的普通牌。');
    if (!cards.some((card) => card.role === 'normal' && card.reward))
        issues.push('奖励池至少需要一张普通牌。');
    if (cards.reduce((sum, card) => sum + card.initialCount, 0) > 30)
        issues.push('初始卡牌数量不能超过 30 张。');
    const recipes = validateRecipes(input.recipes, definitions, issues);
    const field = input.expedition;
    if (field !== undefined) {
        const eligible = (id: string) =>
            !definitions[id]?.chapter && !definitions[id]?.fist && ['basic', 'normal'].indexOf(definitions[id]?.role) >= 0;
        if (
            !field?.starter ||
            typeof field.starter !== 'object' ||
            Array.isArray(field.starter) ||
            !Object.keys(field.starter).length ||
            Object.keys(field.starter).some(
                (id) => !eligible(id) || !integer(field.starter[id], 1, 20)
            )
        )
            issues.push('探索基础牌组的卡牌或张数无效。');
        if (
            !Array.isArray(field?.discoveryGroups) ||
            field.discoveryGroups.length < 1 ||
            field.discoveryGroups.length > 3 ||
            field.discoveryGroups.some(
                (group: unknown) =>
                    !Array.isArray(group) ||
                    !group.length ||
                    group.some((id) => definitions[id]?.role !== 'normal' || !!definitions[id]?.chapter || !!definitions[id]?.fist)
            )
        )
            issues.push('发现牌池须包含 1～3 组有效普通牌。');
        for (const id of Object.keys(field?.faces ?? {})) {
            const face = field.faces[id];
            if (
                !definitions[id] ||
                !face ||
                typeof face.name !== 'string' ||
                !face.name.trim() ||
                face.name.length > 18 ||
                typeof face.text !== 'string' ||
                face.text.length > 80
            )
                issues.push('探索牌面的卡牌引用或说明无效。');
        }
    }
    const rawLabyrinth = input.labyrinth;
    let labyrinth: LabyrinthCatalog | undefined;
    if (rawLabyrinth !== undefined) {
        const eligibleStarter = (value: unknown) =>
            typeof value === 'string' && definitions[value]?.chapter === 'ashen-labyrinth' && definitions[value].role === 'normal';
        const eligibleReward = (value: unknown) =>
            typeof value === 'string' && isLabyrinthRewardCard(definitions[value]);
        const starter = rawLabyrinth?.starter;
        if (!starter || typeof starter !== 'object' || Array.isArray(starter) ||
            !Object.keys(starter).length ||
            Object.keys(starter).some((id) => !eligibleStarter(id) || !integer(starter[id], 1, 20)) ||
            !Object.keys(starter).some((id) => definitions[id]?.effect.type === 'damage'))
            issues.push('焦土迷宫的基础牌组无效，至少需要一张攻击牌。');
        const discoveryPool = rawLabyrinth?.discoveryPool === undefined
            ? legacyDiscoveryPool(rawLabyrinth, id => eligibleStarter(id) ||
                (typeof id === 'string' && !!definitions[id] && isFistBattleReward(definitions[id])), issues)
            : rawLabyrinth.discoveryPool;
        if (!Array.isArray(discoveryPool) || new Set(discoveryPool).size !== discoveryPool.length ||
            !discoveryPool.every(eligibleReward))
            issues.push('焦土迷宫奖励池需要引用不同的普通战斗牌。');
        else labyrinth = { starter: { ...starter }, discoveryPool: [...discoveryPool] };
        const actions = rawLabyrinth?.enemyActions;
        if (actions !== undefined) {
            if (!actions || typeof actions !== 'object' || Array.isArray(actions)) {
                issues.push('焦土迷宫的怪物动作配置无效。');
            } else {
                const plans: NonNullable<LabyrinthCatalog['enemyActions']> = {};
                for (const id of Object.keys(actions)) {
                    const plan = actions[id] as EnemyActionPlan;
                    const loopStart = plan?.loopStart ?? 0;
                    if (!isLabyrinthEnemy(id) || !plan || !integer(plan.attack, 0, 100000) ||
                        !integer(plan.strongAttack, 0, 100000) || !validEnemyActions(plan.actions) ||
                        !integer(loopStart, 0, plan.actions.length - 1)) {
                        issues.push(`${id} 的动作或伤害数值无效。`);
                        continue;
                    }
                    plans[id] = { attack: plan.attack, strongAttack: plan.strongAttack, actions: [...plan.actions], loopStart };
                }
                if (labyrinth && Object.keys(plans).length) labyrinth.enemyActions = plans;
            }
        }
    }
    if (issues.length) throw new CatalogError(issues);
    return {
        version: 1,
        fixedReward: input.fixedReward,
        cards,
        recipes,
        ...(field
            ? {
                  expedition: {
                      starter: { ...field.starter },
                      discoveryGroups: field.discoveryGroups.map((group: string[]) =>
                          group.slice()
                      ),
                      ...(field.faces ? { faces: JSON.parse(JSON.stringify(field.faces)) } : {}),
                  },
              }
            : {}),
        ...(labyrinth ? { labyrinth } : {}),
    };
}

export function installCatalog(raw: unknown): Catalog {
    const next = validateCatalog(raw);
    for (const id of Object.keys(CARD)) delete CARD[id];
    REWARD_POOL.length = 0;
    INITIAL_DECK.length = 0;
    for (const card of withFistVariants(next.cards)) {
        CARD[card.id] = playableCard(card);
        if (card.reward && card.role !== 'supply' && !card.fist) REWARD_POOL.push(card.id);
        for (let count = 0; count < card.initialCount; count++) INITIAL_DECK.push(card.id);
    }
    current = next;
    return next;
}
export function getCatalog(): Catalog {
    if (!current) throw new Error('卡牌配置尚未加载。');
    return current;
}
export function effectSummary(
    card: CardDefinition,
    definitions: Record<string, CardDefinition> = CARD
): string {
    const effect = card.effect;
    let primary = '';
    if (effect.type === 'damage') {
        primary = effect.hits ? `造成 ${effect.amount} 点伤害 ${effect.hits} 次` : `造成 ${effect.amount} 点伤害`;
        if (effect.block) primary += `，获得 ${effect.block} 点格挡`;
        if (effect.extraDraw) primary += `，抽 ${effect.extraDraw} 张`;
    }
    if (effect.type === 'draw') primary = `抽 ${effect.amount} 张牌`;
    if (effect.type === 'block') primary = `获得 ${effect.amount} 点格挡`;
    if (effect.type === 'strength') primary = `本场获得 ${effect.amount} 点力量`;
    if (effect.type === 'skill' && card.fist?.type === 'support') return card.text;
    if (effect.labyrinth) {
        const { rule, amount, threshold } = effect.labyrinth;
        const effects: Record<LabyrinthRule, string> = {
            'blood-erosion': `施加 ${amount} 蚀血`,
            calm: `施加 ${amount} 层镇静`,
            'temporary-calm': `施加 ${amount} 层临时镇静`,
            'gain-stamina': `获得 ${amount} 体力，本场消耗`,
            'next-skill-free': '本回合下一张技能牌免费',
            'calm-block': `镇静达到 ${threshold} 层时再获得 ${amount} 格挡`,
            'discard-to-top': '可将一张弃牌放到抽牌堆顶',
            'draw-on-defer': `本场安排暂缓时抽 ${amount} 张牌`,
            'temporary-to-block': `消耗所有临时镇静，每层获得 ${amount} 格挡`,
            'raise-calm-limit': `本场镇静上限及自动暂缓门槛均提高 ${amount}`,
            'calibrate-attack': '本回合下一张攻击伤害乘以出牌前的镇静层数，并消耗这些层',
            'block-per-spent-calm': `本回合每消耗一层镇静获得 ${amount} 格挡`,
            'deferred-damage': `敌人行动已暂缓时额外造成 ${amount} 伤害`,
            'deferred-draw': `敌人行动已暂缓时抽 ${amount} 张牌`,
            'retain-hand': '从手牌选一张留到下回合',
            'deferred-counter': `本回合完全挡住那次暂缓的攻击时反击 ${amount}`,
        };
        return [primary, effects[rule]].filter(Boolean).join('，');
    }
    if (primary) return primary;
    if (effect.type === 'heal') return `恢复 ${effect.amount} 点血量`;
    if (effect.type === 'equip') {
        const generated = generatedCards(effect).map(
            (id) => definitions[id]?.name ?? id
        );
        const strength = effect.equippedStrength ? `装备时提供 ${effect.equippedStrength} 点力量。` : '';
        return `${strength}下回合起每回合生成「${generated.join('」「')}」`;
    }
    return card.role === 'supply' ? `可兑换 ${card.supplyValue ?? 1} 物资点` : '只能在休整时丢弃';
}
/** Dark ink derived from the chosen accent keeps names legible on the paper card. */
export function titleColor(accent: string): string {
    return (
        '#' +
        [1, 3, 5]
            .map((offset) =>
                (
                    '0' +
                    Math.round(parseInt(accent.slice(offset, offset + 2), 16) * 0.45).toString(16)
                ).slice(-2)
            )
            .join('')
    );
}
export function cardReferences(catalog: Catalog, id: string): string[] {
    const card = catalog.cards.find((card) => card.id === id),
        refs: string[] = [];
    if (card?.initialCount) refs.push(`初始卡组 ${card.initialCount} 张`);
    if (card?.reward) refs.push('随机奖励池');
    if (card?.fist?.type === 'move' || card?.fist?.type === 'finisher') refs.push('拳流派连段');
    if (catalog.expedition?.starter[id])
        refs.push(`探索基础牌组 ${catalog.expedition.starter[id]} 张`);
    if (catalog.expedition?.discoveryGroups.some((group) => group.indexOf(id) >= 0))
        refs.push('战斗发现池');
    if (catalog.labyrinth?.starter[id]) refs.push(`焦土迷宫基础牌组 ${catalog.labyrinth.starter[id]} 张`);
    if ((catalog.labyrinth?.discoveryPool.indexOf(id) ?? -1) >= 0) refs.push('焦土迷宫奖励池');
    if (catalog.fixedReward === id) refs.push('固定搜刮奖励');
    for (const source of catalog.cards)
        if (generatedCards(source.effect).indexOf(id) >= 0) refs.push(`${source.name}的生成牌`);
    for (const recipe of catalog.recipes ?? []) {
        if (recipe.materials.some(({ card }) => card === id)) refs.push(`配方 ${recipe.id} 的材料`);
        if (recipe.products.some(({ card }) => card === id)) refs.push(`配方 ${recipe.id} 的产物`);
    }
    return refs;
}
