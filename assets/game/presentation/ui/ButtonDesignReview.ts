import { _decorator, Component, Label, Node, ResolutionPolicy, UITransform, Vec3, view } from 'cc';
import { ACTION_EVENT, ActionInputEvent } from './UIEvents';
import { ButtonAction } from './ButtonAction';
import { ButtonPresentation } from './ButtonPresentation';
import { ButtonFocusGroup } from './ButtonFocusGroup';
const { ccclass, property } = _decorator;
@ccclass('ButtonDesignReview')
export class ButtonDesignReview extends Component {
    @property({ type: [Node] }) liveButtons: Node[] = [];
    @property({ type: [Node] }) samples: Node[] = [];
    @property({ type: [Node] }) controls: Node[] = [];
    @property(Label) status: Label | null = null;
    @property(Node) darkBackdrop: Node | null = null;
    private counts: Record<string, number> = {};
    private locked = false;
    private dark = false;
    onLoad(): void {
        view.setDesignResolutionSize(1440, 900, ResolutionPolicy.SHOW_ALL);
        this.node.on(ACTION_EVENT, this.onAction, this);
        this.refresh();
        Object.assign(globalThis, { __buttonDesignReview: { snapshot: () => this.snapshot() } });
    }
    onDestroy(): void {
        this.node.off(ACTION_EVENT, this.onAction, this);
    }
    private onAction(event: ActionInputEvent): void {
        event.propagationStopped = true;
        const id = event.detail.id.replace(/^Button_/, 'live-');
        if (id === 'toggle-live') {
            this.locked = !this.locked;
            this.liveButtons.forEach((node) =>
                node.getComponent(ButtonAction)!.setEnabled(!this.locked)
            );
        } else if (id === 'toggle-surface') {
            this.dark = !this.dark;
            if (this.darkBackdrop) this.darkBackdrop.active = this.dark;
            this.liveButtons.forEach((node) =>
                node.getComponent(ButtonPresentation)!.setDarkSurface(this.dark)
            );
        } else if (id === 'reset-counts') this.counts = {};
        else this.counts[id] = (this.counts[id] ?? 0) + 1;
        this.refresh();
    }
    private refresh(): void {
        if (this.status)
            this.status.string = `主操作 ${this.counts['live-primary'] ?? 0} 次　次要 ${this.counts['live-secondary'] ?? 0} 次　轻操作 ${this.counts['live-quiet'] ?? 0} 次　危险操作 ${this.counts['live-danger'] ?? 0} 次`;
        this.controls
            .find((node) => node.name === 'toggle-live')
            ?.getComponent(ButtonAction)
            ?.setText(this.locked ? '恢复可用' : '切换禁用');
    }
    private bounds(node: Node): object {
        const box = node.getComponent(UITransform)!.getBoundingBoxToWorld(),
            root = this.node.getComponent(UITransform)!;
        const low = root.convertToNodeSpaceAR(new Vec3(box.xMin, box.yMin)),
            high = root.convertToNodeSpaceAR(new Vec3(box.xMax, box.yMax));
        return { x: low.x + 720, y: 450 - high.y, width: high.x - low.x, height: high.y - low.y };
    }
    private snapshot(): object {
        const inspect = (node: Node) => ({
            id: node.name,
            ...this.bounds(node),
            view: node.getComponent(ButtonPresentation)?.inspect(),
        });
        return {
            darkSurface: this.dark,
            counts: { ...this.counts },
            locked: this.locked,
            live: this.liveButtons.map(inspect),
            samples: this.samples.map(inspect),
            controls: this.controls.map(inspect),
            focus: this.getComponent(ButtonFocusGroup)?.inspect(),
        };
    }
}
