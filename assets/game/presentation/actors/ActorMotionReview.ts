import { _decorator, Component, director, Label, Node, ResolutionPolicy, view } from 'cc';
import { ActorMotion, SpriteActorMotion } from './SpriteActorMotion';
const { ccclass, property } = _decorator;

@ccclass('ActorMotionReview')
export class ActorMotionReview extends Component {
    @property({ type: [Node] }) actorRoots: Node[] = [];
    @property({ type: [Label] }) captions: Label[] = [];
    @property(Label) status: Label | null = null;
    @property(Label) speedCaption: Label | null = null;
    @property({ type: [Node] }) buttons: Node[] = [];
    private actors: SpriteActorMotion[] = [];
    private mode = 'idle';
    private speed = 1;
    private paused = false;
    private epoch = 0;
    private hits = 0;
    private names = ['幸存者', '游荡感染者', '重型感染者'];
    private actionNames: Record<string, string> = {
        idle: '待机',
        attack: '攻击',
        hurt: '受击',
        death: '倒下',
        sequence: '连续动作',
    };
    onLoad(): void {
        view.setDesignResolutionSize(1440, 900, ResolutionPolicy.SHOW_ALL);
        this.actors = this.actorRoots.map((node) => node.getComponent(SpriteActorMotion)!);
        const reduced =
            typeof matchMedia !== 'undefined' &&
            matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.playIdle();
        if (reduced) this.togglePause();
        Object.assign(globalThis, { __actorMotionReview: { snapshot: () => this.snapshot() } });
    }
    onDestroy(): void {
        this.epoch++;
        this.unscheduleAllCallbacks();
    }
    playIdle(): void {
        this.play('idle');
    }
    playAttack(): void {
        this.play('attack');
    }
    playHurt(): void {
        this.play('hurt');
    }
    playDeath(): void {
        this.play('death');
    }
    private play(action: ActorMotion): void {
        director.getScheduler().resumeTarget(this);
        this.epoch++;
        this.unscheduleAllCallbacks();
        this.mode = action;
        this.paused = false;
        for (const actor of this.actors) {
            actor.setSpeed(this.speed);
            actor.play(action, () => {
                this.hits++;
            });
        }
    }
    playSequence(): void {
        director.getScheduler().resumeTarget(this);
        this.epoch++;
        this.unscheduleAllCallbacks();
        this.mode = 'sequence';
        this.paused = false;
        const epoch = this.epoch,
            steps: ActorMotion[] = ['idle', 'attack', 'hurt', 'death'];
        const step = (index: number) => {
            if (epoch !== this.epoch) return;
            const action = steps[index];
            let remaining = this.actors.length;
            for (const actor of this.actors) {
                actor.setSpeed(this.speed);
                actor.play(
                    action,
                    () => {
                        this.hits++;
                    },
                    () => {
                        if (--remaining || epoch !== this.epoch) return;
                        if (index < 3) step(index + 1);
                        else this.scheduleOnce(() => step(0), 0.7 / this.speed);
                    }
                );
            }
            if (index === 0)
                this.scheduleOnce(() => step(1), this.actors[0].duration('idle') / this.speed);
        };
        step(0);
    }
    toggleSpeed(): void {
        this.speed = this.speed === 1 ? 0.5 : 1;
        this.actors.forEach((actor) => actor.setSpeed(this.speed));
        if (this.speedCaption)
            this.speedCaption.string = this.speed === 1 ? '速度 ×1' : '慢放 ×0.5';
        if (this.mode === 'sequence') this.playSequence();
    }
    togglePause(): void {
        this.paused = !this.paused;
        if (this.paused) director.getScheduler().pauseTarget(this);
        else director.getScheduler().resumeTarget(this);
        this.actors.forEach((actor) => (this.paused ? actor.pause() : actor.resume()));
    }
    update(): void {
        this.actors.forEach((actor, index) => {
            const state = actor.snapshot() as {
                action: string;
                frame?: string;
                rig?: { active: boolean };
            };
            const frame = state.frame?.match(/-(\d\d)$/)?.[1];
            if (this.captions[index])
                this.captions[index].string = state.rig?.active
                    ? `${this.names[index]} · 待机 · 原画呼吸`
                    : `${this.names[index]} · ${this.actionNames[state.action]} ${frame ? ('0' + String(Number(frame) + 1)).slice(-2) : '--'}/08`;
        });
        if (this.status)
            this.status.string = `${this.actionNames[this.mode]}${this.paused ? ' · 已暂停' : ''}　｜　${this.speed === 1 ? '正常速度' : '半速检查'}　｜　命中事件 ${this.hits}`;
    }
    private snapshot(): object {
        return {
            mode: this.mode,
            speed: this.speed,
            paused: this.paused,
            impacts: this.hits,
            actors: this.actors.map((actor) => actor.snapshot()),
            hits: this.buttons.map((node) => {
                const p = node.position;
                return { id: node.name, x: p.x + 720, y: 450 - p.y, width: 160, height: 48 };
            }),
        };
    }
}
