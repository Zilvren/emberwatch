import { validateCatalog, cardReferences, SYSTEM_ROLES, EFFECT_NAMES, ART_IDS, isBattleCard, isLabyrinthRewardCard } from '/shared/catalog.js';
import { cardViewModel, supplyPictureLayout } from '/shared/card-view.js';
import { bindRecipeEditor } from '/recipes.js';
import { LABYRINTH_ENEMIES, DEFAULT_ENEMY_ACTIONS, DEFAULT_ENEMY_LOOP_START, ENEMY_ACTION_LABELS } from '/shared/labyrinth-enemies.js';

const $ = selector => document.querySelector(selector);
const clone = value => JSON.parse(JSON.stringify(value));
const fixedRewardCard = card => card.role === 'normal' && !card.chapter && !card.synthesisOnly && !card.fist;
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const artNames = { attack: '基础攻击', dodge: '基础躲避', knife: '刀具', evade: '强化躲避', repair: '修复', heavy: '重击', slash: '挥砍', cash: '现金', rope: '绳子', battery: '电池' };
const roleNames = { basic: '基础牌', normal: '普通牌', temporary: '战斗临时牌', cash: '旧版现金', supply: '物资牌' };
const effectSearchTerms = { damage: '攻击', block: '防御', heal: '治疗 回复', equip: '武器', draw: '抽卡' };
const cardTypes = [
    ['all', '全部类型'],
    ...Object.entries(EFFECT_NAMES).map(([id, name]) => [id, name, effectSearchTerms[id] ?? '']),
    ['supply', '物资卡', roleNames.supply],
    ['labyrinth', '焦土迷宫'],
    ['basic', roleNames.basic],
    ['normal', roleNames.normal],
    ['temporary', roleNames.temporary],
];
const typeSearch = $('#type-search'), typeOptions = $('#type-options');
const rewardWorkspace = $('#reward-workspace'), rewardGrid = $('#reward-grid');
const rewardFilter = $('#reward-filter');
const enemyWorkspace = $('#enemy-workspace'), enemyEditor = $('#enemy-editor'), enemySelector = $('#enemy-selector');
for (const [id, enemy] of Object.entries(LABYRINTH_ENEMIES)) enemySelector.add(new Option(enemy.title, id));
let draft, baseline, revision, selectedId, selectedIndex = 0, saving = false, lastSaved = '', noticeTimer;
let newCards = new WeakSet();
let previewedCard, previewExpanded = false;
let uiArt, itemArt;
const supplyPage = () => location.pathname === '/supplies';
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
    const [themeResponse, artResponse, itemResponse] = await Promise.allSettled([
        fetchJson('/shared/ui-theme.json'),
        fetchJson('/shared/ui-art.json'),
        fetchJson('/shared/item-art.json'),
    ]);
    const theme = themeResponse.value;
    const hasTheme = theme?.name === 'ashen-labyrinth' && theme.colors?.ink && theme.card?.typeText;
    uiArt = isCardAtlas(artResponse.value) ? artResponse.value : null;
    itemArt = itemResponse.value;
    if (hasTheme) {
        for (const [name, value] of Object.entries(theme.colors)) {
            const property = '--card-' + name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
            $('#preview-card').style.setProperty(property, value);
            rewardWorkspace.style.setProperty(property, value);
        }
        $('#preview-card').style.setProperty('--card-type-text', theme.card.typeText);
    }
    $('#preview-asset-note').hidden = !!hasTheme && !!uiArt;
}

function canJoinRewardPool(card) {
    return !!draft.labyrinth && isLabyrinthRewardCard(card);
}
function inRewardPool(card) {
    return canJoinRewardPool(card) && draft.labyrinth.discoveryPool.includes(card.id);
}
function setRewardMembership(card, included) {
    if (!canJoinRewardPool(card)) return;
    const profile = draft.labyrinth;
    if (included) {
        if (!profile.discoveryPool.includes(card.id)) profile.discoveryPool.push(card.id);
    } else profile.discoveryPool = profile.discoveryPool.filter(id => id !== card.id);
}

function artMarkup(art, cardId) {
    const material = itemArt?.frames?.[art];
    const useMaterial = !uiArt?.cards[cardId] && !uiArt?.cards[art] && material?.image === 'materials.png';
    const atlas = useMaterial ? itemArt.images['materials.png'] : uiArt;
    if (!atlas) return '';
    const [x, y, w, h] = useMaterial ? material.rect : atlas.cards[cardId] ?? atlas.cards[art] ?? atlas.cards.knife;
    const position = `${100 * x / (atlas.width - w)}% ${100 * y / (atlas.height - h)}%`;
    const size = `${100 * atlas.width / w}% ${100 * atlas.height / h}%`;
    const image = useMaterial ? "background-image:url('/art/materials.png');" : '';
    return `<span class="painted-tile" role="img" aria-label="${escape(artNames[art] ?? '卡牌插画')}" style="${image}--art-ratio:${w / h};background-position:${position};background-size:${size}"></span>`;
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
function matchingCardTypes(query) {
    const term = query.trim().toLowerCase();
    if (!term) return cardTypes;
    const exact = cardTypes.find(([id, name]) => term === id || term === name.toLowerCase());
    return exact ? [exact] : cardTypes.filter(option =>
        option[0] !== 'all' && option.some(text => text.toLowerCase().includes(term))
    );
}
function closeTypeOptions() {
    typeOptions.hidden = true;
    typeSearch.setAttribute('aria-expanded', 'false');
    typeSearch.removeAttribute('aria-activedescendant');
}
function showTypeOptions(options = cardTypes) {
    if (!options.length) return closeTypeOptions();
    const matches = matchingCardTypes(typeSearch.value);
    const selected = typeSearch.value.trim() ? matches.length === 1 && matches[0][0] : 'all';
    typeOptions.innerHTML = options.map(([id, name]) => `
        <button type="button" class="type-option" id="type-option-${id}" data-card-type="${id}"
          role="option" tabindex="-1" aria-selected="${id === selected}">${escape(name)}</button>`).join('');
    typeOptions.hidden = false;
    typeOptions.scrollTop = 0;
    typeSearch.removeAttribute('aria-activedescendant');
    typeSearch.setAttribute('aria-expanded', 'true');
}
function chooseCardType(id) {
    const [, name] = cardTypes.find(option => option[0] === id);
    typeSearch.value = id === 'all' ? '' : name;
    typeSearch.focus();
    closeTypeOptions();
    renderList();
}
function clearCardFilters() {
    $('#search').value = '';
    typeSearch.value = '';
    closeTypeOptions();
}
function renderList() {
    if (!draft) return;
    const query = $('#search').value.trim().toLowerCase();
    const types = !supplyPage() && typeSearch.value.trim() ? matchingCardTypes(typeSearch.value).map(([id]) => id) : ['all'];
    const library = supplyPage() ? draft.cards.filter(card => card.role === 'supply') : draft.cards;
    const cards = library.filter(card => {
        const matchesFilter = types.includes('all') || types.includes(card.effect.type) ||
            types.includes(card.role) || (types.includes('labyrinth') && (card.chapter === 'ashen-labyrinth' || !!card.fist));
        return (!query || `${card.id} ${card.name}`.toLowerCase().includes(query)) && matchesFilter;
    });
    $('#card-count').textContent = cards.length;
    $('#card-list').innerHTML = cards.length ? cards.map(card => {
        const supply = card.role === 'supply';
        const details = [
            supply ? `负重 ${card.weight} · 兑换 ${card.supplyValue ?? 1} 物资点` : card.initialCount ? `初始 ×${card.initialCount}` : '',
            inRewardPool(card) ? '奖励池' : '',
        ].filter(Boolean).join('　');
        return `<div role="listitem"><button class="card-row ${card === current() ? 'selected' : ''}" data-select="${draft.cards.indexOf(card)}"
          aria-label="选择卡牌：${escape(card.name)}" aria-current="${card === current()}">
          <span class="row-art art-crop">${artMarkup(card.art, card.id)}</span>
          <span class="row-info"><strong>${escape(card.name)}</strong>
          <small>${escape(card.id)} · ${supply ? '物资卡' : escape(EFFECT_NAMES[card.effect.type])}</small>
          ${details ? `<span class="row-indicator">${details}</span>` : ''}</span>
          <span class="row-cost">${supply ? (card.reward ? '投放中' : '未投放') : card.cost}</span>
        </button></div>`;
    }).join('') : '<p class="empty-list">没有找到匹配的卡牌</p>';
}
function rewardSettings(card) {
    if (!canJoinRewardPool(card)) return '';
    const starterCount = draft.labyrinth.starter[card.id];
    return `<div class="reward-settings">
      ${starterCount ? `<p class="field-note">焦土迷宫基础牌组 ×${starterCount}</p>` : ''}
      <label class="reward-option">
        <input type="checkbox" aria-label="加入随机奖励池" data-field="reward" ${inRewardPool(card) ? 'checked' : ''}>
        <strong>加入随机奖励池</strong>
        <span class="reward-status" aria-hidden="true"><span class="reward-joined">已加入</span><span class="reward-unjoined">未加入</span></span>
      </label>
    </div>`;
}
function rewardCards() {
    return draft.cards.filter(canJoinRewardPool);
}
function renderRewardCount(cards) {
    const included = cards.filter(inRewardPool).length;
    $('#reward-pool-count').textContent = `已加入 ${included} / ${cards.length} 张`;
}
function rewardCardMarkup(card, cardDefinitions) {
    const face = cardViewModel(card, cardDefinitions, '体力', { field: true, labyrinth: true });
    const name = face.title || '未命名卡牌';
    return `<label class="reward-card">
      <span class="reward-face" aria-hidden="true">
        <span class="reward-face-header">
          <span class="reward-face-title">
            <strong title="${escape(name)}">${escape(name)}</strong>
            <small>${escape(face.tag)}</small>
          </span>
          ${face.showCost ? `<span class="reward-face-cost"><strong>${escape(face.cost)}</strong>
            <small>${escape(face.costUnit)}</small></span>` : ''}
        </span>
        <span class="reward-face-art art-crop">${artMarkup(face.art, card.id)}</span>
        <span class="reward-face-text">
          <strong>${escape(face.effect)}</strong>
          ${face.description ? `<small>${escape(face.description)}</small>` : ''}
        </span>
      </span>
      <span class="reward-card-choice">
        <input type="checkbox" data-reward-card="${escape(card.id)}" aria-label="${escape('将' + name + '加入奖励池')}"
          ${inRewardPool(card) ? 'checked' : ''}>
        <span class="reward-card-status" aria-hidden="true"><span class="reward-joined">已加入</span><span class="reward-unjoined">未加入</span></span>
      </span>
    </label>`;
}
function renderRewardGrid(resetScroll = false) {
    if (!draft) return;
    const cards = rewardCards(), filter = rewardFilter.value;
    const visible = cards.filter(card => filter === 'all' || inRewardPool(card) === (filter === 'included'));
    const cardDefinitions = definitions();
    rewardGrid.innerHTML = visible.map(card => rewardCardMarkup(card, cardDefinitions)).join('');
    renderRewardCount(cards);
    const empty = $('#reward-empty');
    empty.hidden = visible.length > 0;
    empty.textContent = filter === 'included' ? '当前奖励池为空。' :
        filter === 'excluded' ? '可选卡牌已全部加入。' : '焦土迷宫暂无可加入的卡牌。';
    if (resetScroll) $('#reward-scroll').scrollTop = 0;
}
function currentEnemyPlan() {
    const enemy = LABYRINTH_ENEMIES[enemySelector.value];
    const plan = draft.labyrinth.enemyActions?.[enemySelector.value];
    return plan ? { ...plan, actions: [...plan.actions] } :
        { attack: enemy.attack, strongAttack: enemy.strongAttack, actions: [...DEFAULT_ENEMY_ACTIONS], loopStart: DEFAULT_ENEMY_LOOP_START };
}
function renderEnemyEditor() {
    if (!draft) return;
    enemySelector.disabled = !draft.labyrinth;
    if (!draft.labyrinth) {
        enemyEditor.innerHTML = '<p class="field-note">当前牌库没有焦土迷宫配置。</p>';
        return;
    }
    const plan = currentEnemyPlan();
    const kinds = Object.entries(ENEMY_ACTION_LABELS);
    enemyEditor.innerHTML = `
      <div class="enemy-damage">
        ${field('普攻伤害', 'attack', plan.attack, { type: 'number', min: 0, max: 100000 })}
        ${field('重击伤害', 'strongAttack', plan.strongAttack, { type: 'number', min: 0, max: 100000 })}
      </div>
      <div class="enemy-sequence-heading">
        <div><h2>行动顺序</h2><p class="enemy-hint">开场执行第 1 步，最后一步之后回到循环起点。</p></div>
        ${select('循环起点', 'loopStart', String(plan.loopStart),
            plan.actions.map((_, index) => [String(index), `第 ${index + 1} 步`]))}
      </div>
      <ol class="enemy-steps">${plan.actions.map((action, index) => `
        <li class="enemy-step">
          ${select(`第 ${index + 1} 步`, 'step-' + index, action, kinds)}
          <div class="enemy-step-buttons">
            <button type="button" class="button outline" data-enemy-edit="up" data-index="${index}"
              aria-label="上移第 ${index + 1} 步" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="button outline" data-enemy-edit="down" data-index="${index}"
              aria-label="下移第 ${index + 1} 步" ${index === plan.actions.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="button outline" data-enemy-edit="remove" data-index="${index}"
              aria-label="移除第 ${index + 1} 步" ${plan.actions.length === 1 ? 'disabled' : ''}>移除</button>
          </div>
        </li>`).join('')}</ol>
      <div class="enemy-controls">
        <button type="button" class="button outline" data-enemy-edit="add">＋ 添加动作</button>
        <button type="button" class="button quiet" data-enemy-edit="reset">恢复默认</button>
      </div>`;
}
function updateEnemyPlan(plan) {
    const profile = draft.labyrinth;
    const plans = { ...profile.enemyActions };
    if (plan) plans[enemySelector.value] = plan;
    else delete plans[enemySelector.value];
    if (Object.keys(plans).length) profile.enemyActions = plans;
    else delete profile.enemyActions;
    renderVisual();
}
function renderInspector() {
    const card = current();
    if (!card) return;
    const saved = !newCards.has(card);
    const system = saved && Object.prototype.hasOwnProperty.call(SYSTEM_ROLES, card.id);
    const chapter = card.chapter === 'ashen-labyrinth';
    const fist = card.fist;
    const fistFinisher = fist?.type === 'finisher';
    const fixedType = chapter || !!fist;
    const fixedEffect = !!fist || (chapter && (saved || !!card.effect.labyrinth));
    const supply = card.role === 'supply';
    const artLabel = uiArt && Object.hasOwn(uiArt.cards, card.id) ? '备用插画' : '卡牌插画';
    const allowedEffects = card.id === 'attack' || card.id === 'slash' ? ['damage'] : card.id === 'dodge' ? ['block'] : card.role === 'cash' || supply ? ['none'] : card.role === 'temporary' ? ['damage', 'block', 'heal'] : ['damage', 'block', 'heal', 'equip', 'draw', 'strength'];
    $('#inspector-content').innerHTML = `
      ${rewardSettings(card)}
      <fieldset class="property-group"><legend>${supply ? '物资属性' : '基本资料'}</legend><div>
        ${field('卡牌名称', 'name', card.name, { maxlength: 18 })}
        ${supply ? `<div class="field-grid">${field('物资卡重量', 'weight', card.weight, { type: 'number', min: 1, max: 30 })}${field('兑换物资点', 'supplyValue', card.supplyValue ?? 1, { type: 'number', min: 1, max: 999 })}</div>` : ''}
        ${field('卡牌 ID', 'id', card.id, { readonly: saved || system, maxlength: 48, hint: saved || system ? '已保存后保持稳定' : '小写字母、数字、下划线' })}
        ${field('分类说明', 'tag', card.tag, { maxlength: 32 })}
        <div class="field-grid">${select('卡牌身份', 'role', card.role, system || fixedType || supplyPage() ? [[card.role, roleNames[card.role]]] : [['normal', '普通牌'], ['temporary', '战斗临时牌'], ['supply', '物资牌']], system || fixedType || supplyPage())}${field('标识色', 'color', card.color, { type: 'color' })}</div>
        ${chapter || supply || fistFinisher ? '' : `<label class="check-field"><input type="checkbox" data-field="canSynthesize" ${card.canSynthesize ? 'checked' : ''} ${isBattleCard(card) ? '' : 'disabled'}>可作为合成材料</label>`}
        <div class="illustration-field">
          ${select(artLabel, 'art', card.art, ART_IDS.map(art => [art, artNames[art] ?? art]))}
          <span id="illustration-thumbnail" class="illustration-thumbnail art-crop" aria-hidden="true"></span>
        </div>
      </div></fieldset>
      <fieldset class="property-group"><legend>${supply ? '物品说明' : '战斗效果'}</legend><div>
        ${supply ? '' : `
        ${field('体力费用', 'cost', card.cost, { type: 'number', min: 0, max: 99, readonly: card.role === 'basic' || card.role === 'cash' })}
        ${fistFinisher ? field('临时版体力费用', 'fist.temporaryCost', fist.temporaryCost, { type: 'number', min: 0, max: 98, hint: '低于奖励版费用' }) : ''}
        ${select('效果类型', 'effect.type', card.effect.type, (fixedEffect ? [card.effect.type] : allowedEffects).map(type => [type, EFFECT_NAMES[type]]), fixedEffect)}
        ${card.effect.type === 'equip' ? `${field('每回合生成牌', 'effect.generatedCardsText', (card.effect.generatedCards ?? (card.effect.generatedCard ? [card.effect.generatedCard] : [])).join(', '), { hint: '填写临时牌 ID，用逗号分隔' })}${field('占用武器槽', 'weaponSlots', card.weaponSlots ?? 1, { type: 'number', min: 1, max: 2 })}` : card.effect.type === 'none' ? '<p class="field-note">现金可以在营地丢弃。</p>' : card.effect.amount ? field('效果数值', 'effect.amount', card.effect.amount, { type: 'number', min: 1, max: 999 }) : ''}`}
        ${card.effect.type === 'damage' ? field('同时获得格挡', 'effect.block', card.effect.block ?? 0, { type: 'number', min: 0, max: 999, hint: '0 表示没有额外格挡' }) : ''}
        ${card.effect.type === 'damage' ? field('攻击段数', 'effect.hits', card.effect.hits ?? 1, { type: 'number', min: 1, max: 20 }) : ''}
        ${card.effect.type === 'equip' ? field('装备力量', 'effect.equippedStrength', card.effect.equippedStrength ?? 0, { type: 'number', min: 0, max: 999 }) : ''}
        ${isBattleCard(card) && ['heal', 'strength'].includes(card.effect.type) ? `<label class="check-field"><input type="checkbox" data-field="oncePerBattle" ${card.oncePerBattle ? 'checked' : ''}>每张每场限用一次</label>` : ''}
        ${supply ? '' : field('简述', 'summary', card.summary ?? '', { hint: '默认显示在卡面' })}
        <label class="field"><span>详细描述<small>悬停时阅读，基础数值自动生成</small></span><textarea aria-label="详细描述" data-field="text" maxlength="80" rows="3">${escape(card.text)}</textarea></label>
      </div></fieldset>
      ${supply ? `<fieldset class="property-group"><legend>搜刮投放</legend><div><label class="check-field"><input type="checkbox" aria-label="加入随机奖励池" data-field="reward" ${card.reward ? 'checked' : ''}>加入搜刮物资池</label>
            ${field('奖励权重', 'rewardWeight', card.rewardWeight ?? 1, { type: 'number', min: 0.01, max: 100, step: 'any', hint: '数值越大，越容易搜到' })}</div></fieldset>` : fistFinisher ? '<p class="field-note">首次在战斗中生成临时版后，解锁本局的奖励版。</p>' : chapter || fist ? '' : `<fieldset class="property-group"><legend>旧版配置</legend><div>
        ${field('初始携带数量', 'initialCount', card.initialCount, { type: 'number', min: card.role === 'basic' ? 1 : 0, max: 8, readonly: !isBattleCard(card) || card.synthesisOnly })}
        ${select('固定搜刮奖励', 'fixedReward', draft.fixedReward, draft.cards.filter(fixedRewardCard).map(card => [card.id, card.name]))}
        <p class="field-note">供兼容存档使用。焦土迷宫的掉落在「奖励池」页管理。</p>
      </div></fieldset>`}
      <div id="references" class="references"></div><div id="validation" class="validation" role="status"></div>`;
    $('#duplicate').disabled = !!fist;
    $('#delete').disabled = system || !!draft.labyrinth?.starter[card.id] || (!!fist && fist.type !== 'support');
    $('#delete').title = system ? '基础能力、现金和系统挥砍需要保留' : '删除卡牌';
    renderVisual();
}
function renderVisual() {
    const card = current();
    if (!card) return;
    const mazeCard = !!card.chapter || !!card.fist || canJoinRewardPool(card);
    const model = cardViewModel(card, definitions(), '体力', { field: mazeCard, labyrinth: mazeCard, runDeck: !mazeCard });
    const supply = model.supplyWeight !== undefined;
    const face = $('#preview-card');
    if (previewedCard !== card) { previewedCard = card; previewExpanded = false; }
    setPreviewExpanded(!supply && previewExpanded);
    face.dataset.face = supply ? 'supply' : 'standard';
    face.dataset.longName = String(model.title.length > 8);
    face.dataset.copy = model.description.length > 42 ? 'long' : model.description ? 'short' : 'empty';
    $('#preview-detail-toggle').hidden = supply;
    $('#preview-supply-value').hidden = !supply;
    $('#preview-supply-value').textContent = supply ? model.effect : '';
    const mark = $('#preview-weight-mark');
    mark.hidden = !supply;
    if (supply) {
        mark.firstElementChild.textContent = model.supplyWeight;
        mark.setAttribute('aria-label', `负重 ${model.supplyWeight}`);
        mark.title = `负重 ${model.supplyWeight}`;
    }
    $('#preview-name').textContent = model.displayTitle || '未命名卡牌';
    $('#preview-card').setAttribute('aria-label', model.title || '未命名卡牌');
    $('#preview-cost').textContent = model.cost;
    $('#preview-unit').textContent = model.costUnit;
    $('#preview-card').dataset.hasCost = String(model.showCost);
    $('#preview-keywords').textContent = model.keywords.join(' · ');
    $('#preview-keywords').hidden = supply;
    $('#preview-tag').textContent = model.tag;
    $('#preview-effect').textContent = model.effect;
    $('#preview-description').textContent = model.description;
    $('#preview-full-description').textContent = model.fullDescription;
    $('#preview-type').textContent = card.role === 'supply' ? '物资卡' : EFFECT_NAMES[card.effect.type];
    $('#preview-weight').textContent = model.weight;
    $('#preview-role').textContent = roleNames[card.role];
    $('#preview-id').textContent = card.id;
    $('#preview-art').innerHTML = artMarkup(card.art, card.id);
    if (supply) {
        const artRatio = Number($('#preview-art .painted-tile')?.style.getPropertyValue('--art-ratio')) || 1;
        const { height, headingShift } = supplyPictureLayout(model.description, artRatio);
        face.style.setProperty('--art-height', `${height / 340 * 100}%`);
        face.style.setProperty('--heading-shift', `${headingShift / 340 * 100}%`);
    }
    const illustrationThumbnail = $('#illustration-thumbnail');
    illustrationThumbnail.hidden = !uiArt;
    illustrationThumbnail.innerHTML = artMarkup(card.art);
    $('#preview-card').style.setProperty('--card-accent', card.color);
    const fixedReward = $('[data-field="fixedReward"]');
    if (fixedReward) fixedReward.innerHTML = draft.cards.filter(fixedRewardCard).map(entry => `<option value="${escape(entry.id)}" ${entry.id === draft.fixedReward ? 'selected' : ''}>${escape(entry.name)}</option>`).join('');
    const count = draft.cards.filter(isBattleCard).reduce((count, card) => count + card.initialCount, 0);
    const profile = draft.labyrinth;
    const rewardCheckbox = $('[data-field="reward"]');
    if (rewardCheckbox) rewardCheckbox.checked = supply ? card.reward : inRewardPool(card);
    $('#starter-label').textContent = profile ? '焦土迷宫起手' : '基础牌组';
    $('#middle-label').textContent = profile ? '可选奖励牌' : '配方';
    $('#pool-label').textContent = profile ? '焦土迷宫奖励池' : '奖励池';
    $('#deck-count').textContent = `${profile ? Object.values(profile.starter).reduce((sum, n) => sum + n, 0) : count} 张`;
    $('#deck-weight').textContent = profile ? `${rewardCards().length} 张` : `${draft.recipes.length} 条`;
    $('#reward-count').textContent = `${profile?.discoveryPool.length ?? 0} 种`;
    const refs = cardReferences(draft, card.id).map(reference =>
        reference === '随机奖励池' ? (supply ? '搜刮物资池' : '旧版投放') : reference);
    $('#references').innerHTML = `<b>此卡牌用于</b><br>${refs.length ? refs.map(escape).join(' · ') : '尚未加入卡组或奖励池'}`;
    renderSaveState();
}
function renderSaveState() {
    let issues = [];
    try { validateCatalog(draft); } catch (error) { issues = error.issues ?? [error.message]; }
    const validation = $('#validation');
    if (validation) validation.textContent = issues.slice(0, 5).join('\n');
    $('#recipe-validation').textContent = issues.slice(0, 5).join('\n');
    const rewardValidation = $('#reward-validation');
    rewardValidation.textContent = issues[0] ?? '';
    rewardValidation.hidden = issues.length === 0;
    const enemyValidation = $('#enemy-validation');
    enemyValidation.textContent = issues[0] ?? '';
    enemyValidation.hidden = issues.length === 0;
    $('#save').disabled = saving || !dirty() || issues.length > 0;
    $('#play').disabled = saving || issues.length > 0;
    $('#play').textContent = dirty() ? '▷ 保存并试玩' : '▷ 试玩游戏';
    $('#save-state').textContent = saving ? '正在保存…' : dirty() ? '有未保存的更改' : lastSaved ? `已保存 ${lastSaved}` : '所有更改已保存';
    $('#save-state').className = 'save-state' + (dirty() ? ' dirty' : '');
}
function render() {
    if (!draft) return;
    if (supplyPage() && current()?.role !== 'supply')
        selectedIndex = draft.cards.findIndex(card => card.role === 'supply');
    else if (!supplyPage() && !current()) selectedIndex = 0;
    selectedId = current()?.id;
    const empty = !current();
    $('.preview-stage').hidden = empty;
    $('.deck-summary').hidden = empty || supplyPage();
    $('.preview-hint').hidden = empty;
    $('#duplicate').disabled = empty;
    $('#delete').disabled = empty;
    renderList();
    if (empty) {
        $('#inspector-content').innerHTML = '<p class="empty-list">点击「＋物资卡」创建第一张物资卡。</p>';
        renderSaveState();
    } else renderInspector();
    recipes.render();
    if (!rewardWorkspace.hidden) renderRewardGrid();
    if (!enemyWorkspace.hidden) renderEnemyEditor();
}

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
        rewardWorkspace.setAttribute('aria-busy', 'false');
        enemyWorkspace.setAttribute('aria-busy', 'false');
        rewardFilter.disabled = false;
        render();
    } catch (error) {
        $('#save-state').textContent = '连接失败';
        $('#save-state').className = 'save-state offline';
        if (!draft) {
            rewardWorkspace.setAttribute('aria-busy', 'false');
            $('#reward-empty').textContent = '卡牌读取失败，可点「重新载入」。';
            enemyWorkspace.setAttribute('aria-busy', 'false');
            enemyEditor.textContent = '配置读取失败，可点「重新载入」。';
        }
        notify(`无法读取配置：${error.message}`, true);
    }
}
async function save() {
    if (!draft || saving) return false;
    try { validateCatalog(draft); } catch (error) { notify(error.message, true); return false; }
    saving = true;
    $('#workspace').inert = true;
    $('#recipe-workspace').inert = true;
    rewardWorkspace.inert = true;
    enemyWorkspace.inert = true;
    $('#reload').disabled = true;
    renderSaveState();
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
    finally {
        saving = false;
        $('#workspace').inert = false;
        $('#recipe-workspace').inert = false;
        rewardWorkspace.inert = false;
        enemyWorkspace.inert = false;
        $('#reload').disabled = false;
        render();
    }
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
    const card = copy ? clone(source) : {
        id: nextId(), name: '新卡牌', tag: '技能 · 攻击', cost: 1, weight: 0, text: '',
        color: '#c29060', art: 'heavy', role: 'normal', initialCount: 0, reward: !draft.labyrinth,
        ...(draft.labyrinth ? { chapter: 'ashen-labyrinth' } : {}),
        effect: { type: 'damage', amount: 3 },
    };
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
    clearCardFilters();
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
        ...(supplyPage() && draft.labyrinth ? { chapter: 'ashen-labyrinth' } : {}),
        initialCount: 0,
        reward: true,
        supplyValue: 1,
        effect: { type: 'none', amount: 0 },
    };
    draft.cards.push(card);
    newCards.add(card);
    selectedIndex = draft.cards.length - 1;
    selectedId = card.id;
    clearCardFilters();
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
    if (canJoinRewardPool(card)) setRewardMembership(card, false);
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
    else if (field === 'fist.temporaryCost') card.fist.temporaryCost = value;
    else if (field === 'reward' && card.role !== 'supply') setRewardMembership(card, value);
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
            if (draft.labyrinth)
                draft.labyrinth.discoveryPool = draft.labyrinth.discoveryPool.map(id => id === previousId ? value : id);
        }
        if ((field === 'canSynthesize' || field === 'oncePerBattle' || field === 'summary') && !value)
            delete card[field];
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
        card.weight = Math.max(1, card.weight);
        card.supplyValue = card.supplyValue ?? 1;
        delete card.canSynthesize;
        delete card.weaponSlots;
        delete card.oncePerBattle;
        delete card.synthesisOnly;
    }
    if (field === 'role' && value !== 'supply') delete card.supplyValue;
    if (field === 'role' && value === 'normal' && card.effect.type === 'none') card.effect = { type: 'damage', amount: 1 };
    if (field === 'role' && !isLabyrinthRewardCard(card) && draft.labyrinth)
        draft.labyrinth.discoveryPool = draft.labyrinth.discoveryPool.filter(id => id !== card.id);
    renderList();
    if (field === 'effect.type' || field === 'role') renderInspector(); else renderVisual();
});
$('#search').addEventListener('input', renderList);
typeSearch.addEventListener('input', () => {
    showTypeOptions(matchingCardTypes(typeSearch.value));
    renderList();
});
typeSearch.addEventListener('click', () => {
    if (typeOptions.hidden) showTypeOptions();
});
typeSearch.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape' || event.key === 'Tab') {
        if (!typeOptions.hidden && event.key === 'Escape') event.preventDefault();
        closeTypeOptions();
        return;
    }
    if (event.key === 'Enter' && !typeOptions.hidden) {
        const choice = typeOptions.querySelector('[data-active]') ??
            (typeOptions.childElementCount === 1 ? typeOptions.firstElementChild : null);
        if (choice) chooseCardType(choice.dataset.cardType);
        return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (typeOptions.hidden) showTypeOptions();
    const options = [...typeOptions.children];
    const active = options.findIndex(option => option.hasAttribute('data-active'));
    const next = event.key === 'ArrowDown' ? (active + 1) % options.length :
        (active <= 0 ? options.length - 1 : active - 1);
    options[active]?.removeAttribute('data-active');
    const option = options[next];
    option.setAttribute('data-active', '');
    typeSearch.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest' });
});
typeOptions.addEventListener('mousedown', event => {
    if (event.target.closest('[data-card-type]')) event.preventDefault();
});
typeOptions.addEventListener('click', event => {
    const option = event.target.closest('[data-card-type]');
    if (option) chooseCardType(option.dataset.cardType);
});
document.addEventListener('pointerdown', event => {
    if (!typeOptions.hidden && !event.target.closest('.card-type-filter')) closeTypeOptions();
});
$('#preview-detail-toggle').addEventListener('click', () => setPreviewExpanded(!previewExpanded));
rewardFilter.addEventListener('change', () => renderRewardGrid(true));
rewardGrid.addEventListener('change', event => {
    const input = event.target;
    if (!input.dataset.rewardCard || !draft || saving) return;
    const card = rewardCards().find(candidate => candidate.id === input.dataset.rewardCard);
    if (!card) return;
    setRewardMembership(card, input.checked);
    renderList();
    renderVisual();
    if (rewardFilter.value === 'all') {
        renderRewardCount(rewardCards());
    } else {
        const previousIndex = [...rewardGrid.children].indexOf(input.closest('.reward-card'));
        renderRewardGrid();
        const next = rewardGrid.children[Math.min(previousIndex, rewardGrid.children.length - 1)]?.querySelector('input');
        (next ?? $('#reward-scroll')).focus();
    }
});
enemySelector.addEventListener('change', renderEnemyEditor);
enemyEditor.addEventListener('input', event => {
    const field = event.target.dataset.field;
    if (!field || !draft?.labyrinth || saving) return;
    const plan = currentEnemyPlan();
    if (field === 'attack' || field === 'strongAttack' || field === 'loopStart') plan[field] = Number(event.target.value);
    else plan.actions[Number(field.slice(5))] = event.target.value;
    updateEnemyPlan(plan);
});
enemyEditor.addEventListener('click', event => {
    const button = event.target.closest('[data-enemy-edit]');
    if (!button || button.disabled || !draft?.labyrinth || saving) return;
    const operation = button.dataset.enemyEdit;
    const plan = currentEnemyPlan(), index = Number(button.dataset.index);
    let focusIndex = index;
    if (operation === 'add') {
        focusIndex = plan.actions.length;
        plan.actions.push('attack');
    } else if (operation === 'remove') {
        plan.actions.splice(index, 1);
        focusIndex = Math.min(index, plan.actions.length - 1);
        if (plan.loopStart > index) plan.loopStart--;
        else if (plan.loopStart === index) plan.loopStart = focusIndex;
    } else if (operation !== 'reset') {
        focusIndex = index + (operation === 'up' ? -1 : 1);
        [plan.actions[focusIndex], plan.actions[index]] = [plan.actions[index], plan.actions[focusIndex]];
        if (plan.loopStart === index) plan.loopStart = focusIndex;
        else if (plan.loopStart === focusIndex) plan.loopStart = index;
    }
    updateEnemyPlan(operation === 'reset' ? null : plan);
    renderEnemyEditor();
    (operation === 'reset' ? $('[data-enemy-edit="reset"]') : $(`[data-field="step-${focusIndex}"]`))?.focus();
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
function activePage() {
    if (supplyPage()) return 'supplies';
    if (location.pathname === '/recipes') return 'recipes';
    const page = new URLSearchParams(location.search).get('page');
    return page === 'rewards' || page === 'enemies' ? page : 'cards';
}
function showPage() {
    const page = activePage();
    const supplies = page === 'supplies';
    $('#workspace').hidden = page !== 'cards' && !supplies;
    $('#library-title').textContent = supplies ? '物资卡库' : '卡牌库';
    $('#add').hidden = supplies;
    $('.card-type-filter').hidden = supplies;
    clearCardFilters();
    $('#recipe-workspace').hidden = page !== 'recipes';
    rewardWorkspace.hidden = page !== 'rewards';
    enemyWorkspace.hidden = page !== 'enemies';
    for (const link of document.querySelectorAll('[data-page]')) {
        if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
        link.onclick = event => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            if (activePage() === link.dataset.page) return;
            history.pushState(null, '', link.pathname + link.search);
            showPage();
        };
    }
    render();
}
window.addEventListener('popstate', showPage);
showPage();
void load();
