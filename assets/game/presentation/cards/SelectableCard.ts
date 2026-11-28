import { _decorator, Component, EventMouse, EventTouch, Label, Node, UITransform } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import type { CardKind } from '../../core/SurvivalGame';
import { ButtonAction } from '../ui/ButtonAction';
import { CardPresentation } from './CardPresentation';
const { ccclass, property } = _decorator;
const DETAILS_CLOSE_HINT = '右键收起详情';

/** A full native card with one explicit selection intent. No battle gesture handler. */
@ccclass('SelectableCard')
export class SelectableCard extends Component {
    @property(CardPresentation) card: CardPresentation | null = null;
    @property(ButtonAction) action: ButtonAction | null = null;
    @property(Label) badge: Label | null = null;
    detailsPreviewEnabled = false;
    onEnable(): void {
        this.node.on(Node.EventType.MOUSE_ENTER, this.enter, this, true);
        this.node.on(Node.EventType.MOUSE_LEAVE, this.leave, this, true);
        this.node.on(Node.EventType.TOUCH_END, this.selectFromDetails, this, true);
    }
    onDisable(): void {
        this.card?.setHovered(false);
        if (this.detailsPreviewEnabled) this.setDetailsExpanded(false);
        this.node.targetOff(this);
    }
    private enter(): void {
        this.card?.setHovered(true);
    }
    private leave(event: EventMouse): void {
        const bounds = this.getComponent(UITransform);
        // The card and its ScrollView share one hover area even when Cocos switches targets.
        if (!bounds?.hitTest(event.getLocation(), event.windowId)) this.card?.setHovered(false);
    }
    setDetailsExpanded(expanded: boolean): void {
        this.card?.setExpanded(expanded, DETAILS_CLOSE_HINT);
    }
    private selectFromDetails(event: EventTouch): void {
        // ScrollView stops an event targeted at its viewport before it reaches the parent button.
        if (!this.detailsPreviewEnabled || event.target !== this.card?.detailsViewport) return;
        const movement = event.getUILocation().subtract(event.getUIStartLocation());
        if (movement.lengthSqr() <= 7 * 7) this.action?.activate(event);
    }
    show(
        kind: CardKind,
        game: GameReadModel,
        id: string,
        selected: boolean,
        status = '',
        enabled = true,
        blocked = '',
        neededForSynthesis = false,
        packedWeight?: number
    ): void {
        this.card?.configure(
            kind,
            blocked,
            '',
            id,
            game.content.cards,
            game.scenario.battleResource === 'stamina' ? '体力' : '物资',
            {
                field: game.scenario.fieldDeck,
                labyrinth: game.scenario.labyrinth,
                runDeck: game.scenario.runDeck,
                neededForSynthesis,
                packedWeight,
                expandedHint: this.detailsPreviewEnabled ? DETAILS_CLOSE_HINT : undefined,
            }
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
