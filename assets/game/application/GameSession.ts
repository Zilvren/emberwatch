import type { GameReadModel } from '../core/GameReadModel';
import { ActionResult, SurvivalGame } from '../core/SurvivalGame';
import { Route } from '../core/content/GameScenario';
import { SaveRepository } from '../infrastructure/SaveRepository';
export type GameCommand =
    | {
          type:
              | 'start'
              | 'enter-node'
              | 'end-turn'
              | 'claim-supplies'
              | 'finish-rewards'
              | 'finish-rest'
              | 'finish-day'
              | 'new-game';
      }
    | { type: 'choose-route'; route: Route }
    | { type: 'play-card' | 'discard-card' | 'toggle-card'; id: string }
    | { type: 'claim-card'; index: number }
    | { type: 'discard-supplies'; amount: number }
    | { type: 'repair'; confirmed?: boolean };

/** Application flow: commands -> pure rules -> persistence. No engine or UI dependencies. */
export class GameSession {
    readonly game: SurvivalGame;
    readonly restored: boolean;
    readonly startupMessage: string;
    get view(): GameReadModel {
        return this.game;
    }
    constructor(
        seed?: number,
        private readonly saves?: SaveRepository
    ) {
        const loaded = saves?.load();
        this.game = loaded?.state
            ? SurvivalGame.fromState(loaded.state, saves?.content)
            : new SurvivalGame(seed, undefined, saves?.content);
        this.restored = !!loaded?.state;
        this.startupMessage = loaded?.warning || (this.restored ? '已继续上次的探索进度。' : '');
    }
    get saveStatus(): string {
        return this.saves?.status ?? '调试模式 · 不存档';
    }
    get saveWarning(): string {
        return this.saves?.warning ?? '';
    }
    execute(command: GameCommand): ActionResult {
        const g = this.game,
            revision = g.revision;
        let result: ActionResult;
        switch (command.type) {
            case 'start':
                result = g.start();
                break;
            case 'choose-route':
                result =
                    command.route === 'A' || command.route === 'B'
                        ? g.chooseRoute(command.route)
                        : { ok: false, message: '路线不存在。' };
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
                result = g.repairAtShelter(command.confirmed);
                break;
            case 'finish-day':
                result = g.finishDay();
                break;
            case 'new-game':
                g.reset();
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
        const revision = this.game.revision;
        this.game.advanceTime(seconds);
        if (revision !== this.game.revision) this.saves?.save(this.game.exportState());
    }
}
