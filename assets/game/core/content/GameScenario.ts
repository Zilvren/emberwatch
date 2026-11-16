/** Stable authored IDs also appear in saves. Display names and behavior belong to definitions. */
export type Route = string;
export type NodeKind = string;
export type EnemyId = string;
export type MapIcon = 'scavenge' | 'supply' | 'battle' | 'elite' | 'rest';
export interface EnemyDefinition {
    title: string;
    actorId: string;
    hp: number;
    attack: number;
    strongAttack: number;
    rewardSupplies: number;
    rewardChoices: number;
    ensureRewardOpeningHand?: boolean;
}
interface NodeDefinitionBase {
    title: string;
    icon: MapIcon;
}
export type NodeDefinition = NodeDefinitionBase &
    (
        | { type: 'battle'; enemyId: EnemyId }
        | { type: 'rest'; restoreArmor: number }
        | {
              type: 'scavenge';
              cost: number;
              supplies: readonly [number, number];
              cardReward: 'fixed' | 'random';
          }
    );
export interface GameScenario {
    ruleset: 'tutorial-v1' | 'stamina-v1';
    battleResource?: 'supplies' | 'stamina';
    suppliesHaveWeight?: boolean;
    scavengeFees?: Record<NodeKind, number>;
    id: string;
    version: number;
    title: string;
    initialDay: number;
    initialSupplies: number;
    initialArmor: number;
    fixedNodeId: NodeKind;
    nodes: Record<NodeKind, NodeDefinition>;
    routes: Record<Route, NodeKind[]>;
    routeDescriptions?: Record<Route, string>;
    enemies: Record<EnemyId, EnemyDefinition>;
    completionDay: number;
}

// Existing teaching content is the first authored scenario, not a global game limit.
export const TUTORIAL_SCENARIO: GameScenario = {
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
    fixedNodeId: 'fixed',
    nodes: {
        fixed: {
            type: 'scavenge',
            title: '废弃补给站',
            icon: 'supply',
            cost: 2,
            supplies: [4, 4],
            cardReward: 'fixed',
        },
        scavenge: {
            type: 'scavenge',
            title: '旧街搜刮',
            icon: 'scavenge',
            cost: 3,
            supplies: [4, 6],
            cardReward: 'random',
        },
        enemy1: { type: 'battle', title: '游荡感染者', icon: 'battle', enemyId: 'enemy1' },
        rest: { type: 'rest', title: '临时营地', icon: 'rest', restoreArmor: 2 },
        enemy2: { type: 'battle', title: '重度感染者', icon: 'elite', enemyId: 'enemy2' },
    },
    routes: {
        A: ['enemy1', 'scavenge', 'rest', 'enemy2'],
        B: ['scavenge', 'enemy1', 'rest', 'enemy2'],
    },
    routeDescriptions: { A: '先战斗，后搜刮', B: '先搜刮，后战斗' },
    enemies: {
        enemy1: {
            title: '游荡感染者',
            actorId: 'wanderer',
            hp: 6,
            attack: 2,
            strongAttack: 4,
            rewardSupplies: 2,
            rewardChoices: 3,
        },
        enemy2: {
            title: '重度感染者',
            actorId: 'brute',
            hp: 10,
            attack: 3,
            strongAttack: 6,
            rewardSupplies: 3,
            rewardChoices: 3,
            ensureRewardOpeningHand: true,
        },
    },
    completionDay: 2,
};

export const STAMINA_SCENARIO: GameScenario = {
    ...TUTORIAL_SCENARIO,
    ruleset: 'stamina-v1',
    id: 'stamina-expedition',
    title: '灰烬街区',
    battleResource: 'stamina',
    suppliesHaveWeight: false,
    scavengeFees: { fixed: 0, scavenge: 0 },
};
export function hasId(definitions: Readonly<Record<string, unknown>>, id: unknown): id is string {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(definitions, id);
}
export function nodeTitle(scenario: Pick<GameScenario, 'nodes'>, id: string): string {
    return scenario.nodes[id]?.title ?? id;
}
export interface RouteProgress {
    readonly fixedDone: boolean;
    readonly route: Route | null;
    readonly pathIndex: number;
}
export function currentNodeId(
    progress: RouteProgress,
    scenario: Pick<GameScenario, 'fixedNodeId' | 'routes'>
): NodeKind {
    if (!progress.fixedDone) return scenario.fixedNodeId;
    if (!progress.route) return 'choice';
    return scenario.routes[progress.route]?.[progress.pathIndex] ?? 'return';
}
function assertContent(valid: boolean, field: string): void {
    if (!valid) throw new Error('章节配置无效：' + field);
}
export function validateScenario(s: GameScenario): void {
    const id = (v: unknown) =>
        typeof v === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) &&
        ['__proto__', 'prototype', 'constructor', 'choice', 'return', 'home'].indexOf(v) < 0;
    const number = (v: unknown, min = 0, max = 100000) =>
        typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
    assertContent(id(s.id) && number(s.version, 1), 'identity');
    assertContent(['tutorial-v1', 'stamina-v1'].indexOf(s.ruleset) >= 0, 'ruleset');
    assertContent(number(s.initialDay, 1) && number(s.completionDay, s.initialDay), 'days');
    assertContent(number(s.initialSupplies) && number(s.initialArmor, 0, 10), 'initial resources');
    assertContent(
        !!s.nodes && !!s.routes && !!s.enemies && hasId(s.nodes, s.fixedNodeId),
        'definitions'
    );
    assertContent(
        s.nodes[s.fixedNodeId].type === 'scavenge',
        'initial node must complete through rewards'
    );
    assertContent(Object.keys(s.routes).length > 0, 'routes');
    for (const key of Object.keys(s.routes)) {
        const steps = s.routes[key];
        assertContent(
            new Set(steps).size === steps.length,
            'node IDs must identify unique route steps: ' + key
        );
        assertContent(
            id(key) && Array.isArray(steps) && steps.length > 0 && steps.length <= 99,
            'route ' + key
        );
        assertContent(
            steps.every((n) => hasId(s.nodes, n) && n !== s.fixedNodeId),
            'route nodes ' + key
        );
    }
    for (const key of Object.keys(s.enemies)) {
        const enemy = s.enemies[key];
        assertContent(id(key) && id(enemy.actorId) && !!enemy.title, 'enemy ' + key);
        assertContent(
            number(enemy.hp, 1) &&
                number(enemy.attack) &&
                number(enemy.strongAttack) &&
                number(enemy.rewardSupplies) &&
                number(enemy.rewardChoices, 0, 3),
            'enemy values ' + key
        );
    }
    for (const key of Object.keys(s.nodes)) {
        const node = s.nodes[key];
        assertContent(
            id(key) &&
                !!node.title &&
                ['scavenge', 'supply', 'battle', 'elite', 'rest'].indexOf(node.icon) >= 0,
            'node ' + key
        );
        if (node.type === 'battle')
            assertContent(hasId(s.enemies, node.enemyId), 'enemy reference ' + key);
        else if (node.type === 'rest')
            assertContent(number(node.restoreArmor, 0, 10), 'rest ' + key);
        else if (node.type === 'scavenge') {
            assertContent(
                number(node.cost) &&
                    Array.isArray(node.supplies) &&
                    node.supplies.length === 2 &&
                    number(node.supplies[0]) &&
                    number(node.supplies[1], node.supplies[0]),
                'scavenge ' + key
            );
            assertContent(
                node.cardReward === 'fixed' || node.cardReward === 'random',
                'card reward ' + key
            );
        } else assertContent(false, 'node type ' + key);
    }
    for (const key of Object.keys(s.scavengeFees ?? {}))
        assertContent(
            s.nodes[key]?.type === 'scavenge' && number(s.scavengeFees![key]),
            'fee ' + key
        );
}
function freeze<T>(value: T): T {
    if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) freeze(value[key]);
        Object.freeze(value);
    }
    return value;
}
const scenarios = new Map<string, GameScenario>();
/** A shipped ID/version cannot silently acquire new rules underneath an existing save. */
export function registerScenario(scenario: GameScenario): GameScenario {
    validateScenario(scenario);
    const key = scenario.id + '@' + scenario.version,
        existing = scenarios.get(key);
    if (existing) {
        assertContent(
            JSON.stringify(existing) === JSON.stringify(scenario),
            'registered version already exists: ' + key
        );
        return existing;
    }
    const snapshot = freeze(JSON.parse(JSON.stringify(scenario)) as GameScenario);
    scenarios.set(key, snapshot);
    return snapshot;
}
registerScenario(TUTORIAL_SCENARIO);
registerScenario(STAMINA_SCENARIO);
export function getScenario(id: string, version: number): GameScenario {
    const scenario = scenarios.get(id + '@' + version);
    if (!scenario) throw new Error('此存档使用的章节版本尚不受支持，已保留原存档。');
    return scenario;
}
