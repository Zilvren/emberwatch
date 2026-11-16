import { GAME_PHASES, type Phase } from '../../core/state/GamePhase';
import type { UiState } from './UiState';
export const POPUP_KEYS = ['inventory', 'help', 'log', 'confirmation', 'map', 'entry'] as const;
export type PopupKey = (typeof POPUP_KEYS)[number];
export function popupKey(overlay: UiState['overlay']): PopupKey | null {
    if (!overlay) return null;
    if (overlay === 'bag') return 'inventory';
    if (overlay === 'help' || overlay === 'log' || overlay === 'map' || overlay === 'entry')
        return overlay;
    return 'confirmation';
}
export function namedBindings<Key extends string, Value>(
    required: readonly Key[],
    entries: readonly { key: string; value: Value }[],
    kind: string
): Record<Key, Value> {
    const bindings = Object.create(null) as Record<Key, Value>;
    for (const { key, value } of entries) {
        if (required.indexOf(key as Key) < 0) throw new Error(`未知${kind}绑定：${key}`);
        if (Object.prototype.hasOwnProperty.call(bindings, key))
            throw new Error(`重复${kind}绑定：${key}`);
        bindings[key as Key] = value;
    }
    for (const key of required)
        if (!Object.prototype.hasOwnProperty.call(bindings, key))
            throw new Error(`缺少${kind}绑定：${key}`);
    return bindings;
}
export { GAME_PHASES };
export type { Phase };
