import { _decorator, Component, EventTouch, Label, Node, UITransform } from 'cc';
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
    revealDetailsOnHover = false;
    private hovered = false;
    onEnable(): void {
        this.node.on(Node.EventType.MOUSE_ENTER, this.enter, this);
        this.node.on(Node.EventType.MOUSE_LEAVE, this.leave, this);
        this.node.on(Node.EventType.TOUCH_END, this.selectFromDetails, this, true);
    }
    onDisable(): void {
        this.hovered = false;
        this.refreshPreview();
        this.node.off(Node.EventType.MOUSE_ENTER, this.enter, this);
        this.node.off(Node.EventType.MOUSE_LEAVE, this.leave, this);
        this.node.off(Node.EventType.TOUCH_END, this.selectFromDetails, this, true);
    }
    private enter(): void {
        this.hovered = true;
        this.refreshPreview();
    }
    private leave(): void {
        this.hovered = false;
        this.refreshPreview();
    }
    private refreshPreview(): void {
        this.card?.setHovered(this.hovered);
        if (this.revealDetailsOnHover)
            this.card?.setExpanded(this.hovered, '');
    }
    private selectFromDetails(event: EventTouch): void {
        // ScrollView stops an event targeted at its viewport before it reaches the parent button.
        if (!this.revealDetailsOnHover || event.target !== this.card?.detailsViewport) return;
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
                labyrinthCatalog: game.content.catalog.labyrinth,
                runDeck: game.scenario.runDeck,
                neededForSynthesis,
                packedWeight,
            }
        );
        this.card?.setSelected(selected);
        this.refreshPreview();
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
