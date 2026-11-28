import { ART_IDS, CARD, CardDefinition, effectSummary, generatedCards, playableCard } from '../../core/content/CardCatalog';
import type { CardDesignReference } from './CardDesignReference';

export const CARD_ART_IDS = ART_IDS;
const keywordLabels: Record<string, string> = {
    basic: '基础牌',
    weapon: '武器',
    instrument: '仪器',
    consumable: '消耗品',
    fist: '拳流派',
    combo: '连击',
    temporary: '本场临时',
    supply: '物资卡',
    synthesis: '可作为合成材料',
    'synthesis-needed': '已有搭配 · 缺此材料',
};
const keywordDescriptions: Record<string, string> = {
    basic: '可在初始卡组中获得。',
    weapon: '打出后进入武器槽，并按武器规则生成攻击牌。',
    instrument: '装入仪器槽，下回合起生成发振。',
    consumable: '使用并结算效果后永久消失。',
    fist: '基础招式可连续打出组成连段，拳流派牌享受本场叠加效果。',
    combo: '本回合已出牌时触发发现。上一张也是拳流派牌时，发现临时基础招式。',
    temporary: '打出后移出本场。未打出的牌随手牌进入弃牌堆，可再次抽到。',
    supply: '带回避难所后，可以兑换成物资点。',
    synthesis: '可以按配方使用本局卡组中的卡牌进行合成。',
    'synthesis-needed': '本局卡组中已有这条配方的一部分材料，仍需要这张卡。',
};
interface DisplayInput {
    id: string;
    title: string;
    tag: string;
    cost: number | null;
    costUnit: string;
    showCost: boolean;
    effect: string;
    description: string;
    fullDescription: string;
    weight: string;
    supplyWeight?: number;
    art: string;
    artKey?: string;
    accent: string;
    temporary: boolean;
    keywords: string[];
}
function displayModel(input: DisplayInput) {
    const index = CARD_ART_IDS.indexOf(input.art);
    const labels = input.keywords.map((id) => keywordLabels[id] ?? id);
    const keywordText = input.keywords
        .map((id) => `${keywordLabels[id] ?? id}：${keywordDescriptions[id] ?? ''}`)
        .join('\n');
    return {
        ...input,
        cost: input.cost === null ? '—' : String(input.cost),
        displayTitle: input.supplyWeight === undefined && input.title.length > 7 ? input.title.slice(0, 6) + '…' : input.title,
        fullDescription:
            (input.title.length > 7 ? input.title + '\n\n' : '') +
            input.fullDescription +
            (keywordText ? '\n\n' + keywordText : ''),
        longDescription: input.title.length > 7 || input.description.length > 24,
        art: index < 0 ? 'knife' : input.art,
        artIndex: index < 0 ? 2 : index,
        keywords: labels,
    };
}
export type CardDisplayModel = ReturnType<typeof displayModel>;

/** Measurements on the 224 × 340 supply face, shared with the editor preview. */
export function supplyPictureLayout(description: string, artRatio: number, blocked = false) {
    if (description) return { height: description.length > 42 ? 133 : 158, headingShift: 0 };
    const available = blocked ? 205 : 225;
    const height = Math.min(available, 200 / artRatio);
    return { height, headingShift: (available - height) / 2 };
}

export interface CardViewOptions {
    field?: boolean;
    labyrinth?: boolean;
    runDeck?: boolean;
    neededForSynthesis?: boolean;
    packedWeight?: number;
    damage?: number;
    cost?: number;
    rageReady?: boolean;
}

/** Compatibility adapter for the existing teaching catalog and web editor. */
export function cardViewModel(
    data: CardDefinition,
    definitions: Readonly<Record<string, CardDefinition>> = CARD,
    costUnit = '物资',
    options: CardViewOptions = {}
): CardDisplayModel {
    data = playableCard(data);
    const { field, labyrinth, damage, cost } = options;
    const instrument = field && !labyrinth && data.effect.type === 'equip';
    const effect = effectSummary(data, definitions);
    const [lead, ...continuation] = data.text.split('。');
    const detail = lead.replace(/\s/g, '') === effect.replace(/\s/g, '')
        ? continuation.join('。').trim()
        : data.text;
    const [baseEffect, ...additional] = data.effect.labyrinth ? effect.split('，') : [effect];
    const generated = generatedCards(data.effect).map((id) => definitions[id]?.name ?? id);
    const hits = data.effect.hits ?? 1;
    const currentDamage = damage ?? data.effect.amount * hits;
    const attack = hits === 1 ? `造成 ${currentDamage} 点伤害`
        : damage === undefined || data.fist ? `造成 ${currentDamage / hits} 点伤害 ${hits} 次`
        : `造成 ${currentDamage} 点总伤害（${hits} 段）`;
    const supportHeadline = data.fist?.type === 'support' && data.effect.type === 'skill' ? {
        'fetch-hook': '补一张缺少的勾拳',
        'switch-stance': '互换直拳和招架',
        'recover-stamina': '移出招式以回复体力',
        'after-finisher': '',
    }[data.fist.action] : '';
    const primary =
        data.effect.type === 'equip'
            ? `生成「${generated.join('」「')}」`
              : data.effect.type === 'damage'
                ? attack + (data.effect.block ? `，获得 ${data.effect.block} 点格挡` : '') +
                    (data.effect.extraDraw ? `，抽 ${data.effect.extraDraw} 张` : '')
              : supportHeadline || (baseEffect.length > 21 && data.effect.labyrinth ? '查看效果说明' : baseEffect);
    const once = data.oncePerBattle ? '每张每场限用一次' : '';
    const context = [once, additional.join('，'), supportHeadline || primary === '查看效果说明' ? baseEffect : '', detail]
        .filter(Boolean).join('。');
    const weaponDescription = data.effect.type === 'equip'
        ? (data.effect.equippedStrength ? `装备时提供 ${data.effect.equippedStrength} 点力量。` : '') +
            (generated.length === 1 ? '从下回合起，每回合 1 张。' : '从下回合起，每回合各 1 张。')
        : '';
    const keywords =
        data.role === 'supply'
            ? ['supply']
            : data.role === 'basic'
              ? ['basic']
              : data.effect.type === 'equip'
                ? [instrument ? 'instrument' : 'weapon']
                : [];
    if (data.canSynthesize && !labyrinth) {
        keywords.push('synthesis');
        if (options.neededForSynthesis) keywords.push('synthesis-needed');
    }
    if (data.fist) {
        keywords.push('fist');
        if (data.role === 'temporary') keywords.push('temporary');
        else if (data.fist.type === 'move') keywords.push('combo');
    }
    const fieldTemporary = field && data.role === 'temporary' && !data.fist;
    return displayModel({
        id: data.id,
        title: data.name,
        tag: instrument ? '仪器 · 持续' : labyrinth
            ? data.tag.split('·').map(part => part.trim())
                .filter(part => part !== '合成产物' && part !== '合成材料').join(' · ')
            : data.tag,
        cost: cost ?? data.cost,
        costUnit,
        showCost: data.role !== 'cash' && data.role !== 'supply',
        effect: data.role === 'supply' ? `价值 ${data.supplyValue ?? 1} 物资点` : primary,
        description:
            data.role === 'supply' ? data.text : data.summary ??
            (fieldTemporary
                ? '打出或回合结束时消失。'
                : weaponDescription + context),
        fullDescription:
            effect +
            (fieldTemporary
                ? '\n\n打出或回合结束时消失。'
                : [once, detail].filter(Boolean).map((line) => '\n\n' + line).join('')),
        weight: data.role === 'temporary' ? '本场临时' : '',
        ...(data.role === 'supply' ? { supplyWeight: options.packedWeight ?? data.weight } : {}),
        art: data.art,
        ...(data.fist && data.role === 'temporary' ? { artKey: data.id.replace(/_temp$/, '') } : {}),
        accent: data.color,
        temporary: data.role === 'temporary',
        keywords,
    });
}

/** Formal design preview. Missing spreadsheet costs remain missing rather than becoming zero. */
export function cardReferenceViewModel(data: CardDesignReference): CardDisplayModel {
    const eligibility = { yes: '进入战斗', no: '不进入战斗', configurable: '可配置入战斗' }[
        data.combatEligibility
    ];
    let primary = data.combatText
        .replace(/造成(\d+)点伤害/, '造成 $1 点伤害')
        .replace(/获得(\d+)点格挡/, '获得 $1 点格挡')
        .replace(/恢复(\d+)点血量.*/, '恢复 $1 点血量');
    if (data.keywords.indexOf('weapon') >= 0 && data.combatText.indexOf('生成') >= 0)
        primary = `生成「${data.combatText.split('生成').pop()}」`;
    if (data.combatEligibility === 'no') primary = data.utilityText || data.combatText;
    const detail =
        data.keywords.indexOf('weapon') >= 0
            ? '从下一回合开始生成。'
            : data.combatText.indexOf('恢复') >= 0 && data.combatText.indexOf('，') >= 0
              ? data.combatText.split('，').slice(1).join('，')
              : data.afterUse;
    return displayModel({
        id: data.id,
        title: data.name,
        tag:
            data.type +
            (data.combatEligibility === 'yes'
                ? ''
                : data.combatEligibility === 'no'
                  ? ' · 非战斗'
                  : ' · 可配置'),
        cost: data.staminaCost,
        costUnit: '体力',
        showCost: data.combatEligibility !== 'no',
        effect: primary,
        description: detail,
        fullDescription: [
            data.combatText,
            `战斗资格：${eligibility}`,
            data.combatEligibility !== 'no'
                ? `体力消耗：${data.staminaCost === null ? '待配置' : data.staminaCost}`
                : '',
            `使用后：${data.afterUse}`,
            `用途：${data.utilityText}`,
        ]
            .filter(Boolean)
            .join('\n\n'),
        weight: data.type === '战斗临时牌' ? '本场临时' : '',
        art: data.art,
        accent: '#aa9278',
        temporary: data.type === '战斗临时牌',
        keywords: data.keywords,
    });
}
