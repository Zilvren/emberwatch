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
            'shelter/progress-summary': `${game.scenario.title} · ${clears ? `已通关 ${clears} 次` : '尚未通关'}`,
            'shelter/progress-hint': '关键事件发生时，会留下新的日志。',
        },
        repairVisible: needsRepair,
        repairEnabled: canRepair,
        repairCaption: `修复护甲 · ${cost} 物资`,
        doneCaption: '整备出发',
    };
}
