import { _decorator, Component, director, Director, JsonAsset, sp, Vec3 } from 'cc';
import {
    silhouetteAtHeight,
    skinVertex,
    type SpineMotion,
    type SpineRigContract,
} from './SpineRigGeometry';
const { ccclass, property } = _decorator;
type MotionRequest = {
    kind: SpineMotion;
    impact?: () => void;
    release?: () => void;
    complete?: () => void;
    advance?: (fraction: number) => void;
    sample?: number;
};

/** Spine owns character poses; this component exposes presentation timing and silhouette queries. */
@ccclass('SpineActorRig')
export class SpineActorRig extends Component {
    @property(sp.Skeleton) skeleton: sp.Skeleton | null = null;
    @property(JsonAsset) contract: JsonAsset | null = null;
    @property(sp.SkeletonData) labyrinthSkeleton: sp.SkeletonData | null = null;
    @property(JsonAsset) labyrinthContract: JsonAsset | null = null;
    @property(Vec3) labyrinthOffset = new Vec3();
    @property labyrinthScale = 1;
    private legacySkeleton: sp.SkeletonData | null = null;
    private legacyContract: JsonAsset | null = null;
    private home: { position: Vec3; scale: Vec3 } | null = null;
    private look: 'legacy' | 'labyrinth' = 'legacy';
    private pending: MotionRequest | null = null;
    private generation = 0;
    private action: SpineMotion = 'idle';
    private callbacks: {
        impact?: () => void;
        release?: () => void;
        complete?: () => void;
        advance?: (fraction: number) => void;
    } = {};
    private pendingImpact = false;
    private pendingRelease = false;
    private pendingComplete = false;
    private bindings: NonNullable<ReturnType<sp.Skeleton['findBone']>>[] = [];
    private readonly point = new Vec3();
    private get data(): SpineRigContract {
        return this.contract!.json as SpineRigContract;
    }
    get ready(): boolean {
        return !!this.skeleton?.findBone('PoseRoot');
    }
    setLook(look: 'legacy' | 'labyrinth'): boolean {
        if (this.look === look || !this.skeleton) return false;
        const data = look === 'labyrinth' ? this.labyrinthSkeleton : this.legacySkeleton;
        const contract = look === 'labyrinth' ? this.labyrinthContract : this.legacyContract;
        if (look === 'labyrinth' && (!data || !contract)) return false;
        if (!this.legacySkeleton) {
            this.legacySkeleton = this.skeleton.skeletonData;
            this.legacyContract = this.contract;
        }
        this.home ??= { position: this.node.position.clone(), scale: this.node.scale.clone() };
        this.cancel();
        this.look = look;
        this.bindings = [];
        this.contract = contract;
        this.skeleton.skeletonData = data;
        if (look === 'labyrinth') {
            this.node.setPosition(Vec3.add(new Vec3(), this.home.position, this.labyrinthOffset));
            this.node.setScale(this.home.scale.x * this.labyrinthScale, this.home.scale.y * this.labyrinthScale, this.home.scale.z);
        } else {
            this.node.setPosition(this.home.position);
            this.node.setScale(this.home.scale);
        }
        return true;
    }
    get flight(): number {
        return this.data.flight ?? 0;
    }
    get poseFamily(): string {
        return this.look === 'labyrinth' || this.data.actor.startsWith('ashen-')
            ? 'ashen-spine' : 'master08-spine';
    }
    aimWorld(out: Vec3): Vec3 {
        this.syncWorldPose();
        const aim = this.skeleton?.findBone('Aim');
        return aim
            ? Vec3.transformMat4(out, new Vec3(aim.worldX, aim.worldY, 0), this.node.worldMatrix)
            : out.set(this.node.worldPosition);
    }
    get approach(): number {
        return this.skeleton?.findBone(this.data.approachBone)?.x ?? 0;
    }
    get time(): number {
        return this.skeleton?.getCurrent(0)?.trackTime ?? 0;
    }
    duration(kind: SpineMotion): number {
        return this.data.motions[kind].duration;
    }
    start(): void {
        this.flush();
    }
    onEnable(): void {
        director.on(Director.EVENT_BEFORE_DRAW, this.afterPoseUpdate, this);
        this.flush();
    }
    lateUpdate(): void {
        this.flush();
    }
    onDisable(): void {
        director.off(Director.EVENT_BEFORE_DRAW, this.afterPoseUpdate, this);
        this.cancel();
    }
    cancel(): void {
        this.generation++;
        this.pending = null;
        this.callbacks = {};
        this.pendingImpact = false;
        this.pendingRelease = false;
        this.pendingComplete = false;
    }
    play(
        kind: SpineMotion,
        impact?: () => void,
        complete?: () => void,
        advance?: (fraction: number) => void,
        release?: () => void
    ): void {
        this.pending = { kind, impact, complete, advance, release };
        this.flush();
    }
    sample(kind: SpineMotion, time: number): void {
        this.pending = { kind, sample: time };
        this.flush();
    }
    private flush(): void {
        if (!this.pending || !this.enabledInHierarchy || !this.ready) return;
        const request = this.pending;
        this.pending = null;
        this.begin(request);
    }
    private begin(request: MotionRequest): void {
        const skeleton = this.skeleton!,
            token = ++this.generation;
        this.action = request.kind;
        this.callbacks = {
            impact: request.impact,
            complete: request.complete,
            advance: request.advance,
            release: request.release,
        };
        this.pendingImpact = false;
        this.pendingRelease = false;
        this.pendingComplete = false;
        skeleton.paused = false;
        if (this.look === 'labyrinth') skeleton.clearTrack(1);
        skeleton.setToSetupPose();
        const entry = skeleton.setAnimation(0, request.kind, this.data.motions[request.kind].loop);
        if (!entry) throw new Error('Spine 动作缺失：' + request.kind);
        skeleton.setTrackEventListener(entry, (_track, event) => {
            if (token !== this.generation) return;
            const value = event as { data?: { name?: string } };
            if (value.data?.name === 'impact') this.pendingImpact = true;
            if (value.data?.name === 'release') this.pendingRelease = true;
        });
        skeleton.setTrackCompleteListener(entry, () => {
            if (token !== this.generation || this.data.motions[request.kind].loop) return;
            this.pendingComplete = true;
        });
        if (request.sample !== undefined) {
            entry.trackTime = Math.max(0, Math.min(request.sample, this.duration(request.kind)));
            this.callbacks = {};
            skeleton.updateAnimation(0);
            skeleton.paused = true;
        } else {
            skeleton.updateAnimation(0);
        }
    }
    /** Runtime events arrive while Spine is applying timelines. Read contacts after its world transforms. */
    private afterPoseUpdate(): void {
        this.syncWorldPose();
        this.callbacks.advance?.(this.approach);
        if (this.pendingRelease) {
            this.pendingRelease = false;
            const release = this.callbacks.release;
            this.callbacks.release = undefined;
            release?.();
        }
        if (this.pendingImpact) {
            this.pendingImpact = false;
            const hit = this.callbacks.impact;
            this.callbacks.impact = undefined;
            hit?.();
        }
        if (this.pendingComplete) {
            this.pendingComplete = false;
            const done = this.callbacks.complete;
            this.callbacks.complete = undefined;
            done?.();
        }
    }
    private syncWorldPose(): void {
        // In the pinned Cocos Spine 3.8 runtime, updateAnimation applies timelines but
        // world transforms are deferred until mesh collection. Contacts need them now.
        this.skeleton?._skeleton?.updateWorldTransform();
    }
    setSpeed(speed: number): void {
        if (this.skeleton) this.skeleton.timeScale = Math.max(0.05, speed);
    }
    pause(): void {
        if (this.skeleton) this.skeleton.paused = true;
    }
    resume(): void {
        if (this.skeleton) this.skeleton.paused = false;
    }
    predictedContactWorld(out: Vec3): Vec3 {
        return Vec3.transformMat4(
            out,
            new Vec3(this.data.contactTip[0], this.data.contactTip[1], 0),
            this.node.worldMatrix
        );
    }
    contactWorld(out: Vec3): Vec3 {
        const bone = this.skeleton?.findBone(this.data.contactBone);
        if (!bone) return this.predictedContactWorld(out);
        return Vec3.transformMat4(
            out,
            new Vec3(bone.worldX, bone.worldY, 0),
            this.node.worldMatrix
        );
    }
    private boneBindings(): typeof this.bindings {
        if (!this.bindings.length) {
            this.bindings = this.data.boneNames.map((name) => {
                const bone = this.skeleton!.findBone(name);
                if (!bone) throw new Error('Spine 骨骼缺失：' + name);
                return bone;
            });
        }
        return this.bindings;
    }
    surfaceAtHeight(worldY: number, fromLeft: boolean, out: Vec3): boolean {
        if (!this.ready) return false;
        this.syncWorldPose();
        const bones = this.boneBindings();
        const vertices = this.data.influences.map((weights) => {
            const p = skinVertex(weights, bones);
            Vec3.transformMat4(this.point, new Vec3(p.x, p.y, 0), this.node.worldMatrix);
            return { x: this.point.x, y: this.point.y };
        });
        const x = silhouetteAtHeight(vertices, this.data.triangles, worldY, fromLeft);
        if (x === null) return false;
        out.set(x, worldY, this.node.worldPosition.z);
        return true;
    }
    inspect(): object {
        const markers: Record<string, object | null> = {};
        for (const name of ['Head', 'Hips', 'FrontFoot', 'RearFoot', 'AttackTip', 'CastOrigin', 'PaperFoldLeft', 'PaperFoldRight']) {
            const bone = this.skeleton?.findBone(name);
            markers[name] = bone
                ? { x: bone.worldX, y: bone.worldY, a: bone.a, b: bone.b, c: bone.c, d: bone.d }
                : null;
        }
        const card = this.skeleton?.findSlot('card');
        return {
            renderer: 'spine-3.8',
            actor: this.data.actor,
            runtimeReady: this.ready,
            motion: this.action,
            time: this.time,
            paused: this.skeleton?.paused,
            speed: this.skeleton?.timeScale,
            bones: this.data.boneNames.length,
            weightedVertices: this.data.influences.filter((w) => w.length > 1).length,
            independentParts: this.data.parts?.length ?? 0,
            source: this.data.sourceSha256,
            approach: this.approach,
            paper: card ? {
                visible: !!card.getAttachment(),
                fragments: this.data.boneNames.filter(name => name.startsWith('paper-chip-') &&
                    this.skeleton?.findSlot(name)?.getAttachment()).length,
            } : null,
            markers,
        };
    }
}
