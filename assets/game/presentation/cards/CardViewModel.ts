import { ART_IDS, CARD, CardDefinition, effectSummary } from '../../core/content/CardCatalog';
import type { CardDesignReference } from './CardDesignReference';

export const CARD_ART_IDS = [...ART_IDS, 'rope', 'battery'];
const keywordLabels: Record<string, string> = {
    basic: '基础牌',
    weapon: '武器',
    consumable: '消耗品',
    supply: '物资卡',
    synthesis: '可作为合成材料',
    'synthesis-needed': '已有搭配 · 缺此材料',
};
const keywordDescriptions: Record<string, string> = {
    basic: '可在初始卡组中获得。',
    weapon: '打出后进入武器槽，并按武器规则生成攻击牌。',
    consumable: '使用并结算效果后永久消失。',
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
    art: string;
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
        displayTitle: input.title.length > 7 ? input.title.slice(0, 6) + '…' : input.title,
        description:
            input.description.length > 24
                ? input.description.slice(0, 23) + '…'
                : input.description,
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

/** Compatibility adapter for the existing teaching catalog and web editor. */
export function cardViewModel(
    data: CardDefinition,
    definitions: Readonly<Record<string, CardDefinition>> = CARD,
    costUnit = '物资',
    options: { runDeck?: boolean; neededForSynthesis?: boolean } = {}
): CardDisplayModel {
    const effect = effectSummary(data, definitions),
        detail = data.text === effect ? '' : data.text;
    const primary =
        data.effect.type === 'equip'
            ? `生成「${definitions[data.effect.generatedCard ?? '']?.name ?? data.effect.generatedCard}」`
            : effect;
    const keywords =
        data.role === 'supply'
            ? ['supply']
            : data.role === 'basic'
              ? ['basic']
              : data.effect.type === 'equip'
                ? ['weapon']
                : [];
    if (data.canSynthesize) {
        keywords.push('synthesis');
        if (options.neededForSynthesis) keywords.push('synthesis-needed');
    }
    return displayModel({
        id: data.id,
        title: data.name,
        tag: data.tag,
        cost: data.cost,
        costUnit,
        showCost: data.role !== 'cash' && data.role !== 'supply',
        effect: primary,
        description: (data.effect.type === 'equip' ? '从下回合起，每回合 1 张。' : '') + detail,
        fullDescription: effect + (detail ? '\n\n' + detail : ''),
        weight:
            data.role === 'temporary'
                ? '本场临时'
                : options.runDeck && data.role !== 'supply'
                  ? '本局卡组'
                  : `负重 ${data.weight}`,
        art: data.art,
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
        .replace(/恢复(\d+)点护甲.*/, '恢复 $1 点护甲');
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
            `探索负重：${data.weight}`,
            `使用后：${data.afterUse}`,
            `用途：${data.utilityText}`,
        ]
            .filter(Boolean)
            .join('\n\n'),
        weight: data.type === '战斗临时牌' ? '本场临时' : `负重 ${data.weight}`,
        art: data.art,
        accent: '#aa9278',
        temporary: data.type === '战斗临时牌',
        keywords: data.keywords,
    });
}
