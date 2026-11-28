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
        const field = !!game.scenario.fieldDeck;
        const runBattleDeck = !!game.scenario.runDeck && ui.bagFilter === 'deck';
        const supplyBag = ui.bagFilter === 'supplies';
        const cards = visibleInventory(game, ui.bagFilter, ui.bagSort);
        const missing = runBattleDeck
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
                missing.has(card.kind),
                card.packedWeight
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
        if (this.summary) {
            if (supplyBag) {
                const packed = cards.filter((card) => card.zone === 'base').length;
                this.summary.string = `行囊 ${packed} 张 · 暂存 ${cards.length - packed} 张`;
            } else this.summary.string = field
                ? `随行牌组 ${game.usableCards.length} 张 · 本次发现 ${game.usableCards.filter((card) => card.found).length} 张` +
                    (game.scenario.labyrinth ? ` · 物资卡 ${game.carriedCards.length} 张` : '')
                : runBattleDeck
                  ? `${game.usableCards.length} 张战斗牌 · 本局使用`
                  : `共 ${cards.length} 张`;
        }
        if (this.hint)
            this.hint.string = runBattleDeck
                ? '滚动浏览 · 在配方表查看材料搭配'
                : ui.deckEdit
                  ? '营地编组：点击卡牌加入或移出出战牌组'
                  : supplyBag ? '行囊里的物资卡成功返营后入库，暂存卡需先腾出空间。' : field
                    ? '点击查看牌面 · 本次发现保留至返家'
                    : '滚动浏览 · 点击卡牌查看大图与操作';
        if (this.emptyLabel) {
            this.emptyLabel.node.active = cards.length === 0 && !ui.bagReader;
            this.emptyLabel.string =
                supplyBag ? '行囊里还没有物资卡' : ui.bagFilter === 'found'
                    ? '这次探索还没有拿取发现牌'
                    : ui.bagFilter === 'overflow'
                      ? '暂存区是空的\n切换「全部卡牌」查看行囊'
                      : ui.bagFilter === 'deck'
                        ? '当前没有出战牌\n切换「全部卡牌」查看可编组的牌'
                        : '行囊里暂时没有卡牌';
        }
        if (this.modeButton) {
            this.modeButton.node.active = !!game.scenario.labyrinth || (!field && !game.scenario.runDeck);
            this.modeButton.actionId = game.scenario.labyrinth ? 'bag-filter-supplies' : 'bag-mode';
            this.modeButton.setText(game.scenario.labyrinth ? '物资行囊' : ui.deckEdit ? '结束编组' : '整理出战牌');
            this.modeButton.setEnabled(!!game.scenario.labyrinth || game.phase === 'rest');
            if (game.scenario.labyrinth) this.modeButton.setVariant(supplyBag ? 'primary' : 'quiet');
        }
        const title = this.node.getChildByName('InventoryTitle')?.getComponent(Label);
        if (title)
            title.string = supplyBag ? '物资行囊' : field ? '随行牌组' : runBattleDeck ? '本局卡组' : '行囊 / 本次探索';
        this.sortButton?.setText(
            '排序：' +
                { original: '获得顺序', name: '名称', cost: '费用' }[ui.bagSort]
        );
        this.filters.forEach((button) => {
            if (button.actionId === 'bag-filter-all')
                button.setText(game.scenario.runDeck ? '物资行囊' : '全部卡牌');
            if (
                button.actionId === 'bag-filter-found' ||
                button.actionId === 'bag-filter-overflow'
            ) {
                button.actionId = field ? 'bag-filter-found' : 'bag-filter-overflow';
                button.setText(field ? '本次发现' : '暂存卡牌');
            }
            if (button.actionId === 'bag-filter-deck')
                button.setText(field ? '基础牌' : game.scenario.runDeck ? '本局卡组' : '出战卡牌');
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
            missing.has(selected.kind),
            selected.packedWeight
        );
        readerView?.card?.setExpanded(ui.bagDetails);
        if (this.readerTitle) this.readerTitle.string = state.name;
        if (this.readerBody)
            this.readerBody.string = field && game.content.cards[selected.kind].role !== 'supply'
                ? `${state.status} · ${game.content.cards[selected.kind].cost} 体力\n\n${state.effect}\n${game.content.cards[selected.kind].text}`
                : `${state.status}\n\n${state.effect}\n\n${state.toggleHint}`;
        if (this.toggle) {
            this.toggle.actionId = 'toggle-' + selected.id;
            this.toggle.setText(state.toggleLabel);
            this.toggle.node.active = !field && !game.scenario.runDeck && game.phase === 'rest';
            this.toggle.setEnabled(state.canToggle);
        }
        if (this.discard) {
            this.discard.node.active = (!field && !runBattleDeck) || (game.content.cards[selected.kind].role === 'supply' && state.canDiscard);
            this.discard.actionId = 'discard-' + selected.id;
            this.discard.setText(state.discardLabel);
            this.discard.setEnabled(state.canDiscard);
        }
        if (this.detailsButton) {
            this.detailsButton.node.active = game.content.cards[selected.kind].role !== 'supply';
            this.detailsButton.setText(ui.bagDetails ? '查看卡面' : '完整说明');
        }
    }
}
