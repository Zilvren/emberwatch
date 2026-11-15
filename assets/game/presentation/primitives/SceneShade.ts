import { _decorator, Color, Component, Graphics, Node, UITransform } from 'cc';
const { ccclass, property, requireComponent, executeInEditMode } = _decorator;
/** Soft contrast at the edges keeps the world visible behind the interface. */
@ccclass('SceneShade')
@executeInEditMode
@requireComponent(Graphics)
export class SceneShade extends Component {
    @property top = 110;
    @property bottom = 190;
    @property right = 0;
    @property(Color) tint = new Color(35, 37, 31, 255);
    onEnable(): void {
        this.node.on(Node.EventType.SIZE_CHANGED, this.redraw, this);
        this.redraw();
    }
    onDisable(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this.redraw, this);
    }
    redraw(): void {
        const g = this.getComponent(Graphics),
            ui = this.getComponent(UITransform);
        if (!g || !ui) return;
        const w = ui.width,
            h = ui.height,
            steps = 160;
        g.clear();
        for (let i = 0; i < steps; i++) {
            const ratio = 1 - i / steps;
            g.fillColor = new Color(
                this.tint.r,
                this.tint.g,
                this.tint.b,
                Math.round(this.top * ratio * ratio)
            );
            g.rect(-w / 2, h / 2 - (i + 1) * (160 / steps), w, 160 / steps);
            g.fill();
            g.fillColor = new Color(
                this.tint.r,
                this.tint.g,
                this.tint.b,
                Math.round(this.bottom * ratio * ratio)
            );
            g.rect(-w / 2, -h / 2 + i * (256 / steps), w, 256 / steps);
            g.fill();
            if (this.right) {
                g.fillColor = new Color(
                    this.tint.r,
                    this.tint.g,
                    this.tint.b,
                    Math.round(this.right * ratio * ratio)
                );
                g.rect(w / 2 - (i + 1) * (800 / steps), -h / 2, 800 / steps, h);
                g.fill();
            }
        }
    }
}
