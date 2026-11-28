import type { GameReadModel } from '../../core/GameReadModel';

export type BattlePile = 'draw-pile' | 'discard-pile' | 'supply-bag';
export function isCardPile(value: string | null): value is BattlePile {
    return value === 'draw-pile' || value === 'discard-pile' || value === 'supply-bag';
}
export interface PileEntry { kind: string; count: number; temporary: boolean; packedWeight?: number }
export const PILE_PAGE_SIZE = 3;
export function battlePileEntries(game: GameReadModel, pile: BattlePile): PileEntry[] {
    const battle = game.battle;
    if (pile === 'discard-pile') return (battle?.discard ?? []).slice().reverse().map(card => ({
        kind: card.kind, count: 1, temporary: card.temporary,
    }));
    const cards: ReadonlyArray<Omit<PileEntry, 'count'>> = pile === 'supply-bag'
        ? game.cards.filter(card => game.content.cards[card.kind].role === 'supply')
              .map(card => ({ kind: card.kind, temporary: false, packedWeight: card.packedWeight ?? game.content.cards[card.kind].weight }))
        : battle?.draw ?? [];
    const groups = new Map<string, PileEntry>();
    for (const card of cards) {
        const key = card.kind + (card.packedWeight !== undefined ? '/' + card.packedWeight : card.temporary ? '/temporary' : '');
        const existing = groups.get(key);
        if (existing) existing.count++;
        else groups.set(key, {kind: card.kind, count: 1, temporary: card.temporary,
            ...(card.packedWeight !== undefined ? { packedWeight: card.packedWeight } : {})});
    }
    return Array.from(groups.values()).sort((a, b) =>
        game.content.cards[a.kind].name.localeCompare(game.content.cards[b.kind].name, 'zh-CN') ||
        a.kind.localeCompare(b.kind) || (a.packedWeight ?? 0) - (b.packedWeight ?? 0) || Number(a.temporary) - Number(b.temporary));
}
