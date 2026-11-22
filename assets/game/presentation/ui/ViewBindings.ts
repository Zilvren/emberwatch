import { GAME_PHASES, type Phase } from '../../core/state/GamePhase';
import type { UiState } from './UiState';
import { isCampStation } from './CampViewModel';
/** day2 is the retained native follow-up journal view, not a gameplay phase. */
export const SCREEN_KEYS = [...GAME_PHASES, 'day2', 'camp'] as const;
export type ScreenKey = (typeof SCREEN_KEYS)[number];
export const POPUP_KEYS = ['inventory', 'help', 'log', 'confirmation', 'map', 'entry', 'recipes', 'camp-station', 'settings', 'battle-pile'] as const;
export type PopupKey = (typeof POPUP_KEYS)[number];
export function popupKey(overlay: UiState['overlay']): PopupKey | null {
    if (!overlay) return null;
    if (overlay === 'draw-pile' || overlay === 'discard-pile') return 'battle-pile';
    if (overlay === 'settings') return 'settings';
    if (isCampStation(overlay)) return 'camp-station';
    if (overlay === 'bag') return 'inventory';
    if (overlay === 'help' || overlay === 'log' || overlay === 'map' || overlay === 'entry' || overlay === 'recipes')
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
