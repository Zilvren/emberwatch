import { CardKind } from './content/CardCatalog';
import { NodeKind, TUTORIAL_SCENARIO } from './content/GameScenario';
export type { CardDefinition, CardKind } from './content/CardCatalog';
export type { NodeKind, Route } from './content/GameScenario';
export type Phase =
    'journal' | 'map' | 'battle' | 'rewards' | 'rest' | 'shelter' | 'day2' | 'failure';
export const ROUTES = TUTORIAL_SCENARIO.routes;
export const NODE_NAMES: Record<NodeKind, string> = {
    fixed: '废弃补给站',
    scavenge: '旧街搜刮',
    enemy1: '游荡感染者',
    rest: '临时营地',
    enemy2: '重度感染者',
};
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
    enemy: 'enemy1' | 'enemy2';
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
    weapon: CombatCard | null;
    equippedTurn: number;
}
export interface Rewards {
    source: NodeKind;
    supplies: number;
    cards: CardKind[];
    supplyTaken: boolean;
    cardTaken: boolean;
}
export interface ActionResult {
    ok: boolean;
    message: string;
    warning?: boolean;
}
export interface Settlement {
    returnedSupplies: number;
    returnedCards: number;
    lostOverflow: string[];
    wasCritical: boolean;
    repairCost: number;
    repaired: boolean;
    repairSpent: number;
    dailySpent: number;
    dailyShortfall: number;
}
