import { _decorator, Component, JsonAsset, Node, Sprite, SpriteFrame, Vec3 } from 'cc';
import { solveTwoBone } from './TwoBoneIK';
const { ccclass, property } = _decorator;
interface Leg {
    upper: string;
    lower: string;
    foot: string;
    target: string;
    upperLength: number;
    lowerLength: number;
    bend: 1 | -1;
}
interface RigDefinition {
    slots: { id: string; bone: string }[];
    legs: Leg[];
}
/** Native transform bones + independent draw-order slots. Animation owns pose; this adapter solves planted feet. */
@ccclass('PaperDollRig')
export class PaperDollRig extends Component {
    @property(JsonAsset) definition: JsonAsset | null = null;
    @property([Node]) bones: Node[] = [];
    @property([Node]) slots: Node[] = [];
    private readonly nodes = new Map<string, Node>();
    private readonly point = new Vec3();
    private feetPlanted = true;
    private get data(): RigDefinition {
        return this.definition!.json as RigDefinition;
    }
    onLoad(): void {
        if (!this.definition) throw new Error('PaperDollRig 缺少骨架定义');
        for (const node of this.bones) {
            if (this.nodes.has(node.name)) throw new Error('PaperDollRig 重复骨骼：' + node.name);
            this.nodes.set(node.name, node);
        }
        for (const slot of this.data.slots)
            if (!this.nodes.has(slot.bone) || !this.slots.some((n) => n.name === slot.id))
                throw new Error('PaperDollRig 缺少插槽绑定：' + slot.id);
        for (const leg of this.data.legs)
            for (const id of [leg.upper, leg.lower, leg.foot, leg.target])
                if (!this.nodes.has(id)) throw new Error('PaperDollRig 缺少腿部绑定：' + id);
        this.syncPose();
    }
    setMotion(motion: string): void {
        this.feetPlanted = motion !== 'death';
    }
    /** Presentation attachment only: inventory/equipment rules remain application commands. */
    setAttachment(id: string, frame: SpriteFrame | null): void {
        const slot = this.slots.find((n) => n.name === id)?.getComponent(Sprite);
        if (!slot) throw new Error('PaperDollRig 插槽不存在：' + id);
        slot.spriteFrame = frame;
    }
    lateUpdate(): void {
        this.syncPose();
    }
    syncPose(): void {
        if (!this.definition || this.nodes.size === 0) return;
        if (this.feetPlanted)
            for (const leg of this.data.legs) {
                const upper = this.nodes.get(leg.upper)!,
                    lower = this.nodes.get(leg.lower)!,
                    foot = this.nodes.get(leg.foot)!;
                upper.parent!.inverseTransformPoint(
                    this.point,
                    this.nodes.get(leg.target)!.worldPosition
                );
                this.point.subtract(upper.position);
                const angles = solveTwoBone(
                    this.point.x,
                    this.point.y,
                    leg.upperLength,
                    leg.lowerLength,
                    leg.bend
                );
                upper.angle = angles.upper;
                lower.angle = angles.lower;
                foot.angle = -angles.upper - angles.lower;
            }
        for (const binding of this.data.slots) {
            const node = this.slots.find((slot) => slot.name === binding.id)!,
                bone = this.nodes.get(binding.bone)!;
            node.setWorldPosition(bone.worldPosition);
            node.setWorldRotation(bone.worldRotation);
            node.setWorldScale(bone.worldScale);
        }
    }
    inspect(): object {
        return {
            renderer: 'native-paper-doll',
            boneCount: this.bones.length,
            slotCount: this.slots.length,
            feetPlanted: this.feetPlanted,
            feet: this.data.legs.map((leg) => {
                const foot = this.nodes.get(leg.foot)!,
                    target = this.nodes.get(leg.target)!;
                return {
                    foot: leg.foot,
                    error: Vec3.distance(foot.worldPosition, target.worldPosition),
                };
            }),
        };
    }
}
