export const LABYRINTH_ENEMIES = {
    'ash-moth': { title: '灰灯蛾', actorId: 'ash-moth', hp: 8, attack: 1, strongAttack: 2, rewardSupplies: 1, rewardChoices: 3 },
    'stone-claw': { title: '叩石螯', actorId: 'stone-claw', hp: 11, attack: 2, strongAttack: 3, rewardSupplies: 2, rewardChoices: 3 },
    'veil-idol': { title: '垂幡守像', actorId: 'veil-idol', hp: 14, attack: 2, strongAttack: 4, rewardSupplies: 3, rewardChoices: 3 },
    'gate-warden': { title: '镇闸石螯', actorId: 'stone-claw', hp: 18, attack: 2, strongAttack: 4, rewardSupplies: 4, rewardChoices: 3 },
    'stymphalian-bird': { title: '斯廷法洛斯鸟', actorId: 'stymphalian-bird', hp: 5, attack: 1, strongAttack: 2, rewardSupplies: 2, rewardChoices: 3 },
    cyclops: { title: '独眼石巨人', actorId: 'cyclops', hp: 12, attack: 2, strongAttack: 4, rewardSupplies: 2, rewardChoices: 3 },
    minotaur: { title: '弥诺陶洛斯', actorId: 'minotaur', hp: 14, attack: 2, strongAttack: 4, rewardSupplies: 3, rewardChoices: 3 },
    hydra: { title: '许德拉', actorId: 'hydra', hp: 12, attack: 1, strongAttack: 3, rewardSupplies: 2, rewardChoices: 3 },
    charybdis: { title: '卡律布狄斯', actorId: 'charybdis', hp: 10, attack: 1, strongAttack: 3, rewardSupplies: 2, rewardChoices: 3 },
    symplegades: { title: '相撞双岩', actorId: 'symplegades', hp: 13, attack: 2, strongAttack: 4, rewardSupplies: 2, rewardChoices: 3 },
};

export type LabyrinthEnemyId = keyof typeof LABYRINTH_ENEMIES;
type Encounter = readonly [LabyrinthEnemyId, ...LabyrinthEnemyId[]];

const regularEncounters: readonly Encounter[] = [
    ['ash-moth'], ['stone-claw'], ['veil-idol'], ['stymphalian-bird'], ['cyclops'],
    ['minotaur'], ['hydra'], ['charybdis'], ['symplegades'], ['stymphalian-bird', 'stymphalian-bird'],
];
const eliteEncounters: readonly Encounter[] = [['gate-warden']];

/** One entry is one equally likely formation, in front-to-back acting order. */
export function labyrinthEncounterPool(elite: boolean): readonly Encounter[] {
    return elite ? eliteEncounters : regularEncounters;
}

export const ENEMY_ACTION_LABELS = { attack: '普攻', prepare: '蓄势', heavy: '重击' };
export type EnemyAction = keyof typeof ENEMY_ACTION_LABELS;
export const DEFAULT_ENEMY_ACTIONS: readonly EnemyAction[] = ['attack', 'prepare', 'heavy'];
export const DEFAULT_ENEMY_LOOP_START = 1;

const patterns: Partial<Record<LabyrinthEnemyId, readonly EnemyAction[]>> = {
    'stymphalian-bird': ['attack', 'prepare', 'heavy'],
    cyclops: ['prepare', 'heavy', 'prepare', 'attack'],
    minotaur: ['attack', 'prepare', 'heavy', 'prepare'],
    hydra: ['attack', 'attack', 'prepare', 'heavy'],
    charybdis: ['prepare', 'heavy', 'attack'],
    symplegades: ['prepare', 'prepare', 'heavy'],
};

export function defaultEnemyPlan(id: LabyrinthEnemyId): EnemyActionPlan {
    const { attack, strongAttack } = LABYRINTH_ENEMIES[id];
    return { attack, strongAttack, actions: [...(patterns[id] ?? DEFAULT_ENEMY_ACTIONS)],
        loopStart: patterns[id] ? 0 : DEFAULT_ENEMY_LOOP_START };
}

export interface EnemyActionPlan {
    attack: number;
    strongAttack: number;
    actions: EnemyAction[];
    loopStart: number;
}

export interface EnemySequence {
    actions: EnemyAction[];
    index: number;
    loopStart: number;
}

export function isLabyrinthEnemy(id: string): id is LabyrinthEnemyId {
    return Object.prototype.hasOwnProperty.call(LABYRINTH_ENEMIES, id);
}

export function validEnemyActions(actions: unknown): actions is EnemyAction[] {
    return Array.isArray(actions) && actions.length > 0 &&
        actions.every(action => typeof action === 'string' && Object.prototype.hasOwnProperty.call(ENEMY_ACTION_LABELS, action));
}

type SequenceView = Omit<Readonly<EnemySequence>, 'actions'> & { readonly actions: readonly EnemyAction[] };

export interface BattleEnemy {
    enemy: string;
    hp: number;
    maxHp: number;
    attack: number;
    strongAttack: number;
    intent: 'attack' | 'prepare';
    boosted: boolean;
    enemySequence?: EnemySequence;
}
export type EnemyView = Omit<Readonly<BattleEnemy>, 'enemySequence'> & { readonly enemySequence?: SequenceView };
type EnemyLine = EnemyView & { readonly companions?: readonly EnemyView[] };

/** The lead occupies slot zero in both historical and group saves. Slots survive individual defeats. */
export function battleEnemies(battle: BattleEnemy & { companions?: BattleEnemy[] }): BattleEnemy[];
export function battleEnemies(battle: EnemyLine): EnemyView[];
export function battleEnemies(battle: EnemyLine): EnemyView[] {
    return [battle, ...(battle.companions ?? [])];
}

export function hasLivingEnemy(battle: EnemyLine): boolean {
    return battle.hp > 0 || !!battle.companions?.some(enemy => enemy.hp > 0);
}

export function intentDamage(enemy: EnemyView): number {
    return enemy.hp <= 0 || enemy.intent === 'prepare' ? 0 : enemy.boosted ? enemy.strongAttack : enemy.attack;
}

export function nextEnemyStep(sequence: SequenceView): number {
    return sequence.index + 1 < sequence.actions.length ? sequence.index + 1 : sequence.loopStart;
}

export function nextEnemyAction(battle: {
    readonly intent: 'attack' | 'prepare';
    readonly enemySequence?: SequenceView;
}): EnemyAction {
    const sequence = battle.enemySequence;
    if (sequence) return sequence.actions[nextEnemyStep(sequence)];
    return battle.intent === 'prepare' ? 'heavy' : 'prepare';
}
