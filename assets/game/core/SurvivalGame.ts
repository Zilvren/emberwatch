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
import { GameScenario, TUTORIAL_SCENARIO, getScenario } from './content/GameScenario';
import { GameState, validateGameState } from './state/GameState';
import { EntryTierId } from './content/EntryTiers';
import { CombatRules } from './systems/CombatRules';
import { ExplorationRules } from './systems/ExplorationRules';
import { InventoryRules } from './systems/InventoryRules';
import { RewardRules } from './systems/RewardRules';
import { RuleFeedback } from './systems/RuleContext';
import { SettlementRules } from './systems/SettlementRules';
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
    private readonly settlementRules: SettlementRules;
    readonly synthesis: SynthesisRules;
    phase: Phase = 'journal';
    day = 1;
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
        public readonly content: CardSet = createCardSet()
    ) {
        this.scenario = JSON.parse(JSON.stringify(scenario));
        this.random = new Random(seed);
        this.feedback = new RuleFeedback(this);
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
            this.scenario
        );
        this.settlementRules = new SettlementRules(
            this,
            this.feedback,
            this.content,
            this.scenario,
            () => this.reset(this.scenario, true)
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
            this.settlementRules,
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
                scenarioId: this.scenario.id,
                scenarioVersion: this.scenario.version,
                seed: this.seed,
                randomState: this.random.state,
                nextId: this.nextId,
                phase: this.phase,
                day: this.day,
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
        const state = validateGameState(raw, content.cards);
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
    reset(scenario?: GameScenario, preserveSupplies = false): void {
        if (scenario) Object.assign(this.scenario, JSON.parse(JSON.stringify(scenario)));
        this.phase = 'journal';
        this.day = this.scenario.initialDay;
        if (!preserveSupplies) this.supplies = this.scenario.initialSupplies;
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
        this.cards = this.content.initialDeck
            .filter((kind) => !this.scenario.runDeck || isBattleCard(this.content.cards[kind]))
            .map((kind) => this.inventoryRules.owned(kind));
        this.feedback.log(`第 1 天 · 护甲 10，物资 10，背负 ${this.baseWeight} / 30。`);
        this.revision++;
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
        return this.explorationRules.start(tier);
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
    repairAtShelter(confirmed = false): ActionResult {
        return this.settlementRules.repairAtShelter(confirmed);
    }
    finishDay(): ActionResult {
        return this.settlementRules.finishDay();
    }
    redeemAllSupplies(): ActionResult {
        return this.settlementRules.redeemAllSupplies();
    }
    private fail(reason: string): void {
        this.reset();
        this.phase = 'failure';
        this.failureReason = reason;
        if (this.scenario.runDeck) this.cards = [];
        this.feedback.log(
            this.scenario.runDeck
                ? '探索失败，本局卡组和行囊已清空。'
                : '教学失败：探索内容已重置，不扣每日物资。'
        );
    }
}
