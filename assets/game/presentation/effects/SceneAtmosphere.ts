import {
    _decorator,
    Color,
    Component,
    Graphics,
    Node,
    Sprite,
    SpriteFrame,
    Tween,
    tween,
    UITransform,
    Vec3,
} from 'cc';
const { ccclass, property } = _decorator;

/** Scene depth and short impact feedback; no game rules or character scaling. */
@ccclass('SceneAtmosphere')
export class SceneAtmosphere extends Component {
    @property(Node) backdrop: Node | null = null;
    @property(Graphics) dust: Graphics | null = null;
    @property(SpriteFrame) tideBackdrop: SpriteFrame | null = null;
    @property(SpriteFrame) labyrinthBackdrop: SpriteFrame | null = null;
    @property(SpriteFrame) labyrinthCourt: SpriteFrame | null = null;
    private previousBackdrop: SpriteFrame | null = null;
    setFieldLook(field: boolean): void {
        this.setLook(field ? 'tide' : 'legacy');
    }
    setLook(look: 'tide' | 'labyrinth' | 'court' | 'legacy'): void {
        const sprite = this.backdrop?.getComponent(Sprite);
        if (!sprite) return;
        if (!this.previousBackdrop) this.previousBackdrop = sprite.spriteFrame;
        sprite.spriteFrame = (look === 'tide' ? this.tideBackdrop
            : look === 'court' ? this.labyrinthCourt
            : look === 'labyrinth' ? this.labyrinthBackdrop : null) ?? this.previousBackdrop;
    }
    private elapsed = 0;
    private reduced = false;
    private query: MediaQueryList | null = null;
    private home = new Vec3();
    private backdropHome = new Vec3();
    private authoredBackdrop: { height: number; y: number; x: number } | null = null;
    /** Preserve the painted floor under the actors while covering the whole visible window. */
    fitBackdrop(width: number, height: number, centerY = 0, floorY = 0): void {
        const node = this.backdrop, frame = node?.getComponent(Sprite)?.spriteFrame;
        const ui = node?.getComponent(UITransform);
        if (!node || !frame || !ui) return;
        if (!this.authoredBackdrop)
            this.authoredBackdrop = { height: ui.height * node.scale.y, y: node.position.y, x: node.position.x };
        const base = this.authoredBackdrop;
        const aspect = frame.originalSize.width / frame.originalSize.height;
        const floorFraction = Math.max(.1, Math.min(.9, .5 + (floorY - base.y) / base.height));
        const coverHeight = Math.max(base.height, (width + 16 + 2 * Math.abs(base.x)) / aspect,
            (height / 2 + floorY - centerY + 4) / floorFraction,
            (height / 2 + centerY - floorY + 4) / (1 - floorFraction));
        ui.setContentSize(coverHeight * aspect / node.scale.x, coverHeight / node.scale.y);
        this.backdropHome.set(base.x, floorY + (.5 - floorFraction) * coverHeight, node.position.z);
        node.setPosition(this.backdropHome);
    }
    setRestingHeight(y: number): void {
        if (y === this.home.y) return;
        Tween.stopAllByTarget(this.node);
        this.home.y = y;
        this.node.setPosition(this.home);
    }
    onLoad(): void {
        this.home = this.node.position.clone();
        this.backdropHome = this.backdrop?.position.clone() ?? new Vec3();
        this.query =
            typeof matchMedia === 'undefined'
                ? null
                : matchMedia('(prefers-reduced-motion: reduce)');
        this.reduced = this.query?.matches ?? false;
    }
    onEnable(): void {
        this.query?.addEventListener('change', this.motionChanged);
        this.drawDust();
    }
    onDisable(): void {
        this.query?.removeEventListener('change', this.motionChanged);
        Tween.stopAllByTarget(this.node);
        this.node.setPosition(this.home);
        this.backdrop?.setPosition(this.backdropHome);
    }
    private motionChanged = (event: MediaQueryListEvent) => {
        this.reduced = event.matches;
        if (this.reduced) {
            Tween.stopAllByTarget(this.node);
            this.node.setPosition(this.home);
            this.backdrop?.setPosition(this.backdropHome);
        }
    };
    update(dt: number): void {
        if (this.reduced) return;
        this.elapsed += dt;
        this.backdrop?.setPosition(
            this.backdropHome.x + Math.sin(this.elapsed * 0.12) * 3,
            this.backdropHome.y,
            this.backdropHome.z
        );
        this.drawDust();
    }
    private drawDust(): void {
        const g = this.dust;
        if (!g) return;
        const size = this.node.getComponent(UITransform)?.contentSize;
        const width = size?.width ?? 1440,
            height = size?.height ?? 900;
        g.clear();
        for (let i = 0; i < 17; i++) {
            const x = ((i * 173 + this.elapsed * (8 + (i % 3))) % (width + 60)) - width / 2 - 30;
            const y = ((i * 97) % height) - height / 2 + Math.sin(this.elapsed * 0.3 + i) * 4;
            g.fillColor = new Color(219, 199, 157, 18 + (i % 4) * 4);
            g.circle(x, y, i % 4 === 0 ? 1.5 : 0.7);
            g.fill();
        }
    }
    impact(reduced: boolean): void {
        if (reduced || this.reduced) return;
        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .to(0.03, { position: new Vec3(this.home.x + 3, this.home.y, this.home.z) })
            .to(0.04, { position: new Vec3(this.home.x - 2, this.home.y + 1, this.home.z) })
            .to(0.07, { position: this.home.clone() }, { easing: 'quadOut' })
            .start();
    }
    inspect(): object {
        return {
            reduced: this.reduced,
            elapsed: this.elapsed,
            x: this.node.position.x,
            y: this.node.position.y,
        };
    }
}
