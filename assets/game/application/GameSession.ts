import type { GameReadModel } from '../core/GameReadModel';
import { ActionResult, SurvivalGame } from '../core/SurvivalGame';
import {
    Route,
    GameScenario,
    ASHEN_LABYRINTH_SCENARIO,
    FIELD_SCENARIO,
    RUN_DECK_SCENARIO,
} from '../core/content/GameScenario';
import { getCatalog } from '../core/content/CardCatalog';
import { EntryTierId } from '../core/content/EntryTiers';
import type { RunPersistence } from './RunPersistence';
export type GameCommand =
    | {
          type:
              | 'enter-node'
              | 'end-turn'
              | 'claim-supplies'
              | 'finish-rewards'
              | 'finish-rest'
              | 'continue-journal'
              | 'retry'
              | 'redeem-supplies'
              | 'open-recipes'
              | 'close-recipes'
              | 'undo-synthesis'
              | 'new-game';
      }
    | { type: 'start'; tier?: EntryTierId }
    | { type: 'choose-route'; route: Route }
    | { type: 'play-card' | 'discard-card' | 'toggle-card'; id: string }
    | { type: 'claim-card'; index: number }
    | { type: 'discover'; kind: string | null }
    | { type: 'resolve-combat-choice'; id: string | null }
    | { type: 'discard-supplies'; amount: number }
    | { type: 'repair' | 'heal-at-shelter' }
    | { type: 'synthesize'; recipeId: string };

/** Application flow: commands -> pure rules -> persistence. No engine or UI dependencies. */
export class GameSession {
    readonly game: SurvivalGame;
    readonly restored: boolean;
    readonly startupMessage: string;
    private recipesOpen = false;
    get view(): GameReadModel {
        return this.game;
    }
    get newGameRuleset(): GameScenario['ruleset'] {
        return this.defaultScenario.ruleset;
    }
    get fieldUpdateAvailable(): boolean {
        return !!this.defaultScenario.fieldDeck &&
            (this.game.scenario.id !== this.defaultScenario.id || !this.game.scenario.fieldDeck);
    }
    get newGameDestination(): string {
        return this.defaultScenario.title;
    }
    constructor(
        seed?: number,
        private readonly saves?: RunPersistence,
        private readonly defaultScenario: GameScenario = getCatalog().labyrinth
            ? ASHEN_LABYRINTH_SCENARIO
            : getCatalog().expedition ? FIELD_SCENARIO : RUN_DECK_SCENARIO,
        private readonly mapSynthesisUnlocked = false
    ) {
        const loaded = saves?.load();
        this.game = loaded?.state
            ? SurvivalGame.fromState(loaded.state, saves?.content)
            : new SurvivalGame(seed, this.defaultScenario, saves?.content);
        this.restored = !!loaded?.state;
        if (loaded?.state && this.game.revision !== loaded.state.revision)
            saves?.save(this.game.exportState());
        this.startupMessage =
            loaded?.warning ||
            (this.restored
                ? this.game.scenario.ruleset === 'tutorial-v1' &&
                  this.defaultScenario.ruleset === 'stamina-v1'
                    ? '已恢复旧规则探索，进度已保留。重开新探索后启用体力系统。'
                    : this.fieldUpdateAvailable
                      ? `已继续旧版探索。重开可进入${this.newGameDestination}。`
                      : '已继续上次的探索进度。'
                : '');
    }
    get saveStatus(): string {
        return this.saves?.status ?? '调试模式 · 不存档';
    }
    get saveWarning(): string {
        return this.saves?.warning ?? '';
    }
    get synthesisBlocked(): string {
        return this.game.synthesis.blocked(this.mapSynthesisUnlocked);
    }
    get canUndoSynthesis(): boolean {
        return this.recipesOpen && !this.synthesisBlocked && this.game.synthesis.canUndo;
    }
    execute(command: GameCommand): ActionResult {
        const g = this.game,
            revision = g.revision;
        if (command.type === 'open-recipes') {
            if (['rest', 'map', 'battle'].indexOf(g.phase) < 0)
                return { ok: false, message: '当前无法打开配方表。' };
            this.recipesOpen = true;
            return { ok: true, message: '' };
        }
        if (command.type === 'close-recipes') {
            this.recipesOpen = false;
            g.synthesis.close();
            return { ok: true, message: '' };
        }
        const synthesis = command.type === 'synthesize' || command.type === 'undo-synthesis';
        if (synthesis !== this.recipesOpen)
            return { ok: false, message: synthesis ? '请先打开配方表。' : '请先关闭配方表。' };
        let result: ActionResult;
        switch (command.type) {
            case 'synthesize':
                result = g.synthesis.craft(command.recipeId, this.mapSynthesisUnlocked);
                break;
            case 'undo-synthesis':
                result = g.synthesis.undo(this.mapSynthesisUnlocked);
                break;
            case 'start':
                result = g.start(command.tier);
                break;
            case 'choose-route':
                result = g.chooseRoute(command.route);
                break;
            case 'enter-node':
                result = g.enterNode();
                break;
            case 'play-card':
                result = g.play(command.id);
                break;
            case 'end-turn':
                result = g.endTurn();
                break;
            case 'claim-supplies':
                result = g.claimSupplies();
                break;
            case 'claim-card':
                result = g.claimCard(command.index);
                break;
            case 'discover':
                result = g.discover(command.kind);
                break;
            case 'resolve-combat-choice':
                result = g.resolveCombatChoice(command.id);
                break;
            case 'finish-rewards':
                result = g.finishRewards();
                break;
            case 'discard-card':
                result = g.discardCard(command.id);
                break;
            case 'discard-supplies':
                result = g.discardSupplies(command.amount);
                break;
            case 'toggle-card':
                result = g.toggleCard(command.id);
                break;
            case 'finish-rest':
                result = g.finishRest();
                break;
            case 'repair':
            case 'heal-at-shelter':
                result = g.healAtShelter();
                break;
            case 'continue-journal':
                result = g.continueJournal();
                break;
            case 'retry':
                result = g.retry();
                break;
            case 'redeem-supplies':
                result = g.redeemAllSupplies();
                break;
            case 'new-game':
                g.reset(this.defaultScenario);
                this.saves?.allowNewGame();
                result = { ok: true, message: '已开始新的探索。' };
                break;
            default:
                return { ok: false, message: '无法识别的游戏命令。' };
        }
        if (g.revision !== revision) this.saves?.save(g.exportState());
        return result;
    }
    advanceTime(seconds: number): void {
        if (this.recipesOpen) return;
        const revision = this.game.revision;
        this.game.advanceTime(seconds);
        if (revision !== this.game.revision) this.saves?.save(this.game.exportState());
    }
}
