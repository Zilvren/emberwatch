import { _decorator, Component, instantiate, JsonAsset, Label, Node, Prefab, ResolutionPolicy, resources, UITransform, Vec2, Vec3, view } from 'cc';
import { SurvivalGame, CARD, CardKind, ActionResult, NODE_NAMES, Phase, Route } from './SurvivalRules';
import { GameAudio } from './GameAudio';
import { UIAction } from './UIAction';
import { UIEvents, UIActionEvent } from './UIEvents';
import { UIValue } from './UIValue';
import { UIProgress } from './UIProgress';
import { ActorPresentation } from './ActorPresentation';
import { HandPresentation } from './HandPresentation';
import { MapPointPresentation } from './MapPointPresentation';
import { InventoryRowPresentation } from './InventoryRowPresentation';
import { RewardChoice } from './RewardChoice';
import { getCatalog, installCatalog } from './CardCatalog';
const { ccclass, property } = _decorator;

type Overlay = 'bag' | 'help' | 'restart' | 'discard' | 'repair-risk' | 'log' | null;
const phases: Phase[] = ['journal', 'map', 'battle', 'rewards', 'rest', 'shelter', 'day2', 'failure'];

/** Scene controller. All fixed layout, art, controls and clips live in native assets. */
@ccclass('SurvivalView')
export class SurvivalView extends Component {
    @property(Node) hud: Node | null = null;
    @property(Node) screensRoot: Node | null = null;
    @property(Node) popupRoot: Node | null = null;
    @property(Node) effectsRoot: Node | null = null;
    @property(Node) dragLayer: Node | null = null;
    @property(Node) toastRoot: Node | null = null;
    @property(Label) toastLabel: Label | null = null;
    @property({ type: [Node], tooltip: 'journal, map, battle, rewards, rest, shelter, day2, failure' }) screens: Node[] = [];
    @property({ type: [Node], tooltip: 'inventory, help, log, confirmation' }) popups: Node[] = [];
    @property(Prefab) floatTemplate: Prefab | null = null;
    @property(Prefab) attackTemplate: Prefab | null = null;
    @property(Prefab) blockTemplate: Prefab | null = null;
    @property(Prefab) healTemplate: Prefab | null = null;

    private game!: SurvivalGame;
    private audio = new GameAudio();
    private overlay: Overlay = null;
    private selectedCard = '';
    private discardId = '';
    private page = 0;
    private busy = false;
    private reduced = false;
    private revision = -1;
    private toastTime = 0;
    private hand: HandPresentation | null = null;
    private hero: ActorPresentation | null = null;
    private enemy: ActorPresentation | null = null;
    private activeScreen: Node | null = null;

    onLoad(): void {
        this.message('正在读取卡牌配置…');
        void this.initialize().catch(error => { this.message(`卡牌配置读取失败：${String(error)}`); this.toastTime=0; console.error('[the end] catalog', error); });
    }
    private async initialize(): Promise<void> {
        const live = typeof location !== 'undefined' && new URLSearchParams(location.search).get('cards') === 'live';
        if (live) {
            const response = await fetch('/api/cards', { cache: 'no-store' });
            if (!response.ok) throw new Error('本地卡牌编辑器服务不可用，请通过编辑器的试玩入口打开。');
            installCatalog((await response.json()).catalog);
        } else {
            const asset = await new Promise<JsonAsset>((resolve, reject) => resources.load('data/cards', JsonAsset, (error, asset) => error ? reject(error) : resolve(asset)));
            installCatalog(asset.json);
        }
        if (!this.isValid) return;
        const seed = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('seed');
        this.game = new SurvivalGame(seed === null ? undefined : Number(seed));
        this.reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        view.setDesignResolutionSize(1440, 900, ResolutionPolicy.SHOW_ALL);
        this.hand = this.screens[2].getComponentInChildren(HandPresentation);
        if (this.hand) this.hand.dragLayer = this.dragLayer;
        UIEvents.on('action', this.onAction, this);
        UIEvents.on('card-drop', this.onCardDrop, this);
        this.refresh();
        this.message('');
        Object.assign(globalThis, { __survivalGame: this.game, __emberUI: { snapshot: () => this.snapshot() } });
    }
    onDestroy(): void { UIEvents.off('action', this.onAction, this); UIEvents.off('card-drop', this.onCardDrop, this); this.audio.dispose(); }
    update(dt: number): void {
        if (!this.game) return;
        if (!this.busy) this.game.advanceTime(dt);
        if (this.game.revision !== this.revision && !this.busy) this.refresh();
        if (this.toastTime > 0) { this.toastTime -= dt; if (this.toastTime <= 0 && this.toastRoot) this.toastRoot.active = false; }
    }
    private message(text: string): void {
        if (this.toastLabel) this.toastLabel.string = text;
        if (this.toastRoot) this.toastRoot.active = !!text;
        this.toastTime = 2.8;
    }
    private act(action: () => ActionResult, sound: 'tap' | 'loot' | 'heal' = 'tap'): void {
        const result = action();
        this.audio.play(result.ok ? sound : 'tap');
        this.message(result.message);
        if (this.game.phase === 'failure' || this.game.phase === 'day2') this.overlay = null;
        this.selectedCard = '';
        this.refresh();
    }
    private text(root: Node, values: Record<string, string | number>): void {
        for (const binding of root.getComponentsInChildren(UIValue)) {
            if (Object.prototype.hasOwnProperty.call(values, binding.key)) binding.setValue(values[binding.key]);
            if (binding.key === 'header/text5' || binding.key === 'battle/text3') binding.setAlert(this.game.critical);
            if (binding.key === 'battle/text0') binding.setAlert(this.game.battle?.intent === 'attack');
        }
    }
    private button(root: Node, id: string, caption?: string, enabled?: boolean): void {
        for (const action of root.getComponentsInChildren(UIAction)) if (action.actionId === id) {
            if (caption !== undefined) action.setText(caption);
            if (enabled !== undefined) action.setEnabled(enabled);
        }
    }
    private refresh(): void {
        const g = this.game, phaseIndex = phases.indexOf(g.phase);
        this.screens.forEach((screen, i) => screen.active = i === phaseIndex);
        this.activeScreen = this.screens[phaseIndex];
        const screen = this.activeScreen;
        this.hero = screen.getChildByName('World')?.getChildByName('Player')?.getComponent(ActorPresentation) ?? null;
        this.hero?.setArmed(g.phase === 'battle' && !!g.battle?.weapon);
        this.text(this.hud!, { 'header/text2': `第 ${g.day} 天`, 'header/text3': `物资 ${g.supplies}`, 'header/text5': `护甲 ${g.armor}/10`, 'header/text6': g.overflowWeight ? `暂存 +${g.overflowWeight}` : '暂无溢出' });
        this.button(this.hud!, 'bag', `背包 ${g.baseWeight}/30`);
        this.button(this.hud!, 'audio', this.audio.muted ? '静音' : '声音');
        this.hud!.getComponentsInChildren(UIProgress).forEach(progress => progress.setRatio(g.armor / 10));
        if (g.phase === 'journal') this.text(screen, { 'journal/text3': `物资 10 · 护甲 10 · 战斗牌 ${g.usableCards.length} 张\n初始总负重 ${g.baseWeight} / 30` });
        if (g.phase === 'map') {
            this.text(screen, { 'banner/text2': g.currentNode === 'return' ? '路已走完。正在自动返回避难所……' : '前往亮起的地点。全程无法主动撤离。', 'map/text0': `负重 ${g.baseWeight}/30  ·  暂存 ${g.overflowWeight}/10`, 'map/text1': g.overflowWeight ? '消耗物资后，暂存卡可自动转入。' : '搜刮和出牌都会改变携带空间。', 'map/fixedReward': `支付 2 物资 → 4 物资 + ${CARD[getCatalog().fixedReward].name}\n完成固定搜刮后，才能选择后续路线。` });
            screen.getChildByName('RouteGraph')!.active = g.fixedDone;
            screen.getChildByName('InitialHint')!.active = !g.fixedDone;
            screen.getComponentsInChildren(MapPointPresentation).forEach(point => point.refresh(g));
            this.button(screen, 'route-A', undefined, g.currentNode === 'choice');
            this.button(screen, 'route-B', undefined, g.currentNode === 'choice');
        }
        if (g.phase === 'battle') this.refreshBattle(screen);
        if (g.phase === 'rewards') {
            const r = g.rewards!, battle = r.source === 'enemy1' || r.source === 'enemy2';
            this.text(screen, { 'banner/text0': battle ? 'VICTORY / SALVAGE' : 'SCAVENGE / SALVAGE', 'banner/text1': battle ? '威胁已清除' : '废墟里，总有东西留下', 'banner/text2': battle ? '最多选择一张卡牌。物资需要单独领取。' : '整理背包后再领取，顺序会影响携带空间。', 'rewards/text0': `携带 ${g.baseWeight}/30  ·  暂存 ${g.overflowWeight}/10`, 'rewards/text2': `物资 +${r.supplies}`, 'rewards/text3': r.supplyTaken ? '已领取' : `可装入 ${Math.max(0, Math.min(r.supplies, 30 - g.baseWeight))} 点` });
            const choices = screen.getComponentsInChildren(RewardChoice);
            choices.forEach((choice, i) => choice.refresh(r.cards.length === 1 ? (i === 1 ? r.cards[0] : undefined) : r.cards[i], r.cards.length === 1 ? 0 : i, g));
            this.button(screen, 'claim-supplies', r.supplyTaken ? '已领取' : '领取物资', !r.supplyTaken);
            this.button(screen, 'rewards-done', r.supplyTaken && r.cardTaken ? '继续探索' : '继续 · 放弃未领取奖励');
        }
        if (g.phase === 'rest') {
            const cash = g.cards.some(c => c.kind === 'cash');
            this.text(screen, { 'banner/text2': g.critical ? '感染临界无法恢复护甲。趁现在整理行囊。' : '进入时已恢复最多 2 点护甲。物资不会恢复。', 'rest/text1': `${CARD.cash.name}已经不再有用。\n丢弃后释放 ${CARD.cash.weight} 点负重，暂存卡会自动转入。`, 'rest/text3': `${g.usableCards.length} 张可用牌 · ${g.cards.filter(c => c.zone === 'overflow').length} 张暂存\n移出战斗不释放负重，永久丢弃才释放。`, 'rest/text5': `护甲 ${g.armor}/10  ·  物资 ${g.supplies}  ·  负重 ${g.baseWeight}/30` });
            this.button(screen, 'rest-cash', cash ? `丢弃${CARD.cash.name} · 释放 ${CARD.cash.weight} 负重` : '现金已丢弃', cash);
        }
        if (g.phase === 'shelter') {
            const s = g.settlement!;
            this.text(screen, { 'shelter/text1': `物资 ${s.returnedSupplies}  ·  卡牌 ${s.returnedCards} 张`, 'shelter/text2': s.lostOverflow.length ? `溢出失效：${s.lostOverflow.join('、')}` : '没有溢出损失。临时战斗牌与装备状态已清除。', 'shelter/text4': `护甲 ${g.armor}/10  ·  ${g.armor === 10 ? '无需付费' : `完全修复需要 ${s.repairCost} 点物资`}`, 'shelter/text6': `${g.supplies} 物资  →  每日需求 1  →  剩余 ${Math.max(0, g.supplies - 1)}`, 'shelter/text7': g.supplies ? '每日物资尚未扣除。下方按钮完成最后这一步。' : '物资不足，将在最后记录 1 点缺口，物资最低为 0。' });
            this.button(screen, 'shelter-repair', g.armor === 10 ? '护甲完整' : `支付 ${s.repairCost} 物资 · 完全修复`, g.armor < 10 && g.supplies >= s.repairCost);
        }
        if (g.phase === 'day2') {
            const s = g.settlement!;
            this.text(screen, { 'journal/text3': `带回 ${s.returnedCards} 张卡牌  /  物资剩余 ${g.supplies}`, 'journal/text4': s.dailyShortfall ? '最后结算：每日物资缺口 1。你选择优先修复。' : `修复花费 ${s.repairSpent}，最后扣除每日物资 ${s.dailySpent}。` });
        }
        if (g.phase === 'failure') this.text(screen, { 'journal/text2': `${g.failureReason}\n\n本次教学探索已完整重置。\n卡牌没有永久损失，\n每日生存物资也没有扣除。` });
        this.refreshPopups();
        this.hand?.setLocked(this.busy || !!this.overlay);
        this.revision = g.revision;
    }
    private refreshBattle(screen: Node): void {
        const g = this.game, b = g.battle!, attack = b.intent === 'attack', world = screen.getChildByName('World')!;
        world.getChildByName('Wanderer')!.active = b.enemy === 'enemy1';
        world.getChildByName('Brute')!.active = b.enemy === 'enemy2';
        this.enemy = world.getChildByName(b.enemy === 'enemy1' ? 'Wanderer' : 'Brute')!.getComponent(ActorPresentation);
        this.text(screen, { 'banner/text0': `ENCOUNTER / ROUND ${b.turn}`, 'banner/text1': NODE_NAMES[b.enemy], 'battle/text0': attack ? `攻击 ${g.incomingDamage}` : '蓄势 · 准备', 'battle/text1': attack ? '结束回合后执行' : `下次攻击 ${b.strongAttack}`, 'battle/text3': `护甲 ${g.armor}/10`, 'battle/text4': `格挡 ${b.block}`, 'battle/text5': `敌人护甲 ${b.hp}/${b.maxHp}`, 'battle/text8': b.turn === b.equippedTurn ? '下回合生成挥砍' : '每回合生成挥砍', 'battle/text9': this.busy ? '正在行动…' : this.selectedCard ? '已选择攻击牌\n点击敌人或拖向敌人' : '点击或拖动攻击牌选择目标\n防御、修复、武器直接使用', 'battle/text10': `回合 ${b.turn}\n手牌 ${b.hand.length} / 6`, 'drawPile/text0': b.draw.length, 'discardPile/text0': b.discard.length });
        screen.getChildByName('CriticalWarning')!.active = g.critical;
        screen.getChildByName('WeaponSlot')!.active = !!b.weapon;
        if (b.weapon) this.text(screen, { 'battle/text7': `${CARD[b.weapon.kind].name}已装备`, 'battle/text8': `每回合生成${CARD[CARD[b.weapon.kind].effect.generatedCard!].name}` });
        screen.getChildByName('TargetGuide')!.active = !!this.selectedCard;
        for (const progress of screen.getComponentsInChildren(UIProgress)) progress.setRatio(progress.key === 'armor' ? g.armor / 10 : b.hp / b.maxHp);
        this.hand?.refresh(g, this.selectedCard, this.busy || !!this.overlay, this.reduced);
        this.button(screen, 'end-turn', undefined, !this.busy);
    }
    private refreshPopups(): void {
        const g = this.game;
        const index = this.overlay === 'bag' ? 0 : this.overlay === 'help' ? 1 : this.overlay === 'log' ? 2 : this.overlay ? 3 : -1;
        this.popups.forEach((popup, i) => popup.active = i === index);
        if (index === 0) {
            const popup = this.popups[0], max = Math.max(0, Math.ceil(g.cards.length / 6) - 1);
            this.page = Math.max(0, Math.min(this.page, max));
            this.text(popup, { 'bag/text1': `基础 ${g.baseWeight}/30  ·  暂存 ${g.overflowWeight}/10  ·  可战斗 ${g.usableCards.length} 张`, 'bag/text20': `${this.page + 1} / ${max + 1}`, 'bag/text21': g.phase === 'rest' ? '移出战斗不释放负重；基础能力永久保留。' : '奖励与休整时可以丢弃物品；现金只能在营地丢弃。' });
            popup.getComponentsInChildren(InventoryRowPresentation).forEach((row, i) => row.refresh(g.cards[this.page * 6 + i], g));
            this.button(popup, 'bag-prev', undefined, this.page > 0);
            this.button(popup, 'bag-next', undefined, this.page < max);
            this.button(popup, 'discard-supply', undefined, (g.phase === 'rest' || g.phase === 'rewards') && g.supplies > 0);
        }
        if (index === 2) this.text(this.popups[2], { 'modal/text1': g.logs.slice(0, 9).join('\n\n') });
        if (index === 3) {
            const c = g.cards.find(c => c.id === this.discardId);
            const title = this.overlay === 'restart' ? '重新开始第 1 天？' : this.overlay === 'discard' ? `丢弃${c ? CARD[c.kind].name : '卡牌'}？` : '修复后，生存补给将不足';
            const body = this.overlay === 'restart' ? '当前教学探索将重置。\n初始物资、护甲和卡牌恢复，随机内容重新生成。' : this.overlay === 'discard' ? `这张牌将从本次探索中永久移除。\n${c ? `释放 ${CARD[c.kind].weight} 点负重，暂存卡按顺序自动转入。` : ''}` : '你仍然可以选择修复。\n\n修复费先支付，每日消耗仍在结算最后执行。\n如果届时物资不足，将记录缺口，物资最低为 0。';
            this.text(this.popups[3], { 'modal/text0': title, 'modal/text1': body });
            this.button(this.popups[3], 'modal-confirm', this.overlay === 'restart' ? '重新开始' : this.overlay === 'discard' ? '永久丢弃' : '仍然修复');
        }
    }
    private onAction(event: UIActionEvent): void {
        if (this.busy || !this.game) return;
        const id = event.id, g = this.game;
        if (id === 'card-select') { if (!this.overlay) this.selectCard(event.payload ?? ''); return; }
        if (id === 'bag' || id === 'rest-bag' || id === 'reward-bag') { this.overlay = 'bag'; this.page = 0; }
        else if (id === 'help' || id === 'log' || id === 'restart') this.overlay = id;
        else if (id === 'audio') this.audio.muted = !this.audio.muted;
        else if (id === 'modal-close' || id === 'modal-cancel') this.overlay = null;
        else if (id === 'bag-prev') this.page--;
        else if (id === 'bag-next') this.page++;
        else if (id === 'modal-confirm') { this.confirm(); return; }
        else if (id.startsWith('discard-') && id !== 'discard-supply') { this.discardId = id.slice(8); this.overlay = 'discard'; }
        else if (id.startsWith('toggle-')) { this.act(() => g.toggleCard(id.slice(7))); return; }
        else if (id === 'discard-supply') { this.act(() => g.discardSupplies(1)); return; }
        else if (this.overlay) return;
        else if (id === 'journal-start') { if (g.phase === 'journal') this.act(() => g.start()); else { g.reset(); this.refresh(); } return; }
        else if (id.startsWith('route-')) { this.act(() => g.chooseRoute(id.slice(6) as Route)); return; }
        else if (id.startsWith('enter-')) { this.act(() => g.enterNode()); return; }
        else if (id === 'end-turn') { this.enemyTurn(); return; }
        else if (id === 'enemy-target') { if (this.selectedCard) this.playCard(this.selectedCard); return; }
        else if (id === 'claim-supplies') { this.act(() => g.claimSupplies(), 'loot'); return; }
        else if (id.startsWith('claim-card-')) { this.act(() => g.claimCard(Number(id.slice(11))), 'loot'); return; }
        else if (id === 'rewards-done') { this.act(() => g.finishRewards()); return; }
        else if (id === 'rest-cash') { this.discardId = g.cards.find(c => c.kind === 'cash')?.id ?? ''; this.overlay = 'discard'; }
        else if (id === 'rest-done') { this.act(() => g.finishRest()); return; }
        else if (id === 'shelter-repair') {
            const result = g.repairAtShelter();
            if (result.warning) this.overlay = 'repair-risk'; else { this.message(result.message); this.audio.play('heal'); this.effect('heal', this.hero, '+护甲'); }
        }
        else if (id === 'shelter-done') { this.act(() => g.finishDay(), 'loot'); return; }
        this.audio.play('tap');
        this.refresh();
    }
    private confirm(): void {
        if (this.overlay === 'restart') { this.game.reset(); this.overlay = null; this.selectedCard = ''; this.refresh(); }
        else if (this.overlay === 'discard') { this.overlay = this.game.phase === 'rest' ? null : 'bag'; this.act(() => this.game.discardCard(this.discardId)); }
        else if (this.overlay === 'repair-risk') { this.overlay = null; this.act(() => this.game.repairAtShelter(true), 'heal'); this.effect('heal', this.hero, '+护甲'); }
    }
    private attackKind(kind: CardKind): boolean { return CARD[kind].effect.type === 'damage'; }
    private selectCard(id: string): void {
        const card = this.game.battle?.hand.find(c => c.id === id);
        if (!card) return;
        const reason = this.game.cardBlocked(card);
        if (reason) { this.message(reason); return; }
        if (this.attackKind(card.kind)) { this.selectedCard = this.selectedCard === id ? '' : id; this.refresh(); }
        else this.playCard(id);
    }
    private onCardDrop(event: { id: string; point: Vec2; accept: () => void }): void {
        if (this.busy || this.overlay) return;
        const card = this.game.battle?.hand.find(c => c.id === event.id), screen = this.screens[2];
        if (!card) return;
        const target = this.attackKind(card.kind) ? screen.getChildByName('enemy-target') : screen.getChildByName('PlayArea');
        if (target?.getComponent(UITransform)?.getBoundingBoxToWorld().contains(event.point) && !this.game.cardBlocked(card)) { event.accept(); this.playCard(event.id); }
        else { this.selectedCard = ''; this.refresh(); }
    }
    private playCard(id: string): void {
        const g = this.game, b = g.battle, card = b?.hand.find(c => c.id === id);
        if (this.busy || !b || !card) return;
        const reason = g.cardBlocked(card);
        if (reason) { this.message(reason); return; }
        this.busy = true;
        this.selectedCard = '';
        this.refreshBattle(this.screens[2]);
        const oldHp = b.hp, oldArmor = g.armor, oldBlock = b.block, run = g.run;
        const impact = () => {
            if (g.run !== run) return;
            const result = g.play(id);
            if (this.attackKind(card.kind)) { this.enemy?.playAction('hurt', this.reduced); this.effect('attack', this.enemy, `−${oldHp - (g.battle?.hp ?? 0)}`); }
            else if (CARD[card.kind].effect.type === 'heal') this.effect('heal', this.hero, `+${g.armor - oldArmor} 护甲`);
            else this.effect('block', this.hero, CARD[card.kind].effect.type === 'equip' ? '武器就绪' : `+${(g.battle?.block ?? oldBlock) - oldBlock} 格挡`);
            this.message(result.message);
        };
        const complete = () => { if (g.run !== run) return; this.busy = false; this.refresh(); };
        const presentation = this.hand?.getCard(id);
        this.audio.play(this.attackKind(card.kind) ? 'attack' : CARD[card.kind].effect.type === 'heal' ? 'heal' : 'block');
        if (this.attackKind(card.kind) && this.hero) {
            presentation?.playAction(() => {}, () => {}, this.reduced);
            this.hero.playAction('attack', this.reduced, impact, complete);
        } else if (presentation) presentation.playAction(impact, complete, this.reduced);
        else { impact(); complete(); }
    }
    private enemyTurn(): void {
        const g = this.game, b = g.battle;
        if (this.busy || !b) return;
        this.busy = true; this.selectedCard = ''; this.refreshBattle(this.screens[2]);
        const run = g.run, attacking = b.intent === 'attack', damage = Math.max(0, g.incomingDamage - b.block);
        this.audio.play(attacking ? 'enemy' : 'block');
        const impact = () => {
            if (run !== g.run) return;
            if (attacking) {
                if (damage) this.hero?.playAction('hurt', this.reduced);
                this.effect(damage ? 'attack' : 'block', this.hero, damage ? `−${damage}` : '完全格挡');
            } else this.effect('block', this.enemy, '正在蓄势');
            this.message(g.endTurn().message);
        };
        const complete = () => { this.busy = false; this.refresh(); };
        if (this.enemy) this.enemy.playAction(attacking ? 'attack' : 'prepare', this.reduced, impact, complete);
        else { impact(); complete(); }
    }
    private effect(kind: 'attack' | 'block' | 'heal', actor: ActorPresentation | null, text: string): void {
        const template = kind === 'attack' ? this.attackTemplate : kind === 'block' ? this.blockTemplate : this.healTemplate;
        if (!actor || !this.effectsRoot || !template || !this.floatTemplate) return;
        const anchor = actor.impactAnchor ?? actor.node;
        const position = this.effectsRoot.getComponent(UITransform)!.convertToNodeSpaceAR(anchor.worldPosition);
        const effect = instantiate(template); effect.setPosition(position); this.effectsRoot.addChild(effect);
        const floating = instantiate(this.floatTemplate); floating.getComponentInChildren(Label)!.string = text;
        floating.setPosition(position); this.effectsRoot.addChild(floating);
    }
    private bounds(node: Node): { x: number; y: number; width: number; height: number } {
        const box = node.getComponent(UITransform)!.getBoundingBoxToWorld(), root = this.node.getComponent(UITransform)!;
        const low = root.convertToNodeSpaceAR(new Vec3(box.xMin, box.yMin, 0)), high = root.convertToNodeSpaceAR(new Vec3(box.xMax, box.yMax, 0));
        return { x: low.x + 720, y: 450 - high.y, width: high.x - low.x, height: high.y - low.y };
    }
    private snapshot(): object {
        const g = this.game;
        const hits = this.node.getComponentsInChildren(UIAction)
            .filter(a => a.node.activeInHierarchy && (!a.getComponent(MapPointPresentation) || a.enabled))
            .map(a => ({ id: a.actionId, ...this.bounds(a.node), enabled: a.enabled && !this.busy }));
        if (g.phase === 'battle') for (const card of this.hand?.entries() ?? []) hits.push({ id: 'card-' + card.cardId, ...this.bounds(card.node), enabled: !this.busy && !this.overlay });
        return { phase: g.phase, ready: true, busy: this.busy, overlay: this.overlay, selectedCard: this.selectedCard, day: g.day, supplies: g.supplies, armor: g.armor, critical: g.critical, baseWeight: g.baseWeight, overflowWeight: g.overflowWeight, currentNode: g.currentNode, route: g.route, hand: g.battle?.hand.map(c => ({ id: c.id, kind: c.kind, blocked: g.cardBlocked(c) })), heroPose: this.hero?.pose, effects: this.effectsRoot?.children.length ?? 0, hits };
    }
}
