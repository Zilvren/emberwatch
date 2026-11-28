export type StatusTone = 'normal' | 'warning' | 'danger';
export interface StatusBarInput {
    day: number;
    supplies: number;
    health: number;
    healthMax: number;
    deckCount: number;
    saveStatus: string;
    muted: boolean;
    actionsEnabled: boolean;
    healthVisible?: boolean;
    round?: number;
    rulesNotice?: string;
    recipesVisible?: boolean;
}
export const defaultStatus: StatusBarInput = {
    day: 1, supplies: 10, health: 10, healthMax: 10, deckCount: 7,
    saveStatus: '自动保存', muted: false, actionsEnabled: true,
};
export function statusBarView(input: Readonly<StatusBarInput>) {
    const save = input.saveStatus;
    const saveTone: StatusTone = /失败|原存档/.test(save) ? 'danger' : /备份/.test(save) ? 'warning' : 'normal';
    const healthTone: StatusTone = input.health <= 2 ? 'danger' : 'normal';
    return {
        day: `第 ${input.day} 天`, round: input.round ? `第 ${input.round} 回合` : '',
        supplies: String(input.supplies),
        suppliesTone: (input.supplies <= 1 ? 'warning' : 'normal') as StatusTone,
        health: `${input.health} / ${input.healthMax}`, healthTone,
        healthRatio: input.healthMax ? Math.max(0, Math.min(1, input.health / input.healthMax)) : 0,
        bag: `牌组 · ${input.deckCount} 张`, save, saveTone,
        saveSymbol: saveTone === 'danger' ? 'warning' : /不存档|不保存/.test(save) ? 'unsaved' : 'saved',
        audio: input.muted ? '声音关' : '声音开', actionsEnabled: input.actionsEnabled,
        rulesNotice: input.rulesNotice ?? '',
    };
}
