import { _decorator, Component, Label, Node, UITransform } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import type { CardKind } from '../../core/SurvivalGame';
import { ButtonAction } from '../ui/ButtonAction';
import { CardPresentation } from './CardPresentation';
const { ccclass, property } = _decorator;

/** A full native card with one explicit selection intent. No battle gesture handler. */
@ccclass('SelectableCard')
export class SelectableCard extends Component {
    @property(CardPresentation) card: CardPresentation | null = null;
    @property(ButtonAction) action: ButtonAction | null = null;
    @property(Label) badge: Label | null = null;
    onEnable(): void {
        this.node.on(Node.EventType.MOUSE_ENTER, this.enter, this);
        this.node.on(Node.EventType.MOUSE_LEAVE, this.leave, this);
    }
    onDisable(): void {
        this.card?.setHovered(false);
        this.node.off(Node.EventType.MOUSE_ENTER, this.enter, this);
        this.node.off(Node.EventType.MOUSE_LEAVE, this.leave, this);
    }
    private enter(): void {
        this.card?.setHovered(true);
    }
    private leave(): void {
        this.card?.setHovered(false);
    }
    show(
        kind: CardKind,
        game: GameReadModel,
        id: string,
        selected: boolean,
        status = '',
        enabled = true,
        blocked = '',
        neededForSynthesis = false
    ): void {
        this.card?.configure(
            kind,
            blocked,
            '',
            id,
            game.content.cards,
            game.scenario.battleResource === 'stamina' ? '体力' : '物资',
            { field: game.scenario.fieldDeck, runDeck: game.scenario.runDeck, neededForSynthesis }
        );
        this.card?.setSelected(selected);
        if (this.badge) {
            this.badge.string = status;
            this.badge.node.active = !!status;
        }
        const visual = this.card?.visualRoot?.getComponent(UITransform),
            bounds = this.getComponent(UITransform);
        if (visual && bounds)
            bounds.setContentSize(visual.width, visual.height + (status ? 43 : 0));
        if (this.action) {
            this.action.actionId = id;
            this.action.setEnabled(enabled);
        }
    }
}
