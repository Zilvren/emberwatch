import { ActionResult } from '../RulesTypes';
import { GameState } from '../state/GameState';
import type { NodeKind, RouteProgress } from '../content/GameScenario';
export type FeedbackState = Pick<GameState, 'revision' | 'logs'>;
export type InventoryState = Pick<
    GameState,
    'battle' | 'cards' | 'phase' | 'supplies' | 'synthesisRewardBoosts' | 'synthesisMaterialBoostedRecipes'
>;
export type SynthesisState = Pick<
    GameState,
    'cards' | 'phase' | 'revision' | 'synthesisRewardBoosts' | 'synthesisBoostedRecipes' | 'synthesisMaterialBoostedRecipes'
>;
export type CombatState = Pick<
    GameState,
    | 'health'
    | 'battle'
    | 'entryTier'
    | 'phase'
    | 'rewards'
    | 'supplies'
    | 'synthesisRewardBoosts'
>;
type NodeCompletionState = Pick<GameState, 'expeditionMap' | 'fixedDone' | 'pathIndex' | 'phase' | 'visited'>;
export type RewardState = NodeCompletionState & Pick<
    GameState,
    'cards' | 'rewards' | 'supplies' | 'discoveryPool' | 'synthesisRewardBoosts'
>;
export type ExplorationState = NodeCompletionState & Pick<
    GameState,
    | 'day'
    | 'seed'
    | 'health'
    | 'battle'
    | 'entryTier'
    | 'returnElapsed'
    | 'rewards'
    | 'discoveryPool'
    | 'route'
    | 'settlement'
    | 'supplies'
    | 'synthesisRewardBoosts'
    | 'failureReason'
>;
export type ShelterState = Pick<
    GameState,
    | 'health'
    | 'battle'
    | 'cards'
    | 'day'
    | 'phase'
    | 'revision'
    | 'settlement'
    | 'storedSupplies'
    | 'supplies'
    | 'synthesisRewardBoosts'
    | 'synthesisBoostedRecipes'
    | 'synthesisMaterialBoostedRecipes'
> & RouteProgress;
export type JournalState = Pick<GameState, 'day' | 'journalEntries' | 'milestones' | 'phase'>;

export function completeExplorationNode(state: NodeCompletionState, id: NodeKind, entrance: NodeKind): void {
    state.visited.push(id);
    if (state.expeditionMap) state.expeditionMap.activeNode = null;
    else if (id !== entrance) state.pathIndex++;
    if (id === entrance) state.fixedDone = true;
    state.phase = 'map';
}

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
