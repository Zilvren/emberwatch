import { _decorator, Component, JsonAsset, Label, Node, ResolutionPolicy, view } from 'cc';
import type { CardDesignReference } from './CardDesignReference';
import { ACTION_EVENT, ActionInputEvent } from '../ui/UIEvents';
import { CardInteraction } from './CardInteraction';
import { CardPresentation } from './CardPresentation';
const { ccclass, property } = _decorator;

@ccclass('CardDesignReview')
export class CardDesignReview extends Component {
    @property(JsonAsset) referenceCards: JsonAsset | null = null;
    @property({ type: [Node] }) cards: Node[] = [];
    @property({ type: [Node] }) controls: Node[] = [];
    @property(Node) dragLayer: Node | null = null;
    @property(Label) status: Label | null = null;
    @property({ type: [Label] }) stateLabels: Label[] = [];
    private references: CardDesignReference[] = [];
    private index = 3;
    private selected = false;
    private longText = false;
    onLoad(): void {
        view.setDesignResolutionSize(1440, 900, ResolutionPolicy.SHOW_ALL);
        this.references = this.referenceCards!.json.cards;
        const card = this.cards[0].getComponent(CardPresentation)!;
        const reduced =
            typeof matchMedia !== 'undefined' &&
            matchMedia('(prefers-reduced-motion: reduce)').matches;
        const input =
            card.node.getComponent(CardInteraction) ?? card.node.addComponent(CardInteraction);
        input.setup(card, {
            enabled: () => true,
            selected: () => this.selected,
            reduced: () => reduced,
            dragLayer: () => this.dragLayer,
            lift: () => 12,
            zoom: () => 1.025,
        });
        this.node.on(ACTION_EVENT, this.onAction, this);
        this.refresh();
        Object.assign(globalThis, { __cardDesignReview: { snapshot: () => this.snapshot() } });
    }
    onDestroy(): void {
        this.node.off(ACTION_EVENT, this.onAction, this);
    }
    private onAction(event: ActionInputEvent): void {
        event.propagationStopped = true;
        if (event.detail.id !== 'card-select') return;
        this.selected = !this.selected;
        this.cards[0].getComponent(CardPresentation)!.setSelected(this.selected);
        this.cards[0].getComponent(CardInteraction)?.sync();
        if (this.status)
            this.status.string = this.selected
                ? '已选中。再次点击取消；拖动后松手可检查回弹。'
                : '悬停、点击或拖动左侧卡牌，检查真实交互。';
    }
    nextCard(): void {
        this.index = (this.index + 1) % this.references.length;
        this.selected = false;
        this.refresh();
    }
    previousCard(): void {
        this.index = (this.index + this.references.length - 1) % this.references.length;
        this.selected = false;
        this.refresh();
    }
    toggleDetails(): void {
        const card = this.cards[0].getComponent(CardPresentation)!;
        card.setExpanded(!card.expanded);
    }
    toggleLongText(): void {
        this.longText = !this.longText;
        this.refresh();
    }
    private refresh(): void {
        const original = this.references[this.index];
        const reference = this.longText
            ? {
                  ...original,
                  name: '用于校验排版的加长卡牌名称',
                  utilityText:
                      '这段说明用于检查长文本。卡面保留关键效果，完整说明可以展开并滚动阅读，不能通过不断缩小字号来塞进卡牌。'.repeat(
                          6
                      ),
              }
            : original;
        const unavailable = reference.combatEligibility === 'yes' ? '体力不足' : '不进入当前战斗';
        if (this.stateLabels[3])
            this.stateLabels[3].string =
                reference.combatEligibility === 'yes' ? '不可用 · 体力不足' : '不可用 · 非战斗卡';
        this.cards.forEach((node, index) => {
            const card = node.getComponent(CardPresentation)!;
            card.configureReference(
                reference,
                index === 3 ? unavailable : '',
                index === 2 ? '已选中' : '点击 / 拖动',
                'preview-' + index
            );
            card.setHovered(index === 1);
            card.setSelected(index === 2);
            if (index > 0 && card.visualRoot) {
                card.visualRoot.setPosition(0, index === 1 ? 12 : 0);
                card.visualRoot.setScale(index === 1 ? 1.025 : 1, index === 1 ? 1.025 : 1, 1);
            }
        });
        this.cards[0].getComponent(CardInteraction)?.sync();
        if (this.status) this.status.string = '悬停、点击或拖动左侧卡牌，检查真实交互。';
    }
    private snapshot(): object {
        return {
            kind: this.references[this.index].id,
            art: this.references[this.index].art,
            reference: 'formal-workbook',
            longText: this.longText,
            selected: this.selected,
            cards: this.cards.map((node) => ({
                name: node.name,
                id: node.getComponent(CardPresentation)!.cardId,
                expanded: node.getComponent(CardPresentation)!.expanded,
                x: node.position.x,
                y: node.position.y,
                view: node.getComponent(CardPresentation)!.inspect(),
            })),
            controls: this.controls.map((node) => ({
                id: node.name,
                x: node.position.x + 720,
                y: 450 - node.position.y,
            })),
        };
    }
}
