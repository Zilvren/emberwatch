import type { CardSet } from '../core/content/ContentRegistry';
import type { GameState } from '../core/state/GameState';
export interface SaveLoad {
    state: GameState | null;
    recovered: boolean;
    warning: string;
}
/** Application port; storage and engine adapters are composed outside the session. */
export interface RunPersistence {
    readonly content: CardSet;
    readonly status: string;
    readonly warning: string;
    load(): SaveLoad;
    save(state: GameState): void;
    allowNewGame(): void;
}
