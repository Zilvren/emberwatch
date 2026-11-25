import { CardDefinition, CardKind, Catalog, getCatalog, playableCard } from './CardCatalog';
export interface CardSet {
    readonly catalog: Catalog;
    readonly cards: Readonly<Record<CardKind, CardDefinition>>;
    readonly rewardPool: readonly CardKind[];
    readonly rewardWeights: Readonly<Record<CardKind, number>>;
    readonly supplyPool: readonly CardKind[];
    readonly initialDeck: readonly CardKind[];
}
/** Old expeditions keep the same authored names. Rules use stable IDs in both settings. */
export function scenarioCardSet(base: CardSet, scenario: { runDeck?: boolean; fieldDeck?: boolean; labyrinth?: true }): CardSet {
    const fieldCards = { ...base.cards };
    const legacyRewards = Object.freeze(base.rewardPool.filter((id) => !base.cards[id].synthesisOnly));
    const faces = base.catalog.expedition?.faces ?? {};
    for (const id of Object.keys(faces))
        fieldCards[id] = Object.freeze(playableCard({ ...base.cards[id], ...faces[id] }));
    Object.freeze(fieldCards);
    return Object.freeze({
        ...base,
        get rewardPool() {
            return scenario.runDeck ? base.rewardPool : legacyRewards;
        },
        get cards() {
            return scenario.fieldDeck && !scenario.labyrinth ? fieldCards : base.cards;
        },
    });
}
export function createCardSet(raw: Catalog = getCatalog()): CardSet {
    const catalog: Catalog = JSON.parse(JSON.stringify(raw));
    const cards: Record<CardKind, CardDefinition> = Object.create(null),
        rewardPool: CardKind[] = [],
        rewardWeights: Record<CardKind, number> = Object.create(null),
        supplyPool: CardKind[] = [],
        initialDeck: CardKind[] = [];
    for (const card of catalog.cards) {
        if (card.effect.labyrinth) Object.freeze(card.effect.labyrinth);
        Object.freeze(card.effect);
        Object.freeze(card);
        cards[card.id] = Object.freeze(playableCard(card));
        rewardWeights[card.id] = card.rewardWeight ?? 1;
        if (card.reward) (card.role === 'supply' ? supplyPool : rewardPool).push(card.id);
        for (let n = 0; n < card.initialCount; n++) initialDeck.push(card.id);
    }
    if (catalog.labyrinth) {
        Object.freeze(catalog.labyrinth.starter);
        for (const deck of catalog.labyrinth.decks) {
            Object.freeze(deck.cards);
            Object.freeze(deck);
        }
        Object.freeze(catalog.labyrinth.decks);
        Object.freeze(catalog.labyrinth.enabledDecks);
        Object.freeze(catalog.labyrinth);
    }
    if (catalog.expedition) {
        Object.freeze(catalog.expedition.starter);
        catalog.expedition.discoveryGroups.forEach((group) => Object.freeze(group));
        Object.freeze(catalog.expedition.discoveryGroups);
        Object.freeze(catalog.expedition);
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
        rewardWeights: Object.freeze(rewardWeights),
        supplyPool: Object.freeze(supplyPool),
        initialDeck: Object.freeze(initialDeck),
    });
}
