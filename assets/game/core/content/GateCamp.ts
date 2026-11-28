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

const KEEPER_OFFERS = [
    { kind: 'lab_damper', price: 2 },
    { kind: 'fist_left_hook', price: 3 },
];

export function keeperOffers(discoveryPool: readonly string[] = []) {
    return KEEPER_OFFERS.filter(offer => discoveryPool.indexOf(offer.kind) >= 0);
}
