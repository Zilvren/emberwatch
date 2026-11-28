import { ActionResult } from '../RulesTypes';
import { GameState } from '../state/GameState';
import type { NodeKind, RouteProgress } from '../content/GameScenario';
export type FeedbackState = Pick<GameState, 'revision'>;
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
    | 'fistUnlocks'
>;
type NodeCompletionState = Pick<GameState, 'expeditionMap' | 'fixedDone' | 'pathIndex' | 'phase' | 'visited'>;
export type RewardState = NodeCompletionState & Pick<
    GameState,
    'cards' | 'rewards' | 'supplies' | 'discoveryPool' | 'synthesisRewardBoosts' | 'fistUnlocks'
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
    | 'fistUnlocks'
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
    | 'fistUnlocks'
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
}
