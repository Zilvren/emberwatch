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
    payload?: string;
}
export interface CampDetail {
    context: string;
    title: string;
    body: string;
    primary?: CampAction;
    secondary?: CampAction;
}

export function campDetail(game: GameReadModel, station: CampStation, page: number, warehouseKind = ''): CampDetail {
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
            const stored = game.storedSupplies ?? {};
            const kinds = Object.keys(stored);
            const index = kinds.indexOf(warehouseKind);
            if (index >= 0) {
                const card = game.content.cards[warehouseKind];
                const value = card.supplyValue ?? 1;
                const next = kinds[index + 1];
                return {
                    context: `仓库 · 物资卡　${index + 1} / ${kinds.length}`,
                    title: `${card.name}　×${stored[warehouseKind]}`,
                    body: `每张可兑换 ${value} 物资点　·　现有 ${game.supplies} 点\n${card.text}`,
                    primary: { id: 'camp-redeem', payload: warehouseKind, caption: `兑换一张 · +${value} 点` },
                    secondary: next ? { id: 'camp-stock-next', caption: '下一种物资卡', payload: next }
                        : { id: 'camp-stock-back', caption: '返回仓库总览' },
                };
            }
            const count = kinds.reduce((sum, kind) => sum + stored[kind], 0);
            const affordable = ENTRY_TIER_IDS.map(id => ENTRY_TIERS[id])
                .filter(tier => tier.cost <= game.supplies)
                .map(tier => `${tier.name} ${tier.cost}`).join('　');
            const settlement = game.settlement;
            const receipt = settlement
                ? `\n上次返营结存 ${settlement.returnedSupplies} 点 · 治疗 ${settlement.treatmentSpent} 点` +
                    (settlement.lostOverflow.length ? ` · 遗失暂存卡 ${settlement.lostOverflow.length} 张` : '')
                : '';
            const keeper = { id: 'camp-find-keeper', caption: '找守门人备货' };
            return {
                context: '仓库',
                title: `库存物资　${game.supplies} 点`,
                body: (count ? `物资卡已存放 ${kinds.length} 种，共 ${count} 张。可继续留存或按张兑换。`
                    : '仓库里还没有物资卡。迷宫里搜到的物资卡，成功带回后会存放在这里。') +
                    receipt + '\n可备补给　' + affordable,
                primary: count ? { id: 'camp-stock', caption: '查看物资卡', payload: kinds[0] } : keeper,
                secondary: count ? keeper : undefined,
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
