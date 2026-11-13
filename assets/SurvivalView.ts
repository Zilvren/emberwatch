import { _decorator, CCObjectFlags, Component, Label, Node, Sprite, UITransform, UIOpacity, view, ResolutionPolicy, tween, Tween, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { SurvivalGame, CARD, CardKind, ActionResult, NODE_NAMES, NodeKind, Route } from './SurvivalRules';
import { PixelUI, P } from './PixelUI';
import { GameArt, ArtName } from './GameArt';
import { GameAudio } from './GameAudio';
import { cardFace, bindHandCard } from './BattleCard';
const { ccclass, executeInEditMode } = _decorator;
type Overlay = 'bag' | 'help' | 'restart' | 'discard' | 'repair-risk' | 'log' | null;
type Hit = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    enabled: boolean;
};
type Actor = {
    node: Node;
    sprite: Sprite;
    name: 'survivor' | 'wanderer' | 'brute';
    height: number;
    home: Vec3;
};
@ccclass('SurvivalView')
@executeInEditMode
export class SurvivalView extends Component {
    private game!: SurvivalGame;
    private art = new GameArt();
    private audio = new GameAudio();
    private stage!: Node;
    private world!: Node;
    private fx!: Node;
    private ui!: PixelUI;
    private wu!: PixelUI;
    private ready = false;
    private loadError = '';
    private busy = false;
    private reduce = false;
    private time = 0;
    private overlay: Overlay = null;
    private page = 0;
    private discardId = '';
    private selectedCard = '';
    private toast = '';
    private toastTime = 0;
    private toastNode: Node | null = null;
    private seenRevision = -1;
    private lastPhase = '';
    private actors: Actor[] = [];
    private hero: Actor | null = null;
    private enemy: Actor | null = null;
    private aim: Node | null = null;
    private instruction: Label | null = null;
    private handNodes = new Map<string, Node>();
    private hits: Hit[] = [];
    private controllers: Tween<Node>[] = [];
    onLoad(): void {
        for (const child of [...this.node.children]) {
            child.removeFromParent();
            child.destroy();
        }
        const seed = !EDITOR && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('seed') : null;
        this.game = new SurvivalGame(seed === null ? undefined : Number(seed));
        this.reduce = !EDITOR && typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        view.setDesignResolutionSize(1440, 900, ResolutionPolicy.SHOW_ALL);
        this.stage = this.layer('Game stage');
        this.fx = this.layer('Transient effects');
        this.render();
        if (!EDITOR)
            Object.assign(globalThis, { __survivalGame: this.game, __emberUI: { snapshot: () => this.snapshot() } });
        void this.art.load().then(() => { if (this.isValid) {
            this.ready = true;
            this.render();
        } }).catch(error => {
            if (this.isValid) {
                this.loadError = String(error);
                console.error('[the end] Art loading failed', error);
                this.render();
            }
        });
    }
    private layer(name: string): Node {
        const n = new Node(name);
        n.layer = this.node.layer;
        n._objFlags |= CCObjectFlags.DontSave;
        this.node.addChild(n);
        n.addComponent(UITransform).setContentSize(1440, 900);
        return n;
    }
    onDestroy(): void { this.controllers.forEach(t => t.stop()); this.audio.dispose(); this.art.dispose(); }
    private snapshot(): object {
        return { phase: this.game.phase, ready: this.ready, busy: this.busy, overlay: this.overlay, selectedCard: this.selectedCard,
            day: this.game.day, supplies: this.game.supplies, armor: this.game.armor, critical: this.game.critical, baseWeight: this.game.baseWeight,
            overflowWeight: this.game.overflowWeight, currentNode: this.game.currentNode, route: this.game.route,
            hand: this.game.battle?.hand.map(c => ({ id: c.id, kind: c.kind, blocked: this.game.cardBlocked(c) })), heroPose: this.hero?.sprite.spriteFrame?.name, effects: this.fx.children.length, hits: this.hits };
    }
    update(dt: number): void {
        if (EDITOR || !this.ready)
            return;
        this.time += dt;
        if (!this.busy)
            this.game.advanceTime(dt);
        if (!this.busy && !this.reduce)
            for (let i = 0; i < this.actors.length; i++) {
                const a = this.actors[i];
                if (a.node.isValid)
                    a.node.setPosition(a.home.x, a.home.y + Math.sin(this.time * 2 + i * 1.9) * 1.3, 0);
            }
        if (this.toastTime > 0) {
            this.toastTime -= dt;
            if (this.toastTime <= 0) {
                this.toast = '';
                if (this.toastNode?.isValid) {
                    this.toastNode.removeFromParent();
                    this.toastNode.destroy();
                }
                this.toastNode = null;
            }
        }
        if (!this.busy && this.game.revision !== this.seenRevision)
            this.render();
    }
    private wipe(node: Node): void {
        for (const child of [...node.children]) {
            this.stopTree(child);
            child.removeFromParent();
            child.destroy();
        }
    }
    private stopTree(node: Node): void { Tween.stopAllByTarget(node); const opacity = node.getComponent(UIOpacity); if (opacity)
        Tween.stopAllByTarget(opacity); for (const c of node.children)
        this.stopTree(c); }
    private message(text: string): void { this.toast = text; this.toastTime = 2.8; }
    private act(action: () => ActionResult, sound: 'tap' | 'loot' | 'heal' = 'tap'): void {
        if (this.busy)
            return;
        const oldPhase = this.game.phase, result = action();
        this.audio.play(result.ok ? sound : 'tap');
        this.message(result.message);
        if (this.game.phase === 'failure' || this.game.phase === 'day2')
            this.overlay = null;
        this.selectedCard = '';
        this.render();
        if (oldPhase !== this.game.phase)
            this.transition();
    }
    private button(id: string, label: string, x: number, y: number, w: number, h: number, action: () => void, style: 'primary' | 'normal' | 'danger' = 'normal', enabled = true): Node {
        this.hits.push({ id, x, y, width: w, height: h, enabled });
        return this.ui.button(label, x, y, w, h, () => { if (!this.busy) {
            this.audio.play('tap');
            action();
        } }, style, enabled);
    }
    private hit(id: string, x: number, y: number, w: number, h: number, action: () => void, enabled = true): Node {
        this.hits.push({ id, x, y, width: w, height: h, enabled });
        const n = this.ui.node(id, x, y, w, h);
        n.on(Node.EventType.TOUCH_END, () => { if (enabled && !this.busy)
            action(); });
        return n;
    }
    private render(draw = false): void {
        if (!this.game || !this.isValid)
            return;
        this.wipe(this.stage);
        this.hits = [];
        this.actors = [];
        this.hero = null;
        this.enemy = null;
        this.aim = null;
        this.instruction = null;
        this.handNodes.clear();
        this.ui = new PixelUI(this.stage);
        this.world = this.ui.node('World', 0, 0, 1440, 900);
        this.wu = new PixelUI(this.world);
        const u = this.ui, g = this.game;
        this.seenRevision = g.revision;
        u.rect(0, 0, 1440, 900, P.bg);
        if (!this.ready) {
            u.text(this.loadError ? '美术资源载入失败' : '正在整理行囊……', 260, 350, 920, 70, 32, P.paper, true, 'center');
            if (this.loadError)
                u.text(this.loadError, 260, 445, 920, 160, 18, P.red);
            return;
        }
        this.world.setSiblingIndex(this.stage.children.length - 1);
        const background: ArtName = (g.phase === 'rest' || g.phase === 'shelter' || g.phase === 'day2') ? 'shelter' : g.phase === 'battle' || g.phase === 'map' ? 'battle-street' : 'dusk-depot';
        this.wu.image(this.art.cover(background, 1.6), 0, 0, 1440, 900);
        this.wu.rect(0, 0, 1440, 900, '#201924', undefined, this.world, g.phase === 'map' ? 124 : 55);
        for (let i = 0; i < 12; i++)
            this.wu.rect((i * 173 + 137) % 1440, 160 + (i * 83) % 420, 2 + (i % 2), 2, '#f5d9a5', undefined, this.world, 50);
        if (g.phase === 'battle')
            this.battle(draw || this.lastPhase !== 'battle');
        else if (g.phase === 'map')
            this.map();
        else if (g.phase === 'rewards')
            this.rewards();
        else if (g.phase === 'rest')
            this.rest();
        else if (g.phase === 'shelter')
            this.shelter();
        else
            this.journal();
        this.header();
        this.toastNode = null;
        if (this.toast) {
            this.toastNode = u.node('Toast', 445, 90, 550, 38);
            const tu = new PixelUI(this.toastNode, 550, 38);
            tu.frame(0, 0, 550, 38, '#241e2a', '#9f7954');
            tu.text(this.toast, 13, 6, 524, 26, 16, P.paper, false, 'center');
        }
        if (this.overlay)
            this.modal();
        this.lastPhase = g.phase;
    }
    private header(): void {
        const u = this.ui, g = this.game;
        u.rect(0, 0, 1440, 80, '#211b26', undefined, this.stage, 244);
        u.rect(0, 77, 1440, 3, '#80634e');
        u.pixelArt(['..ooo..', '.ooooo.', 'ooo.ooo', 'oo...oo', 'ooo.ooo', '.ooooo.', '..ooo..'], { o: P.amber }, 23, 22, 5);
        u.text('the end', 72, 15, 180, 34, 27, P.white, true);
        u.text('SURVIVAL CARD GAME', 75, 50, 180, 17, 11, P.muted);
        u.text(`第 ${g.day} 天`, 278, 23, 100, 36, 23, P.amber, true);
        u.text(`物资 ${g.supplies}`, 401, 17, 140, 32, 25, P.paper, true);
        u.text('出牌费用 / 生存补给', 401, 51, 180, 20, 12, P.muted);
        u.text(`护甲 ${g.armor}/10`, 597, 19, 175, 30, 23, g.critical ? P.red : P.paper, true);
        for (let i = 0; i < 10; i++)
            u.rect(599 + i * 14, 57, 10, 5, i < g.armor ? P.green : P.line);
        this.button('bag', '背包 ' + g.baseWeight + '/30', 801, 22, 175, 38, () => { this.overlay = 'bag'; this.page = 0; this.render(); });
        u.text(g.overflowWeight ? `暂存 +${g.overflowWeight}` : '暂无溢出', 985, 23, 123, 35, 16, g.overflowWeight ? P.orange : P.muted);
        this.button('log', '记录', 1114, 22, 70, 38, () => { this.overlay = 'log'; this.render(); });
        this.button('help', '?', 1194, 22, 44, 38, () => { this.overlay = 'help'; this.render(); });
        this.button('audio', this.audio.muted ? '静音' : '声音', 1248, 22, 70, 38, () => { this.audio.muted = !this.audio.muted; this.render(); });
        this.button('restart', '重开', 1328, 22, 88, 38, () => { this.overlay = 'restart'; this.render(); });
    }
    private actor(name: 'survivor' | 'wanderer' | 'brute', cx: number, foot: number, height: number): Actor {
        const frame = this.art.pose(name === 'survivor' && !this.game.battle?.weapon ? 'survivor-unarmed' : name), w = height * frame.rect.width / frame.rect.height;
        this.wu.ellipse(cx - 93, foot - 10, 186, 25, '#201723', 105);
        const n = this.wu.image(frame, cx - w / 2, foot - height * .95, w, height);
        n.name = name;
        const a = { node: n, sprite: n.getComponent(Sprite)!, name, height, home: n.position.clone() };
        this.actors.push(a);
        return a;
    }
    private pose(actor: Actor | null, index: number): void {
        if (!actor?.node.isValid)
            return;
        const frame = this.art.pose(actor.name === 'survivor' && !this.game.battle?.weapon ? 'survivor-unarmed' : actor.name, index);
        actor.sprite.spriteFrame = frame;
        actor.node.getComponent(UITransform)!.setContentSize(actor.height * frame.rect.width / frame.rect.height, actor.height);
    }
    private banner(kicker: string, title: string, subtitle: string): void {
        const u = this.ui;
        u.rect(30, 112, Math.min(690, Math.max(390, title.length * 38)), 107, '#241d28', undefined, this.stage, 192);
        u.text(kicker, 48, 122, 640, 22, 13, P.amber, true);
        u.text(title, 46, 149, 640, 41, 31, P.white, true);
        u.text(subtitle, 49, 194, 650, 25, 17, P.paper);
    }
    private journal(): void {
        const u = this.ui, g = this.game, end = g.phase === 'day2', failed = g.phase === 'failure';
        this.hero = this.actor('survivor', 385, 725, 500);
        u.frame(735, 155, 625, 652, '#29232d', '#99704d');
        u.rect(752, 172, 591, 7, P.orange);
        u.text(failed ? 'EXPLORATION FAILED' : end ? 'A NEW DAWN' : 'SURVIVAL JOURNAL', 780, 206, 535, 26, 15, P.amber, true);
        u.text(failed ? '还不是终点' : end ? '第 2 天 · 天亮了' : '第 1 天 · 离开庇护', 778, 254, 535, 64, 37, P.white, true);
        const copy = failed ? `${g.failureReason}\n\n本次教学探索已完整重置。\n卡牌没有永久损失，\n每日生存物资也没有扣除。` : end ? '门闩重新落下，外面的脚步声渐渐远去。\n\n你带回的不只是物资，\n还有下一次出发的底气。\n\n教学图的完整日循环，到此结束。' : '收音机只剩下沙沙声。\n最后一箱补给，撑不过太久。\n\n你带上菜刀、急救零件，\n还有一叠早已失去价值的现金。\n\n今天，必须出去走一趟。';
        u.text(copy, 780, 343, 532, 246, 22, P.paper);
        if (end) {
            const s = g.settlement!;
            u.text(`带回 ${s.returnedCards} 张卡牌  /  物资剩余 ${g.supplies}`, 780, 610, 532, 36, 23, P.green, true);
            u.text(s.dailyShortfall ? '最后结算：每日物资缺口 1。你选择优先修复。' : `修复花费 ${s.repairSpent}，最后扣除每日物资 ${s.dailySpent}。`, 780, 655, 532, 48, 18, s.dailyShortfall ? P.orange : P.muted);
        }
        else
            u.text('物资 10 · 护甲 10 · 战斗牌 7 张\n强制携带现金，总负重 27 / 30', 780, 609, 532, 72, 20, P.muted);
        this.button('journal-start', end ? '再走一条路线' : failed ? '重新开始第 1 天' : '出发 · 进入教学图', 780, 726, 532, 57, () => { if (end || failed) {
            this.game.reset();
            this.overlay = null;
            this.render();
            this.transition();
        }
        else
            this.act(() => g.start()); }, 'primary');
        u.text('余烬之中，仍有人守夜。', 66, 782, 610, 46, 32, P.white, true);
        u.text('A SINGLE DAY. A CHANCE TO SURVIVE.', 69, 843, 610, 23, 13, P.muted);
    }
    private map(): void {
        const u = this.ui, g = this.game;
        this.banner('EXPEDITION / ASHFALL DISTRICT', '灰烬街区', g.currentNode === 'return' ? '路已走完。正在自动返回避难所……' : '前往亮起的地点。全程无法主动撤离。');
        this.hero = this.actor('survivor', 205, 715, 352);
        u.frame(47, 748, 300, 102, '#2c2430', '#846149');
        u.text(`负重 ${g.baseWeight}/30  ·  暂存 ${g.overflowWeight}/10`, 62, 762, 270, 30, 19, P.amber, true);
        u.text(g.overflowWeight ? '消耗物资后，暂存卡可自动转入。' : '搜刮和出牌都会改变携带空间。', 62, 803, 270, 32, 16, P.muted);
        u.frame(384, 250, 985, 601, '#2b2930', '#806e5a');
        for (let x = 407; x < 1350; x += 35)
            u.line([[x, 267], [x, 830]], '#38353a', 1);
        for (let y = 272; y < 835; y += 35)
            u.line([[404, y], [1348, y]], '#38353a', 1);
        u.text('N ↑', 1300, 266, 44, 25, 16, P.muted, true);
        u.text('旧城区 · 行动路线', 411, 268, 450, 28, 17, P.paper, true);
        const node = (kind: NodeKind, x: number, y: number, branch?: Route) => {
            const active = g.currentNode === kind && (!branch || g.route === branch), done = g.visited.indexOf(kind) >= 0 && (!branch || g.route === branch), excluded = !!branch && !!g.route && branch !== g.route;
            u.frame(x, y, 240, 69, done ? '#424b3b' : active ? '#795139' : P.panel2, active ? P.amber : P.line);
            u.text(done ? '✓' : active ? '▶' : '◆', x + 10, y + 16, 30, 35, 22, active ? P.amber : P.muted, true, 'center');
            u.text(NODE_NAMES[kind], x + 49, y + 7, 181, 31, 22, excluded ? P.dim : P.paper, true);
            u.text(done ? '已完成' : active ? '点击进入' : excluded ? '另一条路线' : kind === 'rest' ? '恢复 / 整理 / 丢弃现金' : '待探索', x + 49, y + 40, 180, 20, 13, active ? P.amber : P.muted);
            if (active)
                this.hit('enter-' + kind, x, y, 240, 69, () => this.act(() => g.enterNode()));
        };
        node('fixed', 756, 320);
        if (!g.fixedDone) {
            u.line([[876, 390], [876, 470]], P.muted, 3);
            u.icon('heavy', 829, 494, 9);
            u.text('废弃补给站仍有一些东西可带走。', 540, 624, 650, 40, 25, P.paper, true, 'center');
            u.text('支付 2 物资 → 4 物资 + 重击\n完成固定搜刮后，才能选择后续路线。', 540, 687, 650, 86, 22, P.muted, false, 'center');
            return;
        }
        u.line([[876, 389], [876, 408], [608, 408], [608, 487]], P.muted, 3);
        u.line([[876, 408], [1139, 408], [1139, 487]], P.muted, 3);
        for (const [route, x] of [['A', 488], ['B', 1019]] as [
            Route,
            number
        ][]) {
            this.button('route-' + route, `路线 ${route} · ${route === 'A' ? '先战斗' : '先搜刮'}`, x - 24, 431, 288, 39, () => this.act(() => g.chooseRoute(route)), g.route === route ? 'primary' : 'normal', g.currentNode === 'choice');
            node(route === 'A' ? 'enemy1' : 'scavenge', x, 489, route);
            u.line([[x + 120, 558], [x + 120, 582]], P.muted, 3);
            node(route === 'A' ? 'scavenge' : 'enemy1', x, 583, route);
        }
        u.line([[608, 652], [608, 672], [876, 672], [876, 691]], P.muted, 3);
        u.line([[1139, 652], [1139, 672], [876, 672]], P.muted, 3);
        node('rest', 756, 692);
        u.line([[876, 761], [876, 775]], P.muted, 3);
        node('enemy2', 756, 775);
    }
    private battle(draw: boolean): void {
        const u = this.ui, g = this.game, b = g.battle!;
        this.banner(`ENCOUNTER / ROUND ${b.turn}`, NODE_NAMES[b.enemy], '先行动，看意图，决定把物资花在哪里。');
        this.hero = this.actor('survivor', 390, 590, 420);
        this.enemy = this.actor(b.enemy === 'enemy2' ? 'brute' : 'wanderer', 1030, 590, b.enemy === 'enemy2' ? 440 : 420);
        const danger = b.intent === 'attack';
        u.frame(916, 134, 285, 73, danger ? '#542f31' : '#354039', danger ? P.red : P.green);
        u.text(danger ? `攻击 ${g.incomingDamage}` : '蓄势 · 准备', 936, 142, 245, 33, 27, danger ? P.amber : P.green, true, 'center');
        u.text(danger ? '结束回合后执行' : `下次攻击 ${b.strongAttack}`, 936, 180, 245, 20, 14, P.paper, false, 'center');
        if (this.selectedCard) {
            this.aim = u.node('Aim guide', 0, 0, 1440, 900);
            const a = new PixelUI(this.aim);
            a.rect(864, 216, 344, 365, P.amber, P.amber, this.aim, 10);
            a.text('点击敌人 · 打出攻击', 880, 239, 312, 31, 20, P.amber, true, 'center');
            a.line([[725, 586], [800, 491], [930, 422]], P.amber, 3);
            a.polygon([[930, 422], [907, 425], [925, 445]], P.amber);
        }
        this.hit('enemy-target', 860, 216, 350, 378, () => { if (this.selectedCard)
            this.playCard(this.selectedCard); });
        u.frame(258, 573, 270, 52, '#24252b', '#8d9a79');
        u.text(`护甲 ${g.armor}/10`, 270, 580, 124, 28, 20, g.critical ? P.red : P.paper, true);
        u.text(`格挡 ${b.block}`, 403, 580, 112, 28, 20, P.green, true, 'right');
        u.bar(269, 613, 247, g.armor, 10, P.green);
        u.frame(899, 573, 270, 52, '#31232b', '#a96e55');
        u.text(`敌人护甲 ${b.hp}/${b.maxHp}`, 913, 580, 242, 28, 20, P.paper, true, 'center');
        u.bar(910, 613, 247, b.hp, b.maxHp, P.red);
        if (g.critical)
            u.text('感染临界：再次实际受伤即失败', 185, 534, 420, 30, 18, P.red, true, 'center');
        if (b.weapon) {
            u.frame(38, 499, 210, 105, '#29232d', '#b78a60');
            u.icon('knife', 50, 525, 4);
            u.text('菜刀已装备', 111, 512, 125, 33, 18, P.amber, true);
            u.text(b.turn === b.equippedTurn ? '下回合生成挥砍' : '每回合生成挥砍', 111, 552, 125, 29, 13, P.muted);
        }
        u.rect(0, 638, 1440, 262, '#201a26', undefined, this.stage, 175);
        u.line([[0, 639], [1440, 639]], '#705442', 2);
        this.instruction = u.text(this.selectedCard ? '已选择攻击牌\n点击敌人或拖向敌人' : '点击或拖动攻击牌选择目标\n防御、修复、武器直接使用', 545, 575, 340, 47, 15, P.paper, false, 'center');
        this.deckPile(31, 740, b.draw.length, '抽牌堆');
        this.deckPile(1300, 650, b.discard.length, '弃牌堆');
        const w = 156, h = 242, gap = 10, start = 720 - (b.hand.length * w + (b.hand.length - 1) * gap) / 2;
        b.hand.forEach((c, i) => {
            const mid = (b.hand.length - 1) / 2, offset = Math.abs(i - mid) * 7, x = start + i * (w + gap), y = 630 + offset;
            const node = cardFace(u, this.art, c.kind, x, y, w, h, g.cardBlocked(c), this.selectedCard === c.id ? '选择敌人为目标' : '点击 / 拖动');
            this.handNodes.set(c.id, node);
            this.hits.push({ id: 'card-' + c.id, x, y, width: w, height: h, enabled: true });
            bindHandCard(node, this.stage, { canInteract: () => !this.busy && !this.overlay,
                select: () => { const reason = g.cardBlocked(c); if (reason) {
                    this.message(reason);
                    this.render();
                    return;
                } if (this.attackKind(c.kind)) {
                    this.selectedCard = this.selectedCard === c.id ? '' : c.id;
                    this.render();
                }
                else
                    this.playCard(c.id); },
                drop: (px, py) => { if (py > 140 && py < 620 && px > 120 && px < 1250 && (!this.attackKind(c.kind) || px > 800)) {
                    this.playCard(c.id);
                    return this.busy;
                } this.selectedCard = ''; this.render(); return false; }
            }, this.reduce, (mid - i) * 2.2, this.selectedCard === c.id);
            if (draw && !this.reduce) {
                const target = node.position.clone();
                node.setPosition(target.x - 75, target.y - 30, 0);
                const opacity = node.addComponent(UIOpacity);
                opacity.opacity = 0;
                tween(node).delay(i * .035).to(.2, { position: target }, { easing: 'quadOut' }).start();
                tween(opacity).delay(i * .035).to(.16, { opacity: 255 }).start();
            }
        });
        if (!b.hand.length)
            u.text('手牌已空，结束回合继续抽牌。', 400, 720, 620, 80, 27, P.muted, false, 'center');
        this.button('end-turn', '结束回合', 1230, 797, 185, 60, () => this.enemyTurn(), 'primary');
        u.text(`回合 ${b.turn}\n手牌 ${b.hand.length} / 6`, 1236, 862, 175, 36, 13, P.muted, false, 'center');
    }
    private deckPile(x: number, y: number, count: number, label: string): void {
        const u = this.ui;
        for (let i = 3; i >= 0; i--)
            u.frame(x + i * 3, y - i * 4, 82, 108, '#463844', '#aa8060');
        u.pixelArt(['..ooo..', '.ooooo.', 'ooo.ooo', 'oo...oo', 'ooo.ooo', '.ooooo.', '..ooo..'], { o: '#a37c58' }, x + 22, y + 20, 6);
        u.text(String(count), x + 5, y + 72, 72, 30, 25, P.paper, true, 'center');
        u.text(label, x - 10, y + 117, 110, 25, 16, P.muted, false, 'center');
    }
    private attackKind(kind: CardKind): boolean { return kind === 'attack' || kind === 'heavy' || kind === 'slash'; }
    private playCard(id: string): void {
        const g = this.game, b = g.battle;
        if (this.busy || !b)
            return;
        const card = b.hand.find(c => c.id === id);
        if (!card)
            return;
        const reason = g.cardBlocked(card);
        if (reason) {
            this.message(reason);
            this.render();
            return;
        }
        this.busy = true;
        this.selectedCard = '';
        if (this.aim)
            this.aim.active = false;
        if (this.instruction)
            this.instruction.string = '正在出牌…';
        this.audio.play(this.attackKind(card.kind) ? 'attack' : card.kind === 'repair' ? 'heal' : 'block');
        const moving = this.handNodes.get(id);
        if (moving) {
            Tween.stopAllByTarget(moving);
            const opacity = moving.getComponent(UIOpacity) ?? moving.addComponent(UIOpacity);
            tween(moving).to(this.reduce ? .01 : .18, { position: new Vec3(this.attackKind(card.kind) ? 210 : -190, 30, 0), scale: new Vec3(.92, .92, 1), angle: -8 }, { easing: 'quadOut' }).start();
            tween(opacity).to(.18, { opacity: 0 }).start();
        }
        const oldHp = b.hp, oldArmor = g.armor, oldBlock = b.block, run = g.run;
        if (this.attackKind(card.kind) && !this.reduce) {
            this.pose(this.hero, 1);
            if (this.hero)
                tween(this.hero.node).to(.125, { position: this.hero.home.clone().add3f(46, 0, 0) }, { easing: 'quadOut' }).start();
        }
        const sequence = tween(this.node).delay(this.reduce ? .02 : .15).call(() => {
            if (run !== g.run)
                return;
            const result = g.play(id);
            this.seenRevision = g.revision;
            if (this.attackKind(card.kind)) {
                this.pose(this.enemy, 2);
                this.impact(1030, 365, 'attack');
                this.floatText(`−${oldHp - (g.battle?.hp ?? 0)}`, 1030, 300, P.red);
            }
            else if (card.kind === 'repair') {
                this.impact(390, 365, 'heal');
                this.floatText(`+${g.armor - oldArmor} 护甲`, 390, 325, P.green);
            }
            else if (card.kind === 'knife') {
                this.floatText('武器就绪', 390, 315, P.amber);
                this.impact(390, 390, 'block');
            }
            else {
                this.impact(390, 390, 'block');
                this.floatText(`+${(g.battle?.block ?? oldBlock) - oldBlock} 格挡`, 390, 325, P.green);
            }
            this.message(result.message);
        }).delay(this.reduce ? .06 : .29).call(() => { this.controllers = this.controllers.filter(t => t !== sequence); if (run === g.run) {
            this.busy = false;
            this.render();
            if (g.phase === 'rewards') {
                this.audio.play('loot');
                this.transition();
            }
        } });
        this.controllers.push(sequence);
        sequence.start();
    }
    private enemyTurn(): void {
        const g = this.game, b = g.battle;
        if (this.busy || !b)
            return;
        this.busy = true;
        this.selectedCard = '';
        if (this.aim)
            this.aim.active = false;
        if (this.instruction)
            this.instruction.string = '敌人行动中…';
        const run = g.run, attack = b.intent === 'attack', damage = Math.max(0, g.incomingDamage - b.block);
        this.audio.play(attack ? 'enemy' : 'block');
        if (attack && !this.reduce) {
            this.pose(this.enemy, 1);
            if (this.enemy)
                tween(this.enemy.node).to(.16, { position: this.enemy.home.clone().add3f(-60, 0, 0) }, { easing: 'quadOut' }).start();
        }
        const sequence = tween(this.node).delay(this.reduce ? .02 : .19).call(() => {
            if (run !== g.run)
                return;
            if (attack) {
                if (damage) {
                    this.pose(this.hero, 2);
                    this.impact(390, 370, 'attack');
                    this.floatText(`−${damage}`, 390, 300, P.red);
                }
                else {
                    this.impact(390, 365, 'block');
                    this.floatText('完全格挡', 390, 305, P.green);
                }
            }
            else {
                this.floatText('正在蓄势', 1030, 292, P.amber);
                this.impact(1030, 350, 'block');
            }
            const result = g.endTurn();
            this.seenRevision = g.revision;
            this.message(result.message);
        }).delay(this.reduce ? .06 : .29).call(() => { this.controllers = this.controllers.filter(t => t !== sequence); this.busy = false; this.render(true); if (g.phase === 'failure')
            this.transition(); });
        this.controllers.push(sequence);
        sequence.start();
    }
    private impact(x: number, y: number, kind: 'attack' | 'block' | 'heal'): void {
        const f = new PixelUI(this.fx), tint = kind === 'attack' ? P.amber : kind === 'block' ? '#a8c4b7' : P.green;
        const burst = f.node('Impact', x - 100, y - 100, 200, 200), ui = new PixelUI(burst, 200, 200);
        if (kind === 'attack')
            for (let i = 0; i < 3; i++)
                ui.polygon([[20 + i * 22, 148], [116 + i * 22, 20], [106 + i * 22, 80], [60 + i * 22, 165]], i === 1 ? P.white : P.orange);
        if (kind === 'block') {
            ui.polygon([[100, 15], [162, 48], [149, 122], [100, 172], [51, 122], [38, 48]], '#a7c0ad', 150);
            ui.polygon([[100, 30], [146, 57], [134, 113], [100, 152], [66, 113], [54, 57]], '#3d6761', 150);
        }
        if (kind === 'heal') {
            ui.rect(88, 25, 24, 150, P.green);
            ui.rect(25, 88, 150, 24, P.green);
        }
        const opacity = burst.addComponent(UIOpacity);
        tween(opacity).to(this.reduce ? .15 : .26, { opacity: 0 }).call(() => burst.destroy()).start();
        if (!this.reduce)
            for (let i = 0; i < 9; i++) {
                const particle = f.rect(x - 3, y - 3, 5 + i % 3, 5 + i % 3, tint), angle = i * Math.PI * 2 / 9, p = particle.position.clone();
                tween(particle).to(.28, { position: new Vec3(p.x + Math.cos(angle) * 85, p.y + Math.sin(angle) * 75, 0) }, { easing: 'quadOut' }).call(() => particle.destroy()).start();
            }
    }
    private floatText(text: string, x: number, y: number, tint: string): void {
        const n = new PixelUI(this.fx).text(text, x - 160, y - 20, 320, 65, 35, tint, true, 'center').node, o = n.addComponent(UIOpacity), p = n.position.clone();
        tween(n).to(this.reduce ? .2 : .48, { position: new Vec3(p.x, p.y + (this.reduce ? 0 : 36), 0) }, { easing: 'quadOut' }).start();
        tween(o).delay(.16).to(.25, { opacity: 0 }).call(() => n.destroy()).start();
    }
    private transition(): void {
        if (EDITOR)
            return;
        const n = new PixelUI(this.fx).rect(0, 80, 1440, 820, '#1f1824'), o = n.addComponent(UIOpacity);
        o.opacity = 165;
        tween(o).to(this.reduce ? .08 : .2, { opacity: 0 }).call(() => n.destroy()).start();
    }
    private rewards(): void {
        const g = this.game, r = g.rewards!, u = this.ui, battle = r.source === 'enemy1' || r.source === 'enemy2';
        this.banner(battle ? 'VICTORY / SALVAGE' : 'SCAVENGE / SALVAGE', battle ? '威胁已清除' : '废墟里，总有东西留下', battle ? '最多选择一张卡牌。物资需要单独领取。' : '整理背包后再领取，顺序会影响携带空间。');
        this.hero = this.actor('survivor', 230, 720, 380);
        u.frame(45, 755, 345, 94, '#29232d', '#967452');
        u.text(`携带 ${g.baseWeight}/30  ·  暂存 ${g.overflowWeight}/10`, 61, 768, 313, 31, 20, P.amber, true);
        u.text('新卡超重可暂存，物资不能溢出。', 61, 809, 313, 25, 16, P.muted);
        u.rect(480, 251, 907, 586, '#211b27', undefined, this.stage, 207);
        const width = 236, gap = 29, start = 935 - (r.cards.length * width + (r.cards.length - 1) * gap) / 2;
        r.cards.forEach((kind, i) => {
            const x = start + i * (width + gap), blocked = r.cardTaken || !!g.rewardCardBlocked(kind);
            const card = cardFace(u, this.art, kind, x, 284, width, 345, r.cardTaken ? '奖励已处理' : g.rewardCardBlocked(kind));
            if (this.lastPhase !== 'rewards' && !this.reduce) {
                const p = card.position.clone();
                card.setPosition(p.x, p.y - 18, 0);
                const opacity = card.addComponent(UIOpacity);
                opacity.opacity = 0;
                tween(card).delay(i * .04).to(.2, { position: p }, { easing: 'quadOut' }).start();
                tween(opacity).delay(i * .04).to(.18, { opacity: 255 }).start();
            }
            this.button('claim-card-' + i, r.cardTaken ? '卡牌已领取' : g.baseWeight + CARD[kind].weight > 30 ? '领取 · 暂存' : '选择这张卡', x, 640, width, 43, () => { let accepted = false; this.act(() => { const result = g.claimCard(i); accepted = result.ok; return result; }, 'loot'); if (accepted)
                this.flyCard(kind, x + width / 2, 454); }, 'primary', !blocked);
        });
        u.frame(510, 704, 850, 66, '#3e3236', '#8c6a4f');
        u.text(`物资 +${r.supplies}`, 527, 718, 175, 35, 25, P.amber, true);
        u.text(r.supplyTaken ? '已领取' : `可装入 ${Math.min(r.supplies, 30 - g.baseWeight)} 点`, 719, 721, 270, 30, 18, P.muted);
        this.button('claim-supplies', r.supplyTaken ? '已领取' : '领取物资', 1103, 716, 238, 42, () => { const before = g.supplies; this.act(() => g.claimSupplies(), 'loot'); if (g.supplies > before)
            this.floatText(`+${g.supplies - before} 物资`, 470, 105, P.amber); }, 'primary', !r.supplyTaken);
        this.button('reward-bag', '整理背包', 510, 793, 270, 49, () => { this.overlay = 'bag'; this.page = 0; this.render(); });
        this.button('rewards-done', r.supplyTaken && r.cardTaken ? '继续探索' : '继续 · 放弃未领取奖励', 983, 793, 377, 49, () => this.act(() => g.finishRewards()), 'primary');
    }
    private flyCard(kind: CardKind, x: number, y: number): void {
        if (this.reduce) {
            this.floatText('卡牌已收入背包', 890, 110, P.amber);
            return;
        }
        const node = cardFace(new PixelUI(this.fx), this.art, kind, x - 59, y - 87, 118, 174), o = node.addComponent(UIOpacity);
        tween(node).to(.32, { position: new Vec3(168, 409, 0), scale: new Vec3(.2, .2, 1), angle: 8 }, { easing: 'quadOut' }).start();
        tween(o).delay(.2).to(.14, { opacity: 0 }).call(() => node.destroy()).start();
    }
    private rest(): void {
        const g = this.game, u = this.ui;
        this.banner('REST / A MOMENT OF PEACE', '临时营地', g.critical ? '感染临界无法恢复护甲。趁现在整理行囊。' : '进入时已恢复最多 2 点护甲。物资不会恢复。');
        this.hero = this.actor('survivor', 368, 720, 420);
        u.frame(757, 267, 609, 209, '#30282e', '#9f7954');
        u.text('放下旧世界的重量', 783, 292, 550, 45, 29, P.paper, true);
        u.text('现金已经不再有用。\n丢弃后释放 10 点负重，暂存卡会自动转入。', 783, 351, 550, 70, 22, P.muted);
        const cash = g.cards.find(c => c.kind === 'cash');
        this.button('rest-cash', cash ? '丢弃现金 · 释放 10 负重' : '现金已丢弃', 783, 428, 550, 39, () => { if (cash) {
            this.discardId = cash.id;
            this.overlay = 'discard';
            this.render();
        } }, 'primary', !!cash);
        u.frame(757, 497, 609, 172, '#30282e', '#9f7954');
        u.text('检查下一场战斗的卡组', 783, 515, 550, 41, 27, P.paper, true);
        u.text(`${g.usableCards.length} 张可用牌 · ${g.cards.filter(c => c.zone === 'overflow').length} 张暂存\n移出战斗不释放负重，永久丢弃才释放。`, 783, 561, 550, 57, 19, P.muted);
        this.button('rest-bag', '整理出手卡组', 783, 626, 550, 37, () => { this.overlay = 'bag'; this.page = 0; this.render(); });
        u.text('下一站：重度感染者\n护甲 10 · 攻击 3 · 准备后攻击 6', 767, 707, 580, 63, 22, P.amber, true, 'center');
        this.button('rest-done', '离开营地，继续探索', 757, 798, 609, 55, () => this.act(() => g.finishRest()), 'primary');
        u.frame(67, 772, 565, 76, '#29232d', '#8c6a4f');
        u.text(`护甲 ${g.armor}/10  ·  物资 ${g.supplies}  ·  负重 ${g.baseWeight}/30`, 85, 791, 530, 37, 24, P.paper, true, 'center');
    }
    private shelter(): void {
        const u = this.ui, g = this.game, s = g.settlement!;
        this.banner('SHELTER / RETURN HOME', '门后的片刻安稳', '先清点战利品，再决定修复。每日消耗在最后执行。');
        this.hero = this.actor('survivor', 295, 735, 430);
        u.frame(590, 264, 775, 567, '#2b252d', '#9a7756');
        u.text('01  带回的物品已入库', 617, 286, 723, 37, 26, P.amber, true);
        u.text(`物资 ${s.returnedSupplies}  ·  卡牌 ${s.returnedCards} 张`, 617, 336, 723, 36, 26, P.paper, true);
        u.text(s.lostOverflow.length ? `溢出失效：${s.lostOverflow.join('、')}` : '没有溢出损失。临时战斗牌与装备状态已清除。', 617, 381, 723, 37, 17, P.muted);
        u.line([[615, 434], [1337, 434]], P.line, 2);
        u.text('02  护甲修复（可选）', 617, 451, 723, 38, 26, P.amber, true);
        u.text(`护甲 ${g.armor}/10  ·  ${g.armor === 10 ? '无需付费' : `完全修复需要 ${s.repairCost} 点物资`}`, 617, 502, 723, 35, 23, P.paper, true);
        this.button('shelter-repair', g.armor === 10 ? '护甲完整' : `支付 ${s.repairCost} 物资 · 完全修复`, 617, 554, 720, 45, () => { const result = g.repairAtShelter(); if (result.warning) {
            this.overlay = 'repair-risk';
            this.render();
        }
        else {
            this.message(result.message);
            this.audio.play('heal');
            this.render();
            this.impact(295, 460, 'heal');
        } }, 'primary', g.armor < 10 && g.supplies >= s.repairCost);
        u.line([[615, 627], [1337, 627]], P.line, 2);
        u.text('03  最后：每日生存消耗', 617, 642, 723, 39, 26, P.amber, true);
        u.text(`${g.supplies} 物资  →  每日需求 1  →  剩余 ${Math.max(0, g.supplies - 1)}`, 617, 697, 723, 43, 26, g.supplies ? P.green : P.red, true);
        u.text(g.supplies ? '每日物资尚未扣除。下方按钮完成最后这一步。' : '物资不足，将在最后记录 1 点缺口，物资最低为 0。', 617, 757, 723, 42, 18, P.muted);
        this.button('shelter-done', '结束结算 → 第 2 天', 959, 844, 407, 46, () => this.act(() => g.finishDay(), 'loot'), 'primary');
        u.text('不修复时，直接结束结算即可。', 590, 849, 350, 34, 18, P.muted);
    }
    private modal(): void {
        const u = this.ui;
        const shade = u.rect(0, 80, 1440, 820, '#130f1b', undefined, this.stage, 232);
        shade.on(Node.EventType.TOUCH_END, () => { });
        if (this.overlay === 'bag') {
            this.bag();
            return;
        }
        u.frame(325, 180, 790, 564, '#302831', P.amber);
        if (this.overlay === 'help' || this.overlay === 'log') {
            u.text(this.overlay === 'help' ? '生存手册' : '本日行动记录', 365, 211, 710, 52, 32, P.white, true);
            const content = this.overlay === 'help' ? '攻击牌：点击卡牌后选择敌人，或拖向敌人。\n防御、修复、武器牌：点击即可使用。\n\n物资是出牌费用，也占负重。基础负重 30，溢出 10。\n溢出卡不能战斗，释放空间后按顺序转入。\n护甲到 0 不立即失败，再次实际受伤才失败。\n格挡仅在当前回合有效，完全格挡可保护感染临界者。\n奖励处理后才检查物资是否归零。\n每日 1 点物资在结算最后处理。' : this.game.logs.slice(0, 9).join('\n\n');
            u.text(content, 365, 285, 710, 355, this.overlay === 'log' ? 17 : 21, P.paper);
            this.button('modal-close', '返回游戏', 838, 674, 237, 43, () => { this.overlay = null; this.render(); }, 'primary');
            return;
        }
        let title = '', body = '', confirm = '确认', action = () => { };
        if (this.overlay === 'restart') {
            title = '重新开始第 1 天？';
            body = '当前教学探索将重置。\n初始物资、护甲和卡牌恢复，随机内容重新生成。';
            confirm = '重新开始';
            action = () => { this.game.reset(); this.overlay = null; this.selectedCard = ''; this.render(); this.transition(); };
        }
        if (this.overlay === 'discard') {
            const c = this.game.cards.find(c => c.id === this.discardId);
            title = `丢弃${c ? CARD[c.kind].name : '卡牌'}？`;
            body = `这张牌将从本次探索中永久移除。\n${c ? `释放 ${CARD[c.kind].weight} 点负重，暂存卡按顺序自动转入。` : ''}`;
            confirm = '永久丢弃';
            action = () => { this.overlay = this.game.phase === 'rest' ? null : 'bag'; this.act(() => this.game.discardCard(this.discardId)); };
        }
        if (this.overlay === 'repair-risk') {
            title = '修复后，生存补给将不足';
            body = '你仍然可以选择修复。\n\n修复费先支付，每日消耗仍在结算最后执行。\n如果届时物资不足，将记录缺口，物资最低为 0。';
            confirm = '仍然修复';
            action = () => { this.overlay = null; this.act(() => this.game.repairAtShelter(true), 'heal'); this.impact(295, 460, 'heal'); };
        }
        u.text(title, 365, 247, 710, 66, 32, P.amber, true);
        u.text(body, 365, 360, 710, 190, 24, P.paper);
        this.button('modal-cancel', '返回', 365, 641, 265, 57, () => { this.overlay = null; this.render(); });
        this.button('modal-confirm', confirm, 673, 641, 402, 57, action, this.overlay === 'repair-risk' ? 'primary' : 'danger');
    }
    private bag(): void {
        const u = this.ui, g = this.game;
        u.frame(200, 125, 1040, 700, '#302831', P.amber);
        u.text('背包 / 本次探索风险区', 233, 148, 890, 46, 31, P.white, true);
        u.text(`基础 ${g.baseWeight}/30  ·  暂存 ${g.overflowWeight}/10  ·  可战斗 ${g.usableCards.length} 张`, 234, 205, 900, 30, 20, P.muted);
        this.button('modal-close', '关闭', 1126, 152, 82, 38, () => { this.overlay = null; this.render(); });
        const maxPage = Math.max(0, Math.ceil(g.cards.length / 6) - 1);
        this.page = Math.min(this.page, maxPage);
        g.cards.slice(this.page * 6, this.page * 6 + 6).forEach((c, i) => {
            const y = 260 + i * 67;
            u.frame(233, y, 975, 57, P.panel2, P.line);
            if (c.kind !== 'cash')
                u.image(this.art.card(c.kind), 242, y + 5, 47, 47);
            else
                u.icon('cash', 242, y + 12, 3.5);
            u.text(CARD[c.kind].name, 307, y + 10, 200, 37, 22, P.paper, true);
            u.text(`重 ${CARD[c.kind].weight}`, 516, y + 14, 80, 27, 17, P.muted);
            u.text(c.zone === 'overflow' ? '暂存 / 不可战斗' : c.kind === 'cash' ? '不进入抽牌' : c.selected ? '已入卡组' : '携带 / 不抽取', 603, y + 14, 180, 27, 16, c.zone === 'overflow' ? P.orange : P.green);
            if (g.phase === 'rest' && c.kind !== 'cash')
                this.button('toggle-' + c.id, c.selected ? '移出战斗' : '加入战斗', 796, y + 11, 177, 36, () => this.act(() => g.toggleCard(c.id)), 'normal', c.zone === 'base');
            const deletable = (g.phase === 'rest' || g.phase === 'rewards') && c.kind !== 'attack' && c.kind !== 'dodge' && (c.kind !== 'cash' || g.phase === 'rest');
            this.button('discard-' + c.id, '丢弃', 1017, y + 11, 178, 36, () => { this.discardId = c.id; this.overlay = 'discard'; this.render(); }, 'danger', deletable);
        });
        this.button('bag-prev', '上一页', 233, 686, 150, 41, () => { this.page--; this.render(); }, 'normal', this.page > 0);
        u.text(`${this.page + 1} / ${maxPage + 1}`, 405, 691, 80, 30, 19, P.muted, false, 'center');
        this.button('bag-next', '下一页', 513, 686, 150, 41, () => { this.page++; this.render(); }, 'normal', this.page < maxPage);
        this.button('discard-supply', '丢弃 1 物资', 944, 686, 264, 41, () => this.act(() => g.discardSupplies(1)), 'normal', (g.phase === 'rest' || g.phase === 'rewards') && g.supplies > 0);
        u.text(g.phase === 'rest' ? '移出战斗不释放负重；基础能力永久保留。' : '奖励与休整时可以丢弃物品；现金只能在营地丢弃。', 233, 759, 975, 38, 19, P.muted);
    }
}
