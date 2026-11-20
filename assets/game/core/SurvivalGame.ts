import { Random } from './Random';
import {
    ActionResult,
    Battle,
    CombatCard,
    NodeKind,
    OwnedCard,
    Phase,
    Rewards,
    Route,
    Settlement,
} from './RulesTypes';
import { CardKind, isBattleCard } from './content/CardCatalog';
import { CardSet, createCardSet } from './content/ContentRegistry';
import {
    GameScenario,
    STAMINA_SCENARIO,
    TUTORIAL_SCENARIO,
    getScenario,
} from './content/GameScenario';
import { GameState, migrateLegacyGameState, validateGameState } from './state/GameState';
import {
    getJournalCatalog,
    JournalCatalog,
    JournalRecord,
    mapClearMilestone,
    validateJournalCatalog,
} from './content/JournalCatalog';
import { EntryTierId } from './content/EntryTiers';
import { CombatRules } from './systems/CombatRules';
import { ExplorationRules } from './systems/ExplorationRules';
import { InventoryRules } from './systems/InventoryRules';
import { RewardRules } from './systems/RewardRules';
import { RuleFeedback } from './systems/RuleContext';
import { ShelterRules } from './systems/ShelterRules';
import { JournalRules } from './systems/JournalRules';
import { SynthesisRules } from './systems/SynthesisRules';
export { Random } from './Random';
export * from './RulesTypes';
export { CARD, REWARD_POOL } from './content/CardCatalog';
/** Pure state and explicit domain-system delegation. */
export class SurvivalGame {
    private readonly feedback: RuleFeedback;
    private readonly inventoryRules: InventoryRules;
    private readonly combatRules: CombatRules;
    private readonly rewardRules: RewardRules;
    private readonly explorationRules: ExplorationRules;
    private readonly shelterRules: ShelterRules;
    private readonly journalRules: JournalRules;
    readonly synthesis: SynthesisRules;
    readonly schemaVersion = 2 as const;
    phase: Phase = 'journal';
    day = 1;
    milestones: Record<string, number> = {};
    journalEntries: JournalRecord[] = [];
    supplies = 10;
    entryTier: EntryTierId | null = null;
    armor = 10;
    critical = false;
    cards: OwnedCard[] = [];
    storedSupplies?: Record<CardKind, number>;
    route: Route | null = null;
    fixedDone = false;
    pathIndex = 0;
    visited: NodeKind[] = [];
    battle: Battle | null = null;
    rewards: Rewards | null = null;
    settlement: Settlement | null = null;
    logs: string[] = [];
    failureReason = '';
    revision = 0;
    run = 0;
    returnElapsed = 0;
    private nextId = 0;
    readonly random: Random;
    constructor(
        public readonly seed = Math.floor(Math.random() * 0xffffffff),
        public readonly scenario: GameScenario = TUTORIAL_SCENARIO,
        public readonly content: CardSet = createCardSet(),
        journals: JournalCatalog = getJournalCatalog()
    ) {
        this.scenario = JSON.parse(JSON.stringify(scenario));
        this.random = new Random(seed);
        this.feedback = new RuleFeedback(this);
        this.journalRules = new JournalRules(this, this.feedback, validateJournalCatalog(journals));
        const newId = (prefix: string) => prefix + '-' + ++this.nextId,
            fail = (reason: string) => this.fail(reason);
        this.inventoryRules = new InventoryRules(
            this,
            this.feedback,
            this.content,
            newId,
            this.scenario
        );
        this.combatRules = new CombatRules(
            this,
            this.feedback,
            this.content,
            this.inventoryRules,
            this.random,
            newId,
            fail,
            this.scenario,
            () => this.currentNode
        );
        this.shelterRules = new ShelterRules(
            this,
            this.feedback,
            this.content,
            this.scenario,
            this.journalRules
        );
        this.rewardRules = new RewardRules(
            this,
            this.feedback,
            this.content,
            this.inventoryRules,
            fail,
            this.scenario
        );
        this.explorationRules = new ExplorationRules(
            this,
            this.feedback,
            this.content,
            this.inventoryRules,
            this.combatRules,
            this.shelterRules,
            this.random,
            this.scenario,
            fail
        );
        this.synthesis = new SynthesisRules(
            this,
            this.feedback,
            this.content,
            this.scenario,
            (kind) => this.inventoryRules.owned(kind)
        );
        this.reset();
    }
    exportState(): GameState {
        return JSON.parse(
            JSON.stringify({
                schemaVersion: 2,
                scenarioId: this.scenario.id,
                scenarioVersion: this.scenario.version,
                seed: this.seed,
                randomState: this.random.state,
                nextId: this.nextId,
                phase: this.phase,
                day: this.day,
                milestones: this.milestones,
                journalEntries: this.journalEntries,
                supplies: this.supplies,
                entryTier: this.entryTier,
                armor: this.armor,
                critical: this.critical,
                cards: this.cards,
                storedSupplies: this.storedSupplies,
                route: this.route,
                fixedDone: this.fixedDone,
                pathIndex: this.pathIndex,
                visited: this.visited,
                battle: this.battle,
                rewards: this.rewards,
                settlement: this.settlement,
                logs: this.logs,
                failureReason: this.failureReason,
                revision: this.revision,
                run: this.run,
                returnElapsed: this.returnElapsed,
            })
        );
    }
    static fromState(raw: unknown, content: CardSet = createCardSet()): SurvivalGame {
        const state = validateGameState(migrateLegacyGameState(raw), content.cards);
        const game = new SurvivalGame(
            state.seed,
            getScenario(state.scenarioId, state.scenarioVersion),
            content
        );
        const { scenarioId, scenarioVersion, seed, randomState, nextId, ...fields } = state;
        Object.assign(game, fields);
        game.nextId = nextId;
        game.random.state = randomState;
        return game;
    }
    reset(scenario?: GameScenario): void {
        if (scenario) Object.assign(this.scenario, JSON.parse(JSON.stringify(scenario)));
        this.phase = 'journal';
        this.day = this.scenario.initialDay;
        this.milestones = {};
        this.journalEntries = [];
        this.supplies = this.scenario.initialSupplies;
        this.storedSupplies = undefined;
        this.entryTier = null;
        this.armor = this.scenario.initialArmor;
        this.critical = false;
        this.route = null;
        this.fixedDone = false;
        this.pathIndex = 0;
        this.visited = [];
        this.battle = null;
        this.rewards = null;
        this.settlement = null;
        this.failureReason = '';
        this.returnElapsed = 0;
        this.logs = [];
        this.run++;
        this.synthesis.close();
        this.cards = this.createInitialDeck();
        this.feedback.log(
            `第 ${this.day} 天 · 护甲 ${this.armor}，物资 ${this.supplies}，负重 ${this.baseWeight} / 30。`
        );
        this.journalRules.record('campaign-started');
        this.revision++;
    }
    private createInitialDeck(): OwnedCard[] {
        return this.content.initialDeck
            .filter((kind) => !this.scenario.runDeck || isBattleCard(this.content.cards[kind]))
            .map((kind) => this.inventoryRules.owned(kind));
    }
    get baseWeight(): number {
        return this.inventoryRules.baseWeight;
    }
    get overflowWeight(): number {
        return this.inventoryRules.overflowWeight;
    }
    get usableCards(): OwnedCard[] {
        return this.inventoryRules.usableCards;
    }
    get carriedCards(): OwnedCard[] {
        return this.inventoryRules.carriedCards;
    }
    get currentNode(): NodeKind | 'choice' | 'return' {
        return this.explorationRules.currentNode;
    }
    get incomingDamage(): number {
        return this.combatRules.incomingDamage;
    }
    start(tier?: EntryTierId): ActionResult {
        if (
            this.phase === 'journal' &&
            (this.currentJournal?.id !== 'departure' || this.pendingJournalCount !== 1)
        )
            return this.feedback.result(false, '请先阅读关键日志，再返回避难所整备。');
        const prepareFreshRun = this.scenario.runDeck && this.phase === 'shelter';
        const completedRun = this.settlement !== null;
        const result = this.explorationRules.start(tier);
        if (result.ok) {
            if (prepareFreshRun) {
                this.cards = this.createInitialDeck();
                this.armor = this.scenario.initialArmor;
                this.critical = false;
                if (completedRun) this.run++;
            }
            const departure = this.journalEntries.find((entry) => entry.id === 'departure');
            if (departure) departure.read = true;
        }
        return result;
    }
    get currentJournal() {
        return this.journalRules.current;
    }
    get pendingJournalCount(): number {
        return this.journalEntries.filter((entry) => !entry.read).length;
    }
    continueJournal(): ActionResult {
        const result = this.journalRules.continue();
        if (result.ok && this.phase === 'shelter' && this.scenario.runDeck) this.cards = [];
        if (
            result.ok &&
            this.phase === 'shelter' &&
            this.scenario.kind === 'tutorial' &&
            this.milestones[mapClearMilestone(this.scenario.id)]
        )
            Object.assign(this.scenario, JSON.parse(JSON.stringify(STAMINA_SCENARIO)));
        return result;
    }
    retry(): ActionResult {
        if (this.phase !== 'failure') return this.feedback.result(false, '当前没有失败的探索。');
        this.phase = 'shelter';
        return this.feedback.result(true, '已恢复出发补给，可以再次整备出发。');
    }
    chooseRoute(route: Route): ActionResult {
        return this.explorationRules.chooseRoute(route);
    }
    enterNode(): ActionResult {
        return this.explorationRules.enterNode();
    }
    cardBlocked(card: CombatCard): string {
        return this.combatRules.cardBlocked(card);
    }
    play(id: string): ActionResult {
        return this.combatRules.play(id);
    }
    endTurn(): ActionResult {
        return this.combatRules.endTurn();
    }
    claimSupplies(): ActionResult {
        return this.rewardRules.claimSupplies();
    }
    rewardCardBlocked(kind: CardKind): string {
        return this.inventoryRules.rewardCardBlocked(kind);
    }
    rewardZone(kind: CardKind): OwnedCard['zone'] {
        return this.inventoryRules.rewardZone(kind);
    }
    claimCard(index: number): ActionResult {
        return this.rewardRules.claimCard(index);
    }
    finishRewards(): ActionResult {
        return this.rewardRules.finishRewards();
    }
    discardCard(id: string): ActionResult {
        return this.inventoryRules.discardCard(id);
    }
    discardSupplies(amount: number): ActionResult {
        return this.inventoryRules.discardSupplies(amount);
    }
    toggleCard(id: string): ActionResult {
        return this.inventoryRules.toggleCard(id);
    }
    finishRest(): ActionResult {
        return this.explorationRules.finishRest();
    }
    advanceTime(seconds: number): void {
        return this.explorationRules.advanceTime(seconds);
    }
    repairAtShelter(): ActionResult {
        return this.shelterRules.repairAtShelter();
    }
    redeemAllSupplies(): ActionResult {
        return this.shelterRules.redeemAllSupplies();
    }
    private fail(reason: string): void {
        const day = this.day,
            milestones = this.milestones,
            journalEntries = this.journalEntries,
            storedSupplies = this.storedSupplies,
            logs = this.logs;
        this.reset();
        this.day = this.scenario.kind === 'tutorial' ? this.scenario.initialDay : day + 1;
        this.milestones = milestones;
        this.journalEntries = journalEntries;
        this.storedSupplies = storedSupplies;
        this.logs = logs;
        this.phase = 'failure';
        this.failureReason = reason;
        if (this.scenario.runDeck) this.cards = [];
        this.feedback.log(
            this.scenario.kind === 'tutorial'
                ? '教学失败：探索已重置，仍为第 1 天。'
                : this.scenario.runDeck
                  ? `探索失败：时间推进至第 ${this.day} 天，本局卡组和行囊已清空。`
                  : `探索失败：时间推进至第 ${this.day} 天，初始补给、护甲和牌组已恢复。`
        );
    }
}
