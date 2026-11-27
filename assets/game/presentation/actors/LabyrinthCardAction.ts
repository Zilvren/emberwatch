import { Node, SpriteFrame, UITransform } from 'cc';
import type { ActorPresentation } from './ActorPresentation';
import { flyCardBack } from '../effects/FlyingCardBack';

interface CardAction {
    hero: ActorPresentation;
    effects: Node | null;
    cardBack: SpriteFrame | null;
    attack: boolean;
    reduced: boolean;
    impact: () => void;
    complete: () => void;
}

/** The actor cues the card effect and resolves gameplay on separate animation events. */
export function playLabyrinthCardAction(action: CardAction): void {
    const { hero, effects, attack, reduced, impact, complete } = action;
    const rig = hero.spineRig;
    const cardBack = rig?.thrownCard ?? action.cardBack;
    const layer = effects?.getComponent(UITransform);
    const release = !reduced && rig && layer && cardBack
        ? () => flyCardBack(layer.node, cardBack, rig.cardReleasePose(layer))
        : undefined;
    hero.playAction(attack ? 'attack' : 'prepare', reduced, impact, complete, undefined, release);
}
