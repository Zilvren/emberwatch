import { _decorator, Color, Component, Graphics, JsonAsset, Node, UITransform } from 'cc';
const { ccclass, property, requireComponent, executeInEditMode } = _decorator;

/** The deck is a small stack of worn cards, using the same ink and canvas as the actors. */
@ccclass('DeckStackGraphic')
@executeInEditMode
@requireComponent(Graphics)
export class DeckStackGraphic extends Component {
    @property(JsonAsset) theme: JsonAsset | null = null;
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
            h = size.height / 2 - 5,
            colors = this.theme?.json.colors,
            paper = new Color().fromHEX(colors?.paper ?? '#e2dac7'),
            shade = new Color().fromHEX(colors?.paperShade ?? '#c7c1af'),
            ink = new Color().fromHEX(colors?.line ?? '#727263');
        g.clear();
        for (let layer = 2; layer >= 0; layer--) {
            const x = layer * 2,
                y = layer * 2;
            g.fillColor = layer ? shade : paper;
            g.strokeColor = ink;
            g.lineWidth = 1;
            g.moveTo(-w + x + 3, -h + y);
            g.lineTo(w + x, -h + y + 0.4);
            g.lineTo(w + x, h + y - 3);
            g.lineTo(w + x - 3, h + y);
            g.lineTo(-w + x, h + y - 0.5);
            g.close();
            g.fill();
            g.stroke();
        }
        g.strokeColor = new Color().fromHEX(colors?.lineSoft ?? '#b3b09a');
        g.lineWidth = 0.8;
        g.rect(-w + 5, -h + 5, w * 2 - 10, h * 2 - 10);
        g.stroke();
        g.strokeColor = ink;
        g.lineWidth = 1.1;
        for (let card = 2; card >= 0; card--) {
            const x = card * 3 - 11,
                y = card * 2 + 3;
            g.moveTo(x, y);
            g.lineTo(x + 15, y + 2);
            g.lineTo(x + 13, y + 22);
            g.lineTo(x - 2, y + 20);
            g.close();
            g.stroke();
        }
        g.strokeColor = new Color().fromHEX(colors?.lineSoft ?? '#b3b09a');
        g.moveTo(-w + 7, -h + 10);
        g.lineTo(-w + 18, -h + 9);
        g.stroke();
    }
}
