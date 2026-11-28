import { nextMapNodes, type ExpeditionMap } from './ExpeditionMap';
import { LABYRINTH_ENEMIES } from './LabyrinthEnemies';

/** Stable authored IDs also appear in saves. Display names and behavior belong to definitions. */
export type Route = string;
export type NodeKind = string;
export type EnemyId = string;
export const MAX_HEALTH = 10;
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
    discoverAtHalf?: boolean;
}
interface NodeDefinitionBase {
    title: string;
    icon: MapIcon;
}
export type NodeDefinition = NodeDefinitionBase &
    (
        | { type: 'battle'; enemyId: EnemyId }
        | { type: 'rest'; restoreHealth: number }
        | {
              type: 'scavenge';
              cost: number;
              supplies: readonly [number, number];
              cardReward: 'fixed' | 'random';
              discover?: boolean;
              supplyCard?: true;
          }
    );
export interface GameScenario {
    kind: 'tutorial' | 'expedition';
    ruleset: 'tutorial-v1' | 'stamina-v1';
    battleResource?: 'supplies' | 'stamina';
    runDeck?: boolean;
    /** Field discoveries belong to the current expedition. Earlier scenario versions retain their inventory. */
    fieldDeck?: boolean;
    labyrinth?: true;
    scavengeFees?: Record<NodeKind, number>;
    id: string;
    version: number;
    title: string;
    initialDay: number;
    initialSupplies: number;
    initialHealth: number;
    fixedNodeId: NodeKind;
    nodes: Record<NodeKind, NodeDefinition>;
    routes: Record<Route, NodeKind[]>;
    routeDescriptions?: Record<Route, string>;
    enemies: Record<EnemyId, EnemyDefinition>;
}

export function supportsFistCombos(scenario: GameScenario): boolean {
    return scenario.battleResource === 'stamina' && (!!scenario.runDeck || !!scenario.labyrinth);
}

export function supportsWeaponSlots(scenario: Pick<GameScenario, 'runDeck' | 'labyrinth'>): boolean {
    return !!(scenario.runDeck || scenario.labyrinth);
}

// Existing teaching content is the first authored scenario, not a global game limit.
export const TUTORIAL_SCENARIO: GameScenario = {
    kind: 'tutorial',
    ruleset: 'tutorial-v1',
    battleResource: 'supplies',
    runDeck: false,
    scavengeFees: { fixed: 2, scavenge: 3 },
    id: 'first-expedition',
    version: 1,
    title: '第一次探索',
    initialDay: 1,
    initialSupplies: 10,
    initialHealth: 10,
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
        rest: { type: 'rest', title: '临时营地', icon: 'rest', restoreHealth: 2 },
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
};

export const STAMINA_SCENARIO: GameScenario = {
    ...TUTORIAL_SCENARIO,
    kind: 'expedition',
    ruleset: 'stamina-v1',
    id: 'stamina-expedition',
    title: '灰烬街区',
    battleResource: 'stamina',
    scavengeFees: { fixed: 0, scavenge: 0 },
};
export const RUN_DECK_SCENARIO: GameScenario = {
    ...STAMINA_SCENARIO,
    version: 2,
    runDeck: true,
};
const streetCache = {
    type: 'scavenge', icon: 'scavenge', cost: 0, supplies: [1, 2], cardReward: 'random',
} as const;
const synthesisRoute = [
    'marketCache', 'rest', 'roadPatrol', 'marketStorage', 'crossingCache', 'crossingCamp',
    'enemy2', 'workshopCache', 'roofPatrol', 'roofCache', 'roofCamp', 'roofElite',
];
export const SYNTHESIS_SCENARIO: GameScenario = {
    ...RUN_DECK_SCENARIO,
    version: 3,
    nodes: {
        ...RUN_DECK_SCENARIO.nodes,
        marketCache: { ...streetCache, title: '集市货箱' },
        roadPatrol: { type: 'battle', icon: 'battle', title: '街口巡游者', enemyId: 'enemy1' },
        marketStorage: { ...streetCache, title: '集市储藏间' },
        crossingCache: { ...streetCache, title: '过街通道' },
        crossingCamp: { type: 'rest', icon: 'rest', title: '街区营地', restoreHealth: 2 },
        workshopCache: { ...streetCache, title: '废弃工坊' },
        roofPatrol: { type: 'battle', icon: 'battle', title: '楼梯间伏击', enemyId: 'enemy1' },
        roofCache: { ...streetCache, title: '天台储物间' },
        roofCamp: { type: 'rest', icon: 'rest', title: '天台营地', restoreHealth: 2 },
        roofElite: { type: 'battle', icon: 'elite', title: '天台守卫', enemyId: 'roofBrute' },
    },
    routes: {
        A: ['enemy1', 'scavenge', ...synthesisRoute],
        B: ['scavenge', 'enemy1', ...synthesisRoute],
    },
    enemies: {
        ...RUN_DECK_SCENARIO.enemies,
        roofBrute: { ...RUN_DECK_SCENARIO.enemies.enemy2, title: '天台重度感染者', hp: 28 },
    },
};
export const FIELD_SCENARIO: GameScenario = {
    ...STAMINA_SCENARIO,
    id: 'tide-expedition',
    version: 2,
    fieldDeck: true,
    title: '退潮盐原',
    nodes: {
        fixed: { ...STAMINA_SCENARIO.nodes.fixed, title: '旧水标' },
        scavenge: { ...STAMINA_SCENARIO.nodes.scavenge, title: '搁浅的转运舱' },
        rest: { ...STAMINA_SCENARIO.nodes.rest, title: '避风浮舱' },
        enemy1: { ...STAMINA_SCENARIO.nodes.enemy1, title: '巡标机' },
        enemy2: { ...STAMINA_SCENARIO.nodes.enemy2, title: '失控闸轮' },
    },
    routes: {
        A: ['enemy1', 'scavenge', 'rest', 'enemy2'],
        B: ['scavenge', 'rest', 'enemy2'],
    },
    routeDescriptions: { A: '闸脊线 · 多一战，可再发现一次', B: '干潮沟 · 绕过巡标机，直取补给' },
    enemies: {
        enemy1: {
            ...STAMINA_SCENARIO.enemies.enemy1,
            title: '巡标机',
            hp: 16,
            attack: 3,
            strongAttack: 5,
            rewardSupplies: 4,
        },
        enemy2: {
            ...STAMINA_SCENARIO.enemies.enemy2,
            title: '失控闸轮',
            hp: 26,
            attack: 4,
            strongAttack: 7,
            discoverAtHalf: true,
        },
    },
};
function ashenScavengeSites(titles: Readonly<Record<string, string>>, discover: boolean): Record<NodeKind, NodeDefinition> {
    const sites: Record<NodeKind, NodeDefinition> = {};
    for (const id of Object.keys(titles)) {
        sites[id] = {
            type: 'scavenge', title: titles[id], icon: discover ? 'scavenge' : 'supply',
            cost: 0, supplies: discover ? [0, 1] : [1, 2], cardReward: 'random', discover,
            ...(discover ? {} : { supplyCard: true }),
        };
    }
    return sites;
}

export const ASHEN_LABYRINTH_SCENARIO: GameScenario = {
    kind: 'expedition',
    ruleset: 'stamina-v1',
    battleResource: 'stamina',
    fieldDeck: true,
    labyrinth: true,
    id: 'ashen-labyrinth',
    version: 1,
    title: '焦土迷宫',
    initialDay: 1,
    initialSupplies: 10,
    initialHealth: 10,
    fixedNodeId: 'threshold',
    nodes: {
        threshold: { type: 'scavenge', title: '门槛补给', icon: 'supply', cost: 0, supplies: [2, 2], cardReward: 'random' },
        lampPassage: { type: 'battle', title: '悬灯窄道', icon: 'battle', enemyId: 'ash-moth' },
        fallenShelves: { type: 'scavenge', title: '倒架储室', icon: 'scavenge', cost: 0, supplies: [2, 3], cardReward: 'random', discover: true },
        ashGallery: { type: 'battle', title: '灰烬长廊', icon: 'battle', enemyId: 'stone-claw' },
        serviceDuct: { type: 'scavenge', title: '检修暗槽', icon: 'scavenge', cost: 0, supplies: [1, 2], cardReward: 'random', supplyCard: true },
        abandonedStall: { type: 'scavenge', title: '空置货摊', icon: 'supply', cost: 0, supplies: [2, 2], cardReward: 'random', discover: true },
        edgeCache: { type: 'scavenge', title: '门缝暗格', icon: 'scavenge', cost: 0, supplies: [0, 1], cardReward: 'random', discover: true },
        tinLocker: { type: 'scavenge', title: '铁皮储柜', icon: 'supply', cost: 0, supplies: [1, 2], cardReward: 'random', discover: true },
        splitHopper: { type: 'scavenge', title: '裂口料斗', icon: 'scavenge', cost: 0, supplies: [0, 1], cardReward: 'random', discover: true },
        cinderBench: { type: 'scavenge', title: '积灰工台', icon: 'scavenge', cost: 0, supplies: [1, 2], cardReward: 'random', discover: true },
        scatteredCrates: { type: 'scavenge', title: '散落货箱', icon: 'supply', cost: 0, supplies: [1, 2], cardReward: 'random', discover: true },
        sealedShaft: { type: 'scavenge', title: '封阀井口', icon: 'scavenge', cost: 0, supplies: [1, 1], cardReward: 'random', discover: true },
        lightCut: { type: 'battle', title: '折光回廊', icon: 'battle', enemyId: 'ash-moth' },
        hoistBridge: { type: 'battle', title: '悬轮桥', icon: 'battle', enemyId: 'stone-claw' },
        shutterGap: { type: 'battle', title: '碎闸狭口', icon: 'battle', enemyId: 'ash-moth' },
        returnBridge: { type: 'battle', title: '回风窄桥', icon: 'battle', enemyId: 'stone-claw' },
        warmAlcove: { type: 'rest', title: '余温壁炉', icon: 'rest', restoreHealth: 2 },
        leeAlcove: { type: 'rest', title: '背风壁龛', icon: 'rest', restoreHealth: 2 },
        innerAlcove: { type: 'rest', title: '沉灯前室', icon: 'rest', restoreHealth: 2 },
        copperChest: { type: 'scavenge', title: '旧铜匣', icon: 'scavenge', cost: 0, supplies: [1, 2], cardReward: 'random', discover: true },
        lampCourt: { type: 'battle', title: '沉灯庭', icon: 'elite', enemyId: 'veil-idol' },
        ...ashenScavengeSites({
            chartRoom: '旧测绘间', fallenTrestle: '断裂栈台', patchBay: '接线台', coldKiln: '冷却窑',
            siltedGate: '塞灰闸槽', signalCabinet: '信号柜', stampedDrawer: '编号抽屉',
        }, true),
        ...ashenScavengeSites({
            pipeRack: '弯管货架', dustyPails: '积灰桶列', lowerCache: '矮墙储格', coalChute: '落炭滑槽',
            freightBench: '货运平台', rivetedStore: '铆接储间', winchShed: '绞盘棚', drainWell: '下沉水槽',
            pipeBend: '弯管缺口', filterPress: '废旧滤机', waterShelf: '冷凝水架', stackLocker: '叠放货柜',
            railStop: '断轨端头',
        }, false),
    },
    routes: {
        A: ['lampPassage', 'fallenShelves', 'ashGallery', 'lightCut', 'leeAlcove', 'copperChest', 'lampCourt'],
        B: ['serviceDuct', 'abandonedStall', 'lightCut', 'leeAlcove', 'copperChest', 'lampCourt'],
    },
    routeDescriptions: {
        A: '悬灯道 · 多两场战斗，可多发现两次',
        B: '检修道 · 绕开前段战斗，先搜刮补给',
    },
    enemies: LABYRINTH_ENEMIES,
};
export function hasId(definitions: Readonly<Record<string, unknown>>, id: unknown): id is string {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(definitions, id);
}
export function nodeTitle(
    scenario: { readonly nodes: Readonly<Record<string, { readonly title: string }>> },
    id: string
): string {
    return scenario.nodes[id]?.title ?? id;
}
export interface RouteProgress {
    readonly fixedDone: boolean;
    readonly route: Route | null;
    readonly pathIndex: number;
    readonly visited: readonly NodeKind[];
    readonly expeditionMap: Readonly<ExpeditionMap> | null;
}
export function currentNodeId(
    progress: RouteProgress,
    scenario: Pick<GameScenario, 'fixedNodeId' | 'routes'>
): NodeKind {
    const map = progress.expeditionMap;
    if (map) {
        if (map.activeNode !== null) return map.activeNode;
        const next = nextMapNodes(map, progress.visited[progress.visited.length - 1]);
        return next.length > 1 ? 'choice' : next[0] ?? 'return';
    }
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
    assertContent(number(s.initialDay, 1), 'initial day');
    assertContent(s.kind === 'tutorial' || s.kind === 'expedition', 'scenario kind');
    assertContent(number(s.initialSupplies) && number(s.initialHealth, 1, MAX_HEALTH), 'initial resources');
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
            assertContent(number(node.restoreHealth, 0, 10), 'rest ' + key);
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
registerScenario(RUN_DECK_SCENARIO);
registerScenario(SYNTHESIS_SCENARIO);
registerScenario(FIELD_SCENARIO);
registerScenario(ASHEN_LABYRINTH_SCENARIO);
export function getScenario(id: string, version: number): GameScenario {
    const scenario = scenarios.get(id + '@' + version);
    if (!scenario) throw new Error('此存档使用的章节版本尚不受支持，已保留原存档。');
    return scenario;
}
