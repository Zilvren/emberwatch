import { Color, Graphics, HorizontalTextAlignment, Label, Node, Sprite, SpriteFrame, UITransform, VerticalTextAlignment, tween, Tween, Vec3 } from 'cc';
import { CardKind } from './SurvivalRules';
export const P = { bg: '#221d27', panel: '#302a31', panel2: '#3c3337', line: '#66534f', paper: '#e5ceb0', ink: '#352d34',
    muted: '#b09a88', dim: '#786965', amber: '#efb56f', orange: '#cb7957', green: '#a7ba9a', red: '#df8269', white: '#fae7ca' };
export function color(hex: string, alpha = 255): Color {
    const n = parseInt(hex.replace('#', ''), 16);
    return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, alpha);
}
export class PixelUI {
    constructor(public root: Node, public width = 1440, public height = 900) { }
    node(name: string, x: number, y: number, w: number, h: number, parent = this.root): Node {
        const n = new Node(name);
        n.layer = this.root.layer;
        parent.addChild(n);
        n.setPosition(x + w / 2 - this.width / 2, this.height / 2 - y - h / 2);
        n.addComponent(UITransform).setContentSize(w, h);
        return n;
    }
    rect(x: number, y: number, w: number, h: number, fill: string, border?: string, parent = this.root, alpha = 255): Node {
        const n = this.node('Panel', x, y, w, h, parent);
        const g = n.addComponent(Graphics);
        g.fillColor = color(fill, alpha);
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        if (border) {
            g.strokeColor = color(border);
            g.lineWidth = 2;
            g.rect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
            g.stroke();
        }
        return n;
    }
    text(text: string, x: number, y: number, w: number, h: number, size = 20, tint = P.paper, bold = false, align: 'left' | 'center' | 'right' = 'left', parent = this.root): Label {
        const n = this.node('Text', x, y, w, h, parent);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = Math.ceil(size * 1.4);
        l.color = color(tint);
        l.fontFamily = 'Microsoft YaHei';
        l.isBold = bold;
        l.horizontalAlign = align === 'center' ? HorizontalTextAlignment.CENTER : align === 'right' ? HorizontalTextAlignment.RIGHT : HorizontalTextAlignment.LEFT;
        l.verticalAlign = VerticalTextAlignment.CENTER;
        l.overflow = Label.Overflow.SHRINK;
        l.enableWrapText = true;
        return l;
    }
    button(text: string, x: number, y: number, w: number, h: number, action: () => void, style: 'primary' | 'normal' | 'danger' = 'normal', enabled = true, parent = this.root): Node {
        const fill = !enabled ? P.panel2 : style === 'primary' ? P.amber : style === 'danger' ? '#713f3a' : P.panel2;
        const outline = !enabled ? P.line : style === 'primary' ? '#fbd8a0' : style === 'danger' ? P.red : '#8d7766';
        const n = this.node('Button ' + text, x, y, w, h, parent);
        const g = n.addComponent(Graphics);
        const paint = (hover = false) => { g.clear(); g.fillColor = color(hover && enabled ? style === 'primary' ? '#f6ca89' : '#514148' : fill); g.rect(-w / 2, -h / 2, w, h); g.fill(); g.lineWidth = 2; g.strokeColor = color(outline); g.rect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2); g.stroke(); };
        paint();
        const labelNode = new Node('Caption');
        labelNode.layer = n.layer;
        n.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(w - 16, h - 8);
        const l = labelNode.addComponent(Label);
        l.string = text;
        l.fontFamily = 'Microsoft YaHei';
        l.fontSize = 19;
        l.lineHeight = 26;
        l.isBold = true;
        l.color = color(!enabled ? P.dim : style === 'primary' ? P.ink : P.paper);
        l.horizontalAlign = HorizontalTextAlignment.CENTER;
        l.verticalAlign = VerticalTextAlignment.CENTER;
        l.overflow = Label.Overflow.SHRINK;
        n.on(Node.EventType.TOUCH_START, () => { if (enabled)
            tween(n).to(.1, { scale: new Vec3(.98, .98, 1) }, { easing: 'quadOut' }).start(); });
        n.on(Node.EventType.TOUCH_END, () => { if (enabled) {
            Tween.stopAllByTarget(n);
            n.setScale(1, 1, 1);
            action();
        } });
        n.on(Node.EventType.TOUCH_CANCEL, () => { Tween.stopAllByTarget(n); n.setScale(1, 1, 1); });
        n.on(Node.EventType.MOUSE_ENTER, () => paint(true));
        n.on(Node.EventType.MOUSE_LEAVE, () => paint(false));
        return n;
    }
    line(points: number[][], tint = P.line, width = 2, parent = this.root): void {
        const n = this.node('Line', 0, 0, this.width, this.height, parent);
        const g = n.addComponent(Graphics);
        g.strokeColor = color(tint);
        g.lineWidth = width;
        points.forEach(([x, y], i) => i ? g.lineTo(x - this.width / 2, this.height / 2 - y) : g.moveTo(x - this.width / 2, this.height / 2 - y));
        g.stroke();
    }
    image(frame: SpriteFrame, x: number, y: number, w: number, h: number, alpha = 255, parent = this.root): Node {
        const n = this.node('Dusk depot', x, y, w, h, parent);
        const s = n.addComponent(Sprite);
        s.spriteFrame = frame;
        s.sizeMode = Sprite.SizeMode.CUSTOM;
        n.getComponent(UITransform)!.setContentSize(w, h);
        s.color = new Color(255, 255, 255, alpha);
        return n;
    }
    bar(x: number, y: number, w: number, value: number, max: number, tint = P.amber, parent = this.root): void {
        this.rect(x, y, w, 8, '#1b171e', undefined, parent);
        this.rect(x, y, w * Math.max(0, Math.min(1, value / max)), 8, tint, undefined, parent);
    }
    polygon(points: number[][], fill: string, alpha = 255): Node {
        const n = this.node('Pixel shape', 0, 0, this.width, this.height);
        const g = n.addComponent(Graphics);
        g.fillColor = color(fill, alpha);
        points.forEach(([x, y], i) => i ? g.lineTo(x - this.width / 2, this.height / 2 - y) : g.moveTo(x - this.width / 2, this.height / 2 - y));
        g.close();
        g.fill();
        return n;
    }
    frame(x: number, y: number, w: number, h: number, tint = P.panel, border = P.line): Node {
        this.rect(x + 5, y + 6, w, h, '#130f18', undefined, this.root, 150);
        const n = this.rect(x, y, w, h, tint, border);
        this.rect(x + 4, y + 4, w - 8, 2, '#8c7460', undefined, this.root, 95);
        for (const [cx, cy] of [[x, y], [x + w - 5, y], [x, y + h - 5], [x + w - 5, y + h - 5]])
            this.rect(cx, cy, 5, 5, border);
        return n;
    }
    ellipse(x: number, y: number, w: number, h: number, tint: string, alpha = 255): Node {
        const n = this.node('Shadow', x, y, w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = color(tint, alpha);
        g.ellipse(0, 0, w / 2, h / 2);
        g.fill();
        return n;
    }
    pixelArt(rows: string[], palette: Record<string, string>, x: number, y: number, scale: number, parent = this.root): void {
        const n = this.node('Pixel artwork', 0, 0, this.width, this.height, parent);
        const g = n.addComponent(Graphics);
        for (const key of Object.keys(palette)) {
            g.fillColor = color(palette[key]);
            for (let row = 0; row < rows.length; row++)
                for (let col = 0; col < rows[row].length; col++)
                    if (rows[row][col] === key)
                        g.rect(x + col * scale - this.width / 2, this.height / 2 - y - (row + 1) * scale, scale, scale);
            g.fill();
        }
    }
    icon(kind: CardKind, x: number, y: number, scale = 5, parent = this.root): void {
        const icons: Record<string, string[]> = {
            attack: ['........oo', '.......ooo', '......ooo.', '.....ooo..', '....ooo...', '...ooo....', '..ooo.....', '.xxx......', '..xx......', '.xx.......', 'xx........'],
            slash: ['.........o', '........oo', '.......ooo', '.....oooo.', '....oooo..', '...ooo....', '..ooo.....', '.xxx......', '..xx......', '.xx.......', 'xx........'],
            knife: ['.....ooooo', '....oooooo', '...ooooooo', '...ooooooo', '...ooooooo', '...oooooo.', '..xxxx....', '..xxxx....', '..xx......', '..xx......', '..xx......'],
            dodge: ['.oooooooo.', 'oooooooooo', 'oo......oo', 'oo......oo', '.oo....oo.', '.oo....oo.', '..oo..oo..', '..oo..oo..', '...oooo...', '....oo....'],
            evade: ['.oooooooo.', 'oooooooooo', 'oo..xx..oo', 'oo.xxxx.oo', '.o.xxxx.o.', '.oo.xx.oo.', '..oo..oo..', '..oo..oo..', '...oooo...', '....oo....'],
            repair: ['...oooo...', '...oooo...', '...oooo...', 'oooooooooo', 'oooooooooo', 'oooooooooo', '...oooo...', '...oooo...', '...oooo...'],
            heavy: ['..oooooooo', '..oooooooo', '..oooooooo', '..oooooooo', '.....xx...', '.....xx...', '.....xx...', '.....xx...', '.....xx...', '.....xx...', '....xxxx..'],
            cash: ['ooooooooooo', 'oxxxxxxxxoo', 'oxoooooxxoo', 'oxooxoxxxoo', 'oxoooooxxoo', 'oxxxxxxxxoo', 'ooooooooooo'],
        };
        this.pixelArt(icons[kind] ?? icons.attack, { o: '#b77854', x: '#52434b' }, x, y, scale, parent);
    }
    infected(x: number, y: number, boss = false): void {
        const rows = [
            '.......kkkkkk.......', '......kggggggk......', '.....kgggllgggk.....', '.....kggglggggk.....', '.....kgrgggrggk.....', '......kggggggk......', '.......kggggk.......', '......kkggggkk......',
            '....kkbbbbbbbbkk....', '...kbbbblbbbbbgbk...', '..kgbbbblbbbbbbbgk..', '..kgbbbblbbbbbbbgk..', '..kggbbbllbbbbbggk..', '...kgbbbblbbbbbgk...', '...kgbbbblbbbbbgk...', '...kgbbblbbbbbbgk...',
            '..kggbbbbbbbbbbggk..', '..kggbbbbbbbbbbggk..', '...kkbbkkkkbbkkk....', '.....kbk..kbk.......', '.....kbk..kbk.......', '.....kbk..kbbk......', '....kbbk...kbk......', '....kbbk...kbk......', '...kbbbk...kbbk.....', '...kkkkk...kkkk.....',
        ];
        this.pixelArt(rows, { k: '#241e2a', g: boss ? '#988973' : '#a5a084', l: '#c0ad84', r: '#edaa68', b: boss ? '#8b5351' : '#68726c' }, x, y, boss ? 9 : 8);
    }
}
