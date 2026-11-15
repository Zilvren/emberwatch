import { _decorator, Component, EventTouch, Node, Tween, tween, UITransform, Vec2, Vec3 } from 'cc';
import { dispatchAction, dispatchCardDrop } from '../ui/UIEvents';
import { CardPresentation } from './CardPresentation';
const { ccclass } = _decorator;
export interface CardInputContext {
    enabled: () => boolean;
    selected: () => boolean;
    reduced: () => boolean;
    dragLayer: () => Node | null;
    lift: () => number;
    zoom: () => number;
    focus?: () => void;
}

/** Pointer input owns hover and drag state; it never executes a game rule. */
@ccclass('CardInteraction')
export class CardInteraction extends Component {
    private card!: CardPresentation;
    private context!: CardInputContext;
    private visual!: Node;
    private home = new Vec3();
    private homeScale = new Vec3(1, 1, 1);
    private down: Vec2 | null = null;
    private dragging = false;
    private hovering = false;
    private parent: Node | null = null;
    private position = new Vec3();
    private angle = 0;
    private held = false;
    private scrolled = false;
    private showDetails = () => {
        if (!this.down || this.dragging || !this.context.enabled()) return;
        this.held = true;
        this.card.setExpanded(!this.card.expanded);
    };
    setup(card: CardPresentation, context: CardInputContext): void {
        if (this.context) {
            this.context = context;
            return;
        }
        this.card = card;
        this.context = context;
        this.visual = card.visualRoot ?? this.node.getChildByName('Visual')!;
        this.home = this.visual.position.clone();
        this.homeScale = this.visual.scale.clone();
        if (
            typeof matchMedia === 'undefined' ||
            matchMedia('(hover: hover) and (pointer: fine)').matches
        ) {
            this.node.on(Node.EventType.MOUSE_ENTER, this.enter, this);
            this.node.on(Node.EventType.MOUSE_LEAVE, this.leave, this);
        }
        this.node.on(Node.EventType.TOUCH_START, this.onPointerDown, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onPointerMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onPointerUp, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onPointerCancel, this);
        this.node.on('card-expanded', this.onExpanded, this);
    }
    sync(): void {
        if (!this.context || this.dragging) return;
        this.card.setHovered(this.hovering);
        this.card.setSelected(this.context.selected());
        this.pose(this.hovering || this.context.selected());
    }
    private pose(lifted: boolean): void {
        if (!this.visual) return;
        Tween.stopAllByTarget(this.visual);
        const move = lifted && !this.context.reduced();
        const style = this.card.theme?.json.card;
        const readingScale = Math.max(
            1,
            (style?.width ?? 224) / Math.max(1, this.node.getComponent(UITransform)!.width)
        );
        const scale = this.card.expanded ? readingScale : move ? this.context.zoom() : 1;
        const lift = this.card.expanded
            ? readingScale > 1
                ? (style?.readingLift ?? 120)
                : 0
            : move
              ? this.context.lift()
              : 0;
        tween(this.visual)
            .to(
                this.context.reduced() ? 0 : 0.14,
                {
                    position: new Vec3(this.home.x, this.home.y + lift, this.home.z),
                    scale: new Vec3(
                        this.homeScale.x * scale,
                        this.homeScale.y * scale,
                        this.homeScale.z
                    ),
                    angle: this.card.expanded ? -this.node.angle : 0,
                },
                { easing: 'quadOut' }
            )
            .start();
    }
    private onExpanded(value: boolean): void {
        if (value) this.context.focus?.();
        this.sync();
    }
    onDisable(): void {
        this.unschedule(this.showDetails);
        this.down = null;
        this.dragging = false;
        this.hovering = false;
    }
    private enter(): void {
        if (!this.context.enabled()) return;
        this.hovering = true;
        this.card.setHovered(true);
        this.pose(true);
        this.node.setSiblingIndex(this.node.parent!.children.length - 1);
    }
    private leave(): void {
        this.hovering = false;
        this.card.setHovered(false);
        if (!this.dragging) this.pose(this.context.selected());
    }
    private onPointerDown(event: EventTouch): void {
        if (!this.context.enabled()) return;
        this.down = event.getUILocation();
        this.dragging = false;
        this.held = false;
        this.scrolled = false;
        this.scheduleOnce(this.showDetails, 0.45);
        this.parent = this.node.parent;
        this.position = this.node.position.clone();
        this.angle = this.node.angle;
        this.enter();
    }
    private onPointerMove(event: EventTouch): void {
        const layer = this.context.dragLayer();
        if (!this.down || !this.context.enabled() || !layer) return;
        const point = event.getUILocation();
        if (!this.dragging && point.clone().subtract(this.down).length() < 9) return;
        this.unschedule(this.showDetails);
        if (this.card.expanded) {
            this.scrolled = true;
            return;
        }
        if (!this.dragging) {
            this.dragging = true;
            this.node.setParent(layer, true);
            this.card.setHovered(true);
            Tween.stopAllByTarget(this.visual);
        }
        const local = layer
            .getComponent(UITransform)!
            .convertToNodeSpaceAR(new Vec3(point.x, point.y));
        this.node.setPosition(local.x, local.y + 38);
        this.node.angle = 0;
    }
    private onPointerUp(event: EventTouch): void {
        if (!this.down) return;
        this.down = null;
        this.unschedule(this.showDetails);
        if (this.held || this.scrolled) return;
        if (!this.context.enabled()) {
            this.restore();
            return;
        }
        if (this.card.expanded) {
            this.card.setExpanded(false);
            return;
        }
        if (!this.dragging) {
            dispatchAction(this.node, { id: 'card-select', payload: this.card.cardId });
            return;
        }
        this.dragging = false;
        let accepted = false;
        dispatchCardDrop(this.node, {
            id: this.card.cardId,
            point: event.getUILocation(),
            accept: () => {
                accepted = true;
            },
        });
        if (!accepted) this.restore();
    }
    private restore(): void {
        this.dragging = false;
        if (this.parent?.isValid) {
            this.node.setParent(this.parent);
            this.node.setPosition(this.position);
            this.node.angle = this.angle;
        }
        this.hovering = false;
        this.card.setHovered(false);
        this.pose(this.context.selected());
    }
    private onPointerCancel(): void {
        this.unschedule(this.showDetails);
        this.down = null;
        this.restore();
    }
    update(): void {
        if (this.down && !this.context.enabled()) this.onPointerCancel();
    }
    onDestroy(): void {
        if (this.visual?.isValid) Tween.stopAllByTarget(this.visual);
        this.node.targetOff(this);
    }
}
