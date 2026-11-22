import { Color, Graphics, Node, UITransform, Vec3 } from 'cc';
import { ActorPresentation } from '../actors/ActorPresentation';

/** Register the HUD against the low buoy or the hovering rotor, using the same native inputs and labels. */
export class TideBattleLayout {
    private readonly originals = new Map<
        Node,
        { position: Vec3; scale: Vec3; width: number; height: number }
    >();
    private plaque: Node | null = null;
    private instrumentIcon: Node | null = null;
    private mode = 'legacy';
    constructor(private readonly screen: Node) {}
    show(field: boolean, rotor: boolean, labyrinth = false): void {
        const mode = labyrinth ? 'labyrinth' : field ? (rotor ? 'rotor' : 'buoy') : 'legacy';
        if (mode === this.mode) return;
        this.mode = mode;
        for (const [node, before] of this.originals) {
            node.setPosition(before.position);
            node.setScale(before.scale);
            node.getComponent(UITransform)?.setContentSize(before.width, before.height);
        }
        if (!field) {
            if (this.plaque) this.plaque.active = false;
            if (this.instrumentIcon) this.instrumentIcon.active = false;
            this.screen.getChildByName('WeaponSlot')!.getChildByName('Pixel icon')!.active = true;
            return;
        }
        const place = (name: string, x: number, y: number, width?: number, height?: number) => {
            const node = this.screen.getChildByName(name)!;
            this.remember(node);
            node.setPosition(x, y, 0);
            if (width && height) node.getComponent(UITransform)!.setContentSize(width, height);
            return node;
        };
        const y = labyrinth ? 309 : rotor ? 315 : 177;
        place('banner-text1', 272, y, 162, 33);
        place('battle-text5', 438, y, 153, 28);
        place('enemyTrack', 350, y - 20, 308, 4);
        place('enemyFill', 350, y - 20);
        place('battle-text0', 265, y - 44, 152, 30);
        place('battle-text1', 430, y - 44, 172, 28);
        if (labyrinth) place('enemy-target', 325, 22, 390, 380);
        else place('enemy-target', 350, rotor ? 20 : -68, rotor ? 278 : 303, rotor ? 398 : 213);
        place('Hand', 0, -306).setScale(0.93, 0.93, 1);
        place('battle-text9', 0, -151);
        const slot = place('WeaponSlot', 23, 170);
        const oldIcon = slot.getChildByName('Pixel icon')!;
        oldIcon.active = false;
        if (!this.instrumentIcon) {
            this.instrumentIcon = new Node('TideInstrument');
            this.instrumentIcon.layer = slot.layer;
            this.instrumentIcon.parent = slot;
            this.instrumentIcon.setPosition(oldIcon.position);
            const symbol = this.instrumentIcon.addComponent(Graphics);
            symbol.strokeColor = new Color(108, 221, 211);
            symbol.lineWidth = 4;
            symbol.ellipse(0, 2, 18, 12);
            symbol.stroke();
            symbol.strokeColor = new Color(226, 201, 139);
            symbol.lineWidth = 3;
            symbol.moveTo(-10, -9);
            symbol.lineTo(-14, -18);
            symbol.stroke();
        }
        this.instrumentIcon.active = true;
        const world = this.screen.getChildByName('World')!;
        for (const actor of world.getComponentsInChildren(ActorPresentation)) {
            this.remember(actor.node);
            const original = this.originals.get(actor.node)!.position;
            if (labyrinth) {
                if (actor.actorId === 'player') {
                    actor.node.setPosition(-320, -168, original.z);
                    actor.node.setScale(.90, .90, 1);
                }
            } else if (['player', 'wanderer', 'brute'].indexOf(actor.actorId) >= 0)
                actor.node.setPosition(original.x, original.y + (actor.actorId === 'brute' ? 39 : 28), original.z);
        }
        if (!this.plaque) {
            this.plaque = new Node('IntentPlaque');
            this.plaque.layer = this.screen.layer;
            this.plaque.parent = this.screen;
            this.plaque.setSiblingIndex(world.getSiblingIndex() + 1);
            this.plaque.addComponent(Graphics);
        }
        const g = this.plaque.getComponent(Graphics)!;
        g.clear();
        g.fillColor = labyrinth ? new Color(35, 28, 45, 239) : new Color(30, 37, 49, 226);
        g.strokeColor = labyrinth ? new Color(132, 108, 122, 230) : new Color(172, 179, 172, 165);
        g.lineWidth = 1;
        g.moveTo(-164, 20);
        g.lineTo(159, 20);
        g.lineTo(170, 10);
        g.lineTo(170, -53);
        g.lineTo(159, -63);
        g.lineTo(-158, -63);
        g.lineTo(-170, -51);
        g.lineTo(-170, 13);
        g.close();
        g.fill();
        g.stroke();
        g.strokeColor = labyrinth ? new Color(215, 171, 131, 240) : new Color(116, 200, 186, 230);
        g.lineWidth = 2;
        g.moveTo(-164, 10);
        g.lineTo(-164, -17);
        g.stroke();
        this.plaque.active = true;
        this.plaque.setPosition(350, y, 0);
    }
    private remember(node: Node): void {
        if (this.originals.has(node)) return;
        const ui = node.getComponent(UITransform);
        this.originals.set(node, {
            position: node.position.clone(),
            scale: node.scale.clone(),
            width: ui?.width ?? 0,
            height: ui?.height ?? 0,
        });
    }
}
