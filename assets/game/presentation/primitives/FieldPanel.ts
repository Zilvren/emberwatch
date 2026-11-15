import { _decorator, Color, Component, Graphics, Node, UITransform } from 'cc';
const { ccclass, property, requireComponent, executeInEditMode } = _decorator;

/** Fixed metal edges and canvas wear; geometry never changes with a render frame. */
@ccclass('FieldPanel')
@executeInEditMode
@requireComponent(Graphics)
export class FieldPanel extends Component {
    @property(Color) fill = new Color(38, 49, 40, 248);
    @property(Color) line = new Color(88, 103, 79, 255);
    @property(Color) accent = new Color(190, 160, 105, 255);
    @property edge = 7;
    @property marked = true;
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
        const w = ui.width / 2,
            h = ui.height / 2,
            edge = this.edge;
        g.clear();
        g.fillColor = this.fill;
        g.strokeColor = this.line;
        g.lineWidth = 1;
        g.moveTo(-w + edge, h);
        g.lineTo(w, h);
        g.lineTo(w, -h + edge);
        g.lineTo(w - edge, -h);
        g.lineTo(-w, -h);
        g.lineTo(-w, h - edge);
        g.close();
        g.fill();
        g.stroke();
        if (!this.marked) return;
        g.strokeColor = this.accent;
        g.lineWidth = 2;
        g.moveTo(-w + 14, h - 8);
        g.lineTo(-w + 48, h - 8);
        g.stroke();
        g.strokeColor = this.line;
        g.lineWidth = 1;
        for (const x of [-w + 9, w - 9])
            for (const y of [-h + 9, h - 9]) {
                g.circle(x, y, 1.5);
                g.stroke();
            }
        for (let i = 0; i < 3; i++) {
            g.moveTo(w - 35 + i * 7, -h + 6);
            g.lineTo(w - 29 + i * 7, -h + 12);
            g.stroke();
        }
    }
}
