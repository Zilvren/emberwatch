import type { GameReadModel } from '../GameReadModel';

export function atGateCamp(game: Pick<GameReadModel, 'scenario' | 'phase' | 'currentJournal' | 'pendingJournalCount'>): boolean {
    return !!game.scenario.labyrinth && (game.phase === 'shelter' ||
        (game.phase === 'journal' && game.currentJournal?.id === 'departure' && game.pendingJournalCount === 1));
}

export interface CampSkill {
    id: string;
    name: string;
    cost: number;
    requires?: string;
    effect: string;
    openingBlock?: number;
    openingDraw?: number;
}

export const CAMP_SKILLS: readonly CampSkill[] = [
    { id: 'footing', name: '扎稳脚步', cost: 2, effect: '每场战斗开始时获得 1 点格挡。', openingBlock: 1 },
    { id: 'guard', name: '固守', cost: 6, requires: 'footing', effect: '每场战斗开始时额外获得 2 点格挡，与「扎稳脚步」叠加。', openingBlock: 2 },
    { id: 'initiative', name: '先机', cost: 8, requires: 'footing', effect: '每场战斗的起手多抽 1 张牌。', openingDraw: 1 },
];

export function trainingBlocked(skill: CampSkill, learned: readonly string[], supplies: number): string {
    if (learned.indexOf(skill.id) >= 0) return '已学会';
    if (skill.requires && learned.indexOf(skill.requires) < 0)
        return `先学「${CAMP_SKILLS.find(node => node.id === skill.requires)!.name}」`;
    return supplies < skill.cost ? `还差 ${skill.cost - supplies} 物资` : '';
}

export const CAMP_RELICS = [
    { id: 'survey_map', name: '勘测底图', price: 6, effect: '提前辨认下一步的未知地点，看清那里能找到哪类物资或牌。' },
    { id: 'salvage_magnet', name: '拾荒磁石', price: 10, effect: '每次搜刮地点，额外获得 1 物资点。' },
    { id: 'keeper_watch', name: '止动怀表', price: 16, effect: '每场战斗的首回合，打出的第一张技能牌消耗 0 体力。' },
] as const;
export type CampRelic = typeof CAMP_RELICS[number];
export type CampRelicId = CampRelic['id'];

export function ownsRelic(holder: { readonly permanentRelics?: readonly CampRelicId[] }, id: CampRelicId): boolean {
    return holder.permanentRelics?.some(owned => owned === id) ?? false;
}

export function relicPurchaseBlocked(relic: CampRelic, owned: readonly CampRelicId[], points: number): string {
    if (owned.indexOf(relic.id) >= 0) return '已持有';
    return points < relic.price ? `还差 ${relic.price - points} 物资点` : '';
}
