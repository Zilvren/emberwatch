import { validateCatalog, effectSummary, titleColor, cardReferences, SYSTEM_ROLES, EFFECT_NAMES, ART_IDS } from '/shared/catalog.js';

const $ = selector => document.querySelector(selector);
const clone = value => JSON.parse(JSON.stringify(value));
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const artNames = { attack: '基础攻击', dodge: '基础躲避', knife: '刀具', evade: '强化躲避', repair: '修复', heavy: '重击', slash: '挥砍', cash: '现金' };
const roleNames = { basic: '固有能力', normal: '普通牌', temporary: '战斗临时牌', cash: '遗物' };
let draft, baseline, revision, selectedId, selectedIndex = 0, saving = false, lastSaved = '', noticeTimer;
let newCards = new WeakSet();
const current = () => draft?.cards[selectedIndex];
const dirty = () => !!draft && JSON.stringify(draft) !== JSON.stringify(baseline);
const definitions = () => Object.fromEntries(draft.cards.map(card => [card.id, card]));

function artMarkup(art) {
    const cell = { attack: [0, 0], dodge: [1, 0], knife: [2, 0], evade: [0, 1], repair: [1, 1], heavy: [2, 1], slash: [2, 0], cash: [2, 0] }[art] ?? [0, 0];
    return `<img src="/art/card-art.png" alt="${escape(artNames[art] ?? '卡牌插画')}" style="left:-${cell[0] * 100}%;top:-${cell[1] * 100}%">`;
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
    const attributes = `${options.readonly ? 'readonly' : ''} ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.max !== undefined ? `max="${options.max}"` : ''} ${options.maxlength ? `maxlength="${options.maxlength}"` : ''}`;
    return `<label class="field"><span>${label}${options.hint ? `<small>${options.hint}</small>` : ''}</span><input aria-label="${label}" data-field="${key}" type="${options.type ?? 'text'}" value="${escape(value)}" ${attributes} autocomplete="off"></label>`;
}
function select(label, key, value, items, disabled = false) {
    return `<label class="field"><span>${label}</span><select aria-label="${label}" data-field="${key}" ${disabled ? 'disabled' : ''}>${items.map(([id, name]) => `<option value="${escape(id)}" ${id === value ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select></label>`;
}
function renderList() {
    if (!draft) return;
    const query = $('#search').value.trim().toLowerCase(), filter = $('#filter').value;
    const cards = draft.cards.filter(card => (!query || `${card.id} ${card.name}`.toLowerCase().includes(query)) && (filter === 'all' || card.effect.type === filter));
    $('#card-count').textContent = draft.cards.length;
    $('#card-list').innerHTML = cards.length ? cards.map(card => `<div role="listitem"><button class="card-row ${card === current() ? 'selected' : ''}" data-select="${draft.cards.indexOf(card)}" aria-label="选择卡牌：${escape(card.name)}" aria-current="${card === current()}"><span class="row-art art-crop">${artMarkup(card.art)}</span><span class="row-info"><strong>${escape(card.name)}</strong><small>${escape(card.id)} · ${escape(EFFECT_NAMES[card.effect.type])}</small>${card.initialCount || card.reward ? `<span class="row-indicator">${card.initialCount ? `初始 ×${card.initialCount}` : ''}${card.initialCount && card.reward ? '　' : ''}${card.reward ? '奖励池' : ''}</span>` : ''}</span><span class="row-cost">${card.cost}</span></button></div>`).join('') : '<p class="empty-list">没有找到匹配的卡牌</p>';
}
function renderInspector() {
    const card = current();
    if (!card) return;
    const saved = !newCards.has(card);
    const system = saved && Object.prototype.hasOwnProperty.call(SYSTEM_ROLES, card.id);
    const allowedEffects = card.id === 'attack' || card.id === 'slash' ? ['damage'] : card.id === 'dodge' ? ['block'] : card.id === 'cash' ? ['none'] : card.role === 'temporary' ? ['damage', 'block', 'heal'] : ['damage', 'block', 'heal', 'equip'];
    $('#inspector-content').innerHTML = `
      <fieldset class="property-group"><legend><span>01</span>基本资料</legend><div>
        ${field('卡牌名称', 'name', card.name, { maxlength: 18 })}
        ${field('卡牌 ID', 'id', card.id, { readonly: saved || system, maxlength: 48, hint: saved || system ? '已保存后保持稳定' : '小写字母、数字、下划线' })}
        ${field('分类说明', 'tag', card.tag, { maxlength: 32 })}
        <div class="field-grid">${select('卡牌身份', 'role', card.role, system ? [[card.role, roleNames[card.role]]] : [['normal', '普通牌'], ['temporary', '战斗临时牌']], system)}${field('标识色', 'color', card.color, { type: 'color' })}</div>
        <span class="field-label">卡牌插画</span><div class="art-options">${ART_IDS.map(art => `<label class="art-option"><input type="radio" name="illustration" data-field="art" value="${art}" ${card.art === art ? 'checked' : ''} aria-label="插画：${artNames[art]}"><span class="art-crop">${artMarkup(art)}</span><small>${artNames[art]}</small></label>`).join('')}</div>
      </div></fieldset>
      <fieldset class="property-group"><legend><span>02</span>战斗效果</legend><div>
        <div class="field-grid">${field('物资费用', 'cost', card.cost, { type: 'number', min: 0, max: 99, readonly: card.role === 'basic' || card.role === 'cash' })}${field('卡牌重量', 'weight', card.weight, { type: 'number', min: 0, max: 30, readonly: card.role === 'basic' || card.role === 'temporary' })}</div>
        ${select('效果类型', 'effect.type', card.effect.type, allowedEffects.map(type => [type, EFFECT_NAMES[type]]))}
        ${card.effect.type === 'equip' ? select('每回合生成', 'effect.generatedCard', card.effect.generatedCard, draft.cards.filter(card => card.role === 'temporary').map(card => [card.id, card.name])) : card.effect.type === 'none' ? '<p class="field-note">遗物不进入战斗。现金可以在营地丢弃。</p>' : field('效果数值', 'effect.amount', card.effect.amount, { type: 'number', min: 1, max: 999 })}
        <label class="field"><span>补充说明<small>效果数值会自动生成</small></span><textarea aria-label="补充说明" data-field="text" maxlength="80" rows="2">${escape(card.text)}</textarea></label>
      </div></fieldset>
      <fieldset class="property-group"><legend><span>03</span>卡牌投放</legend><div>
        ${field('初始携带数量', 'initialCount', card.initialCount, { type: 'number', min: card.role === 'basic' ? 1 : 0, max: 8, readonly: card.role === 'cash' || card.role === 'temporary' })}
        <label class="check-field"><input type="checkbox" aria-label="加入随机奖励池" data-field="reward" ${card.reward ? 'checked' : ''} ${card.role !== 'normal' ? 'disabled' : ''}>加入随机奖励池</label>
        ${select('固定搜刮奖励', 'fixedReward', draft.fixedReward, draft.cards.filter(card => card.role === 'normal').map(card => [card.id, card.name]))}
        <p class="field-note">初始负重包含 10 点物资，上限 30。新卡加入卡组或奖励池后，会在下次试玩中出现。</p>
      </div></fieldset>
      <div id="references" class="references"></div><div id="validation" class="validation" role="status"></div>`;
    $('#delete').disabled = system;
    $('#delete').title = system ? '基础能力、现金和系统挥砍需要保留' : '删除卡牌';
    renderVisual();
}
function renderVisual() {
    const card = current();
    if (!card) return;
    $('#preview-name').textContent = card.name || '未命名卡牌';
    $('#preview-name').style.color = titleColor(card.color);
    $('#preview-cost').textContent = card.cost;
    $('#preview-tag').textContent = card.tag;
    $('#preview-effect').textContent = effectSummary(card, definitions());
    $('#preview-description').textContent = card.text;
    $('#preview-type').textContent = EFFECT_NAMES[card.effect.type];
    $('#preview-weight').textContent = `负重 ${card.weight}`;
    $('#preview-role').textContent = roleNames[card.role];
    $('#preview-id').textContent = card.id;
    $('#preview-art').innerHTML = artMarkup(card.art);
    $('#preview-card').style.setProperty('--card-accent', card.color);
    const fixedReward = $('[data-field="fixedReward"]');
    if (fixedReward) fixedReward.innerHTML = draft.cards.filter(entry => entry.role === 'normal').map(entry => `<option value="${escape(entry.id)}" ${entry.id === draft.fixedReward ? 'selected' : ''}>${escape(entry.name)}</option>`).join('');
    const count = draft.cards.reduce((count, card) => count + card.initialCount, 0);
    const weight = draft.cards.reduce((weight, card) => weight + card.weight * card.initialCount, 10);
    $('#deck-count').textContent = `${count} 张`;
    $('#deck-weight').textContent = `${weight} / 30`;
    $('#reward-count').textContent = `${draft.cards.filter(card => card.reward).length} 种`;
    $('#weight-fill').style.width = `${Math.min(100, weight / 30 * 100)}%`;
    $('#weight-fill').style.background = weight > 30 ? '#cf8262' : '';
    const refs = cardReferences(draft, card.id);
    $('#references').innerHTML = `<b>此卡牌用于</b><br>${refs.length ? refs.map(escape).join(' · ') : '尚未加入卡组或奖励池'}`;
    let issues = [];
    try { validateCatalog(draft); } catch (error) { issues = error.issues ?? [error.message]; }
    $('#validation').textContent = issues.slice(0, 5).join('\n');
    $('#save').disabled = saving || !dirty() || issues.length > 0;
    $('#play').disabled = saving || issues.length > 0;
    $('#play').textContent = dirty() ? '▷ 保存并试玩' : '▷ 试玩游戏';
    $('#save-state').textContent = saving ? '正在保存…' : dirty() ? '有未保存的更改' : lastSaved ? `已保存 ${lastSaved}` : '所有更改已保存';
    $('#save-state').className = 'save-state' + (dirty() ? ' dirty' : '');
}
function render() { renderList(); renderInspector(); }

async function load() {
    try {
        const response = await fetch('/api/cards', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        draft = validateCatalog(data.catalog);
        newCards = new WeakSet();
        baseline = clone(draft);
        revision = data.revision;
        selectedIndex = Math.max(0, draft.cards.findIndex(card => card.id === selectedId));
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
    finally { saving = false; $('#workspace').inert = false; $('#reload').disabled = false; render(); }
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
    const card = copy ? clone(source) : { id: nextId(), name: '新卡牌', tag: '技能 · 攻击', cost: 1, weight: 2, text: '', color: '#c29060', art: 'heavy', role: 'normal', initialCount: 0, reward: true, effect: { type: 'damage', amount: 3 } };
    if (copy) {
        card.id = nextId(source.id + '_copy');
        card.name = (source.name + '副本').slice(0, 18);
        card.role = source.role === 'temporary' ? 'temporary' : 'normal';
        card.initialCount = 0;
        card.reward = card.role === 'normal';
        if (card.effect.type === 'none') card.effect = { type: 'damage', amount: 2 };
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
async function remove() {
    const card = current();
    if (!card || saving || (!newCards.has(card) && Object.prototype.hasOwnProperty.call(SYSTEM_ROLES, card.id))) return;
    if (draft.fixedReward === card.id) return notify('此卡是固定搜刮奖励，请先在投放设置中更换固定奖励。', true);
    const weapons = draft.cards.filter(source => source.effect.generatedCard === card.id);
    if (weapons.length) return notify(`请先修改${weapons.map(card => card.name).join('、')}的生成牌。`, true);
    if (card.reward && draft.cards.filter(card => card.reward).length === 1) return notify('奖励池至少需要保留一张普通牌。', true);
    const refs = cardReferences(draft, card.id);
    if (!await confirm(`删除「${card.name}」？`, `${refs.length ? `此卡用于：${refs.join('、')}。\n删除后会一并移出初始卡组和随机奖励池。\n\n` : ''}点击「保存到项目」后，删除会在下一次试玩中生效。`)) return;
    const index = draft.cards.indexOf(card);
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
    if (!field || !card || saving || input.disabled || input.readOnly) return;
    const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    if (field === 'fixedReward') draft.fixedReward = value;
    else if (field.startsWith('effect.')) card.effect[field.slice(7)] = value;
    else {
        const previousId = card.id;
        card[field] = value;
        if (field === 'id') selectedId = value;
        if (field === 'id' && draft.fixedReward === previousId) draft.fixedReward = value;
        if (field === 'id') for (const source of draft.cards) if (source.effect.generatedCard === previousId) source.effect.generatedCard = value;
    }
    if (field === 'effect.type') {
        card.effect.amount = ['equip', 'none'].includes(value) ? 0 : card.effect.amount || 1;
        if (value === 'equip') card.effect.generatedCard = draft.cards.find(card => card.role === 'temporary')?.id ?? 'slash';
        else delete card.effect.generatedCard;
    }
    if (field === 'role' && value === 'temporary') { card.initialCount = 0; card.reward = false; card.weight = 0; if (card.effect.type === 'equip') card.effect = { type: 'damage', amount: 1 }; }
    renderList();
    if (field === 'effect.type' || field === 'role') renderInspector(); else renderVisual();
});
$('#search').addEventListener('input', renderList);
$('#filter').addEventListener('change', renderList);
$('#add').addEventListener('click', () => add());
$('#duplicate').addEventListener('click', () => add(true));
$('#delete').addEventListener('click', remove);
$('#save').addEventListener('click', save);
$('#reload').addEventListener('click', async () => {
    if (saving) return;
    if (dirty() && !await confirm('放弃未保存的修改？', '将重新读取项目里已保存的卡牌配置。', '重新载入')) return;
    await load();
});
function gameURL() { return `/play/?cards=live&seed=17&revision=${revision}&t=${Date.now()}`; }
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
void load();
