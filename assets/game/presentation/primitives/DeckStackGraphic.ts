import { _decorator, Color, Component, Graphics, Node, UITransform } from 'cc';
const { ccclass, requireComponent, executeInEditMode } = _decorator;

/** The deck is a small stack of worn cards, using the same ink and canvas as the actors. */
@ccclass('DeckStackGraphic')
@executeInEditMode
@requireComponent(Graphics)
export class DeckStackGraphic extends Component {
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
        const w = size.width / 2 - 5,
            h = size.height / 2 - 5;
        g.clear();
        for (let layer = 2; layer >= 0; layer--) {
            const x = layer * 2,
                y = layer * 2;
            g.fillColor = new Color(layer ? 154 : 196, layer ? 147 : 185, layer ? 116 : 150, 255);
            g.strokeColor = new Color(78, 77, 59, 255);
            g.lineWidth = 1.3;
            g.moveTo(-w + x + 3, -h + y);
            g.lineTo(w + x, -h + y + 0.4);
            g.lineTo(w + x, h + y - 3);
            g.lineTo(w + x - 3, h + y);
            g.lineTo(-w + x, h + y - 0.5);
            g.close();
            g.fill();
            g.stroke();
        }
        g.strokeColor = new Color(111, 112, 81, 210);
        g.lineWidth = 0.8;
        g.rect(-w + 5, -h + 5, w * 2 - 10, h * 2 - 10);
        g.stroke();
        g.fillColor = new Color(99, 108, 73, 255);
        g.rect(-4, 1, 8, 23);
        g.fill();
        g.rect(-12, 8, 24, 8);
        g.fill();
        g.strokeColor = new Color(132, 127, 97, 150);
        g.moveTo(-w + 7, -h + 10);
        g.lineTo(-w + 18, -h + 9);
        g.stroke();
    }
}
