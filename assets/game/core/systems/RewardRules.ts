import { CardSet } from '../content/ContentRegistry';
import { ActionResult } from '../RulesTypes';
import { InventoryRules } from './InventoryRules';
import { RuleFeedback, RewardState } from './RuleContext';
import { GameScenario, TUTORIAL_SCENARIO } from '../content/GameScenario';
import { Random } from '../Random';
export class RewardRules {
    constructor(
        private readonly state: RewardState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly inventory: InventoryRules,
        private readonly fail: (reason: string) => void,
        private readonly scenario: GameScenario = TUTORIAL_SCENARIO,
        private readonly random?: Random
    ) {}
    collectFieldSupplies(source: string, amount: number, discoveries = 0): void {
        this.state.supplies += amount;
        this.feedback.log(`收下 ${amount} 物资，现有 ${this.state.supplies}。`);
        const pool = this.state.discoveryPool ?? [];
        if (this.scenario.labyrinth && discoveries && pool.length) {
            this.state.rewards = {
                source, supplies: amount, cards: this.random!.shuffle(pool).slice(0, discoveries),
                supplyTaken: true, cardTaken: false, discovery: true,
            };
            this.state.phase = 'rewards';
        } else this.completeNode(source);
    }
    discover(kind: string | null): ActionResult {
        const reward = this.state.rewards;
        if (this.state.phase !== 'rewards' || !reward?.discovery ||
            (kind !== null && reward.cards.indexOf(kind) < 0))
            return this.feedback.result(false, '这次发现已处理或不包含该牌。');
        if (kind !== null) this.inventory.addDiscovery(kind);
        this.state.rewards = null;
        this.completeNode(reward.source);
        const message = kind === null ? '已略过发现。' : `已收下${this.content.cards[kind].name}，下场战斗可抽取。`;
        this.feedback.log(message);
        return this.feedback.result(true, message);
    }
    private completeNode(source: string): void {
        this.state.visited.push(source);
        if (source === this.scenario.fixedNodeId) this.state.fixedDone = true;
        else this.state.pathIndex++;
        this.state.phase = 'map';
    }
    claimSupplies(): ActionResult {
        const r = this.state.rewards;
        if (this.state.phase !== 'rewards' || !r || r.supplyTaken)
            return this.feedback.result(false, '没有可领取的物资。');
        const amount = r.supplies;
        this.state.supplies += amount;
        r.supplyTaken = true;
        this.feedback.log(`领取物资 ${amount}。`);
        return this.feedback.result(true, `领取 ${amount} 点物资。`);
    }
    claimCard(index: number): ActionResult {
        const r = this.state.rewards;
        if (this.state.phase !== 'rewards' || !r || r.discovery || r.cardTaken || !r.cards[index])
            return this.feedback.result(false, '卡牌奖励已处理。');
        const kind = r.cards[index];
        const blocked = this.inventory.rewardCardBlocked(kind);
        if (blocked) return this.feedback.result(false, blocked);
        const zone = this.inventory.rewardZone(kind);
        this.state.cards.push(this.inventory.owned(kind, true, zone));
        r.cardTaken = true;
        const destination =
            zone === 'overflow'
                ? '临时溢出区'
                : this.content.cards[kind].role === 'supply'
                  ? '行囊'
                  : '本局卡组';
        this.feedback.log(`获得${this.content.cards[kind].name}，进入${destination}。`);
        return this.feedback.result(true, `卡牌已放入${destination}。`);
    }
    finishRewards(): ActionResult {
        const r = this.state.rewards;
        if (this.state.phase !== 'rewards' || !r)
            return this.feedback.result(false, '当前没有待处理奖励。');
        if (r.discovery) return this.discover(null);
        if (!r.supplyTaken) this.feedback.log(`放弃 ${r.supplies} 点物资奖励。`);
        if (!r.cardTaken) this.feedback.log('放弃未领取的卡牌奖励。');
        this.completeNode(r.source);
        this.state.rewards = null;
        const depleted = this.scenario.battleResource !== 'stamina' && this.state.supplies === 0;
        if (depleted) this.fail('节点奖励处理后，物资仍为 0。');
        return this.feedback.result(
            true,
            depleted ? '物资耗尽，教学探索重置。' : '节点完成，返回路线图。'
        );
    }
}
