/** Authored content, separate from the rules engine and from saved run state. */
export type Route = 'A' | 'B';
export type NodeKind = 'fixed' | 'scavenge' | 'enemy1' | 'rest' | 'enemy2';
export interface GameScenario {
    kind: 'tutorial' | 'expedition';
    ruleset: 'tutorial-v1' | 'stamina-v1';
    battleResource?: 'supplies' | 'stamina';
    suppliesHaveWeight?: boolean;
    scavengeFees?: { fixed: number; scavenge: number };
    id: string;
    version: number;
    title: string;
    initialDay: number;
    initialSupplies: number;
    initialArmor: number;
    routes: Record<Route, NodeKind[]>;
    enemies: Record<'enemy1' | 'enemy2', { hp: number; attack: number; strongAttack: number }>;
}

// Existing teaching content is the first authored scenario, not a global game limit.
export const TUTORIAL_SCENARIO: GameScenario = {
    kind: 'tutorial',
    ruleset: 'tutorial-v1',
    battleResource: 'supplies',
    suppliesHaveWeight: true,
    scavengeFees: { fixed: 2, scavenge: 3 },
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
};

export const STAMINA_SCENARIO: GameScenario = {
    ...TUTORIAL_SCENARIO,
    kind: 'expedition',
    ruleset: 'stamina-v1',
    id: 'stamina-expedition',
    title: '灰烬街区',
    battleResource: 'stamina',
    suppliesHaveWeight: false,
    scavengeFees: { fixed: 0, scavenge: 0 },
};
export function getScenario(id: string, version: number): GameScenario {
    const scenario = [TUTORIAL_SCENARIO, STAMINA_SCENARIO].find(
        (s) => s.id === id && s.version === version
    );
    if (!scenario) throw new Error('此存档使用的章节版本尚不受支持，已保留原存档。');
    return scenario;
}
