import type { GameReadModel } from '../../core/GameReadModel';

/** Display projections only. Shelter commands still execute through GameSession. */
export function shelterSummary(game: GameReadModel) {
    const settlement = game.settlement;
    if (!settlement) throw new Error('Shelter summary requires a return settlement.');
    const needsRepair = game.armor < 10;
    const canRepair = needsRepair && game.supplies >= settlement.repairCost;
    const repairRisk = canRepair && game.supplies - settlement.repairCost < 1;
    const dailyShortfall = game.supplies < 1;
    const remaining = Math.max(0, game.supplies - 1);
    const lost = settlement.lostOverflow;
    if (game.scenario.runDeck) {
        const stored = Object.keys(game.storedSupplies ?? {}).filter(
            (kind) => (game.storedSupplies?.[kind] ?? 0) > 0
        );
        const storedCards = stored.reduce(
            (total, kind) => total + (game.storedSupplies?.[kind] ?? 0),
            0
        );
        const exchangeValue = stored.reduce(
            (total, kind) =>
                total +
                (game.storedSupplies?.[kind] ?? 0) * (game.content.cards[kind].supplyValue ?? 1),
            0
        );
        return {
            values: {
                'shelter/returned': `${settlement.returnedCards} 张物资卡已入库 · 本局带回 ${settlement.returnedSupplies} 物资点`,
                'shelter/losses': lost.length
                    ? `暂存损失 ${lost.length} 件：${lost.slice(0, 3).join('、')}${lost.length > 3 ? '等' : ''}`
                    : '本局战斗卡组已清空 · 暂存无损失',
                'shelter/armor': '本局结束后清空，下局重新开始',
                'shelter/repair-title': '物资卡兑换',
                'shelter/repair-hint': storedCards
                    ? `仓库 ${storedCards} 张物资卡 · 可兑换 ${exchangeValue} 点物资`
                    : '仓库暂无可兑换的物资卡。',
                'shelter/daily-title': '下一局探索',
                'shelter/daily-summary': `当前物资点 ${game.supplies}`,
                'shelter/daily-hint': '避难所不修复护甲，也不扣每日消耗。兑换后即可开始下一局。',
            },
            repairVisible: storedCards > 0,
            repairEnabled: storedCards > 0,
            repairCaption: `兑换全部物资卡 · +${exchangeValue} 物资`,
            repairRisk: false,
            dailyShortfall: false,
            remaining: game.supplies,
            doneCaption: '开始下一局',
        };
    }
    return {
        values: {
            'shelter/returned': `${settlement.returnedSupplies} 物资  ·  ${settlement.returnedCards} 张${game.scenario.runDeck ? '物资卡' : '卡牌'}`,
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
