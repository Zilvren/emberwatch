import { _decorator, Component, Label, Node, ResolutionPolicy, UITransform, Vec3, view } from 'cc';
import { ACTION_EVENT, ActionInputEvent } from './UIEvents';
import { CommonPanel } from './CommonPanel';
import { ButtonAction } from './ButtonAction';
import { ButtonFocusGroup } from './ButtonFocusGroup';
const { ccclass, property } = _decorator;
const paragraphs = [
    '离开避难所前，把需要确认的信息放在同一张纸上。标题说明当前目的，正文保留足够的阅读空间。',
    '正文变长后，只滚动中间的内容区。标题、关闭按钮与底部操作保持可见，不会跟着内容消失。',
    '这里展示的是容器与排版示例，文字不代表新增玩法。确认与取消的实际含义由使用面板的系统决定。',
    '细灰棕线、浅土黄和灰橄榄沿用已经确定的画风。纸面使用固定轮廓，打开时不会重新生成纹理或抖动。',
    '可以用滚轮或拖动阅读，也可以按 PageDown、PageUp、Home、End。按 Escape 关闭时，焦点会回到打开面板的按钮。',
    '记录末尾：你已经读到了最后一段。底部操作始终位于相同的位置。',
];
@ccclass('PanelDesignReview')
export class PanelDesignReview extends Component {
    @property({ type: [Node] }) dialogs: Node[] = [];
    @property({ type: [Node] }) samples: Node[] = [];
    @property(Label) status: Label | null = null;
    private selected = -1;
    private narrow = false;
    private longTitle = false;
    private confirmed = 0;
    private cancelled = 0;
    onLoad(): void {
        view.setDesignResolutionSize(1440, 900, ResolutionPolicy.SHOW_ALL);
        this.node.on(ACTION_EVENT, this.onAction, this);
        Object.assign(globalThis, { __panelDesignReview: { snapshot: () => this.snapshot() } });
        this.refresh();
    }
    onDestroy(): void {
        this.node.off(ACTION_EVENT, this.onAction, this);
    }
    private onAction(event: ActionInputEvent): void {
        event.propagationStopped = true;
        const id = event.detail.id;
        if (id === 'open-info' || id === 'open-confirm' || id === 'open-wide') {
            this.selected = ['open-info', 'open-confirm', 'open-wide'].indexOf(id);
            const panel = this.dialogs[this.selected].getComponent(CommonPanel)!;
            const title =
                this.selected === 1
                    ? '确认这次选择？'
                    : this.selected === 2
                      ? '行动记录'
                      : '阅读面板';
            panel.setContent(
                this.longTitle ? '标题很长时应自然换行，关闭按钮仍保留独立空间' : title,
                this.selected === 1
                    ? '这是组件操作示例。\n\n确认会增加演示计数；取消或关闭不会执行确认。'
                    : paragraphs.join('\n\n'),
                this.selected === 1 ? '请确认后再继续' : 'THE END  /  FIELD NOTES'
            );
            this.refresh();
        } else if (id === 'toggle-width') {
            this.narrow = !this.narrow;
            this.refresh();
        } else if (id === 'toggle-title') {
            this.longTitle = !this.longTitle;
            this.refresh();
        } else if (id === 'modal-confirm' && this.selected === 1) {
            this.confirmed++;
            this.selected = -1;
            this.refresh();
        } else if (id === 'modal-close' || id === 'modal-cancel') {
            this.cancelled++;
            this.selected = -1;
            this.refresh();
        }
    }
    private refresh(): void {
        this.dialogs.forEach((node, index) => {
            node.getComponent(UITransform)?.setContentSize(
                this.narrow ? 408 : 1440,
                this.narrow ? 720 : 900
            );
            node.active = index === this.selected;
        });
        for (const action of this.node.getComponentsInChildren(ButtonAction)) {
            if (action.actionId === 'toggle-width')
                action.setText(this.narrow ? '恢复常规宽度' : '窄尺寸对照');
            if (action.actionId === 'toggle-title')
                action.setText(this.longTitle ? '恢复短标题' : '使用长标题');
        }
        if (this.status)
            this.status.string = `确认 ${this.confirmed} 次  ·  关闭/取消 ${this.cancelled} 次`;
    }
    private bounds(node: Node): object {
        const world = node.worldPosition,
            local = this.node
                .getComponent(UITransform)!
                .convertToNodeSpaceAR(new Vec3(world.x, world.y, world.z));
        const size = node.getComponent(UITransform)!.contentSize;
        return {
            x: local.x + 720 - size.width / 2,
            y: 450 - local.y - size.height / 2,
            width: size.width,
            height: size.height,
        };
    }
    private snapshot(): object {
        const dialog = this.dialogs[this.selected];
        return {
            selected: this.selected,
            narrow: this.narrow,
            longTitle: this.longTitle,
            confirmed: this.confirmed,
            cancelled: this.cancelled,
            panel: dialog?.getComponent(CommonPanel)?.inspect(),
            focus: (dialog ?? this.node).getComponent(ButtonFocusGroup)?.inspect(),
            hits: (dialog ?? this.node)
                .getComponentsInChildren(ButtonAction)
                .filter((button) => button.node.activeInHierarchy)
                .map((button) => ({
                    id: button.actionId,
                    name: button.node.name,
                    ...this.bounds(button.node),
                })),
            samples: this.samples.map((node) => node.getComponent(CommonPanel)?.inspect()),
        };
    }
}
