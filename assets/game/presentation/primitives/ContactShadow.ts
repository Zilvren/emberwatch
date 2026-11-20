import {
    _decorator,
    Color,
    Component,
    director,
    Director,
    Graphics,
    Node,
    UITransform,
    Vec3,
} from 'cc';
const { ccclass, executeInEditMode, property, requireComponent } = _decorator;

/** Scene-owned grounding; follows the actor without changing its artwork or motion. */
@ccclass('ContactShadow')
@executeInEditMode
@requireComponent(Graphics)
export class ContactShadow extends Component {
    @property(Node) target: Node | null = null;
    @property(Color) tint = new Color(55, 58, 47, 255);
    @property opacity = 110;
    @property offsetY = -2;
    private readonly point = new Vec3();

    onEnable(): void {
        this.node.on(Node.EventType.SIZE_CHANGED, this.redraw, this);
        this.redraw();
        this.followTarget();
    }
    onDisable(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this.redraw, this);
        director.off(Director.EVENT_BEFORE_DRAW, this.followTarget, this);
    }
    lateUpdate(): void {
        // Run after the actor's persistent pose callback publishes its final position.
        director.once(Director.EVENT_BEFORE_DRAW, this.followTarget, this);
    }
    private followTarget(): void {
        const graphics = this.getComponent(Graphics);
        if (!graphics) return;
        graphics.enabled = !!this.target?.activeInHierarchy;
        if (!graphics.enabled || !this.target || !this.node.parent) return;
        this.target.getWorldPosition(this.point);
        this.node.parent.inverseTransformPoint(this.point, this.point);
        this.point.y += this.offsetY;
        this.node.setPosition(this.point);
    }
    redraw(): void {
        const graphics = this.getComponent(Graphics),
            size = this.getComponent(UITransform)?.contentSize;
        if (!graphics || !size) return;
        graphics.clear();
        for (let layer = 0; layer < 8; layer++) {
            const scale = 1 - layer * 0.07;
            graphics.fillColor = new Color(
                this.tint.r,
                this.tint.g,
                this.tint.b,
                Math.round(this.opacity * (0.035 + layer * 0.022))
            );
            graphics.ellipse(0, 0, (size.width * scale) / 2, (size.height * scale) / 2);
            graphics.fill();
        }
    }
}
