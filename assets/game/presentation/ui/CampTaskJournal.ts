import { _decorator, Component, Node, Sprite, Color, UIOpacity, UITransform, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CampTaskJournal')
export class CampTaskJournal extends Component {
    @property(Node) spread: Node = null!;
    @property(Node) hinge: Node = null!;
    @property(Sprite) turningLeaf: Sprite = null!;
    @property(UIOpacity) writing: UIOpacity = null!;
    private readonly source = new Vec3();
    private readonly paper = new Color();
    private elapsed = 1;

    openFrom(world: Readonly<Vec3>, reduced: boolean): void {
        this.spread.parent!.getComponent(UITransform)!.convertToNodeSpaceAR(world, this.source);
        this.elapsed = reduced ? 1 : 0;
        this.pose();
    }
    finishOpening(): void {
        if (this.elapsed >= 1) return;
        this.elapsed = 1;
        this.pose();
    }
    update(dt: number): void {
        if (this.elapsed >= 1) return;
        this.elapsed = Math.min(1, this.elapsed + dt / 0.78);
        this.pose();
    }
    private pose(): void {
        const t = this.elapsed, away = (1 - t) ** 3;
        this.spread.setPosition(this.source.x * away, this.source.y * away);
        this.spread.setScale(1 - .92 * away, 1 - .965 * away, 1);
        this.spread.angle = -7 * away;
        const turn = Math.min(1, Math.max(0, (t - .13) / .74));
        const angle = Math.PI * turn, lifted = Math.sin(angle);
        this.hinge.active = turn < 1;
        this.hinge.setScale(Math.cos(angle), 1 + .055 * lifted, 1);
        this.hinge.angle = 3.5 * lifted;
        const light = Math.round(248 - 66 * lifted);
        this.paper.set(light, light - 4, light - 12, 255);
        this.turningLeaf.color = this.paper;
        this.writing.opacity = Math.round(255 * Math.min(1, Math.max(0, (t - .68) / .26)));
    }
}
