import type { GameReadModel } from '../../core/GameReadModel';
import { ENTRY_TIER_IDS, ENTRY_TIERS } from '../../core/content/EntryTiers';
import { shelterSummary } from './ShelterSummaryModel';
import { effectSummary } from '../../core/content/CardCatalog';
import { keeperOffers } from '../../core/content/GateCamp';
import { MAX_SUPPLY_POINTS } from '../../core/RulesTypes';
import type { UiState } from './UiState';
export { atGateCamp } from '../../core/content/GateCamp';

export type CampStation = 'camp-keeper' | 'camp-warehouse' | 'camp-bench' | 'camp-fire' | 'camp-talk' | 'camp-trade' | 'camp-skills';

export function isCampStation(id: string | null): id is CampStation {
    return id === 'camp-keeper' || id === 'camp-warehouse' || id === 'camp-bench' || id === 'camp-fire' ||
        id === 'camp-talk' || id === 'camp-trade' || id === 'camp-skills';
}

const KEEPER_LINES = [
    { line: '“那道亮缝看见了吗？顺着台阶上去就是迷宫。把带哪档补给想好，再跨门槛。”', next: '问问练功的事' },
    { line: '“左边那盏灯是给练功的人留的。牌能丢，自己学会的本事，门收不走。”', next: '问问仓库的事' },
    { line: '“好东西先带回来，搁右边的箱子。你要是缺物资，我照价收。”', next: '问问迷宫的事' },
];

export function nextKeeperTopic(current: number): number {
    return (current + 1) % KEEPER_LINES.length;
}

export function keeperLots(game: GameReadModel) {
    const buy = keeperOffers(game.content.catalog.labyrinth?.discoveryPool).map(offer => ({ ...offer, key: 'buy-' + offer.kind, buying: true }));
    const sell = Object.keys(game.storedSupplies ?? {}).filter(kind => (game.storedSupplies?.[kind] ?? 0) > 0)
        .map(kind => ({ kind, key: 'sell-' + kind, price: game.content.cards[kind].supplyValue ?? 1, buying: false }));
    return [...buy, ...sell];
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

export function campDetail(game: GameReadModel, station: Exclude<CampStation, 'camp-skills'>, ui: UiState): CampDetail {
    switch (station) {
        case 'camp-keeper':
            return {
                context: '门前的牌摊',
                title: '守门人',
                body: game.settlement
                    ? '“回来的人总会再走一趟。你想好了，就到灯前来。”'
                    : '守门人把灯芯拨亮了一点，给你腾出桌前的位置。',
                primary: { id: 'camp-talk', caption: '坐下交谈' },
                secondary: { id: 'camp-trade', caption: '看看货品' },
            };
        case 'camp-talk': {
            const topic = KEEPER_LINES[ui.campTopic];
            return { context: '炉边交谈', title: '守门人', body: topic.line,
                primary: { id: 'camp-talk-next', caption: topic.next },
                secondary: { id: 'camp-trade', caption: '看看货品' } };
        }
        case 'camp-trade': {
            const context = `守门人的牌摊　·　持有 ${game.supplies} 物资`;
            if (ui.tradeReceipt) return { context, title: '交易完成', body: ui.tradeReceipt,
                primary: { id: 'camp-trade-browse', caption: '继续挑选' } };
            const lots = keeperLots(game);
            const index = Math.max(0, lots.findIndex(lot => lot.key === ui.tradeLot));
            const lot = lots[index];
            if (!lot) return { context, title: '货摊暂空', body: '下次带回仓库的物资卡，可以来这里出售。' };
            const card = game.content.cards[lot.kind];
            const packed = lot.buying && game.cards.some(owned => owned.found && owned.kind === lot.kind);
            const short = lot.buying ? Math.max(0, lot.price - game.supplies) : 0;
            const space = lot.buying || lot.price <= MAX_SUPPLY_POINTS - game.supplies;
            return { context: context + `　·　${index + 1}/${lots.length}`, title: card.name,
                body: lot.buying ? `${effectSummary(card)}　·　出牌 ${card.cost} 体力\n买入后加入本趟牌组，每趟限备一张。` :
                    `仓库中有 ${game.storedSupplies?.[lot.kind]} 张。售出一张可得 ${lot.price} 物资。\n${card.text}`,
                primary: { id: 'camp-exchange', payload: lot.key, enabled: !packed && !short && space,
                    caption: packed ? '已备入牌组' : short ? `还差 ${short} 物资` : !space ? '物资储备空间不足' : `${lot.buying ? '买入' : '卖出'} · ${lot.price} 物资` },
                secondary: lots.length > 1 ? { id: 'camp-trade-next', caption: '下一件货品', payload: lots[(index + 1) % lots.length].key } : undefined };
        }
        case 'camp-warehouse': {
            const warehouseKind = ui.warehouseKind;
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
            const keeper = { id: 'camp-find-keeper', caption: '去守门人货摊' };
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
            const index = Math.max(0, Math.min(ui.campJournalPage, total - 1));
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
