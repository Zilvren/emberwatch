import type { GameReadModel } from '../../core/GameReadModel';

/** Display projections only. Repair and daily payment still execute through GameSession. */
export function shelterSummary(game: GameReadModel) {
    const settlement = game.settlement;
    if (!settlement) throw new Error('Shelter summary requires a return settlement.');
    const needsRepair = game.armor < 10;
    const canRepair = needsRepair && game.supplies >= settlement.repairCost;
    const repairRisk = canRepair && game.supplies - settlement.repairCost < 1;
    const dailyShortfall = game.supplies < 1;
    const remaining = Math.max(0, game.supplies - 1);
    const lost = settlement.lostOverflow;
    return {
        values: {
            'shelter/returned': `${settlement.returnedSupplies} 物资  ·  ${settlement.returnedCards} 张卡牌`,
            'shelter/losses': lost.length
                ? `暂存损失 ${lost.length} 件：${lost.slice(0, 3).join('、')}${lost.length > 3 ? '等' : ''}`
                : '携带物品已清点 · 暂存无损失',
            'shelter/armor': `${game.armor} / 10`,
            'shelter/repair-hint': settlement.repaired
                ? `已花费 ${settlement.repairSpent} 物资，护甲恢复完整。`
                : !needsRepair
                  ? '护甲完整，无需修复。'
                  : !canRepair
                    ? `缺少 ${settlement.repairCost - game.supplies} 物资才能修复护甲。`
                    : repairRisk
                      ? '修复后不足以支付每日消耗，仍可选择修复。'
                      : '修复可选；也可以直接结束今天。',
            'shelter/daily-summary': dailyShortfall
                ? '需求 1  ·  当前缺口 1'
                : `消耗 1  ·  预计结余 ${remaining}`,
            'shelter/daily-hint': '每日消耗尚未支付，结束今天时结算。',
        },
        repairVisible: needsRepair,
        repairEnabled: canRepair,
        repairCaption: `修复护甲 · ${settlement.repairCost} 物资`,
        repairRisk,
        dailyShortfall,
        remaining,
        doneCaption: dailyShortfall ? '记录缺口 · 结束今天' : '支付 1 物资 · 结束今天',
    };
}
