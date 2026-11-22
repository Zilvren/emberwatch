import { _decorator, Component, EventKeyboard, input, Input, KeyCode, Label, Node, ResolutionPolicy, view } from 'cc';
import { cardNames, SurvivorFramePlayer } from './SurvivorFramePlayer';

const { ccclass } = _decorator;

@ccclass('SurvivorFrameReview')
export class SurvivorFrameReview extends Component {
    player!: SurvivorFramePlayer;
    private close = false;

    start(): void {
        view.setDesignResolutionSize(1440, 900, ResolutionPolicy.SHOW_ALL);
        this.player = this.getComponentInChildren(SurvivorFramePlayer)!;
        const controls = this.node.getChildByName('Controls')!;
        cardNames.forEach((name, index) => {
            const choose = () => this.player.choose(index);
            this.player.node.getChildByPath(name + '/Face')!.on(Node.EventType.TOUCH_END, choose, this);
            controls.getChildByName(name)!.on(Node.EventType.TOUCH_END, choose, this);
        });
        for (const [name, handler] of [
            ['Deal', () => this.player.deal()], ['Speed', () => this.speed()],
            ['Pause', () => this.pause()], ['Framing', () => this.framing()],
        ] as const) controls.getChildByName(name)!.on(Node.EventType.TOUCH_END, handler, this);
        input.on(Input.EventType.KEY_DOWN, this.key, this);
    }

    onDestroy(): void { input.off(Input.EventType.KEY_DOWN, this.key, this); }

    private label(control: string, value: string): void {
        this.node.getChildByPath('Controls/' + control + '/Caption')!.getComponent(Label)!.string = value;
    }
    private speed(): void {
        this.player.setRate(this.player.rate === 1 ? .5 : 1);
        this.label('Speed', this.player.rate === 1 ? '速度 ×1' : '速度 ×0.5');
    }
    private pause(): void {
        this.player.setPaused(!this.player.paused);
        this.label('Pause', this.player.paused ? '继续' : '暂停');
    }
    framing(): void {
        this.close = !this.close;
        const stage = this.node.getChildByName('Figure')!;
        const scale = this.close ? 1.65 : .82;
        stage.setScale(scale, scale, 1);
        stage.setPosition(this.close ? -80 : -39, this.close ? -352 : 20);
        this.node.getChildByName('Ground')!.active = !this.close;
        this.label('Framing', this.close ? '看全身' : '看手势');
    }
    private key(e: EventKeyboard): void {
        switch (e.keyCode) {
        case KeyCode.DIGIT_1: this.player.choose(0); break;
        case KeyCode.DIGIT_2: this.player.choose(1); break;
        case KeyCode.DIGIT_3: this.player.choose(2); break;
        case KeyCode.KEY_R: this.player.deal(); break;
        case KeyCode.KEY_V: this.framing(); break;
        case KeyCode.SPACE: this.pause(); break;
        }
    }
}
