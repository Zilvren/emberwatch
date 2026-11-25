import { CardSet } from '../content/ContentRegistry';
import { GameScenario, MAX_HEALTH } from '../content/GameScenario';
import { Random } from '../Random';
import { ActionResult, CardKind, CombatCard, OwnedCard } from '../RulesTypes';
import {
    blockAmount,
    CardDefinition,
    generatedCards,
    hasBlockEffect,
} from '../content/CardCatalog';
import { InventoryRules } from './InventoryRules';
import { RuleFeedback, CombatState } from './RuleContext';
import { entryTier } from '../content/EntryTiers';
import {
    advanceCalmRound, applyLabyrinthEffect, consumeCalibration, consumeDiscount,
    initialCalm, labyrinthDamage, staminaCost,
} from './LabyrinthCombat';
export class CombatRules {
    constructor(
        private readonly state: CombatState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly inventory: InventoryRules,
        private readonly random: Random,
        private readonly newId: (prefix: string) => string,
        private readonly fail: (reason: string) => void,
        private readonly scenario: GameScenario,
        private readonly currentNode: () => string,
        private readonly collectSupplies: (source: string, amount: number, discoveries?: number) => void
    ) {}
    private get expandedCombat(): boolean {
        return this.scenario.runDeck === true;
    }
    private get handLimit(): number {
        return this.expandedCombat ? 10 : 6;
    }
    private get turnDraw(): number {
        return this.expandedCombat ? 4 : this.scenario.fieldDeck ? 5 : 3;
    }
    private weapons(b: NonNullable<CombatState['battle']>): CombatCard[] {
        return b.weapons ?? (b.weapon ? [b.weapon] : []);
    }
    private weaponSlots(kind: CardKind): number {
        return this.content.cards[kind].weaponSlots ?? 1;
    }
    private usedWeaponSlots(b: NonNullable<CombatState['battle']>): number {
        return this.weapons(b).reduce((total, card) => total + this.weaponSlots(card.kind), 0);
    }
    private shieldSpearEquipped(b: NonNullable<CombatState['battle']>): boolean {
        return this.weapons(b).some((card) => this.weaponSlots(card.kind) === 2);
    }
    get strength(): number {
        const battle = this.state.battle;
        if (!battle) return 0;
        const equipped = this.weapons(battle).reduce(
            (highest, weapon) => Math.max(highest, this.content.cards[weapon.kind].effect.equippedStrength ?? 0),
            0
        );
        return equipped + (battle.gainedStrength ?? 0);
    }
    private chargedEffect(effect: CardDefinition['effect']) {
        const battle = this.state.battle, rage = effect.rage;
        return battle && rage && this.expandedCombat && this.shieldSpearEquipped(battle) &&
            (battle.rage ?? 0) >= rage.threshold ? rage : undefined;
    }
    private addRage(b: NonNullable<CombatState['battle']>, amount = 1): void {
        if (!this.expandedCombat || !this.shieldSpearEquipped(b) || !amount) return;
        b.rage = Math.min(5, (b.rage ?? 0) + amount);
    }
    private consumeRage(b: NonNullable<CombatState['battle']>): void {
        b.rage = 0;
    }
    private discardReplacedWeapon(b: NonNullable<CombatState['battle']>, card: CombatCard): void {
        b.discard.push(card);
    }
    private equipCard(
        b: NonNullable<CombatState['battle']>,
        card: CombatCard,
        replaceId?: string
    ): void {
        const slots = this.weaponSlots(card.kind);
        const current = this.weapons(b);
        if (slots === 2) {
            for (const previous of current) this.discardReplacedWeapon(b, previous);
            current.splice(0, current.length);
            b.rage = 0;
        } else {
            while (current.length && this.usedWeaponSlots(b) + slots > 2) {
                const replaceIndex = replaceId ? current.findIndex((weapon) => weapon.id === replaceId) : 0;
                const replaced = current.splice(replaceIndex >= 0 ? replaceIndex : 0, 1)[0];
                if (this.weaponSlots(replaced.kind) === 2) b.rage = 0;
                this.discardReplacedWeapon(b, replaced);
                replaceId = undefined;
            }
            if (current.some((weapon) => weapon.id === card.id)) return;
        }
        current.push(card);
        b.weapons = current;
        b.weapon = card;
        b.equippedTurn = b.turn;
        b.weaponTurns ??= {};
        b.weaponTurns[card.id] = b.turn;
    }
    private generatedCard(b: NonNullable<CombatState['battle']>, kind: CardKind): void {
        const generated: CombatCard = {
            id: this.newId('slash'),
            kind,
            temporary: true,
        };
        if (b.hand.length < this.handLimit) b.hand.push(generated);
        else b.discard.push(generated);
    }
    private applyDamage(
        amount: number,
        b: NonNullable<CombatState['battle']>,
        consumeDamageBuff = true
    ): void {
        b.hp = Math.max(0, b.hp - amount);
        this.addRage(b);
        if (consumeDamageBuff) consumeCalibration(b);
        if (this.scenario.fieldDeck) b.attackedThisTurn = true;
    }
    private applyBlock(amount: number, b: NonNullable<CombatState['battle']>): void {
        b.block += amount;
    }
    private copyDefenseEffect(
        kind: CardKind,
        b: NonNullable<CombatState['battle']>,
        preserveDamageBuff = false
    ): void {
        const definition = this.content.cards[kind];
        const effect = definition.effect;
        const damage = effect.type === 'damage' ? this.attackDamage(kind, false) : 0;
        if (damage > 0) this.applyDamage(damage, b, !preserveDamageBuff);
        const block = blockAmount(effect);
        if (block > 0) this.applyBlock(block, b);
        if (effect.type === 'heal')
            this.state.health = Math.min(MAX_HEALTH, this.state.health + effect.amount);
        if (b.hp > 0 && (effect.type === 'draw' || effect.extraDraw))
            this.drawCards(effect.type === 'draw' ? effect.amount : effect.extraDraw!);
        if (b.hp > 0) applyLabyrinthEffect(b, definition, (count) => this.drawCards(count),
            (message) => this.feedback.log(message));
    }
    private rewardChoices(count: number): CardKind[] {
        const boosts = this.state.synthesisRewardBoosts ?? {};
        return this.random.weightedSample(
            this.content.rewardPool,
            (kind) => (this.content.rewardWeights[kind] ?? 1) * (boosts[kind] ?? 1),
            count
        );
    }
    get incomingDamage(): number {
        const b = this.state.battle;
        return !b || b.intent === 'prepare' ? 0 : b.boosted ? b.strongAttack : b.attack;
    }
    combatCard(card: OwnedCard): CombatCard {
        return { id: card.id, kind: card.kind, origin: card.id, temporary: false };
    }
    startBattle(enemy: string): void {
        const definition = this.scenario.enemies[enemy];
        if (!definition) throw new Error('缺少敌人定义：' + enemy);
        this.state.phase = 'battle';
        this.state.battle = {
            stamina: 0,
            maxStamina:
                this.scenario.battleResource === 'stamina'
                    ? (entryTier(this.state.entryTier)?.stamina ?? 1)
                    : 0,
            enemy,
            hp: definition.hp,
            maxHp: definition.hp,
            attack: definition.attack,
            strongAttack: definition.strongAttack,
            turn: 1,
            intent: 'attack',
            boosted: false,
            block: 0,
            draw: this.random.shuffle(this.inventory.usableCards.map((c) => this.combatCard(c))),
            hand: [],
            discard: [],
            ...(this.expandedCombat ? { weapons: [], weaponTurns: {}, rage: 0 } : {}),
            weapon: null,
            equippedTurn: 0,
            ...(this.scenario.labyrinth ? { calm: initialCalm() } : {}),
        };
        if (!this.scenario.fieldDeck && !this.expandedCombat) {
            this.drawCards(4);
            this.beginPlayerTurn(false);
        } else this.beginPlayerTurn();
        if (this.scenario.fieldDeck && !this.scenario.labyrinth) this.offerDiscovery();
        if (
            !this.scenario.fieldDeck &&
            definition.ensureRewardOpeningHand &&
            !this.scenario.runDeck &&
            !this.state.battle.hand.some((c) => this.content.rewardPool.indexOf(c.kind) >= 0)
        ) {
            const index = this.state.battle.draw.findIndex(
                (c) => this.content.rewardPool.indexOf(c.kind) >= 0
            );
            if (index >= 0) {
                const card = this.state.battle.draw.splice(index, 1)[0];
                const replaced = this.state.battle.hand.pop();
                if (replaced) this.state.battle.draw.push(replaced);
                this.state.battle.hand.push(card);
            }
        }
        this.feedback.log(`${definition.title}出现。你先行动，敌人意图已公开。`);
    }
    private offerDiscovery(): void {
        const options: string[] = [];
        for (const group of this.content.catalog.expedition!.discoveryGroups) {
            const remaining = group.filter((id) => options.indexOf(id) < 0);
            if (!remaining.length) continue;
            const unseen = remaining.filter(
                (id) => !this.inventory.usableCards.some((card) => card.found && card.kind === id)
            );
            const pool = unseen.length ? unseen : remaining;
            options.push(pool[this.random.int(0, pool.length - 1)]);
        }
        if (options.length) this.state.battle!.discovery = this.random.shuffle(options);
    }
    discover(kind: string | null): ActionResult {
        const b = this.state.battle;
        if (
            this.state.phase !== 'battle' ||
            !b?.discovery ||
            (kind !== null && b.discovery.indexOf(kind) < 0)
        )
            return this.feedback.result(false, '这次发现已处理或不包含该牌。');
        delete b.discovery;
        if (kind === null) {
            this.feedback.log('略过战场发现，维持当前牌组。');
            return this.feedback.result(true, '已略过发现。');
        }
        const card = this.combatCard(this.inventory.addDiscovery(kind));
        const inHand = b.hand.length < this.handLimit;
        if (inHand) b.hand.push(card);
        else b.draw.unshift(card);
        const message = `${this.content.cards[kind].name}已${inHand ? '入手' : '放到抽牌堆顶'}，本次探索可用。`;
        this.feedback.log(message);
        return this.feedback.result(true, message);
    }
    attackDamage(kind: string, enhanced = true): number {
        const card = this.content.cards[kind], effect = card.effect,
            b = this.state.battle;
        if (effect.type !== 'damage') return 0;
        const triggered =
            effect.bonusWhen === 'after-attack'
                ? b?.attackedThisTurn
                : effect.bonusWhen === 'behind-cover' && (b?.block ?? 0) >= 4;
        const rage = enhanced ? this.chargedEffect(effect) : undefined;
        const base = rage?.damage ?? (effect.amount + (triggered ? (effect.bonus ?? 0) : 0));
        const damage = (base + this.strength) * (effect.hits ?? 1);
        if (!b) return damage;
        const extra = rage?.damagePercentMaxHp ? Math.ceil(b.maxHp * rage.damagePercentMaxHp) : 0;
        return labyrinthDamage(b, card, damage) + extra;
    }
    cardCost(kind: string): number {
        return staminaCost(this.content.cards[kind], this.state.battle?.calm);
    }
    resolveChoice(id: string | null): ActionResult {
        const battle = this.state.battle, choice = battle?.cardChoice;
        if (!battle || !choice || (id !== null && choice.ids.indexOf(id) < 0))
            return this.feedback.result(false, '这次选牌已结束或卡牌不可选。');
        if (choice.mode === 'replace-weapon') {
            const pending = battle.pendingEquip && battle.hand.find((card) => card.id === battle.pendingEquip);
            const replacement = id && (battle.weapons ?? []).find((card) => card.id === id);
            if (id === null) {
                delete battle.pendingEquip;
                delete battle.cardChoice;
                return this.feedback.result(true, '已取消替换。');
            }
            if (!pending || !replacement)
                return this.feedback.result(false, '请选择要替换的武器。');
            const definition = this.content.cards[pending.kind], cost = this.cardCost(pending.kind);
            if (this.state.battle!.stamina < cost)
                return this.feedback.result(false, '体力不足，无法替换武器。');
            battle.hand.splice(battle.hand.indexOf(pending), 1);
            battle.stamina -= cost;
            this.equipCard(battle, pending, replacement.id);
            delete battle.pendingEquip;
            delete battle.cardChoice;
            this.feedback.log(`使用${definition.name}替换${this.content.cards[replacement.kind].name}。`);
            return this.feedback.result(true, `${definition.name}已装备。`);
        }
        if (id !== null) {
            const source = choice.mode === 'discard-to-top' ? battle.discard : battle.hand;
            const index = source.findIndex((card) => card.id === id);
            if (index < 0) return this.feedback.result(false, '这张牌已移动。');
            if (choice.mode === 'discard-to-top') battle.draw.unshift(source.splice(index, 1)[0]);
            else battle.calm!.retained = id;
        }
        delete battle.cardChoice;
        return this.feedback.result(true, id === null ? '已略过。'
            : choice.mode === 'discard-to-top' ? '已放到抽牌堆顶。' : '这张牌会留到下一回合。');
    }
    drawCards(count: number): void {
        const b = this.state.battle!;
        for (let i = 0; i < count && b.hand.length < this.handLimit; i++) {
            if (!b.draw.length) {
                b.draw = this.random.shuffle(b.discard);
                b.discard = [];
            }
            const card = b.draw.shift();
            if (!card) break;
            b.hand.push(card);
        }
    }
    beginPlayerTurn(draw = true): void {
        const b = this.state.battle!;
        b.stamina = b.maxStamina;
        if (this.scenario.fieldDeck) b.attackedThisTurn = false;
        const weapons = this.weapons(b);
        for (const weapon of weapons) {
            const readyTurn = b.weaponTurns?.[weapon.id] ?? b.equippedTurn;
            if (b.turn <= readyTurn) continue;
            for (const kind of generatedCards(this.content.cards[weapon.kind].effect))
                this.generatedCard(b, kind);
        }
        if (draw) this.drawCards(this.turnDraw);
    }
    cardBlocked(card: CombatCard): string {
        if (this.state.battle?.discovery) return '先处理本场发现';
        if (this.state.battle?.cardChoice) return '先完成出牌后的选择';
        const effect = this.content.cards[card.kind].effect;
        const stamina = this.scenario.battleResource === 'stamina';
        if (
            (stamina ? (this.state.battle?.stamina ?? 0) : this.state.supplies) <
            this.cardCost(card.kind)
        )
            return stamina ? '体力不足' : '物资不足';
        if (effect.type === 'none') return '遗物不能在战斗中使用';
        if (effect.type === 'equip' && this.expandedCombat) {
            const slots = this.weaponSlots(card.kind), used = this.usedWeaponSlots(this.state.battle!);
            if (slots === 2 && used === 2 && card.kind === this.state.battle?.weapon?.kind)
                return '这件武器已经装备。';
            if (slots > 2 || (slots === 2 && used > 2)) return '武器槽不足';
        } else if (effect.type === 'equip' && this.state.battle?.weapon) return '武器槽已占用';
        if (effect.type === 'heal' && this.state.health === MAX_HEALTH) return '血量已满';
        return '';
    }
    play(id: string): ActionResult {
        if (this.state.phase !== 'battle' || !this.state.battle)
            return this.feedback.result(false, '当前不在战斗中。');
        const b = this.state.battle;
        const index = b.hand.findIndex((c) => c.id === id);
        if (index < 0) return this.feedback.result(false, '卡牌已不在手中。');
        const card = b.hand[index];
        const definition = this.content.cards[card.kind], effect = definition.effect, cost = this.cardCost(card.kind);
        const reason = this.cardBlocked(card);
        if (reason) return this.feedback.result(false, reason);
        if (
            effect.type === 'equip' &&
            this.expandedCombat &&
            this.weaponSlots(card.kind) === 1 &&
            this.usedWeaponSlots(b) === 2
        ) {
            b.pendingEquip = card.id;
            b.cardChoice = { mode: 'replace-weapon', ids: this.weapons(b).map((weapon) => weapon.id) };
            return this.feedback.result(true, '请选择要替换的武器。');
        }
        b.hand.splice(index, 1);
        if (b.calm?.retained === id) b.calm.retained = null;
        if (this.scenario.battleResource === 'stamina') b.stamina -= cost;
        else this.inventory.spend(cost);
        consumeDiscount(definition, b.calm);
        if (effect.type === 'equip') {
            if (this.expandedCombat) this.equipCard(b, card);
            else {
                b.weapon = card;
                b.equippedTurn = b.turn;
            }
        } else {
            if (effect.type === 'damage') {
                const rage = this.chargedEffect(effect);
                const damage = this.attackDamage(card.kind);
                if (rage) this.consumeRage(b);
                const preserveDamageBuff = !!rage?.copyDefenseTimes && !!b.calm?.calibrated;
                this.applyDamage(damage, b, !preserveDamageBuff);
                if (effect.block) this.applyBlock(effect.block, b);
                if (rage?.copyDefenseTimes) {
                    const target = b.lastDefenseCardKind;
                    if (target) {
                        for (let copy = 0; copy < rage.copyDefenseTimes; copy++)
                            this.copyDefenseEffect(target, b, preserveDamageBuff);
                    }
                    if (preserveDamageBuff) consumeCalibration(b);
                }
            } else if (effect.type === 'block') this.applyBlock(effect.amount, b);
            if (effect.type === 'heal')
                this.state.health = Math.min(MAX_HEALTH, this.state.health + effect.amount);
            if (effect.type === 'strength')
                b.gainedStrength = (b.gainedStrength ?? 0) + effect.amount;
            if (b.hp > 0 && (effect.type === 'draw' || effect.extraDraw))
                this.drawCards(effect.type === 'draw' ? effect.amount : effect.extraDraw!);
            if (b.hp > 0) applyLabyrinthEffect(b, definition, (count) => this.drawCards(count),
                (message) => this.feedback.log(message));
            if (hasBlockEffect(effect)) b.lastDefenseCardKind = card.kind;
            if (!definition.oncePerBattle &&
                (!card.temporary || (!this.expandedCombat && !this.scenario.fieldDeck)) &&
                effect.type !== 'power' && effect.labyrinth?.rule !== 'gain-stamina')
                b.discard.push(card);
        }
        this.feedback.log(
            `第 ${b.turn} 回合 · 使用${definition.name}，消耗 ${cost} ${this.scenario.battleResource === 'stamina' ? '体力' : '物资'}。`
        );
        if (b.hp === 0) {
            const enemy = this.scenario.enemies[b.enemy];
            this.winBattle();
            if (this.scenario.fieldDeck)
                return this.feedback.result(
                    true,
                    `击败${enemy.title} · 物资 +${enemy.rewardSupplies}`
                );
        } else if (
            this.scenario.fieldDeck &&
            this.scenario.enemies[b.enemy].discoverAtHalf &&
            !b.coreExposed &&
            b.hp * 2 <= b.maxHp
        ) {
            b.coreExposed = true;
            this.offerDiscovery();
            this.feedback.log('闸轮失压，核心暴露。获得一次战场发现。');
            return this.feedback.result(true, '闸轮失压 · 获得一次发现');
        }
        return this.feedback.result(true, `${this.content.cards[card.kind].name}已生效。`);
    }
    endTurn(): ActionResult {
        if (this.state.phase !== 'battle' || !this.state.battle)
            return this.feedback.result(false, '当前不在战斗中。');
        const b = this.state.battle;
        if (b.discovery || b.cardChoice) return this.feedback.result(false, '先完成选择。');
        b.stamina = 0;
        const retained = b.calm?.retained;
        b.discard.push(...b.hand.filter((card) => card.id !== retained && (!this.scenario.fieldDeck || !card.temporary)));
        b.hand = b.hand.filter((card) => card.id === retained);
        if (b.calm?.deferred === 'scheduled') {
            this.nextTurn(b);
            return this.feedback.result(true, '敌人原定动作暂缓，进入额外回合。');
        }
        if (b.intent === 'attack') {
            const damage = Math.max(0, this.incomingDamage - b.block);
            this.feedback.log(
                `敌人攻击 ${this.incomingDamage}，格挡 ${b.block}，实际伤害 ${damage}。`
            );
            this.state.health = Math.max(0, this.state.health - damage);
            if (this.state.health === 0) {
                this.fail('血量耗尽，本次探索失败。');
                return this.feedback.result(
                    true,
                    this.scenario.kind === 'tutorial'
                        ? '教学探索失败。'
                        : '探索失败，已撤回避难所。'
                );
            }
            if (damage === 0 && b.calm?.deferred === 'extra-turn' && b.calm.counter) {
                b.hp = Math.max(0, b.hp - b.calm.counter);
                this.feedback.log(`回流盾完全接下暂缓的攻击，反击 ${b.calm.counter} 伤害。`);
                if (b.hp === 0) {
                    this.winBattle();
                    return this.feedback.result(true, '回流盾反击击败敌人。');
                }
            }
            b.boosted = false;
            b.intent = 'prepare';
        } else {
            b.boosted = true;
            b.intent = 'attack';
            this.feedback.log(`敌人正在准备，下次攻击为 ${b.strongAttack}。`);
        }
        this.nextTurn(b);
        return this.feedback.result(true, `第 ${b.turn} 回合，你先行动。`);
    }
    private nextTurn(battle: NonNullable<CombatState['battle']>): void {
        if (battle.calm) advanceCalmRound(battle.calm);
        battle.block = 0;
        battle.turn++;
        this.beginPlayerTurn();
    }
    winBattle(): void {
        const enemy = this.state.battle!.enemy,
            definition = this.scenario.enemies[enemy];
        this.state.battle = null;
        if (this.scenario.fieldDeck) {
            this.feedback.log(`击败${definition.title}。`);
            this.collectSupplies(this.currentNode(), definition.rewardSupplies, definition.rewardChoices);
            return;
        }
        this.state.phase = 'rewards';
        this.state.rewards = {
            source: this.currentNode(),
            supplies: definition.rewardSupplies,
            cards: this.rewardChoices(definition.rewardChoices),
            supplyTaken: false,
            cardTaken: false,
        };
        this.feedback.log(`击败${definition.title}。战斗结束，临时牌与装备已清除。`);
    }
}
