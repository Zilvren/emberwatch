import { createCardSet } from '../core/content/ContentRegistry';
import { FIELD_SCENARIO, RUN_DECK_SCENARIO, getScenario, type GameScenario } from '../core/content/GameScenario';
import { GameState, validateGameState } from '../core/state/GameState';
import type { RunPersistence, SaveLoad } from '../application/RunPersistence';
export type { SaveLoad } from '../application/RunPersistence';
export interface SaveStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
function hash(text: string): string {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0).toString(16);
}
class SaveReadError extends Error {
    constructor(
        message: string,
        readonly preserve: boolean
    ) {
        super(message);
    }
}

const tideCards = new Set(['follow_up', 'shield_push', 'scrap_shiv', 'rummage']);
// These existing IDs gained the legacy reward flag alongside the editable
// labyrinth pool. Recreate that one earlier signature with all other fields intact.
const promotedRewardIds = new Set([
    'follow_up', 'shield_push', 'scrap_shiv', 'rummage', 'rough_spear', 'steel_spear',
    'shield_spear', 'shield_spear_charge', 'shield_spear_guard', 'sharpened_knife',
    'honed_knife', 'dragon_slayer',
]);
function beforeRewardMigration<T extends { id: string; reward: boolean }>(cards: T[]): T[] {
    return cards.map(card => card.reward && promotedRewardIds.has(card.id) ? { ...card, reward: false } : card);
}

/** Platform adapter. Storage writes are atomic per key; the previous valid save is retained. */
export class SaveRepository implements RunPersistence {
    readonly content = createCardSet();
    // Face summaries are presentation text. Keep old catalog signatures stable.
    private readonly signedCards = this.content.catalog.cards.map(({ summary, ...card }) => card);
    private readonly runDeckCards = this.signedCards.filter((card) => !card.chapter);
    private readonly legacyCards = this.runDeckCards.filter((card) => !card.fist);
    private readonly previousCards = this.legacyCards.filter((card) => !card.synthesisOnly);
    private readonly previousRecipes = this.content.catalog.recipes.filter((recipe) =>
        [...recipe.materials, ...recipe.products].every(({ card }) => !this.content.cards[card].synthesisOnly)
    );
    private readonly fieldCards = this.previousCards
        .filter((card) => card.role !== 'supply')
        .map(({ canSynthesize, supplyValue, ...card }) => card);
    private readonly originalFieldCards = this.fieldCards.map((card) =>
        card.id === 'attack' && card.text === ''
            ? { ...card, text: '固有能力，永不丢失' }
            : card
    );
    private readonly priorTideHashes = this.content.catalog.expedition
        ? [this.fieldHash(), this.fieldHash(this.originalFieldCards),
            this.fieldHash(beforeRewardMigration(this.fieldCards)), this.fieldHash(beforeRewardMigration(this.originalFieldCards))]
        : [];
    private readonly previousRunDeckHash = this.runDeckHash(this.previousCards, this.previousRecipes);
    private readonly preFistRunDeckHash = this.runDeckHash(this.legacyCards);
    private readonly preRewardMigrationRunDeckHash = this.runDeckHash(beforeRewardMigration(this.runDeckCards));
    private readonly upstreamHash = this.runDeckHash(
        this.previousCards.filter((card) => !tideCards.has(card.id)), this.previousRecipes
    );
    private readonly preFieldHashes = [this.fieldCards, this.originalFieldCards].map((cards) =>
        this.fieldHash(cards.filter((card) => !tideCards.has(card.id)), false)
    );
    private fieldHash(cards = this.fieldCards, includeExpedition = true): string {
        const { version, fixedReward, expedition } = this.content.catalog;
        return hash(JSON.stringify({ version, fixedReward, cards,
            ...(includeExpedition && expedition ? { expedition } : {}) }));
    }
    private runDeckHash(cards = this.runDeckCards, recipes = this.content.catalog.recipes): string {
        const { version, fixedReward } = this.content.catalog;
        return hash(JSON.stringify({ version, fixedReward, cards, recipes }));
    }
    private catalogHash(scenario: GameScenario, state: GameState, chapterOnly = false): string {
        if (scenario.runDeck) return this.runDeckHash();
        if (!scenario.labyrinth) return this.fieldHash();
        // The save already carries the active discovery pool and the candidates on screen.
        const { version, labyrinth } = this.content.catalog;
        const cards = this.signedCards;
        // Unrelated loot, prices and drop rates can be edited while a campaign is saved.
        // Protect the identities in this save and the weights that its bag was packed with.
        const carried = new Map(state.cards.map(card => [card.kind, card.packedWeight ?? this.content.cards[card.kind]?.weight]));
        const referenced = new Set([...carried.keys(), ...Object.keys(state.storedSupplies ?? {}), ...(state.rewards?.cards ?? [])]);
        const supplies = [...referenced].filter(id => this.content.cards[id]?.role === 'supply').sort()
            .map(id => carried.has(id) ? [id, carried.get(id)] : [id]);
        const usesFistCards = [...referenced, ...(state.discoveryPool ?? []), ...(state.fistUnlocks ?? [])]
            .some((kind) => !!this.content.cards[kind]?.fist);
        return hash(JSON.stringify({
            version,
            starter: labyrinth?.starter,
            cards: cards.filter(card => chapterOnly
                ? card.chapter === 'ashen-labyrinth' && card.role !== 'supply'
                : !card.fist && (card.role === 'normal' || card.role === 'temporary')),
            ...(supplies.length ? { supplies } : {}),
            ...(usesFistCards ? { fistCards: cards.filter((card) => !!card.fist) } : {}),
        }));
    }
    private blocked = false;
    status = '自动保存';
    warning = '';
    constructor(
        private readonly storage: SaveStorage,
        readonly key = 'the-end.run.v1'
    ) {}
    private matchesCatalog(catalogHash: string, scenario: GameScenario, state: GameState): boolean {
        if (catalogHash === this.catalogHash(scenario, state)) return true;
        if (scenario.labyrinth) {
            // The prior upstream signature covered chapter cards and the same
            // run-specific supply/fist fields. That format could not carry
            // migrated non-chapter combat cards in its discovery pool.
            const migrated = (kind: string) => {
                const card = this.content.cards[kind];
                return card?.role === 'normal' && !card.chapter && !card.fist;
            };
            return !(state.discoveryPool ?? []).some(migrated) &&
                !state.cards.some(card => migrated(card.kind)) &&
                !(state.rewards?.cards ?? []).some(migrated) &&
                catalogHash === this.catalogHash(scenario, state, true);
        }
        if (scenario.runDeck) {
            if (catalogHash === this.preRewardMigrationRunDeckHash) return true;
            if (catalogHash === this.preFistRunDeckHash && !state.fistUnlocks &&
                !state.cards?.some((card) => this.content.cards[card.kind]?.fist) &&
                !state.rewards?.cards?.some((kind) => this.content.cards[kind]?.fist))
                return true;
            return scenario.version === RUN_DECK_SCENARIO.version &&
                (catalogHash === this.previousRunDeckHash || catalogHash === this.upstreamHash);
        }
        if (this.priorTideHashes.indexOf(catalogHash) >= 0) return true;
        return !scenario.fieldDeck &&
            (catalogHash === this.upstreamHash || this.preFieldHashes.indexOf(catalogHash) >= 0);
    }
    private decode(text: string): GameState {
        const envelope = JSON.parse(text);
        if (envelope?.format !== 'the-end-save') throw new Error('存档格式无效。');
        if ([1, 2, 3, 4].indexOf(envelope.version) < 0)
            throw new SaveReadError('存档版本暂不受支持，原存档已保留。', true);
        const { checksum, ...body } = envelope;
        if (checksum !== hash(JSON.stringify(body))) throw new Error('存档完整性校验失败。');
        let state = body.state;
        // Both former releases used stamina-expedition@2. Only the salt-field
        // catalog signature identifies a save to migrate to its registered ID.
        if (state?.scenarioId === RUN_DECK_SCENARIO.id &&
            state.scenarioVersion === RUN_DECK_SCENARIO.version &&
            this.priorTideHashes.indexOf(body.catalogHash) >= 0) {
            state = { ...state, scenarioId: FIELD_SCENARIO.id };
        }
        let scenario: GameScenario;
        try {
            scenario = getScenario(state?.scenarioId, state?.scenarioVersion);
        } catch {
            throw new SaveReadError('存档的章节版本暂不受支持，原存档已保留。', true);
        }
        if (!this.matchesCatalog(body.catalogHash, scenario, state))
            throw new SaveReadError(
                '卡牌配置已改变，未加载或覆盖原存档。可恢复原配置，或通过“重开”开始新进度。',
                true
            );
        return validateGameState(state, this.content.cards);
    }
    load(): SaveLoad {
        const result: SaveLoad = { state: null, recovered: false, warning: '' };
        try {
            const primary = this.storage.getItem(this.key);
            if (primary !== null) {
                try {
                    result.state = this.decode(primary);
                    this.status = '已恢复进度';
                    return result;
                } catch (error) {
                    if (error instanceof SaveReadError && error.preserve) throw error;
                }
            }
            const backup = this.storage.getItem(this.key + '.backup');
            if (backup !== null) {
                result.state = this.decode(backup);
                result.recovered = true;
                this.status = '已恢复备份';
                result.warning = '主存档不可用，已从备份恢复上一份有效进度。';
                this.warning = result.warning;
                return result;
            }
            if (primary !== null)
                throw new Error('存档损坏且没有可用备份，原数据已保留。可通过“重开”开始新进度。');
        } catch (error) {
            this.blocked = true;
            this.status = '原存档已保留';
            result.warning = String(error instanceof Error ? error.message : error);
            this.warning = result.warning;
        }
        return result;
    }
    allowNewGame(): void {
        this.blocked = false;
        this.warning = '';
    }
    save(state: GameState): void {
        if (this.blocked) return;
        try {
            const body = {
                format: 'the-end-save',
                version: 4,
                savedAt: new Date().toISOString(),
                catalogHash: this.catalogHash(getScenario(state.scenarioId, state.scenarioVersion), state),
                state: validateGameState(state, this.content.cards),
            };
            const encoded = JSON.stringify({ ...body, checksum: hash(JSON.stringify(body)) });
            const previous = this.storage.getItem(this.key);
            if (previous !== null) {
                let valid = false;
                try {
                    this.decode(previous);
                    valid = true;
                } catch {
                    /* Never replace a valid backup with corrupt data. */
                }
                if (valid) this.storage.setItem(this.key + '.backup', previous);
            }
            this.storage.setItem(this.key, encoded);
            this.status = '进度已保存';
            this.warning = '';
        } catch (error) {
            this.status = '保存失败，请勿关闭';
            this.warning = `进度保存失败：${String(error instanceof Error ? error.message : error)}`;
        }
    }
}
