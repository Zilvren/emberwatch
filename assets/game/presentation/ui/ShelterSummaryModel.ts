import type { GameReadModel } from '../../core/GameReadModel';
import { mapClearMilestone } from '../../core/content/JournalCatalog';

/** Display projections for the persistent shelter, return loot and optional maintenance. */
export function shelterSummary(game: GameReadModel) {
    const settlement = game.settlement;
    const cost = settlement?.repairCost ?? (game.critical ? 2 : 1);
    const needsRepair = game.armor < 10;
    const canRepair = needsRepair && game.supplies >= cost;
    const lost = settlement?.lostOverflow ?? [];
    const clears = game.milestones[mapClearMilestone(game.scenario.id)] ?? 0;
    const progress = `${game.scenario.title} · ${clears ? `已通关 ${clears} 次` : '尚未通关'}`;
    if (game.scenario.runDeck) {
        const stored = game.storedSupplies ?? {};
        let storedCards = 0;
        let exchangeValue = 0;
        for (const kind of Object.keys(stored)) {
            const definition = game.content.cards[kind];
            if (definition?.role !== 'supply') continue;
            storedCards += stored[kind];
            exchangeValue += stored[kind] * (definition.supplyValue ?? 1);
        }
        return {
            values: {
                'banner/text2': '带回的物资卡已入库，可以兑换后再次出发。',
                'shelter/loot-title': settlement ? '本次带回' : '出发储备',
                'shelter/returned': settlement
                    ? `${settlement.returnedCards} 张物资卡已入库`
                    : `仓库 ${storedCards} 张物资卡`,
                'shelter/losses': lost.length
                    ? `暂存损失 ${lost.length} 件：${lost.slice(0, 3).join('、')}${lost.length > 3 ? '等' : ''}`
                    : '暂存无损失',
                'shelter/armor': `当前物资点 ${game.supplies}`,
                'shelter/repair-title': '物资卡兑换',
                'shelter/repair-hint': storedCards
                    ? `仓库 ${storedCards} 张物资卡 · 可兑换 ${exchangeValue} 点物资`
                    : '仓库暂无可兑换的物资卡。',
                'shelter/progress-title': '探索进度',
                'shelter/progress-summary': progress,
                'shelter/progress-hint': '下次出发使用固定初始卡组和初始护甲。',
            },
            repairVisible: storedCards > 0,
            repairEnabled: storedCards > 0,
            repairCaption: `兑换全部物资卡 · +${exchangeValue} 物资`,
            doneCaption: '开始下一局',
        };
    }
    return {
        values: {
            'banner/text2': '整理带回的物品，按需修复护甲，然后再次出发。',
            'shelter/loot-title': settlement ? '本次带回' : '出发储备',
            'shelter/returned': settlement
                ? `${settlement.returnedSupplies} 物资  ·  ${settlement.returnedCards} 张卡牌`
                : `${game.supplies} 物资  ·  ${game.cards.length} 张卡牌`,
            'shelter/losses': lost.length
                ? `暂存损失 ${lost.length} 件：${lost.slice(0, 3).join('、')}${lost.length > 3 ? '等' : ''}`
                : '携带物品已清点 · 暂存无损失',
            'shelter/armor': `${game.armor} / 10`,
            'shelter/repair-hint': settlement?.repaired
                ? `已花费 ${settlement.repairSpent} 物资，护甲恢复完整。`
                : !needsRepair
                  ? '护甲完整，无需修复。'
                  : !canRepair
                    ? `缺少 ${cost - game.supplies} 物资才能修复护甲。`
                    : '修复可选；也可以保留物资直接出发。',
            'shelter/progress-title': '探索进度',
            'shelter/progress-summary': progress,
            'shelter/progress-hint': '关键事件发生时，会留下新的日志。',
        },
        repairVisible: needsRepair,
        repairEnabled: canRepair,
        repairCaption: `修复护甲 · ${cost} 物资`,
        doneCaption: '整备出发',
    };
}
