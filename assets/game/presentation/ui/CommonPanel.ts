import { _decorator, Color, Component, JsonAsset, Label, Node, ScrollView, UITransform } from 'cc';
import { PaperPanel } from '../primitives/PaperPanel';
import { ButtonPresentation } from './ButtonPresentation';
import { panelLayout } from './PanelLayout';
const { ccclass, property, executeInEditMode } = _decorator;

/** Reusable paper container. Content and commands remain owned by the caller. */
@ccclass('CommonPanel')
@executeInEditMode
export class CommonPanel extends Component {
    @property(JsonAsset) theme: JsonAsset | null = null;
    @property(Node) sheet: Node | null = null;
    @property(Label) title: Label | null = null;
    @property(Label) subtitle: Label | null = null;
    @property(Label) body: Label | null = null;
    @property(Node) closeButton: Node | null = null;
    @property(Node) headerLine: Node | null = null;
    @property(Node) footerLine: Node | null = null;
    @property(Node) viewport: Node | null = null;
    @property(Node) content: Node | null = null;
    @property(ScrollView) scroll: ScrollView | null = null;
    @property(Label) scrollHint: Label | null = null;
    @property({ type: [Node] }) actions: Node[] = [];
    @property preferredWidth = 760;
    @property preferredHeight = 580;
    private signature = '';
    private actionWidths: number[] = [];
    private geometry: ReturnType<typeof panelLayout> | null = null;
    onEnable(): void {
        this.signature = '';
        this.refresh();
        this.scroll?.node.on(ScrollView.EventType.SCROLLING, this.updateHint, this);
    }
    onDisable(): void {
        this.scroll?.node.off(ScrollView.EventType.SCROLLING, this.updateHint, this);
    }
    lateUpdate(): void {
        this.refresh();
    }
    setSize(width: number, height: number): void {
        this.preferredWidth = width;
        this.preferredHeight = height;
        this.refresh();
    }
    setContent(title: string, body: string, subtitle = ''): void {
        if (this.title) this.title.string = title;
        if (this.body) this.body.string = body;
        if (this.subtitle) this.subtitle.string = subtitle;
        this.refresh();
    }
    private size(node: Node | null, width: number, height: number): void {
        node?.getComponent(UITransform)?.setContentSize(width, height);
    }
    refresh(): void {
        const area = this.getComponent(UITransform)?.contentSize;
        if (!area || !this.sheet || !this.title || !this.viewport || !this.content) return;
        const signature = [
            area.width,
            area.height,
            this.preferredWidth,
            this.preferredHeight,
            this.title.string,
            this.subtitle?.string,
            this.body?.string,
            ...this.actions.map((node) => node.active),
        ].join('|');
        if (signature === this.signature) return;
        this.signature = signature;
        const theme = this.theme?.json,
            tokens = theme?.panel;
        const padding = tokens?.padding ?? 24,
            margin = tokens?.margin ?? 20;
        const width = Math.min(this.preferredWidth, area.width - margin * 2);
        const inner = width - Math.min(padding, Math.max(16, width * 0.05)) * 2;
        const titleSize = this.title.getComponent(UITransform)!;
        this.title.overflow = Label.Overflow.RESIZE_HEIGHT;
        this.title.enableWrapText = true;
        titleSize.setContentSize(Math.max(20, inner - (this.closeButton ? 60 : 0)), 32);
        this.title.updateRenderData(true);
        const subtitleHeight = this.subtitle?.string ? 22 : 0;
        if (!this.actionWidths.length)
            this.actionWidths = this.actions.map((node) => node.getComponent(UITransform)!.width);
        const visibleActions = this.actions.filter((node) => node.active);
        const layout = panelLayout({
            availableWidth: area.width,
            availableHeight: area.height,
            width: this.preferredWidth,
            height: this.preferredHeight,
            titleHeight: titleSize.height,
            subtitleHeight,
            actionWidths: this.actions
                .map((node, index) => (node.active ? this.actionWidths[index] : 0))
                .filter((value) => value > 0),
            padding,
            margin,
            gap: tokens?.gap ?? 12,
            buttonHeight: tokens?.buttonHeight ?? 48,
        });
        this.geometry = layout;
        this.size(this.sheet, layout.width, layout.height);
        const left = -layout.width / 2 + layout.padding,
            top = layout.height / 2 - layout.padding;
        this.title.node.setPosition(left, top);
        if (this.subtitle) {
            this.subtitle.node.active = !!subtitleHeight;
            this.size(this.subtitle.node, layout.innerWidth, subtitleHeight);
            this.subtitle.node.setPosition(left, top - titleSize.height - 6);
        }
        if (this.closeButton) {
            this.closeButton.setPosition(layout.width / 2 - layout.padding - 20, top - 20);
            this.closeButton.getComponent(ButtonPresentation)?.resize(40, 40);
        }
        this.size(this.headerLine, layout.innerWidth, 1);
        this.headerLine?.setPosition(0, layout.height / 2 - layout.headerHeight);
        this.size(this.footerLine, layout.innerWidth, 1);
        this.footerLine?.setPosition(0, -layout.height / 2 + layout.footerHeight);
        if (this.footerLine) this.footerLine.active = visibleActions.length > 0;
        this.size(this.viewport, layout.innerWidth, layout.bodyHeight);
        this.viewport.setPosition(0, layout.bodyY);
        this.size(this.content, layout.innerWidth, layout.bodyHeight);
        if (this.body) {
            this.body.overflow = Label.Overflow.RESIZE_HEIGHT;
            this.body.enableWrapText = true;
            this.size(this.body.node, layout.innerWidth - 18, layout.bodyHeight);
            this.body.node.setPosition(-layout.innerWidth / 2, 0);
            this.body.updateRenderData(true);
            this.size(
                this.content,
                layout.innerWidth,
                Math.max(layout.bodyHeight, this.body.getComponent(UITransform)!.height + 4)
            );
        }
        visibleActions.forEach((node, index) => {
            const slot = layout.actions[index];
            node.setPosition(slot.x, slot.y);
            node.getComponent(ButtonPresentation)?.resize(slot.width, slot.height);
        });
        this.content.setPosition(0, layout.bodyHeight / 2);
        this.scroll?.stopAutoScroll();
        this.scroll?.scrollToTop(0);
        this.sheet.getComponent(PaperPanel)?.redraw();
        if (theme) {
            const ink = new Color().fromHEX(theme.colors.ink);
            this.title.color = ink;
            if (this.body) this.body.color = ink;
            if (this.subtitle) this.subtitle.color = new Color().fromHEX(theme.colors.muted);
        }
        this.updateHint();
    }
    private updateHint(): void {
        if (!this.scrollHint || !this.scroll || !this.geometry) return;
        const max = this.scroll.getMaxScrollOffset().y;
        this.scrollHint.node.active = max > 1;
        this.scrollHint.string = this.scroll.getScrollOffset().y >= max - 2 ? '↑' : '↓';
        this.scrollHint.node.setPosition(
            this.geometry.innerWidth / 2 - 8,
            this.geometry.bodyY - this.geometry.bodyHeight / 2 + 12
        );
    }
    inspect(): object {
        return {
            ...this.geometry,
            title: this.title?.string,
            textHeight: this.body?.getComponent(UITransform)?.height,
            contentHeight: this.content?.getComponent(UITransform)?.height,
            offset: this.scroll?.getScrollOffset().y,
            maxOffset: this.scroll?.getMaxScrollOffset().y,
        };
    }
}
