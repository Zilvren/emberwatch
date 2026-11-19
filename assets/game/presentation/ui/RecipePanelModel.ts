import type { GameReadModel } from '../../core/GameReadModel';
import { countKinds, recipeAvailability, RecipeDefinition } from '../../core/content/RecipeCatalog';

export type RecipeFilter = 'all' | 'ready' | 'partial';
export interface RecipeBrowseState {
    filter: RecipeFilter;
    category: string;
    byName: boolean;
    page: number;
    recipeId: string;
    card: string;
}
export const recipePageSize = 5;

export function initialRecipeBrowse(): RecipeBrowseState {
    return { filter: 'all', category: '', byName: false, page: 0, recipeId: '', card: '' };
}

export function recipeBrowse(game: GameReadModel, browse: Readonly<RecipeBrowseState>) {
    const definitions = game.content.cards;
    const counts = countKinds(game.usableCards);
    const recipes = game.content.catalog.recipes.map((recipe) => {
        const categories = recipe.products.map(
            ({ card }) => definitions[card].tag.split('·')[0].trim() || '未分类'
        );
        const title = recipe.products
            .map(({ card, count }) => `${definitions[card].name}${count > 1 ? ` ×${count}` : ''}`)
            .join(' + ');
        return { recipe, ...recipeAvailability(recipe, counts), categories, title };
    });
    const categories = Array.from(
        new Set(recipes.reduce<string[]>((all, entry) => all.concat(entry.categories), []))
    );
    const filtered = recipes.filter(
        (entry) =>
            (browse.filter === 'all' || entry.status === browse.filter) &&
            (!browse.category || entry.categories.indexOf(browse.category) >= 0)
    );
    if (browse.byName)
        filtered.sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
    const totalPages = Math.max(1, Math.ceil(filtered.length / recipePageSize));
    const selectedIndex = filtered.findIndex(({ recipe }) => recipe.id === browse.recipeId);
    const page =
        selectedIndex >= 0
            ? Math.floor(selectedIndex / recipePageSize)
            : Math.max(0, Math.min(browse.page, totalPages - 1));
    const rows = filtered.slice(page * recipePageSize, (page + 1) * recipePageSize);
    const selected = recipes.find(({ recipe }) => recipe.id === browse.recipeId) ?? rows[0];
    const card =
        selected &&
        browse.card &&
        [...selected.recipe.materials, ...selected.recipe.products].some(
            ({ card }) => card === browse.card
        )
            ? browse.card
            : (selected?.recipe.products[0].card ?? '');
    return { rows, categories, selected, card, page, totalPages };
}

export function recipeProductText(recipe: RecipeDefinition, game: GameReadModel): string {
    return recipe.products
        .map(({ card, count }) => `${game.content.cards[card].name} ×${count}`)
        .join(' + ');
}
