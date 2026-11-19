import { CardSet } from '../content/ContentRegistry';
import { GameScenario } from '../content/GameScenario';
import { Random } from '../Random';
import { ActionResult, CombatCard, NODE_NAMES, OwnedCard } from '../RulesTypes';
import { InventoryRules } from './InventoryRules';
import { RuleFeedback, RuleState } from './RuleContext';
import { entryTier } from '../content/EntryTiers';
export class CombatRules {
    constructor(
        private readonly state: RuleState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly inventory: InventoryRules,
        private readonly random: Random,
        private readonly newId: (prefix: string) => string,
        private readonly fail: (reason: string) => void,
        private readonly scenario: GameScenario
    ) {}
    get incomingDamage(): number {
        const b = this.state.battle;
        return !b || b.intent === 'prepare' ? 0 : b.boosted ? b.strongAttack : b.attack;
    }
    combatCard(card: OwnedCard): CombatCard {
        return { id: card.id, kind: card.kind, origin: card.id, temporary: false };
    }
    startBattle(enemy: 'enemy1' | 'enemy2'): void {
        const boss = enemy === 'enemy2',
            definition = this.scenario.enemies[enemy];
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
        };
        this.drawCards(4);
        this.beginPlayerTurn();
        if (
            boss &&
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
        this.feedback.log(`${NODE_NAMES[enemy]}出现。你先行动，敌人意图已公开。`);
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
        if (b.weapon && b.turn > b.equippedTurn) {
            const slash: CombatCard = {
                id: this.newId('slash'),
                kind: this.content.cards[b.weapon.kind].effect.generatedCard!,
                temporary: true,
            };
            if (b.hand.length < 6) b.hand.push(slash);
            else b.discard.push(slash);
        }
        this.drawCards(3);
    }
    cardBlocked(card: CombatCard): string {
        const effect = this.content.cards[card.kind].effect;
        const stamina = this.scenario.battleResource === 'stamina';
        if (
            (stamina ? (this.state.battle?.stamina ?? 0) : this.state.supplies) <
            this.content.cards[card.kind].cost
        )
            return stamina ? '体力不足' : '物资不足';
        if (effect.type === 'none') return '遗物不能在战斗中使用';
        if (effect.type === 'equip' && this.state.battle?.weapon) return '武器槽已占用';
        if (effect.type === 'heal' && this.state.armor === 0) return '感染临界，无法修复';
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
        const reason = this.cardBlocked(card);
        if (reason) return this.feedback.result(false, reason);
        b.hand.splice(index, 1);
        if (this.scenario.battleResource === 'stamina')
            b.stamina -= this.content.cards[card.kind].cost;
        else this.inventory.spend(this.content.cards[card.kind].cost);
        const effect = this.content.cards[card.kind].effect;
        if (effect.type === 'equip') {
            b.weapon = card;
            b.equippedTurn = b.turn;
        } else {
            b.discard.push(card);
            if (effect.type === 'damage') b.hp = Math.max(0, b.hp - effect.amount);
            if (effect.type === 'block') b.block += effect.amount;
            if (effect.type === 'heal')
                this.state.armor = Math.min(10, this.state.armor + effect.amount);
        }
        this.feedback.log(
            `第 ${b.turn} 回合 · 使用${this.content.cards[card.kind].name}，消耗 ${this.content.cards[card.kind].cost} ${this.scenario.battleResource === 'stamina' ? '体力' : '物资'}。`
        );
        if (b.hp === 0) this.winBattle();
        return this.feedback.result(true, `${this.content.cards[card.kind].name}已生效。`);
    }
    endTurn(): ActionResult {
        if (this.state.phase !== 'battle' || !this.state.battle)
            return this.feedback.result(false, '当前不在战斗中。');
        const b = this.state.battle;
        b.stamina = 0;
        b.discard.push(...b.hand);
        b.hand = [];
        if (b.intent === 'attack') {
            const damage = Math.max(0, this.incomingDamage - b.block);
            this.feedback.log(
                `敌人攻击 ${this.incomingDamage}，格挡 ${b.block}，实际伤害 ${damage}。`
            );
            if (damage > 0 && this.state.armor === 0) {
                this.fail('感染临界时再次受到实际伤害。');
                return this.feedback.result(true, '教学探索失败。');
            }
            this.state.armor = Math.max(0, this.state.armor - damage);
            if (this.state.armor === 0) this.state.critical = true;
            b.boosted = false;
            b.intent = 'prepare';
        } else {
            b.boosted = true;
            b.intent = 'attack';
            this.feedback.log(`敌人正在准备，下次攻击为 ${b.strongAttack}。`);
        }
        b.block = 0;
        b.turn++;
        this.beginPlayerTurn();
        return this.feedback.result(true, `第 ${b.turn} 回合，你先行动。`);
    }
    winBattle(): void {
        const enemy = this.state.battle!.enemy;
        this.state.battle = null;
        this.state.phase = 'rewards';
        this.state.rewards = {
            source: enemy,
            supplies: enemy === 'enemy1' ? 2 : 3,
            cards: this.random.shuffle(this.content.rewardPool).slice(0, 3),
            supplyTaken: false,
            cardTaken: false,
        };
        this.feedback.log(`击败${NODE_NAMES[enemy]}。战斗结束，临时牌与装备已清除。`);
    }
}
