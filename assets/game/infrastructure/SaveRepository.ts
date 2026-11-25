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

/** Platform adapter. Storage writes are atomic per key; the previous valid save is retained. */
export class SaveRepository implements RunPersistence {
    readonly content = createCardSet();
    private readonly legacyCards = this.content.catalog.cards.filter((card) => !card.chapter);
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
        ? [this.fieldHash(), this.fieldHash(this.originalFieldCards)]
        : [];
    private readonly previousRunDeckHash = this.runDeckHash(this.previousCards, this.previousRecipes);
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
    private runDeckHash(cards = this.legacyCards, recipes = this.content.catalog.recipes): string {
        const { version, fixedReward } = this.content.catalog;
        return hash(JSON.stringify({ version, fixedReward, cards, recipes }));
    }
    private catalogHash(scenario: GameScenario): string {
        if (scenario.runDeck) return this.runDeckHash();
        if (!scenario.labyrinth) return this.fieldHash();
        // The save already carries the active discovery pool and the candidates on screen.
        const { version, labyrinth, cards } = this.content.catalog;
        return hash(JSON.stringify({
            version,
            starter: labyrinth?.starter,
            cards: cards.filter((card) => card.chapter === 'ashen-labyrinth'),
        }));
    }
    private blocked = false;
    status = '自动保存';
    warning = '';
    constructor(
        private readonly storage: SaveStorage,
        readonly key = 'the-end.run.v1'
    ) {}
    private matchesCatalog(catalogHash: string, scenario: GameScenario): boolean {
        if (catalogHash === this.catalogHash(scenario)) return true;
        if (scenario.labyrinth) return false;
        if (scenario.runDeck)
            return scenario.version === RUN_DECK_SCENARIO.version &&
                (catalogHash === this.previousRunDeckHash || catalogHash === this.upstreamHash);
        if (this.priorTideHashes.indexOf(catalogHash) >= 0) return true;
        return !scenario.fieldDeck &&
            (catalogHash === this.upstreamHash || this.preFieldHashes.indexOf(catalogHash) >= 0);
    }
    private decode(text: string): GameState {
        const envelope = JSON.parse(text);
        if (envelope?.format !== 'the-end-save') throw new Error('存档格式无效。');
        if (envelope.version !== 1 && envelope.version !== 2 && envelope.version !== 3)
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
        if (!this.matchesCatalog(body.catalogHash, scenario))
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
                version: 3,
                savedAt: new Date().toISOString(),
                catalogHash: this.catalogHash(getScenario(state.scenarioId, state.scenarioVersion)),
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
