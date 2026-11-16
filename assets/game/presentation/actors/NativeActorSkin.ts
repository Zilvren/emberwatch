import { _decorator, JsonAsset, Mat4, Node, Vec3 } from 'cc';
import { StableActorSprite } from './StableActorSprite';
const { ccclass, property } = _decorator;
type Influence = [number, number, number, number];
interface NativeSkin {
    actor: string;
    boneDefinitions: { name: string }[];
    influences: Influence[][];
    contactTip: [number, number];
    sourceSha256: string;
    partGroups: Record<string, number>;
}
/** Cocos Animation drives real Node bones; this pinned renderer maps the unchanged 08 drawing to them. */
@ccclass('NativeActorSkin')
export class NativeActorSkin extends StableActorSprite {
    @property(JsonAsset) skin: JsonAsset | null = null;
    @property([Node]) boneNodes: Node[] = [];
    private readonly inverse = new Mat4();
    private readonly palette: Mat4[] = [];
    private readonly sample = { x: 0, y: 0 };
    private readonly world = new Vec3();
    private get definition(): NativeSkin {
        return this.skin!.json as NativeSkin;
    }
    private ensureBindings(): void {
        if (this.palette.length) return;
        const definition = this.definition;
        if (
            this.boneNodes.length !== definition.boneDefinitions.length ||
            definition.influences.length !== this.rig.vertices.length
        )
            throw new Error('NativeActorSkin 绑定数量不一致');
        this.boneNodes.forEach((node, i) => {
            if (!node || node.name !== definition.boneDefinitions[i].name)
                throw new Error(
                    'NativeActorSkin 骨骼绑定错误：' + definition.boneDefinitions[i].name
                );
            this.palette.push(new Mat4());
        });
    }
    lateUpdate(): void {
        this.updatePose();
    }
    updatePose(): void {
        if (!this.skin || !this.geometry) return;
        this.ensureBindings();
        Mat4.invert(this.inverse, this.node.worldMatrix);
        this.boneNodes.forEach((bone, i) =>
            Mat4.multiply(this.palette[i], this.inverse, bone.worldMatrix)
        );
        this.markForUpdateRenderData();
    }
    vertexPosition(index: number): { x: number; y: number } {
        if (!this.palette.length) return super.vertexPosition(index);
        let x = 0,
            y = 0;
        for (const [bone, lx, ly, weight] of this.definition.influences[index]) {
            const m = this.palette[bone];
            x += (m.m00 * lx + m.m04 * ly + m.m12) * weight;
            y += (m.m01 * lx + m.m05 * ly + m.m13) * weight;
        }
        const v = this.rig.vertices[index];
        const head = this.definition.influences[index].every(
            ([bone]) => this.definition.boneDefinitions[bone].name === 'Head'
        );
        const breath = head ? 0 : this.breath;
        this.sample.x = x + v[4] * breath;
        this.sample.y = y + v[5] * breath;
        return this.sample;
    }
    /** Predicted contact pose in the Visual coordinate system, authored with the same native curves. */
    contactTipWorld(out: Vec3): Vec3 {
        const [x, y] = this.definition.contactTip;
        return Vec3.transformMat4(out, new Vec3(x, y, 0), this.node.worldMatrix);
    }
    /** Closest visible silhouette at this attack height, instead of a fixed distant effect marker. */
    surfaceAtHeight(worldY: number, fromLeft: boolean, out: Vec3): boolean {
        this.updatePose();
        const points = this.rig.vertices.map((_, i) => {
            const p = this.vertexPosition(i);
            Vec3.transformMat4(this.world, new Vec3(p.x, p.y, 0), this.node.worldMatrix);
            return { x: this.world.x, y: this.world.y };
        });
        let edge = fromLeft ? Infinity : -Infinity;
        for (let i = 0; i < this.rig.indices.length; i += 3)
            for (let k = 0; k < 3; k++) {
                const a = points[this.rig.indices[i + k]],
                    b = points[this.rig.indices[i + ((k + 1) % 3)]];
                if (
                    Math.abs(a.y - b.y) < 0.000001 ||
                    worldY < Math.min(a.y, b.y) ||
                    worldY > Math.max(a.y, b.y)
                )
                    continue;
                const x = a.x + ((b.x - a.x) * (worldY - a.y)) / (b.y - a.y);
                edge = fromLeft ? Math.min(edge, x) : Math.max(edge, x);
            }
        if (!Number.isFinite(edge)) return false;
        out.set(edge, worldY, this.node.worldPosition.z);
        return true;
    }
    rigSnapshot(): object {
        return {
            ...super.rigSnapshot(),
            renderer: 'cocos-native-cutout',
            actor: this.definition?.actor,
            bones: this.boneNodes.length,
            renderReady: !!this.renderData?.chunk,
            parts: Object.keys(this.definition?.partGroups ?? {}).length,
            source: this.definition?.sourceSha256,
        };
    }
}
