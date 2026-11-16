import { _decorator, Animation, AnimationClip, AnimationState, Component, Node, Sprite } from 'cc';
import { StableActorSprite } from './StableActorSprite';
const { ccclass, property, requireComponent } = _decorator;
@ccclass('ActorPresentation')
@requireComponent(Animation)
export class ActorPresentation extends Component {
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
    setReducedMotion(value: boolean): void {
        if (this.reducedMotion === value) return;
        this.reducedMotion = value;
        // In-flight actions must still deliver their single impact and completion.
        if (!this.enabledInHierarchy || this.playingAction || this.action !== 'idle') return;
        if (value) this.stopIdle();
        else this.playIdle();
    }
    private stopIdle(): void {
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
        const clip = this.clip('idle');
        if (clip) {
            this.play(clip);
            if (this.reducedMotion) this.stopIdle();
        }
    }
    private play(clip: AnimationClip): void {
        this.artwork
            ?.getComponent(StableActorSprite)
            ?.setRigActive(this.action === 'idle' || this.action === 'prepare');
        const animation = this.getComponent(Animation)!;
        if (!animation.getState(clip.name)) animation.addClip(clip);
        animation.play(clip.name);
        animation.getState(clip.name)?.sample();
    }
    playAction(
        kind: 'attack' | 'hurt' | 'prepare' | 'death',
        reduced = false,
        impact?: () => void,
        complete?: () => void
    ): void {
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
        this.play(clip);
    }
    private finished(_type: string, state: AnimationState): void {
        if (this.playingAction && state.name === this.clip(this.action)?.name) {
            this.playingAction = false;
            this.notifyImpact();
            const done = this.complete;
            this.complete = null;
            if (this.action !== 'death') this.playIdle();
            done?.();
        }
    }
    notifyImpact(): void {
        const hit = this.impact;
        this.impact = null;
        hit?.();
    }
    get pose(): string {
        return this.artwork?.spriteFrame?.name ?? '';
    }
    get motion(): string {
        return this.action;
    }
    get isArmed(): boolean {
        return this.armed;
    }
}
