import { CardDefinition, CardKind, Catalog, getCatalog } from './CardCatalog';
export interface CardSet {
    readonly catalog: Catalog;
    readonly cards: Readonly<Record<CardKind, CardDefinition>>;
    readonly rewardPool: readonly CardKind[];
    readonly initialDeck: readonly CardKind[];
}
export function createCardSet(raw: Catalog = getCatalog()): CardSet {
    const catalog: Catalog = JSON.parse(JSON.stringify(raw));
    const cards: Record<CardKind, CardDefinition> = Object.create(null),
        rewardPool: CardKind[] = [],
        initialDeck: CardKind[] = [];
    for (const card of catalog.cards) {
        Object.freeze(card.effect);
        Object.freeze(card);
        cards[card.id] = card;
        if (card.reward) rewardPool.push(card.id);
        for (let n = 0; n < card.initialCount; n++) initialDeck.push(card.id);
    }
    Object.freeze(catalog.cards);
    Object.freeze(catalog);
    return Object.freeze({
        catalog,
        cards: Object.freeze(cards),
        rewardPool: Object.freeze(rewardPool),
        initialDeck: Object.freeze(initialDeck),
    });
}
