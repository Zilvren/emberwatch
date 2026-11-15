import type { GameReadModel } from '../../core/GameReadModel';
import type { OwnedCard } from '../../core/SurvivalGame';
import { effectSummary } from '../../core/content/CardCatalog';

export type BagFilter = 'all' | 'deck' | 'overflow';
export type BagSort = 'original' | 'name' | 'cost' | 'weight';
export function visibleInventory(
    game: GameReadModel,
    filter: BagFilter,
    sort: BagSort
): Readonly<OwnedCard>[] {
    const cards = game.cards.filter(
        (card) =>
            filter === 'all' ||
            (filter === 'overflow'
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
    const status =
        card.zone === 'overflow'
            ? '暂存 · 不可战斗'
            : card.kind === 'cash'
              ? '旧物 · 不进入抽牌'
              : card.selected
                ? '已编入出战'
                : '携带 · 未编入';
    const canToggle = game.phase === 'rest' && card.zone === 'base' && card.kind !== 'cash';
    const canDiscard =
        (game.phase === 'rest' || game.phase === 'rewards') &&
        card.kind !== 'attack' &&
        card.kind !== 'dodge' &&
        (card.kind !== 'cash' || game.phase === 'rest');
    return {
        name: definition.name,
        status,
        effect: effectSummary(definition, game.content.cards),
        weight: definition.weight,
        canToggle,
        toggleLabel: card.selected ? '移出出战牌组' : '加入出战牌组',
        toggleHint:
            game.phase !== 'rest'
                ? '营地内可以整理出战牌'
                : card.zone !== 'base'
                  ? '暂存中的卡牌不能编入'
                  : card.kind === 'cash'
                    ? '此物品不参与战斗'
                    : '编组不会释放携带空间',
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
