import type { GameReadModel } from '../../core/GameReadModel';
import { ENTRY_TIER_IDS, ENTRY_TIERS } from '../../core/content/EntryTiers';
import { shelterSummary } from './ShelterSummaryModel';

export type CampStation = 'camp-keeper' | 'camp-warehouse' | 'camp-bench' | 'camp-fire';

export function isCampStation(id: string | null): id is CampStation {
    return id === 'camp-keeper' || id === 'camp-warehouse' || id === 'camp-bench' || id === 'camp-fire';
}

export function atGateCamp(game: GameReadModel): boolean {
    return !!game.scenario.labyrinth && (game.phase === 'shelter' ||
        (game.phase === 'journal' && game.currentJournal?.id === 'departure' && game.pendingJournalCount === 1));
}

interface CampAction {
    id: string;
    caption: string;
    enabled?: boolean;
}
export interface CampDetail {
    context: string;
    title: string;
    body: string;
    primary?: CampAction;
    secondary?: CampAction;
}

export function campDetail(game: GameReadModel, station: CampStation, page: number): CampDetail {
    switch (station) {
        case 'camp-keeper':
            return {
                context: '迷宫入口',
                title: '守门人',
                body: game.settlement
                    ? '“回来的人总会再走一趟。你想好了，就到灯前来。”'
                    : '“从火堆往上走，就是门。进去之前，先想好这一趟要带多少补给。”',
                primary: { id: 'camp-depart', caption: '选择入场补给' },
            };
        case 'camp-warehouse': {
            const affordable = ENTRY_TIER_IDS.map(id => ENTRY_TIERS[id])
                .filter(tier => tier.cost <= game.supplies)
                .map(tier => `${tier.name} ${tier.cost}`).join('　');
            const ledger = game.settlement
                ? `上次返营结存 ${game.settlement.returnedSupplies} 份，已用于治疗 ${game.settlement.treatmentSpent} 份。`
                : '确认进门时，守门人会从仓库支取所选的补给。';
            return {
                context: '仓库',
                title: `库存物资　${game.supplies} 份`,
                body: ledger + '\n当前可备的补给（份）　' + affordable,
                primary: { id: 'camp-find-keeper', caption: '找守门人备货' },
            };
        }
        case 'camp-bench': {
            const summary = shelterSummary(game);
            return {
                context: '整备台',
                title: `血量　${game.health} / 10`,
                body: summary.values['shelter/repair-hint'],
                primary: { id: 'camp-deck', caption: `翻看牌册 · ${game.cards.length} 张` },
                secondary: game.phase === 'shelter' && summary.repairVisible
                    ? { id: 'camp-repair', caption: summary.repairCaption, enabled: summary.repairEnabled }
                    : undefined,
            };
        }
        case 'camp-fire': {
            const total = game.journalEntries.length;
            const index = Math.max(0, Math.min(page, total - 1));
            const entry = game.journalAt(index);
            return {
                context: entry ? `营火手记 · 第 ${entry.day} 天${total > 1 ? `　${index + 1} / ${total}` : ''}` : '营火手记',
                title: entry?.title ?? '篝火',
                body: entry?.body.replace(/\n{2,}/g, '\n') ?? '手记还没有新的记录。',
                primary: index > 0 ? { id: 'camp-prev', caption: '上一篇' } : undefined,
                secondary: index + 1 < total ? { id: 'camp-next', caption: '下一篇' } : undefined,
            };
        }
    }
}
