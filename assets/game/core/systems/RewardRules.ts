import { CardSet } from '../content/ContentRegistry';
import { ActionResult } from '../RulesTypes';
import { InventoryRules } from './InventoryRules';
import { RuleFeedback, RewardState } from './RuleContext';
import { GameScenario, TUTORIAL_SCENARIO } from '../content/GameScenario';
export class RewardRules {
    constructor(
        private readonly state: RewardState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly inventory: InventoryRules,
        private readonly fail: (reason: string) => void,
        private readonly scenario: GameScenario = TUTORIAL_SCENARIO
    ) {}
    claimSupplies(): ActionResult {
        const r = this.state.rewards;
        if (this.state.phase !== 'rewards' || !r || r.supplyTaken)
            return this.feedback.result(false, '没有可领取的物资。');
        const amount =
            this.scenario.suppliesHaveWeight === false
                ? r.supplies
                : Math.min(r.supplies, Math.max(0, 30 - this.inventory.baseWeight));
        this.state.supplies += amount;
        r.supplyTaken = true;
        this.feedback.log(
            `领取物资 ${amount} / ${r.supplies}。${amount < r.supplies ? '超出负重的部分已放弃。' : ''}`
        );
        return this.feedback.result(
            true,
            `领取 ${amount} 点物资${amount < r.supplies ? `，其余 ${r.supplies - amount} 点放弃` : ''}。`
        );
    }
    claimCard(index: number): ActionResult {
        const r = this.state.rewards;
        if (this.state.phase !== 'rewards' || !r || r.cardTaken || !r.cards[index])
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
        if (!r.supplyTaken) this.feedback.log(`放弃 ${r.supplies} 点物资奖励。`);
        if (!r.cardTaken) this.feedback.log('放弃未领取的卡牌奖励。');
        this.state.visited.push(r.source);
        if (r.source === this.scenario.fixedNodeId) this.state.fixedDone = true;
        else this.state.pathIndex++;
        this.state.rewards = null;
        this.state.phase = 'map';
        const depleted = this.scenario.battleResource !== 'stamina' && this.state.supplies === 0;
        if (depleted) this.fail('节点奖励处理后，物资仍为 0。');
        return this.feedback.result(
            true,
            depleted ? '物资耗尽，教学探索重置。' : '节点完成，返回路线图。'
        );
    }
}
