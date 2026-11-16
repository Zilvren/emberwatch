import { _decorator, Component, Node } from 'cc';
import { GAME_PHASES, POPUP_KEYS, namedBindings, type Phase, type PopupKey } from './ViewBindings';
import { ActorPresentation } from '../actors/ActorPresentation';
import type { GameReadModel } from '../../core/GameReadModel';
const { ccclass, property } = _decorator;
/** Explicit native prefab identity. Array order and hierarchy names carry no screen-routing meaning. */
@ccclass('GameView')
export class GameView extends Component {
    @property key = '';
}
export interface SceneBindings {
    hud: Node;
    screens: Record<Phase, Node>;
    popups: Record<PopupKey, Node>;
}
export function bindScene(
    hud: Node | null,
    screenRoots: readonly Node[],
    popupRoots: readonly Node[],
    scenario: GameReadModel['scenario']
): SceneBindings {
    if (!hud) throw new Error('缺少 HUD 绑定');
    const entries = (roots: readonly Node[]) =>
        roots.map((value) => {
            const descriptors = value.getComponentsInChildren(GameView);
            if (descriptors.length !== 1)
                throw new Error(`界面 ${value.name} 需要且只能有一个 GameView 标识`);
            return { key: descriptors[0].key, value };
        });
    const screens = namedBindings(GAME_PHASES, entries(screenRoots), '屏幕');
    const actors = new Set<string>();
    for (const actor of screens.battle.getComponentsInChildren(ActorPresentation)) {
        if (!actor.actorId || actors.has(actor.actorId))
            throw new Error('战斗角色绑定缺失或重复：' + actor.actorId);
        actors.add(actor.actorId);
    }
    for (const id of [
        'player',
        ...Object.keys(scenario.enemies).map((id) => scenario.enemies[id].actorId),
    ])
        if (!actors.has(id)) throw new Error('缺少战斗角色绑定：' + id);
    return { hud, screens, popups: namedBindings(POPUP_KEYS, entries(popupRoots), '弹窗') };
}
