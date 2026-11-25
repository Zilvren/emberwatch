import { _decorator, Color, Component, Graphics } from 'cc';
const { ccclass, requireComponent } = _decorator;

@ccclass('CampEmbers')
@requireComponent(Graphics)
export class CampEmbers extends Component {
    private elapsed = 0;
    private frameTime = 0;
    private ink = new Color(255, 178, 100, 0);
    private media: MediaQueryList | null = null;

    onEnable(): void {
        this.media = typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-reduced-motion: reduce)');
        this.media?.addEventListener('change', this.clear);
    }
    onDisable(): void {
        this.media?.removeEventListener('change', this.clear);
        this.clear();
    }
    private clear = () => this.getComponent(Graphics)?.clear();

    update(dt: number): void {
        if (this.media?.matches) return;
        this.elapsed += dt;
        this.frameTime += dt;
        if (this.frameTime < 1 / 24) return;
        this.frameTime = 0;
        const g = this.getComponent(Graphics)!;
        g.clear();
        for (let i = 0; i < 9; i++) {
            const t = (this.elapsed * (0.27 + (i % 3) * 0.045) + i * 0.347) % 1;
            const x = Math.sin(i * 29) * 26 + t * 22 + Math.sin(this.elapsed * 1.7 + i) * 5;
            const y = 6 + t * (82 + (i % 4) * 17);
            this.ink.a = Math.round(Math.sin(t * Math.PI) * (128 + (i % 3) * 22));
            g.fillColor = this.ink;
            g.ellipse(x, y, 0.9 + (i % 3) * 0.22, 1.4 + i % 2);
            g.fill();
        }
    }
}
