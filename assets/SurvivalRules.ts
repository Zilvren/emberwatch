export type CardKind = 'attack' | 'dodge' | 'knife' | 'evade' | 'repair' | 'heavy' | 'cash' | 'slash';
export type Phase = 'journal' | 'map' | 'battle' | 'rewards' | 'rest' | 'shelter' | 'day2' | 'failure';
export type Route = 'A' | 'B';
export type NodeKind = 'fixed' | 'scavenge' | 'enemy1' | 'rest' | 'enemy2';
export interface CardDefinition {
    name: string;
    tag: string;
    cost: number;
    weight: number;
    text: string;
    color: string;
}
export const CARD: Record<CardKind, CardDefinition> = {
    attack: { name: '基础攻击', tag: '固有 · 攻击', cost: 0, weight: 0, text: '造成 2 点伤害。\n无需物资，永不丢失。', color: '#c29060' },
    dodge: { name: '基础躲避', tag: '固有 · 防御', cost: 0, weight: 0, text: '获得 2 点格挡。\n格挡在回合结束时清零。', color: '#86a99c' },
    knife: { name: '菜刀', tag: '武器 · 唯一装备槽', cost: 2, weight: 3, text: '从下一回合起，\n每回合生成一张「挥砍」。', color: '#c29060' },
    evade: { name: '强化躲避', tag: '技能 · 防御', cost: 1, weight: 2, text: '获得 5 点格挡。\n格挡可抵消致命的再次受击。', color: '#86a99c' },
    repair: { name: '修复', tag: '技能 · 恢复', cost: 2, weight: 2, text: '恢复 3 点护甲，上限 10。\n护甲为 0 时无法使用。', color: '#9baf79' },
    heavy: { name: '重击', tag: '技能 · 攻击', cost: 1, weight: 4, text: '造成 5 点伤害。\n使用后进入弃牌堆。', color: '#cc795c' },
    cash: { name: '旧世界现金', tag: '遗物 · 无战斗效果', cost: 0, weight: 10, text: '沉重的旧世界遗物。\n只能在休整节点永久删除。', color: '#a59a78' },
    slash: { name: '挥砍', tag: '战斗临时牌', cost: 1, weight: 0, text: '造成 4 点伤害。\n战斗结束后消失。', color: '#d89e64' },
};
export const REWARD_POOL: CardKind[] = ['knife', 'evade', 'repair', 'heavy'];
export const ROUTES: Record<Route, NodeKind[]> = {
    A: ['enemy1', 'scavenge', 'rest', 'enemy2'], B: ['scavenge', 'enemy1', 'rest', 'enemy2'],
};
export const NODE_NAMES: Record<NodeKind, string> = {
    fixed: '废弃补给站', scavenge: '旧街搜刮', enemy1: '游荡感染者', rest: '临时营地', enemy2: '重度感染者',
};
export interface OwnedCard {
    id: string;
    kind: CardKind;
    zone: 'base' | 'overflow';
    selected: boolean;
    found: boolean;
}
export interface CombatCard {
    id: string;
    kind: CardKind;
    origin?: string;
    temporary: boolean;
}
export interface Battle {
    enemy: 'enemy1' | 'enemy2';
    hp: number;
    maxHp: number;
    attack: number;
    strongAttack: number;
    turn: number;
    intent: 'attack' | 'prepare';
    boosted: boolean;
    block: number;
    draw: CombatCard[];
    hand: CombatCard[];
    discard: CombatCard[];
    weapon: CombatCard | null;
    equippedTurn: number;
}
export interface Rewards {
    source: NodeKind;
    supplies: number;
    cards: CardKind[];
    supplyTaken: boolean;
    cardTaken: boolean;
}
export interface ActionResult {
    ok: boolean;
    message: string;
    warning?: boolean;
}
export interface Settlement {
    returnedSupplies: number;
    returnedCards: number;
    lostOverflow: string[];
    wasCritical: boolean;
    repairCost: number;
    repaired: boolean;
    repairSpent: number;
    dailySpent: number;
    dailyShortfall: number;
}
export class Random {
    constructor(public state: number) { this.state = state >>> 0 || 1; }
    next(): number { let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state = x >>> 0; return this.state / 4294967296; }
    int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
    shuffle<T>(source: T[]): T[] {
        const result = source.slice();
        for (let i = result.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}
/** Pure game rules. No rendering, engine objects, or browser dependencies. */
export class SurvivalGame {
    phase: Phase = 'journal';
    day = 1;
    supplies = 10;
    armor = 10;
    critical = false;
    cards: OwnedCard[] = [];
    route: Route | null = null;
    fixedDone = false;
    pathIndex = 0;
    visited: NodeKind[] = [];
    battle: Battle | null = null;
    rewards: Rewards | null = null;
    settlement: Settlement | null = null;
    logs: string[] = [];
    failureReason = '';
    revision = 0;
    run = 0;
    returnElapsed = 0;
    private nextId = 0;
    readonly random: Random;
    constructor(public readonly seed = Math.floor(Math.random() * 0xffffffff)) {
        this.random = new Random(seed);
        this.reset();
    }
    private result(ok: boolean, message: string, warning = false): ActionResult {
        if (ok)
            this.revision++;
        return { ok, message, warning };
    }
    private log(message: string): void { this.logs.unshift(message); this.logs = this.logs.slice(0, 36); }
    private owned(kind: CardKind, found = false, zone: 'base' | 'overflow' = 'base'): OwnedCard {
        return { id: `card-${++this.nextId}`, kind, found, zone, selected: kind !== 'cash' };
    }
    reset(): void {
        this.phase = 'journal';
        this.day = 1;
        this.supplies = 10;
        this.armor = 10;
        this.critical = false;
        this.route = null;
        this.fixedDone = false;
        this.pathIndex = 0;
        this.visited = [];
        this.battle = null;
        this.rewards = null;
        this.settlement = null;
        this.failureReason = '';
        this.returnElapsed = 0;
        this.logs = [];
        this.run++;
        this.cards = (['attack', 'attack', 'dodge', 'dodge', 'knife', 'evade', 'repair', 'cash'] as CardKind[]).map(k => this.owned(k));
        this.log('第 1 天 · 护甲 10，物资 10，背负 27 / 30。');
        this.revision++;
    }
    get baseWeight(): number { return this.supplies + this.cards.filter(c => c.zone === 'base').reduce((n, c) => n + CARD[c.kind].weight, 0); }
    get overflowWeight(): number { return this.cards.filter(c => c.zone === 'overflow').reduce((n, c) => n + CARD[c.kind].weight, 0); }
    get usableCards(): OwnedCard[] { return this.cards.filter(c => c.zone === 'base' && c.selected && c.kind !== 'cash'); }
    get currentNode(): NodeKind | 'choice' | 'return' {
        if (!this.fixedDone)
            return 'fixed';
        if (!this.route)
            return 'choice';
        return ROUTES[this.route][this.pathIndex] ?? 'return';
    }
    get incomingDamage(): number {
        const b = this.battle;
        return !b || b.intent === 'prepare' ? 0 : b.boosted ? b.strongAttack : b.attack;
    }
    start(): ActionResult {
        if (this.phase !== 'journal')
            return this.result(false, '当前不能出发。');
        this.phase = 'map';
        return this.result(true, '教学探索开始。完成补给站后选择路线。');
    }
    chooseRoute(route: Route): ActionResult {
        if (this.phase !== 'map' || this.currentNode !== 'choice')
            return this.result(false, '请先完成固定搜刮。');
        this.route = route;
        this.log(`选择路线 ${route}：${route === 'A' ? '先战斗，后搜刮' : '先搜刮，后战斗'}。`);
        return this.result(true, `已选择路线 ${route}。`);
    }
    enterNode(): ActionResult {
        if (this.phase !== 'map')
            return this.result(false, '请先完成当前事件。');
        const node = this.currentNode;
        if (node === 'choice')
            return this.result(false, '选择一条路线。');
        if (node === 'return')
            return this.result(false, '正在返回避难所。');
        if (node === 'fixed' || node === 'scavenge') {
            const fee = node === 'fixed' ? 2 : 3;
            if (this.supplies < fee)
                return this.result(false, `进入需要 ${fee} 点物资，目前只有 ${this.supplies} 点。可以重新开始教学。`);
            this.spend(fee);
            this.phase = 'rewards';
            this.rewards = { source: node, supplies: node === 'fixed' ? 4 : this.random.int(4, 6),
                cards: [node === 'fixed' ? 'heavy' : REWARD_POOL[this.random.int(0, 3)]], supplyTaken: false, cardTaken: false };
            this.log(`${NODE_NAMES[node]}：支付 ${fee} 点物资。奖励需要主动领取。`);
        }
        else if (node === 'rest') {
            this.phase = 'rest';
            const restored = this.critical ? 0 : Math.min(2, 10 - this.armor);
            this.armor += restored;
            this.log(this.critical ? '感染临界，营地无法恢复护甲。' : `进入营地，恢复 ${restored} 点护甲。`);
        }
        else
            this.startBattle(node);
        return this.result(true, `进入${NODE_NAMES[node]}。`);
    }
    private combatCard(card: OwnedCard): CombatCard { return { id: card.id, kind: card.kind, origin: card.id, temporary: false }; }
    private startBattle(enemy: 'enemy1' | 'enemy2'): void {
        const boss = enemy === 'enemy2';
        this.phase = 'battle';
        this.battle = { enemy, hp: boss ? 10 : 6, maxHp: boss ? 10 : 6, attack: boss ? 3 : 2, strongAttack: boss ? 6 : 4,
            turn: 1, intent: 'attack', boosted: false, block: 0, draw: this.random.shuffle(this.usableCards.map(c => this.combatCard(c))),
            hand: [], discard: [], weapon: null, equippedTurn: 0 };
        this.drawCards(4);
        this.beginPlayerTurn();
        if (boss && !this.battle.hand.some(c => REWARD_POOL.indexOf(c.kind) >= 0)) {
            const index = this.battle.draw.findIndex(c => REWARD_POOL.indexOf(c.kind) >= 0);
            if (index >= 0) {
                const card = this.battle.draw.splice(index, 1)[0];
                const replaced = this.battle.hand.pop();
                if (replaced)
                    this.battle.draw.push(replaced);
                this.battle.hand.push(card);
            }
        }
        this.log(`${NODE_NAMES[enemy]}出现。你先行动，敌人意图已公开。`);
    }
    private drawCards(count: number): void {
        const b = this.battle!;
        for (let i = 0; i < count && b.hand.length < 6; i++) {
            if (!b.draw.length) {
                b.draw = this.random.shuffle(b.discard);
                b.discard = [];
            }
            const card = b.draw.shift();
            if (!card)
                break;
            b.hand.push(card);
        }
    }
    private beginPlayerTurn(): void {
        const b = this.battle!;
        if (b.weapon && b.turn > b.equippedTurn) {
            const slash: CombatCard = { id: `slash-${++this.nextId}`, kind: 'slash', temporary: true };
            if (b.hand.length < 6)
                b.hand.push(slash);
            else
                b.discard.push(slash);
        }
        this.drawCards(3);
    }
    cardBlocked(card: CombatCard): string {
        if (this.supplies < CARD[card.kind].cost)
            return '物资不足';
        if (card.kind === 'knife' && this.battle?.weapon)
            return '武器槽已占用';
        if (card.kind === 'repair' && this.armor === 0)
            return '感染临界，无法修复';
        if (card.kind === 'repair' && this.armor === 10)
            return '护甲已满';
        return '';
    }
    play(id: string): ActionResult {
        if (this.phase !== 'battle' || !this.battle)
            return this.result(false, '当前不在战斗中。');
        const b = this.battle;
        const index = b.hand.findIndex(c => c.id === id);
        if (index < 0)
            return this.result(false, '卡牌已不在手中。');
        const card = b.hand[index];
        const reason = this.cardBlocked(card);
        if (reason)
            return this.result(false, reason);
        b.hand.splice(index, 1);
        this.spend(CARD[card.kind].cost);
        if (card.kind === 'knife') {
            b.weapon = card;
            b.equippedTurn = b.turn;
        }
        else {
            b.discard.push(card);
            if (card.kind === 'attack')
                b.hp = Math.max(0, b.hp - 2);
            if (card.kind === 'heavy')
                b.hp = Math.max(0, b.hp - 5);
            if (card.kind === 'slash')
                b.hp = Math.max(0, b.hp - 4);
            if (card.kind === 'dodge')
                b.block += 2;
            if (card.kind === 'evade')
                b.block += 5;
            if (card.kind === 'repair')
                this.armor = Math.min(10, this.armor + 3);
        }
        this.log(`第 ${b.turn} 回合 · 使用${CARD[card.kind].name}，消耗 ${CARD[card.kind].cost} 物资。`);
        if (b.hp === 0)
            this.winBattle();
        return this.result(true, `${CARD[card.kind].name}已生效。`);
    }
    endTurn(): ActionResult {
        if (this.phase !== 'battle' || !this.battle)
            return this.result(false, '当前不在战斗中。');
        const b = this.battle;
        b.discard.push(...b.hand);
        b.hand = [];
        if (b.intent === 'attack') {
            const damage = Math.max(0, this.incomingDamage - b.block);
            this.log(`敌人攻击 ${this.incomingDamage}，格挡 ${b.block}，实际伤害 ${damage}。`);
            if (damage > 0 && this.armor === 0) {
                this.fail('感染临界时再次受到实际伤害。');
                return this.result(true, '教学探索失败。');
            }
            this.armor = Math.max(0, this.armor - damage);
            if (this.armor === 0)
                this.critical = true;
            b.boosted = false;
            b.intent = 'prepare';
        }
        else {
            b.boosted = true;
            b.intent = 'attack';
            this.log(`敌人正在准备，下次攻击为 ${b.strongAttack}。`);
        }
        b.block = 0;
        b.turn++;
        this.beginPlayerTurn();
        return this.result(true, `第 ${b.turn} 回合，你先行动。`);
    }
    private winBattle(): void {
        const enemy = this.battle!.enemy;
        this.battle = null;
        this.phase = 'rewards';
        this.rewards = { source: enemy, supplies: enemy === 'enemy1' ? 2 : 3, cards: this.random.shuffle(REWARD_POOL).slice(0, 3), supplyTaken: false, cardTaken: false };
        this.log(`击败${NODE_NAMES[enemy]}。战斗结束，临时牌与装备已清除。`);
    }
    private spend(amount: number): void { this.supplies -= amount; this.promoteOverflow(); }
    private promoteOverflow(): void {
        for (const card of this.cards.filter(c => c.zone === 'overflow')) {
            if (this.baseWeight + CARD[card.kind].weight > 30)
                break;
            card.zone = 'base';
            this.log(`${CARD[card.kind].name}从溢出区转入可用卡组。`);
            if (this.battle && card.selected)
                this.battle.discard.push(this.combatCard(card));
        }
    }
    claimSupplies(): ActionResult {
        const r = this.rewards;
        if (this.phase !== 'rewards' || !r || r.supplyTaken)
            return this.result(false, '没有可领取的物资。');
        const amount = Math.min(r.supplies, Math.max(0, 30 - this.baseWeight));
        this.supplies += amount;
        r.supplyTaken = true;
        this.log(`领取物资 ${amount} / ${r.supplies}。${amount < r.supplies ? '超出负重的部分已放弃。' : ''}`);
        return this.result(true, `领取 ${amount} 点物资${amount < r.supplies ? `，其余 ${r.supplies - amount} 点放弃` : ''}。`);
    }
    rewardCardBlocked(kind: CardKind): string {
        if (this.baseWeight + CARD[kind].weight <= 30)
            return '';
        return this.overflowWeight + CARD[kind].weight <= 10 ? '' : '基础负重和临时溢出区均不足';
    }
    claimCard(index: number): ActionResult {
        const r = this.rewards;
        if (this.phase !== 'rewards' || !r || r.cardTaken || !r.cards[index])
            return this.result(false, '卡牌奖励已处理。');
        const kind = r.cards[index];
        const blocked = this.rewardCardBlocked(kind);
        if (blocked)
            return this.result(false, blocked);
        const zone = this.baseWeight + CARD[kind].weight <= 30 ? 'base' : 'overflow';
        this.cards.push(this.owned(kind, true, zone));
        r.cardTaken = true;
        this.log(`获得${CARD[kind].name}，${zone === 'base' ? '进入可用卡组' : '暂存临时溢出区'}。`);
        return this.result(true, zone === 'base' ? '卡牌已加入本次探索卡组。' : '卡牌进入临时溢出区，暂不能用于战斗。');
    }
    finishRewards(): ActionResult {
        const r = this.rewards;
        if (this.phase !== 'rewards' || !r)
            return this.result(false, '当前没有待处理奖励。');
        if (!r.supplyTaken)
            this.log(`放弃 ${r.supplies} 点物资奖励。`);
        if (!r.cardTaken)
            this.log('放弃未领取的卡牌奖励。');
        this.visited.push(r.source);
        if (r.source === 'fixed')
            this.fixedDone = true;
        else
            this.pathIndex++;
        this.rewards = null;
        this.phase = 'map';
        const depleted = this.supplies === 0;
        if (depleted)
            this.fail('节点奖励处理后，物资仍为 0。');
        return this.result(true, depleted ? '物资耗尽，教学探索重置。' : '节点完成，返回路线图。');
    }
    discardCard(id: string): ActionResult {
        if (this.phase !== 'rewards' && this.phase !== 'rest')
            return this.result(false, '只能在奖励或休整时整理背包。');
        const index = this.cards.findIndex(c => c.id === id);
        if (index < 0)
            return this.result(false, '卡牌不存在。');
        const card = this.cards[index];
        if (card.kind === 'attack' || card.kind === 'dodge')
            return this.result(false, '基础能力永久保留，可在休整时选择不带入战斗。');
        if (card.kind === 'cash' && this.phase !== 'rest')
            return this.result(false, '现金只能在休整节点删除。');
        this.cards.splice(index, 1);
        this.log(`永久丢弃${CARD[card.kind].name}，释放 ${CARD[card.kind].weight} 负重。`);
        this.promoteOverflow();
        return this.result(true, '卡牌已从本次探索中永久移除。');
    }
    discardSupplies(amount: number): ActionResult {
        if (this.phase !== 'rewards' && this.phase !== 'rest')
            return this.result(false, '只能在奖励或休整时丢弃物资。');
        if (!Number.isInteger(amount) || amount <= 0 || amount > this.supplies)
            return this.result(false, '没有足够物资可丢弃。');
        this.spend(amount);
        this.log(`丢弃 ${amount} 点物资。`);
        return this.result(true, `已释放 ${amount} 点负重。`);
    }
    toggleCard(id: string): ActionResult {
        if (this.phase !== 'rest')
            return this.result(false, '只有休整节点可调整出手卡组。');
        const card = this.cards.find(c => c.id === id);
        if (!card || card.kind === 'cash')
            return this.result(false, '现金不进入战斗。');
        if (!card.selected && card.zone === 'overflow')
            return this.result(false, '临时溢出卡尚不能用于战斗。');
        card.selected = !card.selected;
        return this.result(true, card.selected ? '已加入出手卡组。' : '本次不抽取此牌，卡牌仍占负重并可带回。');
    }
    finishRest(): ActionResult {
        if (this.phase !== 'rest')
            return this.result(false, '当前不在营地。');
        if (!this.usableCards.some(c => c.kind === 'attack' || c.kind === 'heavy' || c.kind === 'knife'))
            return this.result(false, '至少选择一张能够造成伤害的牌再出发。');
        this.visited.push('rest');
        this.pathIndex++;
        this.phase = 'map';
        if (this.supplies === 0)
            this.fail('休整结束时物资为 0。');
        return this.result(true, '休整结束。');
    }
    advanceTime(seconds: number): void {
        if (this.phase !== 'map' || this.currentNode !== 'return')
            return;
        this.returnElapsed += seconds;
        if (this.returnElapsed >= 0.8)
            this.returnToShelter();
    }
    private returnToShelter(): void {
        const lost = this.cards.filter(c => c.zone === 'overflow').map(c => CARD[c.kind].name);
        this.cards = this.cards.filter(c => c.zone === 'base');
        this.battle = null;
        this.settlement = { returnedSupplies: this.supplies, returnedCards: this.cards.length, lostOverflow: lost,
            wasCritical: this.critical, repairCost: this.armor === 10 ? 0 : this.critical ? 2 : 1, repaired: false,
            repairSpent: 0, dailySpent: 0, dailyShortfall: 0 };
        this.critical = false;
        this.phase = 'shelter';
        this.log('返回避难所，带回物品已入库，感染临界已解除。');
        this.revision++;
    }
    repairAtShelter(confirmed = false): ActionResult {
        const s = this.settlement;
        if (this.phase !== 'shelter' || !s)
            return this.result(false, '当前不在避难所。');
        if (this.armor === 10)
            return this.result(false, '护甲已满，无需支付修复费用。');
        if (this.supplies < s.repairCost)
            return this.result(false, '物资不足以支付修复费用。');
        if (this.supplies - s.repairCost < 1 && !confirmed)
            return this.result(false, '修复后将不足以支付每日消耗。仍要修复吗？', true);
        this.supplies -= s.repairCost;
        s.repairSpent = s.repairCost;
        s.repaired = true;
        this.armor = 10;
        this.log(`支付 ${s.repairCost} 点物资，护甲完全修复。每日消耗尚未扣除。`);
        return this.result(true, '护甲已恢复至 10。每日物资将在结束结算时扣除。');
    }
    finishDay(): ActionResult {
        const s = this.settlement;
        if (this.phase !== 'shelter' || !s)
            return this.result(false, '请先回到避难所。');
        s.dailySpent = Math.min(1, this.supplies);
        s.dailyShortfall = 1 - s.dailySpent;
        this.supplies -= s.dailySpent;
        this.log(s.dailyShortfall ? '结算最后：每日需求 1，实际支付 0，缺口 1。' : '结算最后：扣除每日生存物资 1。');
        this.day = 2;
        this.phase = 'day2';
        return this.result(true, '第 2 天日志已解锁，教学原型结束。');
    }
    private fail(reason: string): void {
        this.reset();
        this.phase = 'failure';
        this.failureReason = reason;
        this.log('教学失败：所有探索内容已重置；没有永久损失，不扣每日物资。');
    }
}
