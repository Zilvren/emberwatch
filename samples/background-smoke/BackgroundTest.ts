import { _decorator, Component, Graphics, Label, Node, UITransform, Color } from 'cc';
import { EDITOR } from 'cc/env';

const { ccclass, executeInEditMode } = _decorator;

/** A small scene for checking Pink rendering, scripts, and touch input. */
@ccclass('BackgroundTest')
@executeInEditMode
export class BackgroundTest extends Component {
    private status: Label | null = null;
    private elapsed = 0;
    private clicks = 0;

    onLoad(): void {
        this.node.removeAllChildren();
        const graphics = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        graphics.clear();

        // The canvas uses a 1280 x 720 design resolution, centered at (0, 0).
        this.rectangle(graphics, -640, -360, 1280, 720, '#bfe9f2');
        this.rectangle(graphics, -640, -70, 1280, 240, '#d6eff0');
        this.disc(graphics, 370, 190, 73, '#fff1bc');
        this.disc(graphics, 370, 190, 53, '#ffd68a');
        this.cloud(graphics, -390, 195);
        this.cloud(graphics, 100, 245);

        this.hills(graphics, '#a9c4cf', [
            [-640, -90], [-490, 80], [-290, -50], [-90, 110], [150, -90],
            [340, 70], [640, -60],
        ]);
        this.hills(graphics, '#72a9b1', [
            [-640, -160], [-410, -35], [-170, -140], [80, 0],
            [300, -130], [480, -20], [640, -90],
        ]);
        this.hills(graphics, '#427d83', [
            [-640, -260], [-390, -145], [-100, -245], [170, -130],
            [410, -230], [640, -135],
        ]);
        this.hills(graphics, '#24575c', [
            [-640, -320], [-320, -235], [-10, -300], [320, -210], [640, -270],
        ]);

        this.text('Title', 'Hello, PinK.', -385, 35, 64, '#214d59', 450, 90);
        this.text('Subtitle', 'A little world, ready to begin.', -385, -28, 23,
            '#3f707b', 450, 42);
        this.text('Hint', 'Click anywhere to test input', 0, -296, 20,
            '#e5f7ed', 640, 40);
        this.status = this.text('Status', EDITOR ? 'PINK BACKGROUND TEST' : 'ENGINE RUNNING',
            0, -330, 17, '#b4dbd1', 900, 30);

        if (!EDITOR) {
            this.node.on(Node.EventType.TOUCH_END, this.onTouch, this);
            this.publishStatus();
            console.info('[PinkSmokeTest] scene loaded; rendering and scripts are ready');
        }
    }

    update(deltaTime: number): void {
        if (EDITOR) return;
        this.elapsed += deltaTime;
        if (this.status) {
            this.status.string = `ENGINE RUNNING  /  ${this.elapsed.toFixed(1)}s  /  CLICKS ${this.clicks}`;
        }
        this.publishStatus();
    }

    onDestroy(): void {
        this.node.off(Node.EventType.TOUCH_END, this.onTouch, this);
    }

    private onTouch(): void {
        this.clicks += 1;
        this.publishStatus();
    }

    private publishStatus(): void {
        Object.assign(globalThis, {
            __pinkSmokeTest: { ready: true, elapsed: this.elapsed, clicks: this.clicks },
        });
    }

    private color(hex: string): Color {
        const rgb = Number.parseInt(hex.slice(1), 16);
        return new Color((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255);
    }

    private rectangle(g: Graphics, x: number, y: number, w: number, h: number, hex: string): void {
        g.fillColor = this.color(hex);
        g.rect(x, y, w, h);
        g.fill();
    }

    private disc(g: Graphics, x: number, y: number, radius: number, hex: string): void {
        g.fillColor = this.color(hex);
        g.circle(x, y, radius);
        g.fill();
    }

    private cloud(g: Graphics, x: number, y: number): void {
        this.disc(g, x - 32, y, 25, '#f4fcf8');
        this.disc(g, x, y + 11, 35, '#f4fcf8');
        this.disc(g, x + 36, y, 25, '#f4fcf8');
        this.rectangle(g, x - 32, y - 24, 68, 36, '#f4fcf8');
    }

    private hills(g: Graphics, hex: string, points: number[][]): void {
        g.fillColor = this.color(hex);
        g.moveTo(-640, -360);
        for (const [x, y] of points) g.lineTo(x, y);
        g.lineTo(640, -360);
        g.close();
        g.fill();
    }

    private text(name: string, content: string, x: number, y: number, size: number,
        hex: string, width: number, height: number): Label {
        const node = new Node(name);
        node.layer = this.node.layer;
        this.node.addChild(node);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.string = content;
        label.fontSize = size;
        label.lineHeight = size + 8;
        label.color = this.color(hex);
        label.fontFamily = 'Arial';
        label.isBold = name === 'Title';
        return label;
    }
}
