import { _decorator, Component, Label, Node, ResolutionPolicy, UITransform, Vec3, view } from 'cc';
import { StatusBar } from './StatusBar';
import { defaultStatus, StatusBarInput } from './StatusBarModel';
import { ACTION_EVENT, ActionInputEvent } from './UIEvents';
import { ButtonAction } from './ButtonAction';
import { ButtonFocusGroup } from './ButtonFocusGroup';
const { ccclass, property } = _decorator;
function examples(): StatusBarInput[] {
    return [
        { ...defaultStatus, saveStatus: '进度已保存' },
        { ...defaultStatus, supplies: 1, health: 2, deckCount: 20, saveStatus: '已恢复备份' },
        { ...defaultStatus, supplies: 0, health: 0, deckCount: 12 },
        { ...defaultStatus, day: 123, supplies: 12345678, saveStatus: '原存档已保留' },
    ];
}
@ccclass('StatusBarDesignReview')
export class StatusBarDesignReview extends Component {
    @property({ type: [Node] }) bars: Node[] = [];
    @property({ type: [Node] }) headings: Node[] = [];
    @property({ type: [Node] }) controls: Node[] = [];
    @property(Label) status: Label | null = null;
    private cases = examples();
    private widthIndex = 0;
    private counters: Record<string, number> = {};
    onLoad(): void {
        this.bars.forEach((node) => (node.getComponent(StatusBar)!.presentation = 'strip'));
        view.setDesignResolutionSize(1440, 900, ResolutionPolicy.SHOW_ALL);
        this.node.on(ACTION_EVENT, this.onAction, this);
        Object.assign(globalThis, { __statusBarDesignReview: { snapshot: () => this.snapshot() } });
        this.refresh();
    }
    onDestroy(): void {
        this.node.off(ACTION_EVENT, this.onAction, this);
    }
    private onAction(event: ActionInputEvent): void {
        event.propagationStopped = true;
        const id = event.detail.id,
            live = this.cases[3];
        if (id === 'supplies-state')
            live.supplies = live.supplies > 1 ? 1 : live.supplies === 1 ? 0 : 10;
        else if (id === 'health-state') {
            live.health = live.health > 2 ? 2 : live.health === 2 ? 0 : 10;
        } else if (id === 'carry-state') {
            live.deckCount = live.deckCount === 7 ? 12 : 7;
        } else if (id === 'save-state') {
            const states = ['进度已保存', '已恢复备份', '保存失败，请勿关闭', '原存档已保留'];
            live.saveStatus = states[(states.indexOf(live.saveStatus) + 1) % states.length];
        } else if (id === 'width-state') this.widthIndex = (this.widthIndex + 1) % 3;
        else if (id === 'lock-state') live.actionsEnabled = !live.actionsEnabled;
        else if (id === 'reset-state') {
            this.cases = examples();
            this.widthIndex = 0;
            this.counters = {};
        } else {
            this.counters[id] = (this.counters[id] ?? 0) + 1;
            if (id === 'audio') {
                const target = event.target as Node;
                const index = this.bars.findIndex(
                    (node) => target === node || node.isChildOf(target) || target.isChildOf(node)
                );
                const state = this.cases[index < 0 ? 3 : index];
                state.muted = !state.muted;
            }
        }
        this.refresh();
    }
    private refresh(): void {
        const width = [1320, 960, 408][this.widthIndex];
        this.bars.forEach((node, index) => {
            node.active = !this.widthIndex || index === 3;
            if (index === 3) {
                node.setPosition(0, this.widthIndex ? 30 : -160);
                node.getComponent(UITransform)!.width = width;
            } else node.getComponent(UITransform)!.width = 1320;
            node.getComponent(StatusBar)?.render(this.cases[index]);
        });
        this.headings.forEach((node, index) => (node.active = !this.widthIndex || index === 3));
        if (this.headings[3]) this.headings[3].setPosition(0, this.widthIndex ? 214 : -97);
        const widthAction = this.controls
            .find((node) => node.name === 'width-state')
            ?.getComponent(ButtonAction);
        widthAction?.setText(
            this.widthIndex === 0
                ? '中等宽度'
                : this.widthIndex === 1
                  ? '窄尺寸对照'
                  : '恢复常规宽度'
        );
        this.controls
            .find((node) => node.name === 'lock-state')
            ?.getComponent(ButtonAction)
            ?.setText(this.cases[3].actionsEnabled ? '切换锁定' : '恢复操作');
        if (this.status)
            this.status.string = `背包 ${this.counters.bag ?? 0} 次  ·  记录 ${this.counters.log ?? 0} 次  ·  帮助 ${this.counters.help ?? 0} 次  ·  声音 ${this.counters.audio ?? 0} 次  ·  重开 ${this.counters.restart ?? 0} 次`;
    }
    private bounds(node: Node): object {
        const local = this.node
                .getComponent(UITransform)!
                .convertToNodeSpaceAR(
                    new Vec3(node.worldPosition.x, node.worldPosition.y, node.worldPosition.z)
                ),
            size = node.getComponent(UITransform)!.contentSize;
        return {
            x: local.x + 720 - size.width / 2,
            y: 450 - local.y - size.height / 2,
            width: size.width,
            height: size.height,
        };
    }
    private snapshot(): object {
        return {
            widthIndex: this.widthIndex,
            counters: { ...this.counters },
            bars: this.bars.map((node, index) => ({
                index,
                active: node.activeInHierarchy,
                ...node.getComponent(StatusBar)!.inspect(),
            })),
            hits: this.node
                .getComponentsInChildren(ButtonAction)
                .filter((action) => action.node.activeInHierarchy)
                .map((action) => ({
                    id: action.actionId,
                    enabled: action.enabled,
                    bar: this.bars.findIndex((node) => action.node.isChildOf(node)),
                    ...this.bounds(action.node),
                })),
            focus: this.getComponent(ButtonFocusGroup)?.inspect(),
        };
    }
}
