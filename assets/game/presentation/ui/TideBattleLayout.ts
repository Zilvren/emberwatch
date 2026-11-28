import { Color, Graphics, Node, UITransform, Vec3 } from 'cc';
import { ActorPresentation } from '../actors/ActorPresentation';
import { HandPresentation } from '../cards/HandPresentation';
import { SceneAtmosphere } from '../effects/SceneAtmosphere';
import { battleWindowLayout } from './BattleWindowLayout';

/** Position the encounter HUD against the active actor's resting pose. */
export class TideBattleLayout {
    private readonly originalActors = new Map<Node, { position: Vec3; scale: Vec3 }>();
    private instrumentIcon: Node | null = null;
    private mode = '';
    private frame = battleWindowLayout(1440, 900);
    private enemy: ActorPresentation | null = null;
    private field = false;
    private labyrinth = false;
    constructor(private readonly screen: Node) {}
    fitWindow(frame: ReturnType<typeof battleWindowLayout>): void {
        if (frame.width === this.frame.width && frame.height === this.frame.height && frame.scale === this.frame.scale) return;
        this.screen.getChildByName('Hand')!.getComponent(HandPresentation)!.cancelGestures();
        this.frame = frame;
        this.placeInWindow();
    }
    show(enemy: ActorPresentation, field: boolean, labyrinth: boolean): void {
        const mode = (labyrinth ? 'labyrinth/' : field ? 'tide/' : 'legacy/') + enemy.actorId;
        if (mode === this.mode) return;
        this.mode = mode;
        this.enemy = enemy;
        this.field = field;
        this.labyrinth = labyrinth;
        for (const [node, before] of this.originalActors) {
            node.setPosition(before.position);
            node.setScale(before.scale);
        }
        const slot = this.screen.getChildByName('WeaponSlot')!;
        const oldIcon = slot.getChildByName('Pixel icon')!;
        oldIcon.active = !field;
        if (!field) {
            if (this.instrumentIcon) this.instrumentIcon.active = false;
            this.placeInWindow();
            return;
        }
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
            if (!this.originalActors.has(actor.node))
                this.originalActors.set(actor.node, { position: actor.node.position.clone(), scale: actor.node.scale.clone() });
            const original = this.originalActors.get(actor.node)!.position;
            if (labyrinth) {
                if (actor.actorId === 'player') {
                    actor.node.setPosition(-320, -168, original.z);
                    actor.node.setScale(.90, .90, 1);
                }
            } else if (['player', 'wanderer', 'brute'].indexOf(actor.actorId) >= 0)
                actor.node.setPosition(original.x, original.y + (actor.actorId === 'brute' ? 39 : 28), original.z);
        }
        this.placeInWindow();
    }
    private placeInWindow(): void {
        const enemy = this.enemy;
        if (!enemy) return;
        const f = this.frame, a = f.actorScale;
        const child = (name: string) => this.screen.getChildByName(name)!;
        const root = this.screen.getComponent(UITransform)!;
        this.screen.setScale(f.scale, f.scale, 1);
        root.setContentSize(f.width, f.height);
        child('SceneEdgeShade').getComponent(UITransform)!.setContentSize(f.width, f.height);
        const world = child('World'), atmosphere = world.getComponent(SceneAtmosphere)!;
        world.setScale(a, a, 1);
        atmosphere.setRestingHeight(f.worldY);
        atmosphere.fitBackdrop(f.width / a, f.height / a, -f.worldY / a, -168);

        const side = enemy.node.getChildByName('VitalsAnchor');
        const hpX = side ? Math.min(f.healthX, root.convertToNodeSpaceAR(side.worldPosition).x) : f.healthX;
        child('PlayerVitals').setPosition(-hpX, f.healthY);
        child('EnemyVitals').setPosition(hpX, f.healthY);
        const crown = enemy.node.getChildByName('IntentAnchor');
        const intent = child('EnemyIntent'), rotor = enemy.actorId === 'brute';
        if (crown) intent.setWorldPosition(crown.worldPosition);
        else intent.setPosition(enemy.node.position.x * a, f.worldY + (this.field && !rotor ? 102 : 266) * a);
        const target = child('enemy-target');
        const box = this.labyrinth ? [enemy.node.position.x + 15, 22, 390, 380]
            : this.field ? [350, rotor ? 20 : -68, rotor ? 278 : 303, rotor ? 398 : 213]
            : [350, 45, 380, 520];
        target.setPosition(box[0] * a, box[1] * a + f.worldY);
        target.getComponent(UITransform)!.setContentSize(box[2] * a, box[3] * a);

        child('drawPile').setPosition(-f.pileX, f.pileY);
        child('discardPile').setPosition(f.pileX, f.pileY);
        child('StaminaGauge').setPosition(f.energyX, f.actionY);
        child('end-turn').setPosition(f.endX, f.actionY);
        const hand = child('Hand'), handScale = this.field ? .93 : 1;
        hand.setPosition(f.handX, f.handY);
        hand.setScale(handScale, handScale, 1);
        hand.getComponent(HandPresentation)!.fitWidth(f.handWidth / handScale);
        const playArea = child('PlayArea'), bottom = f.handY + 132, top = f.height / 2 - 85;
        playArea.setPosition(0, (bottom + top) / 2);
        playArea.getComponent(UITransform)!.setContentSize(f.width - 32, top - bottom);
        child('banner-text2').setPosition(-f.width / 2 + 354, f.height / 2 - 137);
        const weaponY = f.stacked ? f.height / 2 - 146 : this.field ? 170 : 0;
        child('WeaponSlot').setPosition(720 - f.width / 2 + (this.field ? 23 : 0), weaponY);
    }
}
