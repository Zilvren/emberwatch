import { CardSet } from '../content/ContentRegistry';
import { GameScenario } from '../content/GameScenario';
import { Random } from '../Random';
import { ActionResult, CombatCard, OwnedCard } from '../RulesTypes';
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
            weapon: null,
            equippedTurn: 0,
            ...(this.scenario.labyrinth ? { calm: initialCalm() } : {}),
        };
        if (!this.scenario.fieldDeck) this.drawCards(4);
        this.beginPlayerTurn();
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
        const inHand = b.hand.length < 6;
        if (inHand) b.hand.push(card);
        else b.draw.unshift(card);
        const message = `${this.content.cards[kind].name}已${inHand ? '入手' : '放到抽牌堆顶'}，本次探索可用。`;
        this.feedback.log(message);
        return this.feedback.result(true, message);
    }
    attackDamage(kind: string): number {
        const card = this.content.cards[kind], effect = card.effect,
            b = this.state.battle;
        const triggered =
            effect.bonusWhen === 'after-attack'
                ? b?.attackedThisTurn
                : effect.bonusWhen === 'behind-cover' && (b?.block ?? 0) >= 4;
        const damage = effect.amount + (triggered ? (effect.bonus ?? 0) : 0);
        return b ? labyrinthDamage(b, card, damage) : damage;
    }
    cardCost(kind: string): number {
        return staminaCost(this.content.cards[kind], this.state.battle?.calm);
    }
    resolveChoice(id: string | null): ActionResult {
        const battle = this.state.battle, choice = battle?.cardChoice;
        if (!battle || !choice || (id !== null && choice.ids.indexOf(id) < 0))
            return this.feedback.result(false, '这次选牌已结束或卡牌不可选。');
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
        for (let i = 0; i < count && b.hand.length < 6; i++) {
            if (!b.draw.length) {
                b.draw = this.random.shuffle(b.discard);
                b.discard = [];
            }
            const card = b.draw.shift();
            if (!card) break;
            b.hand.push(card);
        }
    }
    beginPlayerTurn(): void {
        const b = this.state.battle!;
        b.stamina = b.maxStamina;
        if (this.scenario.fieldDeck) b.attackedThisTurn = false;
        if (b.weapon && b.turn > b.equippedTurn) {
            const slash: CombatCard = {
                id: this.newId('slash'),
                kind: this.content.cards[b.weapon.kind].effect.generatedCard!,
                temporary: true,
            };
            if (b.hand.length < 6) b.hand.push(slash);
            else if (!this.scenario.fieldDeck) b.discard.push(slash);
        }
        this.drawCards(this.scenario.fieldDeck ? 5 : 3);
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
        if (effect.type === 'equip' && this.state.battle?.weapon) return '武器槽已占用';
        if (effect.type === 'heal' && this.state.armor === 0)
            return this.scenario.labyrinth ? '护甲临界，无法修复'
                : this.scenario.fieldDeck ? '压力服临界，无法修复' : '感染临界，无法修复';
        if (effect.type === 'heal' && this.state.armor === 10) return '护甲已满';
        return '';
    }
    play(id: string): ActionResult {
        if (this.state.phase !== 'battle' || !this.state.battle)
            return this.feedback.result(false, '当前不在战斗中。');
        const b = this.state.battle;
        const index = b.hand.findIndex((c) => c.id === id);
        if (index < 0) return this.feedback.result(false, '卡牌已不在手中。');
        const card = b.hand[index];
        const definition = this.content.cards[card.kind], cost = this.cardCost(card.kind);
        const reason = this.cardBlocked(card);
        if (reason) return this.feedback.result(false, reason);
        b.hand.splice(index, 1);
        if (b.calm?.retained === id) b.calm.retained = null;
        if (this.scenario.battleResource === 'stamina') b.stamina -= cost;
        else this.inventory.spend(cost);
        consumeDiscount(definition, b.calm);
        const effect = definition.effect;
        if (effect.type === 'equip') {
            b.weapon = card;
            b.equippedTurn = b.turn;
        } else {
            if (effect.type === 'damage') {
                b.hp = Math.max(0, b.hp - this.attackDamage(card.kind));
                consumeCalibration(b);
                if (this.scenario.fieldDeck) b.attackedThisTurn = true;
            }
            if (effect.type === 'block') b.block += effect.amount;
            if (effect.type === 'heal')
                this.state.armor = Math.min(10, this.state.armor + effect.amount);
            if (b.hp > 0 && (effect.type === 'draw' || effect.extraDraw))
                this.drawCards(effect.type === 'draw' ? effect.amount : effect.extraDraw!);
            if (b.hp > 0) applyLabyrinthEffect(b, definition, (count) => this.drawCards(count),
                (message) => this.feedback.log(message));
            if ((!card.temporary || !this.scenario.fieldDeck) &&
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
            if (damage > 0 && this.state.armor === 0) {
                this.fail(
                    this.scenario.labyrinth ? '护甲临界时再次受到未格挡的伤害。' : this.scenario.fieldDeck
                        ? '压力服临界时再次受到未格挡的伤害。'
                        : '感染临界时再次受到实际伤害。'
                );
                return this.feedback.result(
                    true,
                    this.scenario.kind === 'tutorial'
                        ? '教学探索失败。'
                        : '探索失败，已撤回避难所。'
                );
            }
            this.state.armor = Math.max(0, this.state.armor - damage);
            if (this.state.armor === 0) this.state.critical = true;
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
            cards: this.random.shuffle(this.content.rewardPool).slice(0, definition.rewardChoices),
            supplyTaken: false,
            cardTaken: false,
        };
        this.feedback.log(`击败${definition.title}。战斗结束，临时牌与装备已清除。`);
    }
}
