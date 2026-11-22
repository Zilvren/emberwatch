import { _decorator, Color, Component, Graphics, Node, UITransform } from 'cc';
const { ccclass, property, requireComponent, executeInEditMode } = _decorator;

/** Quiet paper geometry. Edge variation is fixed, so it never jitters between frames. */
@ccclass('PaperPanel')
@executeInEditMode
@requireComponent(Graphics)
export class PaperPanel extends Component {
    @property(Color) fill = new Color(242, 234, 219, 255);
    @property(Color) line = new Color(111, 103, 87, 255);
    @property(Color) innerLine = new Color(179, 166, 142, 110);
    @property lineWidth = 1.2;
    @property corner = 5;
    fieldStock = false;
    metalTrim = false;
    onEnable(): void {
        this.node.on(Node.EventType.SIZE_CHANGED, this.redraw, this);
        this.redraw();
    }
    onDisable(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this.redraw, this);
    }
    redraw(): void {
        const g = this.getComponent(Graphics),
            size = this.getComponent(UITransform)?.contentSize;
        if (!g || !size) return;
        const w = size.width / 2,
            h = size.height / 2,
            r = this.corner;
        g.clear();
        g.fillColor = this.fill;
        g.strokeColor = this.line;
        g.lineWidth = this.lineWidth;
        g.moveTo(-w + r, -h);
        g.lineTo(w - r, -h + 0.35);
        g.lineTo(w, -h + r);
        g.lineTo(w - 0.3, h - r);
        g.lineTo(w - r, h);
        g.lineTo(-w + r, h - 0.25);
        g.lineTo(-w, h - r);
        g.lineTo(-w + 0.25, -h + r);
        g.close();
        g.fill();
        g.stroke();
        if (this.metalTrim) {
            const inset = Math.min(5, h * .24);
            g.strokeColor = this.innerLine;
            g.lineWidth = .8;
            g.moveTo(-w + inset, -h + inset + r);
            g.lineTo(-w + inset, h - inset - r);
            g.lineTo(-w + inset + r, h - inset);
            g.lineTo(w - inset - r, h - inset);
            g.lineTo(w - inset, h - inset - r);
            g.lineTo(w - inset, -h + inset + r);
            g.lineTo(w - inset - r, -h + inset);
            g.lineTo(-w + inset + r, -h + inset);
            g.close();
            g.stroke();
            return;
        }
        if (this.fieldStock) {
            g.strokeColor = new Color(40, 50, 56, 195);
            g.lineWidth = 2;
            g.moveTo(-w + 4, h - 29);
            g.lineTo(-w + 4, h - 9);
            g.lineTo(-w + 9, h - 4);
            g.lineTo(-w + 34, h - 4);
            g.stroke();
            g.lineWidth = 1.3;
            for (let i = 0; i < 3; i++) {
                g.moveTo(w - 11 - i * 5, -h + 5);
                g.lineTo(w - 6 - i * 5, -h + 10);
            }
            g.stroke();
        }
        g.strokeColor = this.innerLine;
        g.lineWidth = 0.65;
        g.moveTo(-w + 8, h - 5);
        g.lineTo(w - 8, h - 5.3);
        g.stroke();
    }
}
