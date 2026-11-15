/** Authored content, separate from the rules engine and from saved run state. */
export type Route = 'A' | 'B';
export type NodeKind = 'fixed' | 'scavenge' | 'enemy1' | 'rest' | 'enemy2';
export interface GameScenario {
    ruleset: 'tutorial-v1';
    id: string;
    version: number;
    title: string;
    initialDay: number;
    initialSupplies: number;
    initialArmor: number;
    routes: Record<Route, NodeKind[]>;
    enemies: Record<'enemy1' | 'enemy2', { hp: number; attack: number; strongAttack: number }>;
    completionDay: number;
}

// Existing teaching content is the first authored scenario, not a global game limit.
export const TUTORIAL_SCENARIO: GameScenario = {
    ruleset: 'tutorial-v1',
    id: 'first-expedition',
    version: 1,
    title: '第一次探索',
    initialDay: 1,
    initialSupplies: 10,
    initialArmor: 10,
    routes: {
        A: ['enemy1', 'scavenge', 'rest', 'enemy2'],
        B: ['scavenge', 'enemy1', 'rest', 'enemy2'],
    },
    enemies: {
        enemy1: { hp: 6, attack: 2, strongAttack: 4 },
        enemy2: { hp: 10, attack: 3, strongAttack: 6 },
    },
    completionDay: 2,
};

export function getScenario(id: string, version: number): GameScenario {
    if (id !== TUTORIAL_SCENARIO.id || version !== TUTORIAL_SCENARIO.version)
        throw new Error('此存档使用的章节版本尚不受支持，已保留原存档。');
    return TUTORIAL_SCENARIO;
}
