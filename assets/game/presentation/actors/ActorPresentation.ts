import {
    _decorator,
    Animation,
    AnimationClip,
    AnimationState,
    Component,
    Node,
    Sprite,
    Vec3,
} from 'cc';
import { StableActorSprite } from './StableActorSprite';
import { PaperDollRig } from './PaperDollRig';
import { NativeActorSkin } from './NativeActorSkin';
import { SpineActorRig } from './SpineActorRig';
const { ccclass, property, requireComponent } = _decorator;
@ccclass('ActorPresentation')
@requireComponent(Animation)
export class ActorPresentation extends Component {
    @property actorId = '';
    @property(SpineActorRig) spineRig: SpineActorRig | null = null;
    @property(PaperDollRig) paperDoll: PaperDollRig | null = null;
    @property(Sprite) artwork: Sprite | null = null;
    @property(Node) impactAnchor: Node | null = null;
    @property(AnimationClip) idle: AnimationClip | null = null;
    @property(AnimationClip) attack: AnimationClip | null = null;
    @property(AnimationClip) hurt: AnimationClip | null = null;
    @property(AnimationClip) prepare: AnimationClip | null = null;
    @property(AnimationClip) death: AnimationClip | null = null;
    @property(AnimationClip) armedIdle: AnimationClip | null = null;
    @property(AnimationClip) armedAttack: AnimationClip | null = null;
    @property(AnimationClip) armedHurt: AnimationClip | null = null;
    private armed = false;
    private playingAction = false;
    private action: 'idle' | 'attack' | 'hurt' | 'prepare' | 'death' = 'idle';
    private impact: (() => void) | null = null;
    private complete: (() => void) | null = null;
    private reducedMotion = false;
    private attackHome: Vec3 | null = null;
    private attackDistance = 0;
    private advance = 0;
    private contactDistance = 0;
    private readonly contactPoint = new Vec3();
    private lastContactError: number | null = null;
    @property
    get approach(): number {
        return this.advance;
    }
    set approach(value: number) {
        this.advance = value;
        if (this.attackHome)
            this.node.setPosition(
                this.attackHome.x + this.attackDistance * value,
                this.attackHome.y,
                this.attackHome.z
            );
    }
    private get nativeSkin(): NativeActorSkin | null {
        return this.artwork?.getComponent(NativeActorSkin) ?? null;
    }
    private prepareMelee(target: ActorPresentation): void {
        if (this.spineRig || target.spineRig) {
            const parent = this.node.parent,
                destination = target.spineRig ?? target.nativeSkin;
            if (!parent || !destination) return;
            const tip = this.spineRig
                ? this.spineRig.predictedContactWorld(new Vec3())
                : this.nativeSkin!.contactTipWorld(new Vec3());
            const surface = new Vec3();
            if (!destination.surfaceAtHeight(tip.y, tip.x < target.node.worldPosition.x, surface))
                return;
            const localTip = parent.inverseTransformPoint(new Vec3(), tip);
            const localSurface = parent.inverseTransformPoint(new Vec3(), surface);
            this.attackHome = this.node.position.clone();
            this.attackDistance = localSurface.x - localTip.x;
            this.contactDistance = Math.abs(this.attackDistance);
            this.contactPoint.set(surface);
            this.lastContactError = null;
            this.approach = 0;
            target.impactAnchor?.setWorldPosition(surface);
            return;
        }
        const skin = this.nativeSkin,
            targetSkin = target.nativeSkin,
            parent = this.node.parent;
        if (!skin || !targetSkin || !parent) return;
        const tip = skin.contactTipWorld(new Vec3()),
            surface = new Vec3();
        if (!targetSkin.surfaceAtHeight(tip.y, tip.x < target.node.worldPosition.x, surface))
            return;
        const localTip = parent.inverseTransformPoint(new Vec3(), tip),
            localSurface = parent.inverseTransformPoint(new Vec3(), surface);
        this.attackHome = this.node.position.clone();
        this.attackDistance = localSurface.x - localTip.x;
        this.contactDistance = Math.abs(this.attackDistance);
        this.contactPoint.set(surface);
        this.lastContactError = null;
        this.approach = 0;
        // The same contact point owns damage feedback; moving the actor does not change rule state.
        target.impactAnchor?.setWorldPosition(surface);
    }
    private resetApproach(): void {
        if (this.attackHome) this.node.setPosition(this.attackHome);
        this.attackHome = null;
        this.attackDistance = 0;
        this.advance = 0;
    }
    onLoad(): void {
        this.getComponent(Animation)!.on(Animation.EventType.FINISHED, this.finished, this);
    }
    onEnable(): void {
        this.reducedMotion =
            typeof matchMedia !== 'undefined' &&
            matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.playingAction = false;
        this.impact = null;
        this.complete = null;
        this.playIdle();
    }
    onDestroy(): void {
        this.getComponent(Animation)?.off(Animation.EventType.FINISHED, this.finished, this);
    }
    onDisable(): void {
        this.resetApproach();
        this.spineRig?.cancel();
        this.impact = null;
        this.complete = null;
        this.playingAction = false;
        this.getComponent(Animation)?.stop();
    }
    setArmed(value: boolean): void {
        if (this.armed !== value) {
            this.armed = value;
            if (!this.playingAction) this.playIdle();
        }
    }
    setFieldLook(value: boolean): void {
        if (this.spineRig?.setFieldLook(value) && this.enabledInHierarchy) this.playIdle();
    }
    setLook(look: 'legacy' | 'tide' | 'labyrinth'): void {
        if (this.spineRig?.setLook(look) && this.enabledInHierarchy) this.playIdle();
    }
    setReducedMotion(value: boolean): void {
        if (this.reducedMotion === value) return;
        this.reducedMotion = value;
        // In-flight actions must still deliver their single impact and completion.
        if (!this.enabledInHierarchy || this.playingAction || this.action !== 'idle') return;
        if (value) this.stopIdle();
        else this.playIdle();
    }
    private stopIdle(): void {
        if (this.spineRig) {
            this.spineRig.sample('idle', 0);
            return;
        }
        if (this.paperDoll) {
            const clip = this.clip('idle'),
                animation = this.getComponent(Animation)!;
            if (clip) {
                const state = animation.getState(clip.name);
                if (state) {
                    state.time = 0;
                    state.sample();
                }
            }
            this.paperDoll.syncPose();
        }
        this.getComponent(Animation)?.stop();
        const sprite = this.artwork?.getComponent(StableActorSprite);
        if (sprite) sprite.breath = 0;
    }
    private clip(kind: 'idle' | 'attack' | 'hurt' | 'prepare' | 'death'): AnimationClip | null {
        return this.armed
            ? ((kind === 'idle'
                  ? this.armedIdle
                  : kind === 'attack'
                    ? this.armedAttack
                    : kind === 'hurt'
                      ? this.armedHurt
                      : null) ?? this[kind])
            : this[kind];
    }
    private playIdle(): void {
        this.action = 'idle';
        if (this.spineRig) {
            this.spineRig.play('idle');
            if (this.reducedMotion) this.stopIdle();
            return;
        }
        const clip = this.clip('idle');
        if (clip) {
            this.play(clip);
            if (this.reducedMotion) this.stopIdle();
        }
    }
    private play(clip: AnimationClip): void {
        this.paperDoll?.setMotion(this.action);
        this.artwork
            ?.getComponent(StableActorSprite)
            ?.setRigActive(
                !!this.nativeSkin || this.action === 'idle' || this.action === 'prepare'
            );
        const animation = this.getComponent(Animation)!;
        if (!animation.getState(clip.name)) animation.addClip(clip);
        animation.play(clip.name);
        animation.getState(clip.name)?.sample();
    }
    playAction(
        kind: 'attack' | 'hurt' | 'prepare' | 'death',
        reduced = false,
        impact?: () => void,
        complete?: () => void,
        target?: ActorPresentation | null,
        release?: () => void
    ): void {
        if (this.spineRig) {
            if (kind !== 'attack') this.resetApproach();
            this.action = kind;
            this.impact = impact ?? null;
            this.complete = complete ?? null;
            this.playingAction = !reduced;
            if (kind === 'attack' && this.spineRig.flight && target?.spineRig)
                target.impactAnchor?.setWorldPosition(target.spineRig.aimWorld(new Vec3()));
            if (reduced) {
                if (kind === 'death') this.spineRig.sample(kind, this.spineRig.duration(kind));
                this.notifyImpact();
                const done = this.complete;
                this.complete = null;
                if (kind !== 'death') this.playIdle();
                done?.();
                return;
            }
            if (kind === 'attack' && target && !this.spineRig.flight) this.prepareMelee(target);
            this.spineRig.play(
                kind,
                () => {
                    this.approach = this.spineRig!.approach;
                    this.notifyImpact();
                },
                () => {
                    this.playingAction = false;
                    this.notifyImpact();
                    const done = this.complete;
                    this.complete = null;
                    this.resetApproach();
                    if (kind !== 'death') this.playIdle();
                    done?.();
                },
                kind === 'attack'
                    ? (fraction) => {
                          this.approach = fraction;
                      }
                    : undefined,
                release
            );
            return;
        }
        const clip = this.clip(kind);
        if (!clip || reduced) {
            if (clip && kind === 'death') {
                this.action = kind;
                this.play(clip);
                const animation = this.getComponent(Animation)!,
                    state = animation.getState(clip.name)!;
                state.time = clip.duration;
                state.sample();
                animation.stop();
            }
            impact?.();
            complete?.();
            return;
        }
        this.impact = impact ?? null;
        this.complete = complete ?? null;
        this.playingAction = true;
        this.action = kind;
        if (kind === 'attack' && target) this.prepareMelee(target);
        this.play(clip);
    }
    private finished(_type: string, state: AnimationState): void {
        if (this.playingAction && state.name === this.clip(this.action)?.name) {
            this.playingAction = false;
            this.notifyImpact();
            const done = this.complete;
            this.complete = null;
            this.resetApproach();
            if (this.action !== 'death') this.playIdle();
            done?.();
        }
    }
    notifyImpact(): void {
        if (this.impact && this.attackHome && this.spineRig)
            this.lastContactError = Vec3.distance(
                this.spineRig.contactWorld(new Vec3()),
                this.contactPoint
            );
        else if (this.impact && this.attackHome && this.nativeSkin) {
            const tip = this.nativeSkin.boneNodes.find((node) => node.name === 'AttackTip');
            if (tip) this.lastContactError = Vec3.distance(tip.worldPosition, this.contactPoint);
        }
        const hit = this.impact;
        this.impact = null;
        hit?.();
    }
    get pose(): string {
        if (this.spineRig) return this.spineRig.poseFamily + ':' + this.action;
        if (this.nativeSkin) return 'master08-native:' + this.action;
        if (this.paperDoll) return 'paperdoll08:' + this.action;
        return this.artwork?.spriteFrame?.name ?? '';
    }
    get rendererKind(): string {
        if (this.spineRig) return 'spine-3.8';
        if (this.nativeSkin) return 'cocos-native-cutout';
        return this.paperDoll ? 'native-paper-doll' : 'sprite-frames';
    }
    inspectRig(): object | null {
        if (this.spineRig)
            return {
                ...this.spineRig.inspect(),
                approach: this.approach,
                attackTravel: this.contactDistance,
                contactError: this.lastContactError,
            };
        if (this.nativeSkin)
            return {
                ...this.nativeSkin.rigSnapshot(),
                approach: this.approach,
                attackTravel: this.contactDistance,
                contactError: this.lastContactError,
            };
        return this.paperDoll?.inspect() ?? null;
    }
    get motion(): string {
        return this.action;
    }
    get isArmed(): boolean {
        return this.armed;
    }
}
