import {
    _decorator,
    Component,
    instantiate,
    Label,
    Node,
    Prefab,
    ScrollView,
    UITransform,
} from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import type { UiState } from '../ui/UiState';
import { ButtonAction } from '../ui/ButtonAction';
import { inventoryCardView, visibleInventory } from './InventoryViewModel';
import { SelectableCard } from './SelectableCard';
import { missingSynthesisMaterials } from '../../core/content/RecipeCatalog';
const { ccclass, property } = _decorator;

@ccclass('InventoryGrid')
export class InventoryGrid extends Component {
    @property(Prefab) cardPrefab: Prefab | null = null;
    @property(Node) content: Node | null = null;
    @property(ScrollView) scroll: ScrollView | null = null;
    @property(Node) reader: Node | null = null;
    @property(Node) readerCardHost: Node | null = null;
    @property(Label) summary: Label | null = null;
    @property(Label) readerTitle: Label | null = null;
    @property(Label) readerBody: Label | null = null;
    @property(Label) hint: Label | null = null;
    @property(Label) emptyLabel: Label | null = null;
    @property(ButtonAction) toggle: ButtonAction | null = null;
    @property(ButtonAction) discard: ButtonAction | null = null;
    @property(ButtonAction) modeButton: ButtonAction | null = null;
    @property(ButtonAction) sortButton: ButtonAction | null = null;
    @property(ButtonAction) detailsButton: ButtonAction | null = null;
    @property({ type: [ButtonAction] }) filters: ButtonAction[] = [];
    private readonly entries = new Map<string, SelectableCard>();
    private filterKey = '';
    refresh(game: GameReadModel, ui: Readonly<UiState>): void {
        if (!this.content || !this.cardPrefab) return;
        const cards = visibleInventory(game, ui.bagFilter, ui.bagSort);
        const missing =
            game.scenario.runDeck && ui.bagFilter === 'deck'
                ? missingSynthesisMaterials(game.content.catalog.recipes, game.usableCards)
                : new Set<string>();
        const alive = new Set(game.cards.map((card) => card.id));
        const shown = new Set(cards.map((card) => card.id));
        for (const [id, view] of this.entries) {
            view.node.active = shown.has(id);
            if (!alive.has(id)) {
                view.node.destroy();
                this.entries.delete(id);
            }
        }
        cards.forEach((card, index) => {
            let view = this.entries.get(card.id);
            if (!view) {
                const node = instantiate(this.cardPrefab!);
                node.parent = this.content;
                view = node.getComponent(SelectableCard)!;
                this.entries.set(card.id, view);
            }
            view.node.active = true;
            view.node.setPosition(((index % 5) - 2) * 224, -174 - Math.floor(index / 5) * 328);
            view.node.setScale(0.84, 0.84, 1);
            const state = inventoryCardView(card, game);
            view.show(
                card.kind,
                game,
                'inspect-' + card.id,
                ui.deckEdit ? card.selected : ui.inspectedCard === card.id,
                state.status,
                true,
                '',
                missing.has(card.kind)
            );
        });
        this.content.getComponent(UITransform)!.height = Math.max(
            590,
            Math.ceil(cards.length / 5) * 328 + 22
        );
        const key = ui.bagFilter + ':' + ui.bagSort + ':' + ui.deckEdit;
        if (key !== this.filterKey) {
            this.scroll?.scrollToTop(0);
            this.filterKey = key;
        }
        if (this.summary)
            this.summary.string =
                game.scenario.runDeck && ui.bagFilter === 'deck'
                    ? `${game.usableCards.length} 张战斗牌 · 本局使用`
                    : `携带 ${game.baseWeight}/30    暂存 ${game.overflowWeight}/10    共 ${game.carriedCards.length} 张`;
        if (this.hint)
            this.hint.string =
                game.scenario.runDeck && ui.bagFilter === 'deck'
                    ? '滚动浏览 · 在配方表查看材料搭配'
                    : ui.deckEdit
                      ? '营地编组：点击卡牌加入或移出出战牌组 · 不释放负重'
                      : '滚动浏览 · 点击卡牌查看大图与操作';
        if (this.emptyLabel) {
            this.emptyLabel.node.active = cards.length === 0 && !ui.bagReader;
            this.emptyLabel.string =
                ui.bagFilter === 'overflow'
                    ? '暂存区是空的\n切换「全部卡牌」查看行囊'
                    : ui.bagFilter === 'deck'
                      ? '当前没有出战牌\n切换「全部卡牌」查看可编组的牌'
                      : '行囊里暂时没有卡牌';
        }
        this.modeButton?.setText(ui.deckEdit ? '结束编组' : '整理出战牌');
        this.modeButton?.setEnabled(game.phase === 'rest');
        if (this.modeButton) this.modeButton.node.active = !game.scenario.runDeck;
        const title = this.node.getChildByName('InventoryTitle')?.getComponent(Label);
        if (title)
            title.string =
                game.scenario.runDeck && ui.bagFilter === 'deck' ? '本局卡组' : '行囊 / 本次探索';
        this.sortButton?.setText(
            '排序：' +
                { original: '获得顺序', name: '名称', cost: '费用', weight: '负重' }[ui.bagSort]
        );
        this.filters.forEach((button) => {
            if (button.actionId === 'bag-filter-all')
                button.setText(game.scenario.runDeck ? '物资行囊' : '全部卡牌');
            if (button.actionId === 'bag-filter-deck')
                button.setText(game.scenario.runDeck ? '本局卡组' : '出战牌组');
            button.setVariant(
                button.actionId === 'bag-filter-' + ui.bagFilter ? 'primary' : 'quiet'
            );
        });
        const selected = game.cards.find((card) => card.id === ui.inspectedCard);
        if (this.reader) this.reader.active = ui.bagReader && !!selected;
        if (!ui.bagReader || !selected) return;
        const state = inventoryCardView(selected, game);
        const readerView = this.readerCardHost?.getComponentInChildren(SelectableCard);
        if (!readerView)
            throw new Error('Inventory reader is missing its SelectableCard prefab binding.');
        readerView?.show(
            selected.kind,
            game,
            'reader-card',
            false,
            state.status,
            false,
            '',
            missing.has(selected.kind)
        );
        readerView?.card?.setExpanded(ui.bagDetails);
        if (this.readerTitle) this.readerTitle.string = state.name;
        if (this.readerBody)
            this.readerBody.string = `${state.status}${game.scenario.runDeck && ui.bagFilter === 'deck' ? '' : `\n负重 ${state.weight}`}\n\n${state.effect}\n\n${state.toggleHint}`;
        if (this.toggle) {
            this.toggle.actionId = 'toggle-' + selected.id;
            this.toggle.setText(state.toggleLabel);
            this.toggle.node.active = !game.scenario.runDeck && game.phase === 'rest';
            this.toggle.setEnabled(state.canToggle);
        }
        if (this.discard) {
            this.discard.node.active = !game.scenario.runDeck || ui.bagFilter !== 'deck';
            this.discard.actionId = 'discard-' + selected.id;
            this.discard.setText(state.discardLabel);
            this.discard.setEnabled(state.canDiscard);
        }
        this.detailsButton?.setText(ui.bagDetails ? '查看卡面' : '完整说明');
    }
}
