import {
    _decorator,
    Color,
    Component,
    Graphics,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    Tween,
    tween,
    UITransform,
    Vec3,
    warn,
} from 'cc';
const { ccclass, property } = _decorator;

const roomPaintings = new Map([
    ['hornCourt', 'horn-court'],
    ['quarryHall', 'broken-column-quarry'],
    ['floodedVault', 'flooded-vault'],
    ['windPerch', 'windworn-perch'],
    ['galeRoost', 'twin-wind-gallery'],
    ['ebbWell', 'ebb-well'],
    ['clashingPass', 'clashing-pass'],
]);
type MazeLook = 'labyrinth' | 'court';
interface RoomPainting {
    name: string;
    fallback: MazeLook;
    frame: SpriteFrame | null;
}

/** Scene depth and short impact feedback; no game rules or character scaling. */
@ccclass('SceneAtmosphere')
export class SceneAtmosphere extends Component {
    @property(Node) backdrop: Node | null = null;
    @property(Graphics) dust: Graphics | null = null;
    @property(SpriteFrame) labyrinthBackdrop: SpriteFrame | null = null;
    @property(SpriteFrame) labyrinthCourt: SpriteFrame | null = null;
    private previousBackdrop: SpriteFrame | null = null;
    private roomPainting: RoomPainting | null = null;

    setLook(look: MazeLook | 'legacy'): void {
        const sprite = this.backdrop?.getComponent(Sprite);
        if (sprite) {
            this.previousBackdrop ??= sprite.spriteFrame;
            const frame = (look === 'court' ? this.labyrinthCourt
                : look === 'labyrinth' ? this.labyrinthBackdrop : null) ?? this.previousBackdrop;
            this.showFrame(sprite, frame);
        }
        this.roomPainting?.frame?.decRef();
        this.roomPainting = null;
    }

    setRoom(room: string, fallback: MazeLook = 'labyrinth'): void {
        const name = roomPaintings.get(room);
        if (name && name === this.roomPainting?.name) return;
        this.setLook(fallback);
        const sprite = this.backdrop?.getComponent(Sprite);
        if (!name || !sprite) return;
        const request: RoomPainting = { name, fallback, frame: null };
        this.roomPainting = request;
        const path = `art/battle-rooms/${name}/spriteFrame`;
        const accept = (frame: SpriteFrame) => {
            frame.addRef();
            // A late download can complete after leaving this room or returning to it.
            if (this.roomPainting !== request || !sprite.isValid) {
                frame.decRef();
                return;
            }
            request.frame = frame;
            this.showFrame(sprite, frame);
        };
        const cached = resources.get(path, SpriteFrame);
        if (cached) accept(cached);
        else resources.load(path, SpriteFrame, (error, frame) => {
            if (!error && frame) accept(frame);
            else if (this.roomPainting === request) {
                this.roomPainting = null;
                warn(`无法载入房间背景 ${path}`, error);
            }
        });
    }

    private showFrame(sprite: Sprite, frame: SpriteFrame | null): void {
        if (sprite.spriteFrame === frame) return;
        sprite.spriteFrame = frame;
        const fit = this.lastFit;
        if (fit) this.fitBackdrop(fit.width, fit.height, fit.centerY, fit.floorY);
    }
    private elapsed = 0;
    private reduced = false;
    private query: MediaQueryList | null = null;
    private home = new Vec3();
    private backdropHome = new Vec3();
    private authoredBackdrop: { height: number; y: number; x: number } | null = null;
    private lastFit: { width: number; height: number; centerY: number; floorY: number } | null = null;
    /** Preserve the painted floor under the actors while covering the whole visible window. */
    fitBackdrop(width: number, height: number, centerY = 0, floorY = 0): void {
        this.lastFit = { width, height, centerY, floorY };
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
        if (this.roomPainting) this.setLook(this.roomPainting.fallback);
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
