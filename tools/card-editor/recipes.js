import { isBattleCard } from '/shared/catalog.js';
import { recipeRelations } from '/shared/recipes.js';

export function bindRecipeEditor({ getDraft, renderValidation, escape, confirm }) {
    const list = document.querySelector('#recipe-list');
    const form = document.querySelector('#recipe-form');
    const preview = document.querySelector('#recipe-tree');
    let selected = 0;
    let focusCard = '';

    function names(rows, byId) {
        return rows.map(({ card, count }) => `${byId.get(card)?.name ?? '选一张卡'} ×${count || '—'}`).join(' + ');
    }

    function renderList() {
        const draft = getDraft();
        const byId = new Map(draft.cards.map(card => [card.id, card]));
        list.innerHTML = draft.recipes.map((recipe, index) => `
            <button class="recipe-list-row" type="button" data-select-recipe="${index}" aria-current="${index === selected}">
              <strong>${escape(names(recipe.products, byId) || '未设置产物')}</strong>
              <span>${escape(names(recipe.materials, byId) || '未设置材料')}</span>
            </button>`).join('');
    }

    function renderTree() {
        const { cards, recipes } = getDraft();
        const recipe = recipes[selected];
        const byId = new Map(cards.map(card => [card.id, card]));
        const kind = focusCard || recipe?.products.find(row => row.card)?.card || recipe?.materials.find(row => row.card)?.card;
        if (!byId.has(kind)) {
            preview.innerHTML = '<p class="recipe-note">选择产物或材料后，可在这里查看合成关系。</p>';
            return;
        }
        function branches(cardId, direction, path = new Set(), expanded = new Set()) {
            if (path.has(cardId)) return '<span class="tree-note">循环</span>';
            const relations = recipeRelations(recipes, cardId)[direction];
            if (!relations.length) return '';
            if (path.size >= 4) return '<span class="tree-note">点卡牌继续查看</span>';
            if (expanded.has(cardId)) return '<span class="tree-note">已在另一分支展开</span>';
            expanded.add(cardId);
            const nextPath = new Set(path).add(cardId);
            const side = direction === 'sources' ? 'materials' : 'products';
            return `<ul class="recipe-branches">${relations.map(relation => `
                <li><span class="tree-recipe">${escape(relation.id || '配方')}</span>
                    <ul>${relation[side].map(row => `
                        <li><button type="button" class="tree-card" data-focus-card="${escape(row.card)}">${escape(names([row], byId))}</button>${branches(row.card, direction, nextPath, expanded)}</li>
                    `).join('')}</ul></li>
            `).join('')}</ul>`;
        }
        preview.innerHTML = `
            <div class="tree-root"><strong>${escape(byId.get(kind).name)}</strong>${focusCard ? '<button type="button" class="tree-card" data-focus-card="">回到当前配方</button>' : ''}</div>
            <h3>合成来源</h3>${branches(kind, 'sources') || '<p class="recipe-note">暂无配方</p>'}
            <h3>可合成</h3>${branches(kind, 'derivatives') || '<p class="recipe-note">暂无配方</p>'}`;
    }

    function render() {
        const draft = getDraft();
        if (!draft) return;
        selected = Math.max(0, Math.min(selected, draft.recipes.length - 1));
        renderList();
        const recipe = draft.recipes[selected];
        if (!recipe) {
            form.innerHTML = '<h2>添加第一条配方</h2><p class="recipe-note">先在卡牌编辑中勾选「可作为合成材料」，再新建配方。</p>';
        } else {
            const group = (side, title) => `
                <fieldset class="recipe-side"><legend>${title}</legend>
                  ${recipe[side].map(({ card, count }, index) => {
                      const choices = draft.cards.filter(definition => !definition.chapter && isBattleCard(definition) && (side === 'products' || definition.canSynthesize));
                      const invalid = card && !choices.some(choice => choice.id === card);
                      return `<div class="recipe-input-row" data-side="${side}" data-row="${index}">
                        <label class="field"><span>${title}卡牌</span><select aria-label="${title}卡牌" data-recipe-field="card">
                          <option value="">选择${title}</option>
                          ${invalid ? `<option selected value="${escape(card)}">${escape(draft.cards.find(item => item.id === card)?.name ?? card)}（需重新选择）</option>` : ''}
                          ${choices.map(choice => `<option value="${escape(choice.id)}" ${choice.id === card ? 'selected' : ''}>${escape(choice.name)} · ${escape(choice.id)}</option>`).join('')}
                        </select></label>
                        <label class="field"><span>数量</span><input aria-label="${title}数量" type="number" min="1" max="99" step="1" value="${escape(count)}" data-recipe-field="count"></label>
                        <button type="button" class="icon-button danger" data-remove-row aria-label="移除${title}第 ${index + 1} 行">×</button>
                      </div>`;
                  }).join('')}
                  <button type="button" class="button outline recipe-add-row" data-add-side="${side}">＋ 添加${title}</button>
                </fieldset>`;
            form.innerHTML = `
                <div class="recipe-heading"><h2>编辑配方</h2><button type="button" class="icon-button danger" data-remove-recipe aria-label="删除配方">⌫</button></div>
                <label class="field"><span>配方 ID<small>只在编辑器使用</small></span><input maxlength="48" data-recipe-field="id" value="${escape(recipe.id)}" autocomplete="off"></label>
                ${group('materials', '材料')}${group('products', '产物')}`;
        }
        renderTree();
    }

    document.querySelector('#add-recipe').addEventListener('click', () => {
        const draft = getDraft();
        if (!draft) return;
        let index = 1;
        while (draft.recipes.some(recipe => recipe.id === `recipe_${index}`)) index++;
        selected = draft.recipes.length;
        draft.recipes.push({ id: `recipe_${index}`, materials: [{ card: '', count: 1 }], products: [{ card: '', count: 1 }] });
        focusCard = '';
        render();
        renderValidation();
        form.querySelector('[data-recipe-field="id"]').focus();
    });
    list.addEventListener('click', event => {
        const button = event.target.closest('[data-select-recipe]');
        if (!button) return;
        selected = Number(button.dataset.selectRecipe);
        focusCard = '';
        render();
    });
    form.addEventListener('input', event => {
        const input = event.target;
        const field = input.dataset.recipeField;
        if (!field) return;
        const recipe = getDraft().recipes[selected];
        const row = input.closest('[data-row]');
        if (field === 'id') recipe.id = input.value;
        else recipe[row.dataset.side][Number(row.dataset.row)][field] = field === 'count' ? Number(input.value) : input.value;
        focusCard = '';
        renderList();
        renderTree();
        renderValidation();
    });
    form.addEventListener('click', async event => {
        const draft = getDraft();
        const recipe = draft.recipes[selected];
        const control = event.target.closest('button');
        if (!recipe || !control) return;
        if (control.hasAttribute('data-remove-recipe')) {
            if (!await confirm('删除这条配方？', '保存到项目后，本配方会从下次试玩的配方表中移除。')) return;
            draft.recipes.splice(draft.recipes.indexOf(recipe), 1);
        } else if (control.dataset.addSide) recipe[control.dataset.addSide].push({ card: '', count: 1 });
        else if (control.hasAttribute('data-remove-row')) {
            const row = control.closest('[data-row]');
            recipe[row.dataset.side].splice(Number(row.dataset.row), 1);
        } else return;
        focusCard = '';
        render();
        renderValidation();
    });
    preview.addEventListener('click', event => {
        const button = event.target.closest('[data-focus-card]');
        if (!button) return;
        focusCard = button.dataset.focusCard;
        renderTree();
    });

    return { render };
}
