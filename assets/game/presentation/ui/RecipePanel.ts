import { _decorator, Component, instantiate, Label, Node, ScrollView, UITransform } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { recipeRelations, RecipeDefinition } from '../../core/content/RecipeCatalog';
import { ButtonAction } from './ButtonAction';
import { recipeBrowse, RecipeBrowseState, recipeProductText } from './RecipePanelModel';
const { ccclass, property } = _decorator;

interface RecipeRow {
    title: string;
    detail: string;
    id?: string;
    payload?: string;
    marked?: boolean;
}
const statusText = { ready: '材料齐全', partial: '缺部分材料', missing: '尚无材料' };

@ccclass('RecipePanel')
export class RecipePanel extends Component {
    @property(Label) status: Label | null = null;
    @property(Label) page: Label | null = null;
    @property(Label) relationTitle: Label | null = null;
    @property(Label) empty: Label | null = null;
    @property(ButtonAction) craft: ButtonAction | null = null;
    @property(ButtonAction) undo: ButtonAction | null = null;
    @property(ButtonAction) prev: ButtonAction | null = null;
    @property(ButtonAction) next: ButtonAction | null = null;
    @property(ButtonAction) category: ButtonAction | null = null;
    @property(ButtonAction) sort: ButtonAction | null = null;
    @property({ type: [ButtonAction] }) filters: ButtonAction[] = [];
    @property({ type: [ButtonAction] }) choices: ButtonAction[] = [];
    @property(ScrollView) detail: ScrollView | null = null;
    @property(ScrollView) tree: ScrollView | null = null;
    @property(Node) detailTemplate: Node | null = null;
    @property(Node) treeTemplate: Node | null = null;
    private detailRows: Node[] = [];
    private treeRows: Node[] = [];
    private selectedId = '';
    private focusedCard = '';

    onEnable(): void {
        this.selectedId = '';
        this.focusedCard = '';
    }

    refresh(
        game: GameReadModel,
        browse: Readonly<RecipeBrowseState>,
        blocked: string,
        canUndo: boolean
    ): void {
        const model = recipeBrowse(game, browse);
        const { selected, card } = model;
        const definitions = game.content.cards;
        if (this.status)
            this.status.string = blocked || '使用本局卡组中的材料，产物立即加入本局卡组。';
        if (this.page) this.page.string = `${model.page + 1} / ${model.totalPages}`;
        this.prev?.setEnabled(model.page > 0);
        this.next?.setEnabled(model.page + 1 < model.totalPages);
        const category = browse.category;
        this.category?.setText(category ? `分类 · ${category}` : '所有分类');
        this.category?.setEnabled(model.categories.length > 0);
        this.sort?.setText(browse.byName ? '按名称' : '按配方顺序');
        this.sort?.setEnabled(model.rows.length > 0);
        this.filters.forEach((button) =>
            button.setVariant(button.payload === browse.filter ? 'primary' : 'secondary')
        );
        this.choices.forEach((button, index) => {
            const chosen = model.rows[index];
            button.node.active = !!chosen;
            if (!chosen) return;
            button.payload = chosen.recipe.id;
            const first = chosen.recipe.materials[0];
            const from = `${definitions[first.card].name} ×${first.count}`;
            const otherCount = chosen.recipe.materials.length - 1;
            button.setText(
                `${chosen.title}\n${from}${otherCount ? ` 等 ${otherCount + 1} 种` : ''}\n${statusText[chosen.status]}`
            );
            button.setVariant(chosen === selected ? 'primary' : 'secondary');
        });
        if (this.empty) {
            this.empty.node.active = !model.rows.length;
            this.empty.string = game.content.catalog.recipes.length
                ? '本筛选下没有配方'
                : '暂未配置配方';
        }
        this.craft?.setText(
            blocked
                ? '仅查看配方'
                : !selected
                  ? '选择配方'
                  : selected.status !== 'ready'
                    ? '材料不足'
                    : '合成'
        );
        this.craft?.setEnabled(!blocked && selected?.status === 'ready');
        this.undo?.setEnabled(canUndo);
        if (this.undo) this.undo.node.active = !blocked;
        if (this.relationTitle)
            this.relationTitle.string = card ? `合成关系 · ${definitions[card].name}` : '合成关系';

        const related: RecipeRow[] = [];
        const detail: RecipeRow[] = [];
        if (selected) {
            detail.push({ title: '材料需求', detail: statusText[selected.status] });
            for (const need of selected.materials) {
                const hint =
                    selected.status === 'partial' && need.missing
                        ? ` · 还缺 ${need.missing} 张`
                        : '';
                detail.push({
                    title: definitions[need.card].name,
                    detail: `拥有 ${need.owned} / 需 ${need.count}${hint}\n可作为合成材料`,
                    id: 'recipe-card',
                    payload: need.card,
                    marked: need.card === card,
                });
            }
            detail.push({ title: '合成产物', detail: '点击卡牌查看关系' });
            for (const product of selected.recipe.products) {
                detail.push({
                    title: `${definitions[product.card].name} ×${product.count}`,
                    detail: definitions[product.card].canSynthesize
                        ? '可作为合成材料'
                        : '加入本局卡组',
                    id: 'recipe-card',
                    payload: product.card,
                    marked: product.card === card,
                });
            }
        }
        if (card) {
            const { sources, derivatives } = recipeRelations(game.content.catalog.recipes, card);
            const relation = (recipe: RecipeDefinition): RecipeRow => ({
                title: `↳ ${recipeProductText(recipe, game)}`,
                detail: recipe.materials
                    .map(({ card, count }) => `${definitions[card].name} ×${count}`)
                    .join(' + '),
                id: 'recipe-link',
                payload: recipe.id,
                marked: selected?.recipe.id === recipe.id,
            });
            related.push({ title: '由哪些配方合成', detail: sources.length ? '' : '没有合成来源' });
            related.push(...sources.map(relation));
            related.push({
                title: '能用于哪些配方',
                detail: derivatives.length ? '' : '没有下游配方',
            });
            related.push(...derivatives.map(relation));
        }
        const changed = this.selectedId !== (selected?.recipe.id ?? '');
        this.fill(this.detail, this.detailTemplate, this.detailRows, detail, changed);
        this.fill(
            this.tree,
            this.treeTemplate,
            this.treeRows,
            related,
            changed || this.focusedCard !== card
        );
        this.selectedId = selected?.recipe.id ?? '';
        this.focusedCard = card;
    }

    private fill(
        scroll: ScrollView | null,
        template: Node | null,
        nodes: Node[],
        rows: RecipeRow[],
        reset: boolean
    ): void {
        const content = scroll?.content;
        if (!scroll || !content || !template) return;
        const step = template.getComponent(UITransform)!.height + 7;
        rows.forEach((row, index) => {
            const node = nodes[index] ?? (nodes[index] = instantiate(template));
            if (node.parent !== content) node.parent = content;
            node.active = true;
            node.setPosition(0, -step * (index + 0.5));
            const action = node.getComponent(ButtonAction)!;
            action.actionId = row.id ?? '';
            action.payload = row.payload ?? '';
            action.setEnabled(!!row.id);
            action.setVariant(row.marked ? 'primary' : 'secondary');
            action.setText(`${row.title}${row.detail ? '\n' + row.detail : ''}`);
        });
        for (let index = rows.length; index < nodes.length; index++) nodes[index].active = false;
        content.getComponent(UITransform)!.height = Math.max(
            scroll.node.getComponent(UITransform)!.height,
            rows.length * step
        );
        if (reset) scroll.scrollToTop(0);
    }
}
