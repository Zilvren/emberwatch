import { CardDefinition, CardKind, Catalog, getCatalog } from './CardCatalog';
export interface CardSet {
    readonly catalog: Catalog;
    readonly cards: Readonly<Record<CardKind, CardDefinition>>;
    readonly rewardPool: readonly CardKind[];
    readonly supplyPool: readonly CardKind[];
    readonly initialDeck: readonly CardKind[];
}
export function createCardSet(raw: Catalog = getCatalog()): CardSet {
    const catalog: Catalog = JSON.parse(JSON.stringify(raw));
    const cards: Record<CardKind, CardDefinition> = Object.create(null),
        rewardPool: CardKind[] = [],
        supplyPool: CardKind[] = [],
        initialDeck: CardKind[] = [];
    for (const card of catalog.cards) {
        Object.freeze(card.effect);
        Object.freeze(card);
        cards[card.id] = card;
        if (card.reward) (card.role === 'supply' ? supplyPool : rewardPool).push(card.id);
        for (let n = 0; n < card.initialCount; n++) initialDeck.push(card.id);
    }
    Object.freeze(catalog.cards);
    for (const recipe of catalog.recipes ?? []) {
        for (const row of [...recipe.materials, ...recipe.products]) Object.freeze(row);
        Object.freeze(recipe.materials);
        Object.freeze(recipe.products);
        Object.freeze(recipe);
    }
    Object.freeze(catalog.recipes);
    Object.freeze(catalog);
    return Object.freeze({
        catalog,
        cards: Object.freeze(cards),
        rewardPool: Object.freeze(rewardPool),
        supplyPool: Object.freeze(supplyPool),
        initialDeck: Object.freeze(initialDeck),
    });
}
