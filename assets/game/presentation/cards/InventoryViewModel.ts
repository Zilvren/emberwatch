import type { GameReadModel } from '../../core/GameReadModel';
import type { OwnedCard } from '../../core/SurvivalGame';
import { effectSummary } from '../../core/content/CardCatalog';

export type BagFilter = 'all' | 'deck' | 'overflow' | 'found';
export type BagSort = 'original' | 'name' | 'cost';
export function visibleInventory(
    game: GameReadModel,
    filter: BagFilter,
    sort: BagSort
): Readonly<OwnedCard>[] {
    const source = game.scenario.runDeck && filter !== 'deck' ? game.carriedCards : game.cards;
    const cards = source.filter(
        (card) =>
            filter === 'all' ||
            (game.scenario.fieldDeck
                ? filter === 'found'
                    ? card.found
                    : !card.found
                : filter === 'overflow'
                  ? card.zone === 'overflow'
                  : card.zone === 'base' && card.selected && card.kind !== 'cash')
    );
    if (sort !== 'original')
        cards.sort((a, b) => {
            const first = game.content.cards[a.kind],
                second = game.content.cards[b.kind];
            return sort === 'name'
                ? first.name.localeCompare(second.name, 'zh-CN')
                : first[sort] - second[sort];
        });
    return cards;
}
export function inventoryCardView(card: Readonly<OwnedCard>, game: GameReadModel) {
    const definition = game.content.cards[card.kind];
    if (game.scenario.runDeck) {
        const carried = definition.role === 'supply';
        const canDiscard = carried && (game.phase === 'rewards' || game.phase === 'rest');
        return {
            name: definition.name,
            status: carried ? (card.zone === 'overflow' ? '暂存' : '行囊 · 可入库') : '本局战斗牌',
            effect: effectSummary(definition, game.content.cards),
            canToggle: false,
            toggleLabel: '',
            toggleHint: carried
                ? '探索完成后将行囊中的物资卡带回避难所。'
                : '整套本局卡组都会进入战斗。',
            canDiscard,
            discardLabel: canDiscard ? '丢弃物资卡' : '当前仅可查看',
        };
    }
    const field = !!game.scenario.fieldDeck;
    const status = field
        ? card.found
            ? '本次发现'
            : '基础牌组'
        : card.zone === 'overflow'
          ? '暂存 · 不可战斗'
          : card.kind === 'cash'
            ? '旧物 · 不进入抽牌'
            : card.selected
              ? '已编入出战'
              : '携带 · 未编入';
    const canToggle =
        !field && game.phase === 'rest' && card.zone === 'base' && card.kind !== 'cash';
    const canDiscard =
        !field &&
        (game.phase === 'rest' || game.phase === 'rewards') &&
        card.kind !== 'attack' &&
        card.kind !== 'dodge' &&
        (card.kind !== 'cash' || game.phase === 'rest');
    return {
        name: definition.name,
        status,
        effect: effectSummary(definition, game.content.cards),
        canToggle,
        toggleLabel: card.selected ? '移出出战牌组' : '加入出战牌组',
        toggleHint:
            game.phase !== 'rest'
                ? '营地内可以整理出战牌'
                : card.zone !== 'base'
                  ? '暂存中的卡牌不能编入'
                  : card.kind === 'cash'
                    ? '此物品不参与战斗'
                    : '可以在营地调整出战牌组。',
        canDiscard,
        discardLabel:
            card.kind === 'attack' || card.kind === 'dodge'
                ? '基础卡牌保留'
                : card.kind === 'cash' && game.phase !== 'rest'
                  ? '仅营地可丢弃'
                  : game.phase !== 'rest' && game.phase !== 'rewards'
                    ? '当前仅可查看'
                    : '永久丢弃',
    };
}
