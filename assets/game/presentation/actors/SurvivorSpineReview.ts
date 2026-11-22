import { _decorator, Color, Component, Graphics, Label, Node, sp, UIOpacity, view, ResolutionPolicy } from 'cc';

const { ccclass, property } = _decorator;
type Clip = 'idle' | 'prepare' | 'attack' | 'hurt' | 'death';
const titles: Record<Clip, string> = { idle: '待机', prepare: '取牌', attack: '出牌', hurt: '受击', death: '倒下' };
const sequence: readonly [Clip, number][] = [
    ['idle', 1.55], ['prepare', 0], ['attack', 0], ['idle', .48],
    ['hurt', 0], ['idle', .48], ['death', .65],
];
const loadedAt = .22, prepareAt = .56, releaseAt = .36, flightEnd = .606;

@ccclass('SurvivorSpineReview')
export class SurvivorSpineReview extends Component {
    @property(Node) actor: Node | null = null;
    @property(Label) status: Label | null = null;
    @property(Label) speedCaption: Label | null = null;
    @property(Label) pauseCaption: Label | null = null;
    skeleton: sp.Skeleton | null = null;
    private clip: Clip = 'idle';
    private rate = 1;
    private frozen = false;
    private fixedClock = false;
    private step = -1;
    private queuedAttack = false;
    private carry = false;
    private respawn: { next: Clip; time: number; switched: boolean } | null = null;
    private opacity: UIOpacity | null = null;
    private shadow: Graphics | null = null;
    private shadowNode: Node | null = null;

    start(): void {
        view.setDesignResolutionSize(1440, 900, ResolutionPolicy.SHOW_ALL);
        this.skeleton = this.actor!.getComponent(sp.Skeleton)!;
        this.opacity = this.actor!.getComponent(UIOpacity) ?? this.actor!.addComponent(UIOpacity);
        const oldShadow = this.node.getChildByName('FootShadow');
        if (oldShadow) oldShadow.active = false;
        this.shadowNode = new Node('ContactShadows');
        this.shadowNode.layer = this.actor!.layer;
        this.shadowNode.parent = this.actor!.parent;
        this.shadowNode.setSiblingIndex(0);
        this.shadow = this.shadowNode.addComponent(Graphics);
        const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.playSequence();
        if (reduced) { this.playIdle(); this.togglePause(); }
    }
    private begin(next: Clip, hard = false): void {
        const s = this.skeleton!;
        const from = s.getCurrent(0), previous = from?.animation?.name, t = from?.trackTime ?? 0;
        const seek = !hard && previous === 'prepare' && next === 'attack' ? loadedAt * Math.min(1, t / prepareAt) : 0;
        if (hard) {
            s.clearTracks(); s.setToSetupPose(); this.carry = false;
        } else {
            if (previous === 'attack' && t >= releaseAt && t < flightEnd && next !== 'attack') {
                const flight = s.setAnimation(1, 'card-flight', false);
                if (flight) { flight.mixDuration = 0; flight.trackTime = t - releaseAt; }
            }
            if ((next === 'hurt' || next === 'idle' || next === 'death') && s.findSlot('held-card')?.getAttachment()) {
                const hold = s.setAnimation(2, 'carry-card', false);
                if (hold) { hold.mixDuration = 0; this.carry = true; }
            } else if ((next === 'prepare' || next === 'attack') && this.carry) {
                s.clearTrack(2); this.carry = false;
            }
            if (from) from.eventThreshold = 0;
        }
        const entry = s.setAnimation(0, next, next === 'idle');
        if (!entry) throw new Error('动作轨道缺失 ' + next);
        entry.mixDuration = hard || !from || seek > 0 ? 0 : next === 'hurt' ? .105 : next === 'death' ? .13 : .10;
        entry.trackTime = seek;
        this.clip = next;
        s.timeScale = this.rate;
        s.paused = this.fixedClock || this.frozen;
        this.captions();
    }
    private transition(next: Clip): void {
        if (this.respawn) { this.respawn.next = next; return; }
        if (this.clip === 'death' && next !== 'death' && (this.skeleton?.getCurrent(0)?.trackTime ?? 0) > .49) {
            this.respawn = { next, time: 0, switched: false };
            return;
        }
        this.begin(next);
    }
    private select(next: Clip): void {
        this.step = -1;
        this.frozen = false;
        if (this.skeleton) this.skeleton.paused = this.fixedClock;
        if (next === 'attack' && this.clip === 'attack' && (this.skeleton?.getCurrent(0)?.trackTime ?? 0) < 1.095) {
            this.queuedAttack = true;
            this.captions();
            return;
        }
        this.queuedAttack = false;
        this.transition(next);
    }
    playIdle(): void { this.select('idle'); }
    playPrepare(): void { this.select('prepare'); }
    playAttack(): void { this.select('attack'); }
    playHurt(): void { this.select('hurt'); }
    playDeath(): void { this.select('death'); }
    playSequence(): void {
        this.frozen = false;
        if (this.skeleton) this.skeleton.paused = this.fixedClock;
        this.step = 0; this.queuedAttack = false;
        this.transition('idle');
    }
    toggleSpeed(): void {
        this.rate = this.rate === 1 ? .5 : 1;
        if (this.skeleton) this.skeleton.timeScale = this.rate;
        this.captions();
    }
    togglePause(): void {
        this.frozen = !this.frozen;
        if (this.skeleton) this.skeleton.paused = this.fixedClock || this.frozen;
        this.captions();
    }
    private captions(): void {
        if (this.status) this.status.string = '青年求生者  ·  ' + titles[this.clip] + (this.queuedAttack ? '  ·  下一张已排队' : '');
        if (this.speedCaption) this.speedCaption.string = this.rate === 1 ? '速度 ×1' : '速度 ×0.5';
        if (this.pauseCaption) this.pauseCaption.string = this.frozen ? '继续' : '暂停';
    }
    private groundShadow(): void {
        const s = this.skeleton, g = this.shadow;
        if (!s || !g) return;
        const near = s.findBone('near-boot'), far = s.findBone('far-boot'), hip = s.findBone('hips'), head = s.findBone('head');
        if (!near || !far || !hip || !head) return;
        g.clear();
        const alpha = (this.opacity?.opacity ?? 255) / 255;
        const ellipse = (x: number, w: number, h: number, a: number) => {
            g.fillColor = new Color(31, 25, 40, Math.round(a * alpha)); g.ellipse(x, 0, w, h); g.fill();
        };
        for (const foot of [near, far]) {
            const weight = Math.max(0, 1 - Math.max(0, foot.worldY - 38) / 19);
            ellipse(foot.worldX + 7, 24, 3.4, 26 + 28 * weight);
        }
        const contact = Math.max(0, Math.min(1, (160 - hip.worldY) / 125));
        ellipse(hip.worldX + (head.worldX - hip.worldX) * contact * .47, 33 + Math.abs(head.worldX - hip.worldX) * contact * .56, 4 + contact * 4, 14 + contact * 35);
    }
    private afterPose(dt: number): void {
        const s = this.skeleton;
        if (!s) return;
        s._skeleton?.updateWorldTransform();
        this.groundShadow();
        if (this.frozen) return;
        if (this.respawn) {
            const r = this.respawn; r.time += dt * this.rate;
            if (!r.switched && r.time >= .12) { this.opacity!.opacity = 0; this.begin(r.next, true); r.switched = true; }
            this.opacity!.opacity = Math.round(255 * (r.switched ? Math.min(1, (r.time - .12) / .16) : Math.max(0, 1 - r.time / .12)));
            if (r.time >= .28) this.respawn = null;
            return;
        }
        const main = s.getCurrent(0), flight = s.getCurrent(1);
        if (!main) return;
        if (flight && flight.trackTime >= flightEnd - releaseAt) {
            s.clearTrack(1); s.findSlot('flight-card')?.setAttachment(null);
        }
        if (this.carry) {
            const finger = s.findBone('AttackTip'), mouth = s.findBone('CardMouth');
            if (finger && mouth && Math.hypot(finger.worldX - mouth.worldX, finger.worldY - mouth.worldY) < 5.5 && main.trackTime > .08) {
                s.clearTrack(2); s.findSlot('held-card')?.setAttachment(null); this.carry = false;
            }
        }
        const t = main.trackTime, duration = main.animation?.duration ?? 0;
        if (this.step >= 0) {
            const [next, hold] = sequence[this.step];
            if (t < (next === 'idle' ? hold : duration + hold)) return;
            this.step = (this.step + 1) % sequence.length;
            this.transition(sequence[this.step][0]);
        } else if (t >= duration && (this.clip === 'attack' || this.clip === 'hurt')) {
            const next = this.queuedAttack ? 'attack' : 'idle'; this.queuedAttack = false; this.begin(next);
        }
    }
    lateUpdate(dt: number): void {
        if (!this.fixedClock) this.afterPose(dt);
    }
    /** The recorder advances the same tracks and transition controller once per output step. */
    setReviewClock(fixed: boolean): void {
        this.fixedClock = fixed;
        if (this.skeleton) this.skeleton.paused = this.fixedClock || this.frozen;
    }
    advanceReview(dt: number): void {
        const s = this.skeleton;
        if (!s || !this.fixedClock || this.frozen) return;
        s.paused = false; s.updateAnimation(dt); s.paused = true; this.afterPose(dt);
    }
}
