import {
    _decorator, Component, EventKeyboard, EventTouch, input, Input, KeyCode, Label,
    ResolutionPolicy, sp, UITransform, Vec3, view,
} from 'cc';

const { ccclass, property } = _decorator;
const cards = ['lantern', 'guard', 'repel'] as const;
type Card = typeof cards[number];
const positions: Record<Card,string> = { lantern:'左下', guard:'中间', repel:'右上' };

@ccclass('SurvivorFlickSpineReview')
export class SurvivorFlickSpineReview extends Component {
    @property(sp.Skeleton) skeleton: sp.Skeleton | null = null;
    @property(Label) status: Label | null = null;
    @property(Label) speedCaption: Label | null = null;
    @property(Label) pauseCaption: Label | null = null;
    @property(Label) framingCaption: Label | null = null;

    private stage: 'fan' | 'think' | 'flick' = 'think';
    private active: Card | null = null;
    private selected: Card | null = 'guard';
    private confirmed: Card | null = null;
    private readonly spent = new Set<Card>();
    private readonly originalPosition = new Vec3();
    private readonly originalScale = new Vec3();
    private close = false;

    start(): void {
        view.setDesignResolutionSize(1440, 900, ResolutionPolicy.SHOW_ALL);
        const actor = this.skeleton!;
        Vec3.copy(this.originalPosition, actor.node.position);
        Vec3.copy(this.originalScale, actor.node.scale);
        for (const card of cards) {
            const action = card + '-flick';
            for (const previous of ['think', 'fan-in', ...cards.map(id => 'think-without-' + id)]) {
                actor.setMix(previous, action, .065);
            }
            actor.setMix(action, 'think-without-' + card, .065);
        }
        actor.setEventListener((entry, event) => {
            if (typeof event !== 'number' && this.active && entry.animation?.name === this.active + '-flick' && event.data.name === 'release') {
                this.caption('牌已弹出');
            }
        });
        input.on(Input.EventType.TOUCH_END, this.chooseBack, this);
        input.on(Input.EventType.KEY_DOWN, this.key, this);
        this.rest();
        if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
            this.pause(true);
        }
    }

    onDestroy(): void {
        input.off(Input.EventType.TOUCH_END, this.chooseBack, this);
        input.off(Input.EventType.KEY_DOWN, this.key, this);
        this.skeleton?.setEventListener(null);
    }

    private caption(text: string): void {
        if (this.status) this.status.string = '青年求生者  ·  ' + text;
    }

    private pause(paused: boolean): void {
        this.skeleton!.paused = paused;
        if (this.pauseCaption) this.pauseCaption.string = paused ? '继续' : '暂停';
    }

    think(): void {
        const s = this.skeleton!;
        for (const id of this.spent) s.clearTrack(1 + cards.indexOf(id));
        this.spent.clear();
        this.stage = 'fan';
        this.active = null;
        this.selected = 'guard';
        this.confirmed = null;
        this.pause(false);
        s.setAnimation(0, 'fan-in', false);
        this.caption('展牌');
    }

    private rest(last?: Card): void {
        this.stage = 'think';
        this.active = null;
        this.skeleton!.setAnimation(0, last ? 'think-without-' + last : 'think', true);
        this.selectionCaption();
    }

    private selectionCaption(): void {
        if (this.spent.size === cards.length) this.caption('本轮已出完');
        else if (this.selected) this.caption('已选' + positions[this.selected] + '  ·  按「出牌」');
        else this.caption('点一张牌背选牌');
    }

    private select(card: Card): void {
        if (this.spent.has(card) || this.active === card) return;
        this.selected = card;
        this.selectionCaption();
    }

    private cast(card: Card): void {
        const s = this.skeleton!;
        this.stage = 'flick';
        this.active = card;
        if (this.selected === card) this.selected = null;
        this.pause(false);
        s.setAnimation(0, card + '-flick', false);
        this.caption('出牌  ·  ' + positions[card]);
    }

    playSelected(): void {
        const card = this.selected;
        if (!card || this.spent.has(card) || this.active === card) return;
        if (this.stage === 'think') this.cast(card);
        else {
            this.confirmed = card;
            this.caption('收势后出' + positions[card] + '的牌');
        }
    }

    lateUpdate(): void {
        const s = this.skeleton!;
        if (s.paused || this.stage === 'think') return;
        const entry = s.getCurrent(0);
        const action = this.active;
        const expected = action ? action + '-flick' : 'fan-in';
        if (entry?.animation?.name !== expected || entry.trackTime < entry.animation.duration) return;
        if (action) {
            this.spent.add(action);
            const hide = s.setAnimation(1 + cards.indexOf(action), 'spent-' + action, false);
            if (hide) hide.mixDuration = 0;
        }
        const next = this.confirmed;
        this.confirmed = null;
        if (next && !this.spent.has(next)) this.cast(next);
        else this.rest(action ?? undefined);
    }

    toggleSpeed(): void {
        const s = this.skeleton!;
        s.timeScale = s.timeScale === 1 ? .5 : 1;
        if (this.speedCaption) this.speedCaption.string = '速度 ×' + s.timeScale;
    }

    togglePause(): void {
        this.pause(!this.skeleton!.paused);
    }

    toggleFraming(): void {
        this.close = !this.close;
        const n = this.skeleton!.node;
        if (this.close) {
            n.setScale(2.65, 2.65, 1);
            n.setPosition(-163, -766, 0);
        } else {
            n.setPosition(this.originalPosition);
            n.setScale(this.originalScale);
        }
        for (const name of ['FootShadow','NearFootShadow','FarFootShadow']) {
            const shadow = this.node.getChildByName(name);
            if (shadow) shadow.active = !this.close;
        }
        if (this.framingCaption) this.framingCaption.string = this.close ? '看全身' : '看手势';
    }

    private key(event: EventKeyboard): void {
        if (event.keyCode >= KeyCode.DIGIT_1 && event.keyCode <= KeyCode.DIGIT_3) {
            this.select(cards[event.keyCode - KeyCode.DIGIT_1]);
        } else if (event.keyCode === KeyCode.KEY_R) this.think();
        else if (event.keyCode === KeyCode.ENTER) this.playSelected();
        else if (event.keyCode === KeyCode.KEY_V) this.toggleFraming();
        else if (event.keyCode === KeyCode.SPACE) this.togglePause();
    }

    private chooseBack(event: EventTouch): void {
        const s = this.skeleton!;
        const pos = event.getUILocation();
        const transform = s.node.getComponent(UITransform)!;
        const p = transform.convertToNodeSpaceAR(new Vec3(pos.x, pos.y, 0));
        for (const id of cards) {
            const b = s.findBone('float-' + id);
            const a = s.findSlot('float-' + id)?.getAttachment() as sp.spine.RegionAttachment | null;
            if (!b || !a) continue;
            const determinant = b.a * b.d - b.b * b.c;
            if (Math.abs(determinant) < .004) continue;
            const dx = p.x - b.worldX, dy = p.y - b.worldY;
            const x = (b.d * dx - b.b * dy) / determinant;
            const y = (b.a * dy - b.c * dx) / determinant;
            if (Math.abs(x) <= a.width * a.scaleX / 2 && Math.abs(y) <= a.height * a.scaleY / 2) {
                this.select(id);
                return;
            }
        }
    }
}
