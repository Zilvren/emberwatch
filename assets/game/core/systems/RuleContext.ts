import { ActionResult } from '../RulesTypes';
import { GameState } from '../state/GameState';
export type FeedbackState = Pick<GameState, 'revision' | 'logs'>;
export type InventoryState = Pick<GameState, 'battle' | 'cards' | 'phase' | 'supplies'>;
export type CombatState = Pick<
    GameState,
    'armor' | 'battle' | 'critical' | 'entryTier' | 'phase' | 'rewards' | 'supplies'
>;
export type RewardState = Pick<
    GameState,
    'cards' | 'fixedDone' | 'pathIndex' | 'phase' | 'rewards' | 'supplies' | 'visited'
>;
export type ExplorationState = Pick<
    GameState,
    | 'armor'
    | 'critical'
    | 'entryTier'
    | 'fixedDone'
    | 'pathIndex'
    | 'phase'
    | 'returnElapsed'
    | 'rewards'
    | 'route'
    | 'supplies'
    | 'visited'
>;
export type SettlementState = Pick<
    GameState,
    | 'armor'
    | 'battle'
    | 'cards'
    | 'critical'
    | 'day'
    | 'phase'
    | 'revision'
    | 'settlement'
    | 'supplies'
>;
export class RuleFeedback {
    constructor(private readonly state: FeedbackState) {}
    result(ok: boolean, message: string, warning = false): ActionResult {
        if (ok) this.state.revision++;
        return { ok, message, warning };
    }
    log(message: string): void {
        this.state.logs.unshift(message);
        this.state.logs = this.state.logs.slice(0, 36);
    }
}
