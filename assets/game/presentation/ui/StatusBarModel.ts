export type StatusTone = 'normal' | 'warning' | 'danger';
export interface StatusBarInput {
    day: number;
    supplies: number;
    armor: number;
    armorMax: number;
    critical: boolean;
    carried: number;
    capacity: number;
    overflow: number;
    overflowCapacity: number;
    saveStatus: string;
    muted: boolean;
    actionsEnabled: boolean;
    rulesNotice?: string;
    recipesVisible?: boolean;
}
export const defaultStatus: StatusBarInput = {
    day: 1,
    supplies: 10,
    armor: 10,
    armorMax: 10,
    critical: false,
    carried: 27,
    capacity: 30,
    overflow: 0,
    overflowCapacity: 10,
    saveStatus: '自动保存',
    muted: false,
    actionsEnabled: true,
};
/** Display decisions only. A warning never changes command eligibility or game rules. */
export function statusBarView(input: Readonly<StatusBarInput>) {
    const suppliesTone: StatusTone =
        input.supplies <= 0 ? 'danger' : input.supplies <= 1 ? 'warning' : 'normal';
    const armorTone: StatusTone = input.critical
        ? 'danger'
        : input.armor <= 2
          ? 'warning'
          : 'normal';
    const carryTone: StatusTone =
        input.overflow > 0 || input.carried >= input.capacity ? 'warning' : 'normal';
    let save = input.saveStatus,
        saveTone: StatusTone = 'normal';
    if (save.indexOf('保存失败') >= 0) {
        save = '保存失败 · 勿关闭';
        saveTone = 'danger';
    } else if (save.indexOf('原存档') >= 0) {
        save = '原存档已保留';
        saveTone = 'warning';
    } else if (save.indexOf('备份') >= 0) saveTone = 'warning';
    else if (save.indexOf('不存档') >= 0) save = '本次测试不保存';
    return {
        day: `第 ${input.day} 天`,
        supplies: String(input.supplies),
        suppliesTone,
        suppliesHint:
            input.supplies <= 0 ? '补给用尽' : input.supplies <= 1 ? '补给偏低' : '生存补给',
        armorTitle: input.critical ? '护甲 · 感染临界' : input.armor <= 2 ? '护甲 · 偏低' : '护甲',
        armor: `${input.armor} / ${input.armorMax}`,
        armorTone,
        armorRatio: input.armorMax > 0 ? Math.max(0, Math.min(1, input.armor / input.armorMax)) : 0,
        bag: `背包 ${input.carried} / ${input.capacity}`,
        carryTone,
        carryHint:
            input.overflow > 0
                ? `暂存 ${input.overflow} / ${input.overflowCapacity}`
                : input.carried >= input.capacity
                  ? '携带已满'
                  : `剩余 ${input.capacity - input.carried} 负重`,
        save,
        saveTone,
        audio: input.muted ? '声音关' : '声音开',
        actionsEnabled: input.actionsEnabled,
        rulesNotice: input.rulesNotice ?? '',
    };
}
