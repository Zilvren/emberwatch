import { _decorator, Animation, AnimationState, Component, Node } from 'cc';

const { ccclass } = _decorator;
export const cardNames = ['Lantern', 'Guard', 'Repel'] as const;

@ccclass('SurvivorFramePlayer')
export class SurvivorFramePlayer extends Component {
    private anim!: Animation;
    private slots: Node[] = [];
    private spent = new Set<number>();
    private pending = -1;
    private selected = -1;
    private didRelease = false;
    activeClip = '';
    paused = false;
    rate = 1;

    onLoad(): void {
        this.anim = this.getComponent(Animation)!;
        this.slots = cardNames.map(name => this.node.getChildByName(name)!);
        this.anim.on(Animation.EventType.FINISHED, this.finished, this);
    }

    start(): void { this.deal(); }
    onDestroy(): void { this.anim?.off(Animation.EventType.FINISHED, this.finished, this); }

    deal(): void {
        this.pending = this.selected = -1;
        this.spent.clear();
        this.slots.forEach(slot => { slot.active = true; });
        this.play('Fan');
    }

    choose(index: number): boolean {
        if (!Number.isInteger(index) || index < 0 || index >= cardNames.length ||
            this.paused || this.spent.has(index) || index === this.selected) return false;
        if (this.activeClip !== 'Think') {
            this.pending = index;
            return true;
        }
        this.selected = index;
        this.didRelease = false;
        this.play('Flick' + cardNames[index]);
        return true;
    }

    setRate(rate: number): void {
        this.rate = rate;
        const state = this.anim.getState(this.activeClip);
        if (state) state.speed = rate;
    }

    setPaused(paused: boolean): void {
        this.paused = paused;
        if (paused) this.anim.pause();
        else this.anim.resume();
    }

    // A presentation event at the first contact cel. Game rules own card effects.
    onCardRelease(): void {
        if (this.selected < 0 || this.didRelease) return;
        this.didRelease = true;
        this.node.emit('card-release', this.selected);
    }

    private play(clip: string): void {
        this.activeClip = clip;
        this.anim.play(clip);
        this.anim.getState(clip).speed = this.rate;
        if (this.paused) this.anim.pause();
    }

    private finished(_event: string, state: AnimationState): void {
        if (state.name !== this.activeClip) return;
        if (this.selected >= 0) {
            this.spent.add(this.selected);
            this.slots[this.selected].active = false;
            this.selected = -1;
        }
        this.play('Think');
        const queued = this.pending;
        this.pending = -1;
        if (queued >= 0) this.choose(queued);
    }
}
