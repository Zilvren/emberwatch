import { validateCatalog, activeDiscoveryCards, cardReferences, SYSTEM_ROLES, EFFECT_NAMES, ART_IDS, isBattleCard } from '/shared/catalog.js';
import { cardViewModel } from '/shared/card-view.js';
import { bindRecipeEditor } from '/recipes.js';

const $ = selector => document.querySelector(selector);
const clone = value => JSON.parse(JSON.stringify(value));
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const artNames = { attack: '基础攻击', dodge: '基础躲避', knife: '刀具', evade: '强化躲避', repair: '修复', heavy: '重击', slash: '挥砍', cash: '现金' };
const roleNames = { basic: '基础牌', normal: '普通牌', temporary: '战斗临时牌', cash: '旧版现金', supply: '物资牌' };
let draft, baseline, revision, selectedId, selectedIndex = 0, saving = false, lastSaved = '', noticeTimer;
let newCards = new WeakSet();
let previewedCard, previewExpanded = false;
let uiArt;
const current = () => draft?.cards[selectedIndex];
const dirty = () => !!draft && JSON.stringify(draft) !== JSON.stringify(baseline);
const definitions = () => Object.fromEntries(draft.cards.map(card => [card.id, card]));
const recipes = bindRecipeEditor({ getDraft: () => draft, renderValidation: () => renderVisual(), escape, confirm });

async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `请求失败（${response.status}）`);
    return data;
}

function isCardAtlas(atlas) {
    if (!Number.isInteger(atlas?.width) || !Number.isInteger(atlas.height) || !Array.isArray(atlas.cards?.knife)) return false;
    return Object.values(atlas.cards).every(frame => {
        if (!Array.isArray(frame) || frame.length !== 4 || !frame.every(Number.isInteger)) return false;
        const [x, y, width, height] = frame;
        return x >= 0 && y >= 0 && width > 0 && height > 0 &&
            width < atlas.width && height < atlas.height && x + width <= atlas.width && y + height <= atlas.height;
    });
}

async function loadVisualAssets() {
    const [themeResponse, artResponse] = await Promise.allSettled([
        fetchJson('/shared/ui-theme.json'),
        fetchJson('/shared/ui-art.json'),
    ]);
    const theme = themeResponse.value;
    const hasTheme = theme?.name === 'ashen-labyrinth' && theme.colors?.ink && theme.card?.typeText;
    uiArt = isCardAtlas(artResponse.value) ? artResponse.value : null;
    if (hasTheme) {
        const { style } = $('#preview-card');
        for (const [name, value] of Object.entries(theme.colors)) {
            style.setProperty('--card-' + name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value);
        }
        style.setProperty('--card-type-text', theme.card.typeText);
    }
    $('#preview-asset-note').hidden = !!hasTheme && !!uiArt;
}

function renderDecks() {
    const profile = draft?.labyrinth;
    $('#discovery-decks').hidden = !profile;
    if (!profile) return;
    const names = definitions();
    $('#deck-options').innerHTML = profile.decks.map(deck => `
        <label class="deck-option">
          <input type="checkbox" data-deck="${escape(deck.id)}" ${profile.enabledDecks.includes(deck.id) ? 'checked' : ''}>
          <span><strong>${escape(deck.name)}</strong><small>${deck.cards.map(id => escape(names[id]?.name ?? id)).join('、') || '暂未收录卡牌'}</small></span>
          <span class="deck-size">${deck.cards.length} 张</span>
        </label>`).join('');
    const count = activeDiscoveryCards(profile).length;
    $('#discovery-count').textContent = count ? `发现池 ${count} 种 · 每次最多出现 ${Math.min(3, count)} 张` : '发现池为空。探索时直接结算地点奖励。';
    $('#save-decks').disabled = saving || !dirty();
}

function artMarkup(art, cardId) {
    if (!uiArt) return '';
    const [x, y, w, h] = uiArt.cards[cardId] ?? uiArt.cards[art] ?? uiArt.cards.knife;
    const position = `${100 * x / (uiArt.width - w)}% ${100 * y / (uiArt.height - h)}%`;
    const size = `${100 * uiArt.width / w}% ${100 * uiArt.height / h}%`;
    return `<span class="painted-tile" role="img" aria-label="${escape(artNames[art] ?? '卡牌插画')}" style="background-position:${position};background-size:${size}"></span>`;
}
function setPreviewExpanded(value) {
    previewExpanded = value;
    $('#preview-card').dataset.expanded = String(value);
    $('#preview-details').hidden = !value;
    $('#preview-detail-toggle').textContent = value ? '收起说明' : '查看说明';
    $('#preview-detail-toggle').setAttribute('aria-expanded', String(value));
}
function notify(message, error = false) {
    clearTimeout(noticeTimer);
    $('#notice').textContent = message;
    $('#notice').classList.toggle('error', error);
    $('#notice').hidden = false;
    noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, error ? 8000 : 3500);
}
function confirm(title, body, action = '确认删除') {
    return new Promise(resolve => {
        const dialog = $('#confirm-dialog');
        $('#confirm-title').textContent = title;
        $('#confirm-body').textContent = body;
        $('#confirm-action').textContent = action;
        dialog.returnValue = '';
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
        dialog.showModal();
    });
}
function field(label, key, value, options = {}) {
    const attributes = `${options.readonly ? 'readonly' : ''} ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.max !== undefined ? `max="${options.max}"` : ''} ${options.step ? `step="${options.step}"` : ''} ${options.maxlength ? `maxlength="${options.maxlength}"` : ''}`;
    return `<label class="field"><span>${label}${options.hint ? `<small>${options.hint}</small>` : ''}</span><input aria-label="${label}" data-field="${key}" type="${options.type ?? 'text'}" value="${escape(value)}" ${attributes} autocomplete="off"></label>`;
}
function select(label, key, value, items, disabled = false) {
    return `<label class="field"><span>${label}</span><select aria-label="${label}" data-field="${key}" ${disabled ? 'disabled' : ''}>${items.map(([id, name]) => `<option value="${escape(id)}" ${id === value ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select></label>`;
}
function renderList() {
    if (!draft) return;
    const query = $('#search').value.trim().toLowerCase(), filter = $('#filter').value;
    const cards = draft.cards.filter(card => {
        const matchesFilter = filter === 'all' ||
            (filter === 'supply' ? card.role === 'supply' : filter === 'labyrinth' ? !!card.chapter : card.effect.type === filter);
        return (!query || `${card.id} ${card.name}`.toLowerCase().includes(query)) && matchesFilter;
    });
    $('#card-count').textContent = draft.cards.length;
    $('#card-list').innerHTML = cards.length ? cards.map(card => `<div role="listitem"><button class="card-row ${card === current() ? 'selected' : ''}" data-select="${draft.cards.indexOf(card)}" aria-label="选择卡牌：${escape(card.name)}" aria-current="${card === current()}"><span class="row-art art-crop">${artMarkup(card.art, card.id)}</span><span class="row-info"><strong>${escape(card.name)}</strong><small>${escape(card.id)} · ${card.role === 'supply' ? '物资卡' : escape(EFFECT_NAMES[card.effect.type])}</small>${card.initialCount || card.reward || card.role === 'supply' ? `<span class="row-indicator">${card.role === 'supply' ? `兑换 ${card.supplyValue ?? 1} 物资点` : ''}${card.role !== 'supply' && card.initialCount ? `初始 ×${card.initialCount}` : ''}${card.role !== 'supply' && card.initialCount && card.reward ? '　' : ''}${card.role !== 'supply' && card.reward ? '奖励池' : ''}</span>` : ''}</span><span class="row-cost">${card.role === 'supply' ? '物资' : card.cost}</span></button></div>`).join('') : '<p class="empty-list">没有找到匹配的卡牌</p>';
}
function renderInspector() {
    const card = current();
    if (!card) return;
    const saved = !newCards.has(card);
    const system = saved && Object.prototype.hasOwnProperty.call(SYSTEM_ROLES, card.id);
    const chapter = card.chapter === 'ashen-labyrinth';
    const supply = card.role === 'supply';
    const allowedEffects = card.id === 'attack' || card.id === 'slash' ? ['damage'] : card.id === 'dodge' ? ['block'] : card.role === 'cash' || supply ? ['none'] : card.role === 'temporary' ? ['damage', 'block', 'heal'] : ['damage', 'block', 'heal', 'equip', 'draw', 'strength'];
    $('#inspector-content').innerHTML = `
      <fieldset class="property-group"><legend>基本资料</legend><div>
        ${field('卡牌名称', 'name', card.name, { maxlength: 18 })}
        ${field('卡牌 ID', 'id', card.id, { readonly: saved || system, maxlength: 48, hint: saved || system ? '已保存后保持稳定' : '小写字母、数字、下划线' })}
        ${field('分类说明', 'tag', card.tag, { maxlength: 32 })}
        <div class="field-grid">${select('卡牌身份', 'role', card.role, system || chapter ? [[card.role, roleNames[card.role]]] : [['normal', '普通牌'], ['temporary', '战斗临时牌'], ['supply', '物资牌']], system || chapter)}${field('标识色', 'color', card.color, { type: 'color' })}</div>
        ${chapter ? '' : `<label class="check-field"><input type="checkbox" data-field="canSynthesize" ${card.canSynthesize ? 'checked' : ''} ${isBattleCard(card) ? '' : 'disabled'}>可作为合成材料</label>`}
        <span class="field-label">卡牌插画</span><div class="art-options">${ART_IDS.map(art => `<label class="art-option"><input type="radio" name="illustration" data-field="art" value="${art}" ${card.art === art ? 'checked' : ''} aria-label="插画：${artNames[art]}"><span class="art-crop">${artMarkup(art)}</span><small>${artNames[art]}</small></label>`).join('')}</div>
      </div></fieldset>
      <fieldset class="property-group"><legend>战斗效果</legend><div>
        <div class="field-grid">${field('体力费用', 'cost', card.cost, { type: 'number', min: 0, max: 99, readonly: card.role === 'basic' || card.role === 'cash' || supply })}${supply ? field('物资卡重量', 'weight', card.weight, { type: 'number', min: 0, max: 30 }) : ''}</div>
        ${select('效果类型', 'effect.type', card.effect.type, (chapter ? [card.effect.type] : allowedEffects).map(type => [type, supply && type === 'none' ? '无' : EFFECT_NAMES[type]]), chapter)}
        ${supply ? field('兑换物资点', 'supplyValue', card.supplyValue ?? 1, { type: 'number', min: 1, max: 999, hint: '带回避难所后可兑换' }) : ''}
        ${card.effect.type === 'equip' ? `${field('每回合生成牌', 'effect.generatedCardsText', (card.effect.generatedCards ?? (card.effect.generatedCard ? [card.effect.generatedCard] : [])).join(', '), { hint: '填写临时牌 ID，用逗号分隔' })}${field('占用武器槽', 'weaponSlots', card.weaponSlots ?? 1, { type: 'number', min: 1, max: 2 })}` : card.effect.type === 'none' ? `<p class="field-note">${supply ? '从搜刮获得，带回避难所后可兑换物资点。' : '现金可以在营地丢弃。'}</p>` : card.effect.amount ? field('效果数值', 'effect.amount', card.effect.amount, { type: 'number', min: 1, max: 999 }) : ''}
        ${card.effect.type === 'damage' ? field('同时获得格挡', 'effect.block', card.effect.block ?? 0, { type: 'number', min: 0, max: 999, hint: '0 表示没有额外格挡' }) : ''}
        ${card.effect.type === 'damage' ? field('攻击段数', 'effect.hits', card.effect.hits ?? 1, { type: 'number', min: 1, max: 20 }) : ''}
        ${card.effect.type === 'equip' ? field('装备力量', 'effect.equippedStrength', card.effect.equippedStrength ?? 0, { type: 'number', min: 0, max: 999 }) : ''}
        ${isBattleCard(card) && ['heal', 'strength'].includes(card.effect.type) ? `<label class="check-field"><input type="checkbox" data-field="oncePerBattle" ${card.oncePerBattle ? 'checked' : ''}>每张每场限用一次</label>` : ''}
        <label class="field"><span>补充说明<small>效果数值会自动生成</small></span><textarea aria-label="补充说明" data-field="text" maxlength="80" rows="2">${escape(card.text)}</textarea></label>
      </div></fieldset>
      <fieldset class="property-group"><legend>卡牌投放</legend><div>
        ${chapter ?
            `<p class="field-note">${draft.labyrinth?.starter[card.id] ? `焦土迷宫基础牌组 ×${draft.labyrinth.starter[card.id]}` : '选择此牌归属的发现牌组。'} </p>
            ${draft.labyrinth?.decks.map(deck => `<label class="check-field"><input type="checkbox" data-membership="${escape(deck.id)}" ${deck.cards.includes(card.id) ? 'checked' : ''}>${escape(deck.name)}${draft.labyrinth.enabledDecks.includes(deck.id) ? '' : '（未启用）'}</label>`).join('') ?? ''}`
            : `
        ${field('初始携带数量', 'initialCount', card.initialCount, { type: 'number', min: card.role === 'basic' ? 1 : 0, max: 8, readonly: !isBattleCard(card) || card.synthesisOnly })}
        <label class="check-field"><input type="checkbox" aria-label="加入随机奖励池" data-field="reward" ${card.reward ? 'checked' : ''} ${card.role === 'normal' || supply ? '' : 'disabled'}>加入随机奖励池</label>
        ${card.role === 'normal' && card.reward ? field('奖励权重', 'rewardWeight', card.rewardWeight ?? 1, { type: 'number', min: 0.01, max: 100, step: 'any', hint: '合成路线会临时提高材料权重' }) : ''}
        ${select('固定搜刮奖励', 'fixedReward', draft.fixedReward, draft.cards.filter(card => card.role === 'normal' && !card.chapter && !card.synthesisOnly).map(card => [card.id, card.name]))}
        <p class="field-note">${supply ? '奖励池中的物资牌可在合成探索的旧街搜刮获得。' : card.synthesisOnly ? '本牌仅在合成探索中获得。' : '这些投放设置用于焦土迷宫以外的章节。'}</p>`}
      </div></fieldset>
      <div id="references" class="references"></div><div id="validation" class="validation" role="status"></div>`;
    $('#delete').disabled = system || !!draft.labyrinth?.starter[card.id];
    $('#delete').title = system ? '基础能力、现金和系统挥砍需要保留' : '删除卡牌';
    renderVisual();
}
function renderVisual() {
    const card = current();
    if (!card) return;
    const model = cardViewModel(card, definitions(), '体力', { field: !!card.chapter, runDeck: !card.chapter });
    if (previewedCard !== card) { previewedCard = card; previewExpanded = false; }
    setPreviewExpanded(previewExpanded);
    $('#preview-name').textContent = model.displayTitle || '未命名卡牌';
    $('#preview-card').setAttribute('aria-label', model.title || '未命名卡牌');
    $('#preview-cost').textContent = model.cost;
    $('#preview-unit').textContent = model.costUnit;
    $('#preview-card').dataset.hasCost = String(model.showCost);
    $('#preview-keywords').textContent = model.keywords.join(' · ');
    $('#preview-tag').textContent = model.tag;
    $('#preview-effect').textContent = model.effect;
    $('#preview-description').textContent = model.description;
    $('#preview-full-description').textContent = model.fullDescription;
    $('#preview-type').textContent = EFFECT_NAMES[card.effect.type];
    $('#preview-weight').textContent = model.weight;
    $('#preview-role').textContent = roleNames[card.role];
    $('#preview-id').textContent = card.id;
    $('#preview-art').innerHTML = artMarkup(card.art, card.id);
    $('#preview-card').style.setProperty('--card-accent', card.color);
    const fixedReward = $('[data-field="fixedReward"]');
    if (fixedReward) fixedReward.innerHTML = draft.cards.filter(entry => entry.role === 'normal' && !entry.chapter && !entry.synthesisOnly).map(entry => `<option value="${escape(entry.id)}" ${entry.id === draft.fixedReward ? 'selected' : ''}>${escape(entry.name)}</option>`).join('');
    const count = draft.cards.filter(isBattleCard).reduce((count, card) => count + card.initialCount, 0);
    const profile = card.chapter ? draft.labyrinth : null;
    $('#starter-label').textContent = profile ? '焦土迷宫起手' : '合成探索起手';
    $('#middle-label').textContent = profile ? '启用牌组' : '配方';
    $('#pool-label').textContent = profile ? '发现池' : '旧章节奖励池';
    $('#deck-count').textContent = `${profile ? Object.values(profile.starter).reduce((sum, n) => sum + n, 0) : count} 张`;
    $('#deck-weight').textContent = profile ? `${profile.enabledDecks.length} / ${profile.decks.length}` : `${draft.recipes.length} 条`;
    $('#reward-count').textContent = `${profile ? activeDiscoveryCards(profile).length : draft.cards.filter(card => card.reward).length} 种`;
    $('#weight-fill').parentElement.hidden = !profile;
    if (profile) $('#weight-fill').style.width = `${profile.enabledDecks.length / profile.decks.length * 100}%`;
    const refs = cardReferences(draft, card.id);
    $('#references').innerHTML = `<b>此卡牌用于</b><br>${refs.length ? refs.map(escape).join(' · ') : '尚未加入卡组或奖励池'}`;
    let issues = [];
    try { validateCatalog(draft); } catch (error) { issues = error.issues ?? [error.message]; }
    $('#validation').textContent = issues.slice(0, 5).join('\n');
    $('#recipe-validation').textContent = issues.slice(0, 5).join('\n');
    $('#save').disabled = saving || !dirty() || issues.length > 0;
    $('#play').disabled = saving || issues.length > 0;
    $('#play').textContent = dirty() ? '▷ 保存并试玩' : '▷ 试玩游戏';
    $('#save-state').textContent = saving ? '正在保存…' : dirty() ? '有未保存的更改' : lastSaved ? `已保存 ${lastSaved}` : '所有更改已保存';
    $('#save-state').className = 'save-state' + (dirty() ? ' dirty' : '');
}
function render() { renderList(); renderInspector(); renderDecks(); recipes.render(); }

async function load() {
    try {
        const [data] = await Promise.all([fetchJson('/api/cards'), loadVisualAssets()]);
        draft = validateCatalog(data.catalog);
        newCards = new WeakSet();
        baseline = clone(draft);
        revision = data.revision;
        selectedIndex = Math.max(0, draft.cards.findIndex(card => card.id === (selectedId ?? Object.keys(draft.labyrinth?.starter ?? {})[0])));
        selectedId = draft.cards[selectedIndex].id;
        $('#workspace').setAttribute('aria-busy', 'false');
        render();
    } catch (error) {
        $('#save-state').textContent = '连接失败';
        $('#save-state').className = 'save-state offline';
        notify(`无法读取配置：${error.message}`, true);
    }
}
async function save() {
    if (!draft || saving) return false;
    try { validateCatalog(draft); } catch (error) { notify(error.message, true); return false; }
    saving = true;
    $('#workspace').inert = true;
    $('#recipe-workspace').inert = true;
    $('#reload').disabled = true;
    renderVisual();
    try {
        const response = await fetch('/api/cards', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ catalog: draft, revision }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        draft = data.catalog;
        newCards = new WeakSet();
        baseline = clone(draft);
        revision = data.revision;
        lastSaved = new Date(data.savedAt).toLocaleTimeString('zh-CN', { hour12: false });
        notify('已保存到项目。重新打开试玩后生效。');
        return true;
    } catch (error) { notify(`保存失败：${error.message}`, true); return false; }
    finally { saving = false; $('#workspace').inert = false; $('#recipe-workspace').inert = false; $('#reload').disabled = false; render(); }
}
function nextId(base = 'card') {
    base = base.slice(0, 38);
    let index = 1;
    while (draft.cards.some(card => card.id === `${base}_${index}`)) index++;
    return `${base}_${index}`;
}
function add(copy = false) {
    if (!draft || saving) return;
    const source = current();
    const card = copy ? clone(source) : { id: nextId(), name: '新卡牌', tag: '技能 · 攻击', cost: 1, weight: 0, text: '', color: '#c29060', art: 'heavy', role: 'normal', initialCount: 0, reward: true, effect: { type: 'damage', amount: 3 } };
    if (copy) {
        card.id = nextId(source.id + '_copy');
        card.name = (source.name + '副本').slice(0, 18);
        card.role = ['temporary', 'supply'].includes(source.role) ? source.role : 'normal';
        card.initialCount = 0;
        card.reward = card.role === 'supply' || (card.role === 'normal' && !card.chapter);
        if (card.effect.type === 'none' && card.role !== 'supply')
            card.effect = { type: 'damage', amount: 2 };
    }
    draft.cards.push(card);
    newCards.add(card);
    selectedIndex = draft.cards.length - 1;
    selectedId = card.id;
    $('#search').value = '';
    $('#filter').value = 'all';
    render();
    const input = $('[data-field="name"]'); input.focus(); input.select();
}
function addSupply() {
    if (!draft || saving) return;
    const card = {
        id: nextId('supply'),
        name: '新物资卡',
        tag: '物资',
        cost: 0,
        weight: 1,
        text: '带回避难所后可兑换物资点。',
        color: '#9aaf8c',
        art: 'cash',
        role: 'supply',
        initialCount: 0,
        reward: true,
        supplyValue: 1,
        effect: { type: 'none', amount: 0 },
    };
    draft.cards.push(card);
    newCards.add(card);
    selectedIndex = draft.cards.length - 1;
    selectedId = card.id;
    $('#search').value = '';
    $('#filter').value = 'all';
    render();
    const input = $('[data-field="name"]'); input.focus(); input.select();
}
async function remove() {
    const card = current();
    if (!card || saving || (!newCards.has(card) && Object.prototype.hasOwnProperty.call(SYSTEM_ROLES, card.id))) return;
    if (draft.fixedReward === card.id) return notify('此卡是固定搜刮奖励，请先在投放设置中更换固定奖励。', true);
    if (draft.labyrinth?.starter[card.id]) return notify('此卡属于焦土迷宫基础牌组。', true);
    const weapons = draft.cards.filter(source => source.effect.generatedCard === card.id || source.effect.generatedCards?.includes(card.id));
    if (weapons.length) return notify(`请先修改${weapons.map(card => card.name).join('、')}的生成牌。`, true);
    if (draft.recipes.some(recipe => [...recipe.materials, ...recipe.products].some(row => row.card === card.id)))
        return notify('此卡用于合成配方，请先到「配方编辑」修改引用。', true);
    if (card.role === 'normal' && card.reward && draft.cards.filter(card => card.role === 'normal' && card.reward).length === 1) return notify('奖励池至少需要保留一张普通牌。', true);
    const refs = cardReferences(draft, card.id);
    if (!await confirm(`删除「${card.name}」？`, `${refs.length ? `此卡用于：${refs.join('、')}。\n删除后会一并移出初始卡组和随机奖励池。\n\n` : ''}点击「保存到项目」后，删除会在下一次试玩中生效。`)) return;
    const index = draft.cards.indexOf(card);
    if (draft.expedition) {
        delete draft.expedition.starter[card.id];
        if (draft.expedition.faces) delete draft.expedition.faces[card.id];
        draft.expedition.discoveryGroups = draft.expedition.discoveryGroups
            .map(group => group.filter(id => id !== card.id)).filter(group => group.length);
    }
    for (const deck of draft.labyrinth?.decks ?? []) deck.cards = deck.cards.filter(id => id !== card.id);
    draft.cards.splice(index, 1);
    selectedIndex = Math.min(index, draft.cards.length - 1);
    selectedId = draft.cards[selectedIndex].id;
    render();
}

$('#card-list').addEventListener('click', event => {
    const button = event.target.closest('[data-select]');
    if (!button || saving) return;
    selectedIndex = Number(button.dataset.select);
    selectedId = current().id;
    render();
});
$('#inspector-content').addEventListener('input', event => {
    const input = event.target, field = input.dataset.field, card = current();
    if (input.dataset.membership && card?.chapter && !saving) {
        const deck = draft.labyrinth.decks.find(group => group.id === input.dataset.membership);
        deck.cards = input.checked ? [...new Set([...deck.cards, card.id])] : deck.cards.filter(id => id !== card.id);
        renderVisual();
        renderDecks();
        return;
    }
    if (!field || !card || saving || input.disabled || input.readOnly) return;
    const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    if (field === 'fixedReward') draft.fixedReward = value;
    else if (field === 'effect.generatedCardsText') {
        card.effect.generatedCards = String(value).split(',').map(id => id.trim()).filter(Boolean);
        delete card.effect.generatedCard;
    } else if (['effect.block', 'effect.hits', 'effect.equippedStrength'].includes(field)) {
        const key = field.slice(7), defaultValue = key === 'hits' ? 1 : 0;
        if (value > defaultValue) card.effect[key] = value;
        else delete card.effect[key];
    } else if (field.startsWith('effect.')) card.effect[field.slice(7)] = value;
    else {
        const previousId = card.id;
        card[field] = value;
        if (field === 'id') {
            selectedId = value;
            if (draft.fixedReward === previousId) draft.fixedReward = value;
            for (const source of draft.cards) {
                if (source.effect.generatedCard === previousId) source.effect.generatedCard = value;
                if (source.effect.generatedCards)
                    source.effect.generatedCards = source.effect.generatedCards.map(id => id === previousId ? value : id);
            }
            for (const recipe of draft.recipes)
                for (const row of [...recipe.materials, ...recipe.products])
                    if (row.card === previousId) row.card = value;
            if (draft.expedition) {
                for (const dict of [draft.expedition.starter, draft.expedition.faces]) {
                    if (!dict || !Object.hasOwn(dict, previousId)) continue;
                    dict[value] = dict[previousId];
                    delete dict[previousId];
                }
                draft.expedition.discoveryGroups = draft.expedition.discoveryGroups.map(group => group.map(id => id === previousId ? value : id));
            }
            for (const deck of draft.labyrinth?.decks ?? [])
                deck.cards = deck.cards.map(id => id === previousId ? value : id);
        }
        if ((field === 'canSynthesize' || field === 'oncePerBattle') && !value) delete card[field];
    }
    if (field === 'effect.type') {
        if (value !== 'damage') {
            delete card.effect.bonusWhen;
            delete card.effect.bonus;
            delete card.effect.extraDraw;
            delete card.effect.block;
            delete card.effect.hits;
            delete card.effect.rage;
        }
        if (value !== 'heal' && value !== 'strength') delete card.oncePerBattle;
        card.effect.amount = ['equip', 'none'].includes(value) ? 0 : card.effect.amount || 1;
        if (value === 'equip') {
            const generated = card.effect.generatedCards ?? (card.effect.generatedCard ? [card.effect.generatedCard] : []);
            card.effect.generatedCards = generated.length ? generated : [draft.cards.find(card => card.role === 'temporary')?.id ?? 'slash'];
            delete card.effect.generatedCard;
            card.weaponSlots = card.weaponSlots ?? 1;
        } else {
            delete card.effect.generatedCard;
            delete card.effect.generatedCards;
            delete card.weaponSlots;
            delete card.effect.equippedStrength;
        }
    }
    if (field === 'role' && value === 'temporary') {
        card.initialCount = 0;
        card.reward = false;
        card.weight = 0;
        if (['equip', 'none', 'strength'].includes(card.effect.type)) card.effect = { type: 'damage', amount: 1 };
        delete card.weaponSlots;
        delete card.oncePerBattle;
        delete card.canSynthesize;
    }
    if (field === 'role' && value === 'supply') {
        card.initialCount = 0;
        card.cost = 0;
        card.effect = { type: 'none', amount: 0 };
        card.supplyValue = card.supplyValue ?? 1;
        delete card.canSynthesize;
        delete card.weaponSlots;
        delete card.oncePerBattle;
        delete card.synthesisOnly;
    }
    if (field === 'role' && value !== 'supply') delete card.supplyValue;
    if (field === 'role' && value === 'normal' && card.effect.type === 'none') card.effect = { type: 'damage', amount: 1 };
    renderList();
    if (field === 'effect.type' || field === 'role') renderInspector(); else renderVisual();
});
$('#search').addEventListener('input', renderList);
$('#preview-detail-toggle').addEventListener('click', () => setPreviewExpanded(!previewExpanded));
$('#filter').addEventListener('change', renderList);
$('#filter').add(new Option('焦土迷宫', 'labyrinth'));
$('#filter').add(new Option('获得力量', 'strength'));
$('#discovery-decks').addEventListener('click', () => { renderDecks(); $('#deck-dialog').showModal(); });
$('#close-decks').addEventListener('click', () => $('#deck-dialog').close());
$('#save-decks').addEventListener('click', async () => { if (await save()) $('#deck-dialog').close(); });
$('#deck-options').addEventListener('change', event => {
    const id = event.target.dataset.deck;
    if (!id || saving) return;
    const profile = draft.labyrinth;
    profile.enabledDecks = profile.decks.filter(deck => deck.id === id ? event.target.checked : profile.enabledDecks.includes(deck.id)).map(deck => deck.id);
    renderVisual();
    renderDecks();
    [...$('#deck-options').querySelectorAll('[data-deck]')].find(input => input.dataset.deck === id)?.focus();
});
$('#add').addEventListener('click', () => add());
$('#add-supply').addEventListener('click', addSupply);
$('#duplicate').addEventListener('click', () => add(true));
$('#delete').addEventListener('click', remove);
$('#save').addEventListener('click', save);
$('#reload').addEventListener('click', async () => {
    if (saving) return;
    if (dirty() && !await confirm('放弃未保存的修改？', '将重新读取项目里已保存的卡牌配置。', '重新载入')) return;
    await load();
});
function gameURL() {
    const query = new URLSearchParams({ cards: 'live', save: 'off', seed: '17', revision, t: Date.now() });
    const mapCraft = $('#map-craft-test').checked;
    if (location.pathname === '/recipes' || mapCraft) {
        query.set('scenario', 'synthesis');
        query.delete('seed');
    }
    if (mapCraft) query.set('mapCraft', '1');
    return '/play/?' + query;
}
$('#play').addEventListener('click', async () => {
    if (!draft || saving) return;
    if (dirty() && !await save()) return;
    $('#game-frame').src = gameURL();
    $('#game-dialog').showModal();
});
$('#reload-game').addEventListener('click', () => { $('#game-frame').src = gameURL(); });
$('#close-game').addEventListener('click', () => $('#game-dialog').close());
$('#game-dialog').addEventListener('close', () => { $('#game-frame').src = 'about:blank'; });
window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (!$('#save').disabled) void save(); } });
function showPage() {
    const inRecipes = location.pathname === '/recipes';
    $('#workspace').hidden = inRecipes;
    $('#recipe-workspace').hidden = !inRecipes;
    for (const link of document.querySelectorAll('[data-page]')) {
        if ((link.dataset.page === 'recipes') === inRecipes) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
        link.onclick = event => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            if (location.pathname === link.pathname) return;
            history.pushState(null, '', link.pathname);
            showPage();
        };
    }
    if (inRecipes) recipes.render();
}
window.addEventListener('popstate', showPage);
showPage();
void load();
