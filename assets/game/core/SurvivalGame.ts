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
import { CardKind } from './content/CardCatalog';
import { CardSet, createCardSet, scenarioCardSet } from './content/ContentRegistry';
import {
    GameScenario,
    STAMINA_SCENARIO,
    TUTORIAL_SCENARIO,
    getScenario,
} from './content/GameScenario';
import { GameState, validateGameState } from './state/GameState';
import type { ExpeditionMap } from './content/ExpeditionMap';
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
    readonly schemaVersion = 4 as const;
    phase: Phase = 'journal';
    day = 1;
    milestones: Record<string, number> = {};
    journalEntries: JournalRecord[] = [];
    supplies = 10;
    entryTier: EntryTierId | null = null;
    health = 10;
    get lowHealth(): boolean { return this.health <= 2; }
    cards: OwnedCard[] = [];
    storedSupplies?: Record<CardKind, number>;
    route: Route | null = null;
    expeditionMap: ExpeditionMap | null = null;
    fixedDone = false;
    pathIndex = 0;
    visited: NodeKind[] = [];
    discoveryPool?: string[];
    fistUnlocks?: CardKind[];
    synthesisRewardBoosts: Record<string, number> = {};
    synthesisBoostedRecipes: string[] = [];
    synthesisMaterialBoostedRecipes: string[] = [];
    battle: Battle | null = null;
    rewards: Rewards | null = null;
    settlement: Settlement | null = null;
    failureReason = '';
    revision = 0;
    run = 0;
    returnElapsed = 0;
    private nextId = 0;
    readonly random: Random;
    readonly content: CardSet;
    constructor(
        public readonly seed = Math.floor(Math.random() * 0xffffffff),
        public readonly scenario: GameScenario = TUTORIAL_SCENARIO,
        content: CardSet = createCardSet(),
        journals: JournalCatalog = getJournalCatalog()
    ) {
        this.scenario = JSON.parse(JSON.stringify(scenario));
        this.content = scenarioCardSet(content, this.scenario);
        this.random = new Random(seed);
        this.feedback = new RuleFeedback(this);
        this.journalRules = new JournalRules(
            this,
            this.feedback,
            validateJournalCatalog(journals),
            this.scenario
        );
        const newId = (prefix: string) => prefix + '-' + ++this.nextId,
            fail = (reason: string) => this.fail(reason);
        this.inventoryRules = new InventoryRules(
            this,
            this.feedback,
            this.content,
            newId,
            this.scenario
        );
        this.rewardRules = new RewardRules(
            this,
            this.feedback,
            this.content,
            this.inventoryRules,
            fail,
            this.scenario,
            this.random
        );
        const collectSupplies = (source: string, amount: number, discoveries?: number) =>
            this.rewardRules.collectFieldSupplies(source, amount, discoveries);
        this.combatRules = new CombatRules(
            this,
            this.feedback,
            this.content,
            this.inventoryRules,
            this.random,
            newId,
            fail,
            this.scenario,
            () => this.currentNode,
            (source, amount, count, unlocked) => this.rewardRules.collectBattleRewards(source, amount, count, unlocked)
        );
        this.shelterRules = new ShelterRules(
            this,
            this.feedback,
            this.content,
            this.scenario,
            this.journalRules,
            () => this.inventoryRules.restoreStarter()
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
            fail,
            collectSupplies
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
                schemaVersion: this.schemaVersion,
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
                health: this.health,
                cards: this.cards,
                storedSupplies: this.storedSupplies,
                route: this.route,
                expeditionMap: this.expeditionMap,
                fixedDone: this.fixedDone,
                pathIndex: this.pathIndex,
                visited: this.visited,
                discoveryPool: this.discoveryPool,
                fistUnlocks: this.fistUnlocks,
                synthesisRewardBoosts: this.synthesisRewardBoosts,
                synthesisBoostedRecipes: this.synthesisBoostedRecipes,
                synthesisMaterialBoostedRecipes: this.synthesisMaterialBoostedRecipes,
                battle: this.battle,
                rewards: this.rewards,
                settlement: this.settlement,
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
        if (game.health === 0 && game.phase !== 'failure') {
            if (game.phase === 'journal' || game.phase === 'shelter') {
                // A completed legacy return already advanced the day.
                game.health = 1;
                game.revision++;
            } else game.fail('血量耗尽，本次探索失败。');
        }
        return game;
    }
    reset(scenario?: GameScenario): void {
        if (scenario) {
            delete this.scenario.runDeck;
            delete this.scenario.fieldDeck;
            delete this.scenario.labyrinth;
            delete this.scenario.scavengeFees;
            Object.assign(this.scenario, JSON.parse(JSON.stringify(scenario)));
        }
        this.phase = 'journal';
        this.day = this.scenario.initialDay;
        this.milestones = {};
        this.journalEntries = [];
        this.supplies = this.scenario.initialSupplies;
        this.storedSupplies = undefined;
        this.entryTier = null;
        this.health = this.scenario.initialHealth;
        this.route = null;
        this.expeditionMap = null;
        this.fixedDone = false;
        this.pathIndex = 0;
        this.visited = [];
        this.discoveryPool = undefined;
        this.fistUnlocks = undefined;
        this.synthesisRewardBoosts = {};
        this.synthesisBoostedRecipes = [];
        this.synthesisMaterialBoostedRecipes = [];
        this.battle = null;
        this.rewards = null;
        this.settlement = null;
        this.failureReason = '';
        this.returnElapsed = 0;
        this.run++;
        this.synthesis.close();
        this.inventoryRules.restoreStarter();
        this.journalRules.record('campaign-started');
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
                this.inventoryRules.restoreStarter();
                this.health = this.scenario.initialHealth;
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
    journalAt(index: number) {
        return this.journalRules.at(index);
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
        if (this.health === 0) this.health = this.scenario.initialHealth;
        this.phase = 'shelter';
        return this.feedback.result(true, '已恢复出发补给，可以再次出发。');
    }
    chooseRoute(route: Route): ActionResult {
        return this.explorationRules.chooseRoute(route);
    }
    enterNode(target?: NodeKind): ActionResult {
        return this.explorationRules.enterNode(target);
    }
    cardBlocked(card: CombatCard): string {
        return this.combatRules.cardBlocked(card);
    }
    discover(kind: CardKind | null): ActionResult {
        return this.rewards?.discovery ? this.rewardRules.discover(kind) : this.combatRules.discover(kind);
    }
    switchRoomReward(): ActionResult {
        return this.rewardRules.switchRoomReward();
    }
    resolveCombatChoice(id: string | null): ActionResult {
        return this.combatRules.resolveChoice(id);
    }
    cardCost(kind: CardKind): number {
        return this.combatRules.cardCost(kind);
    }
    attackDamage(kind: CardKind): number {
        return this.combatRules.attackDamage(kind);
    }
    get strength(): number {
        return this.combatRules.strength;
    }
    play(id: string, target?: number): ActionResult {
        return this.combatRules.play(id, target);
    }
    endTurn(slot?: number, turn?: number): ActionResult {
        return this.combatRules.endTurn(slot, turn);
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
    healAtShelter(): ActionResult {
        return this.shelterRules.healAtShelter();
    }
    redeemAllSupplies(): ActionResult {
        return this.shelterRules.redeemSupplies();
    }
    redeemSupply(kind: CardKind): ActionResult {
        if (!kind) return this.feedback.result(false, '请选择要兑换的物资卡。');
        return this.shelterRules.redeemSupplies(kind);
    }
    private fail(reason: string): void {
        const defeated = this.health === 0;
        const day = this.day,
            milestones = this.milestones,
            journalEntries = this.journalEntries,
            storedSupplies = this.storedSupplies;
        this.reset();
        this.day = this.scenario.kind === 'tutorial' ? this.scenario.initialDay : day + 1;
        this.milestones = milestones;
        this.journalEntries = journalEntries;
        this.storedSupplies = storedSupplies;
        this.phase = 'failure';
        if (defeated) this.health = 0;
        this.failureReason = reason;
        if (this.scenario.runDeck) this.cards = [];
    }
}
