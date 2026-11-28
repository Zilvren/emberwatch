import { _decorator, Color, Component, game, Graphics, Material, Sprite, Vec4 } from 'cc';
import { ButtonPresentation } from '../ui/ButtonPresentation';
import type { ButtonState } from '../ui/ButtonStyle';
const { ccclass, property, requireComponent } = _decorator;
const illumination: Record<ButtonState, number> = { normal: 0, disabled: 0, hover: 1, focus: 1, pressed: 1.35 };

@ccclass('CampAtmosphere')
@requireComponent(Graphics)
export class CampAtmosphere extends Component {
    @property(Sprite) painting: Sprite | null = null;
    @property(ButtonPresentation) gate: ButtonPresentation | null = null;
    @property(ButtonPresentation) keeper: ButtonPresentation | null = null;
    @property(ButtonPresentation) bench: ButtonPresentation | null = null;
    @property(ButtonPresentation) warehouse: ButtonPresentation | null = null;
    @property(ButtonPresentation) journal: ButtonPresentation | null = null;
    @property(Sprite) journalArt: Sprite | null = null;
    private material: Material | null = null;
    private sparks!: Graphics;
    private readonly light = new Vec4();
    private readonly paperTint = new Color();
    private readonly motion = new Vec4();
    private elapsed = 0;
    private frameTime = 0;
    private readonly ink = new Color(255, 188, 110, 0);
    private media: MediaQueryList | null = null;
    private previousCursor: string | null = null;

    onLoad(): void {
        this.sparks = this.getComponent(Graphics)!;
        this.material = this.painting?.getMaterialInstance(0) ?? null;
        this.media = typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-reduced-motion: reduce)');
    }

    onEnable(): void {
        this.media?.addEventListener('change', this.draw);
        this.draw();
    }

    onDisable(): void {
        this.media?.removeEventListener('change', this.draw);
        this.point(false);
        this.sparks.clear();
    }

    update(dt: number): void {
        if (!this.media?.matches) this.elapsed += dt;
        this.frameTime += dt;
        if (this.frameTime < 1 / 30) return;
        this.frameTime %= 1 / 30;
        this.draw();
    }

    private point(over: boolean): void {
        const style = game.canvas?.style;
        if (!style) return;
        if (over && this.previousCursor === null) {
            this.previousCursor = style.cursor;
            style.cursor = 'pointer';
        } else if (!over && this.previousCursor !== null) {
            style.cursor = this.previousCursor;
            this.previousCursor = null;
        }
    }

    private draw = (): void => {
        const keeper = this.keeper?.state ?? 'disabled', bench = this.bench?.state ?? 'disabled';
        const warehouse = this.warehouse?.state ?? 'disabled', journal = this.journal?.state ?? 'disabled';
        const gate = this.gate?.state ?? 'disabled';
        this.point(gate === 'hover' || keeper === 'hover' || bench === 'hover' || warehouse === 'hover' || journal === 'hover');
        this.light.set(illumination[keeper], illumination[bench], illumination[warehouse], 0);
        if (this.journalArt) {
            const amount = Math.min(1, illumination[journal]);
            this.paperTint.set(223 + 32 * amount, 197 + 58 * amount, 174 + 71 * amount, 255);
            this.journalArt.color = this.paperTint;
        }
        const reduced = this.media?.matches;
        const t = reduced ? 0 : this.elapsed;
        this.motion.set(t, reduced ? 0 : 1, 0.7 * Math.sin(t * 1.45) + 0.3 * Math.sin(t * 2.35), illumination[gate]);
        this.material?.setProperty('fireMotion', this.motion);
        this.material?.setProperty('stationLight', this.light);
        const g = this.sparks;
        g.clear();
        if (reduced) return;
        const cycle = Math.floor(t / 9);
        const breeze = Math.sin(cycle * 2.4);
        const life = (t % 9 - 3 - 1.5 * breeze) / 1.8;
        if (life <= 0 || life >= 1) return;
        this.ink.a = Math.round(78 * Math.sin(life * Math.PI));
        g.fillColor = this.ink;
        g.ellipse(12 * breeze + 4 * life, 76 + 38 * life, 0.85, 1.3);
        g.fill();
    };
}
