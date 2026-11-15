import { _decorator, Animation, AnimationClip, AnimationState, Component, Sprite } from 'cc';
import { StableActorSprite } from './StableActorSprite';
const { ccclass, property, requireComponent } = _decorator;
export type ActorMotion = 'idle' | 'attack' | 'hurt' | 'death';

/** Presentation only: authored sprite frames, playback and a single impact cue. */
@ccclass('SpriteActorMotion')
@requireComponent(Animation)
export class SpriteActorMotion extends Component {
    @property(Sprite) artwork: Sprite | null = null;
    @property(AnimationClip) idle: AnimationClip | null = null;
    @property(AnimationClip) attack: AnimationClip | null = null;
    @property(AnimationClip) hurt: AnimationClip | null = null;
    @property(AnimationClip) death: AnimationClip | null = null;
    private action: ActorMotion = 'idle';
    private speed = 1;
    private impact: (() => void) | null = null;
    private complete: (() => void) | null = null;
    private impactFired = false;
    onLoad(): void {
        this.getComponent(Animation)!.on(Animation.EventType.FINISHED, this.finished, this);
    }
    onEnable(): void {
        this.play('idle');
    }
    onDisable(): void {
        this.impact = null;
        this.complete = null;
        this.getComponent(Animation)?.stop();
    }
    onDestroy(): void {
        this.getComponent(Animation)?.off(Animation.EventType.FINISHED, this.finished, this);
    }
    play(action: ActorMotion, impact?: () => void, complete?: () => void): void {
        const clip = this[action];
        if (!clip) throw new Error(`Missing actor motion: ${action}`);
        this.action = action;
        this.artwork?.getComponent(StableActorSprite)?.setRigActive(action === 'idle');
        this.impact = impact ?? null;
        this.complete = complete ?? null;
        this.impactFired = false;
        const player = this.getComponent(Animation)!;
        if (!player.getState(clip.name)) player.addClip(clip);
        player.play(clip.name);
        const state = player.getState(clip.name)!;
        state.speed = this.speed;
        state.sample();
    }
    setSpeed(speed: number): void {
        this.speed = speed;
        const clip = this[this.action];
        if (clip) {
            const state = this.getComponent(Animation)!.getState(clip.name);
            if (state) state.speed = speed;
        }
    }
    pause(): void {
        this.getComponent(Animation)!.pause();
    }
    resume(): void {
        this.getComponent(Animation)!.resume();
    }
    duration(action: ActorMotion): number {
        return this[action]?.duration ?? 0;
    }
    notifyImpact(): void {
        if (this.action !== 'attack' || this.impactFired) return;
        this.impactFired = true;
        const callback = this.impact;
        this.impact = null;
        this.node.emit('motion-impact');
        callback?.();
    }
    private finished(_type: string, state: AnimationState): void {
        if (state.name !== this[this.action]?.name || this.action === 'idle') return;
        if (this.action === 'attack') this.notifyImpact();
        const callback = this.complete;
        this.complete = null;
        this.impact = null;
        if (this.action !== 'death') this.play('idle');
        callback?.();
    }
    snapshot(): object {
        const clip = this[this.action],
            state = clip ? this.getComponent(Animation)!.getState(clip.name) : null;
        return {
            action: this.action,
            frame: this.artwork?.spriteFrame?.name,
            clip: clip?.name,
            time: state?.time,
            playing: state?.isPlaying,
            paused: state?.isPaused,
            speed: this.speed,
            duration: clip?.duration,
            rig: this.artwork?.getComponent(StableActorSprite)?.rigSnapshot(),
        };
    }
}
