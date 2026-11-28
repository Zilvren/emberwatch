export const LABYRINTH_ENEMIES = {
    'ash-moth': { title: '灰灯蛾', actorId: 'ash-moth', hp: 8, attack: 1, strongAttack: 2, rewardSupplies: 1, rewardChoices: 3 },
    'stone-claw': { title: '叩石螯', actorId: 'stone-claw', hp: 11, attack: 2, strongAttack: 3, rewardSupplies: 2, rewardChoices: 3 },
    'veil-idol': { title: '垂幡守像', actorId: 'veil-idol', hp: 14, attack: 2, strongAttack: 4, rewardSupplies: 3, rewardChoices: 3 },
};

export type LabyrinthEnemyId = keyof typeof LABYRINTH_ENEMIES;
export const ENEMY_ACTION_LABELS = { attack: '普攻', prepare: '蓄势', heavy: '重击' };
export type EnemyAction = keyof typeof ENEMY_ACTION_LABELS;
export const DEFAULT_ENEMY_ACTIONS: readonly EnemyAction[] = ['attack', 'prepare', 'heavy'];
export const DEFAULT_ENEMY_LOOP_START = 1;

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
