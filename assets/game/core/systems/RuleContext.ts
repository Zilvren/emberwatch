import { ActionResult } from '../RulesTypes';
import { GameState } from '../state/GameState';
export type RuleState = Omit<
    GameState,
    'scenarioId' | 'scenarioVersion' | 'seed' | 'randomState' | 'nextId'
>;
export class RuleFeedback {
    constructor(private readonly state: RuleState) {}
    result(ok: boolean, message: string, warning = false): ActionResult {
        if (ok) this.state.revision++;
        return { ok, message, warning };
    }
    log(message: string): void {
        this.state.logs.unshift(message);
        this.state.logs = this.state.logs.slice(0, 36);
    }
}
