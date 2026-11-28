import type { CardDefinition } from './CardCatalog';

export interface RecipeCard {
    readonly card: string;
    readonly count: number;
}

export interface RecipeDefinition {
    readonly id: string;
    readonly materials: readonly RecipeCard[];
    readonly products: readonly RecipeCard[];
}

export function validateRecipes(
    raw: unknown,
    cards: Record<string, CardDefinition>,
    issues: string[]
): RecipeDefinition[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
        issues.push('配方表必须是列表。');
        return [];
    }
    const ids = new Set<string>();
    const signatures = new Set<string>();
    const recipes: RecipeDefinition[] = [];
    for (const [index, input] of raw.entries()) {
        const label = `配方「${typeof input?.id === 'string' ? input.id : index + 1}」`;
        const before = issues.length;
        const id = input?.id;
        if (typeof id !== 'string' || !/^[a-z][a-z0-9_-]{1,47}$/.test(id))
            issues.push(`${label}的 ID 需为 2～48 位小写字母、数字、下划线或短横线，首位为字母。`);
        else if (ids.has(id)) issues.push(`${label}的 ID 重复。`);
        if (typeof id === 'string') ids.add(id);
        const readSide = (rows: unknown, material: boolean): RecipeCard[] => {
            const side = material ? '材料' : '产物';
            if (!Array.isArray(rows) || !rows.length) {
                issues.push(`${label}至少需要一项${side}。`);
                return [];
            }
            const seen = new Set<string>();
            const result: RecipeCard[] = [];
            for (const row of rows) {
                const kind = row?.card;
                const definition = typeof kind === 'string' ? cards[kind] : undefined;
                const count = row?.count;
                if (!definition) {
                    issues.push(
                        `${label}引用了不存在的${side}卡牌「${typeof kind === 'string' ? kind : ''}」。`
                    );
                    continue;
                }
                if (definition.role !== 'basic' && definition.role !== 'normal')
                    issues.push(`${label}的${side}「${definition.name}」须为战斗卡。`);
                else if (definition.chapter || definition.fist?.type === 'finisher')
                    issues.push(`${label}的${side}「${definition.name}」仅用于焦土迷宫。`);
                else if (material && !definition.canSynthesize)
                    issues.push(`${label}的材料「${definition.name}」未勾选“可作为合成材料”。`);
                if (seen.has(kind))
                    issues.push(`${label}的${side}「${definition.name}」重复，请合并数量。`);
                seen.add(kind);
                if (!Number.isInteger(count) || count < 1 || count > 99)
                    issues.push(`${label}的${side}「${definition.name}」数量须为 1～99 的整数。`);
                result.push({ card: kind, count });
            }
            return result;
        };
        const materials = readSide(input?.materials, true);
        const products = readSide(input?.products, false);
        if (issues.length !== before) continue;
        const signature = JSON.stringify(
            [materials, products].map((rows) =>
                rows.map(({ card, count }) => `${card}:${count}`).sort()
            )
        );
        if (signatures.has(signature)) issues.push(`${label}的材料和产物与另一条配方相同。`);
        signatures.add(signature);
        recipes.push({ id, materials, products });
    }
    const active = new Set<string>();
    const visited = new Set<string>();
    const edges = new Map<string, Set<string>>();
    for (const recipe of recipes) {
        for (const material of recipe.materials) {
            const destinations = edges.get(material.card) ?? new Set<string>();
            for (const product of recipe.products) destinations.add(product.card);
            edges.set(material.card, destinations);
        }
    }
    const path: string[] = [];
    function cycle(kind: string): boolean {
        if (active.has(kind)) {
            const names = [...path.slice(path.indexOf(kind)), kind].map((id) => cards[id].name);
            issues.push(`配方形成循环：${names.join(' → ')}。`);
            return true;
        }
        if (visited.has(kind)) return false;
        active.add(kind);
        path.push(kind);
        for (const destination of edges.get(kind) ?? []) if (cycle(destination)) return true;
        path.pop();
        active.delete(kind);
        visited.add(kind);
        return false;
    }
    for (const kind of edges.keys()) if (cycle(kind)) break;
    return recipes;
}

export function recipeRelations(recipes: readonly RecipeDefinition[], kind: string) {
    return {
        sources: recipes.filter(({ products }) => products.some(({ card }) => card === kind)),
        derivatives: recipes.filter(({ materials }) => materials.some(({ card }) => card === kind)),
    };
}

export function countKinds(cards: readonly { readonly kind: string }[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const { kind } of cards) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return counts;
}

export function recipeAvailability(recipe: RecipeDefinition, counts: ReadonlyMap<string, number>) {
    const materials = recipe.materials.map(({ card, count }) => {
        const owned = counts.get(card) ?? 0;
        return { card, count, owned, missing: Math.max(0, count - owned) };
    });
    const status = materials.every(({ missing }) => missing === 0)
        ? 'ready'
        : materials.some(({ owned }) => owned > 0)
          ? 'partial'
          : 'missing';
    return { materials, status } as const;
}

export function missingSynthesisMaterials(
    recipes: readonly RecipeDefinition[],
    battleDeck: readonly { readonly kind: string }[]
): Set<string> {
    const missing = new Set<string>();
    if (!recipes.length) return missing;
    const counts = countKinds(battleDeck);
    for (const recipe of recipes) {
        const availability = recipeAvailability(recipe, counts);
        if (availability.status !== 'partial') continue;
        for (const row of availability.materials) if (row.missing) missing.add(row.card);
    }
    return missing;
}
