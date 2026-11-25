import { CardKind } from './content/CardCatalog';
import { NodeKind, TUTORIAL_SCENARIO } from './content/GameScenario';
export type { CardDefinition, CardKind } from './content/CardCatalog';
export type { NodeKind, Route } from './content/GameScenario';
export type { Phase } from './state/GamePhase';
export const ROUTES = TUTORIAL_SCENARIO.routes;
/** Compatibility export for tools that inspect the first chapter. Runtime views use scenario.nodes. */
export const NODE_NAMES: Record<NodeKind, string> = {};
for (const id of Object.keys(TUTORIAL_SCENARIO.nodes))
    NODE_NAMES[id] = TUTORIAL_SCENARIO.nodes[id].title;
export interface OwnedCard {
    id: string;
    kind: CardKind;
    zone: 'base' | 'overflow';
    selected: boolean;
    found: boolean;
}
export interface CombatCard {
    id: string;
    kind: CardKind;
    origin?: string;
    temporary: boolean;
}
export interface Battle {
    stamina: number;
    maxStamina: number;
    enemy: string;
    hp: number;
    maxHp: number;
    attack: number;
    strongAttack: number;
    turn: number;
    intent: 'attack' | 'prepare';
    boosted: boolean;
    block: number;
    draw: CombatCard[];
    hand: CombatCard[];
    discard: CombatCard[];
    weapons?: CombatCard[];
    weapon: CombatCard | null;
    weaponTurns?: Record<string, number>;
    pendingEquip?: string;
    equippedTurn: number;
    rage?: number;
    lastDefenseCardKind?: CardKind;
    /** Saved candidates for an opening or a surviving elite's first exposed core. */
    discovery?: CardKind[];
    attackedThisTurn?: boolean;
    coreExposed?: boolean;
    calm?: CalmBattle;
    cardChoice?: { mode: 'discard-to-top' | 'retain-hand' | 'replace-weapon'; ids: string[] };
}
export interface CalmBattle {
    persistent: number;
    temporary: number;
    applied: number;
    limit: number;
    deferred: 'scheduled' | 'extra-turn' | null;
    freeSkill: boolean;
    calibrated: boolean;
    spent: number;
    guardPerLayer: number;
    drawOnDefer: number;
    counter: number;
    retained: string | null;
}
export interface Rewards {
    source: NodeKind;
    supplies: number;
    cards: CardKind[];
    supplyTaken: boolean;
    cardTaken: boolean;
    discovery?: true;
}
export interface ActionResult {
    ok: boolean;
    message: string;
    warning?: boolean;
}
/** Loot and maintenance from a return; there is no daily payment. */
export interface Settlement {
    returnedSupplies: number;
    returnedCards: number;
    discoveredCards?: number;
    lostOverflow: string[];
    wasCritical: boolean;
    repairCost: number;
    repaired: boolean;
    repairSpent: number;
}
