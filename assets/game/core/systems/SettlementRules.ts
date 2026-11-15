import { CardSet } from '../content/ContentRegistry';
import { GameScenario } from '../content/GameScenario';
import { ActionResult } from '../RulesTypes';
import { RuleFeedback, RuleState } from './RuleContext';
export class SettlementRules {
    constructor(
        private readonly state: RuleState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly scenario: GameScenario
    ) {}
    returnToShelter(): void {
        const lost = this.state.cards
            .filter((c) => c.zone === 'overflow')
            .map((c) => this.content.cards[c.kind].name);
        this.state.cards = this.state.cards.filter((c) => c.zone === 'base');
        this.state.battle = null;
        this.state.settlement = {
            returnedSupplies: this.state.supplies,
            returnedCards: this.state.cards.length,
            lostOverflow: lost,
            wasCritical: this.state.critical,
            repairCost: this.state.armor === 10 ? 0 : this.state.critical ? 2 : 1,
            repaired: false,
            repairSpent: 0,
            dailySpent: 0,
            dailyShortfall: 0,
        };
        this.state.critical = false;
        this.state.phase = 'shelter';
        this.feedback.log('返回避难所，带回物品已入库，感染临界已解除。');
        this.state.revision++;
    }
    repairAtShelter(confirmed = false): ActionResult {
        const s = this.state.settlement;
        if (this.state.phase !== 'shelter' || !s)
            return this.feedback.result(false, '当前不在避难所。');
        if (this.state.armor === 10)
            return this.feedback.result(false, '护甲已满，无需支付修复费用。');
        if (this.state.supplies < s.repairCost)
            return this.feedback.result(false, '物资不足以支付修复费用。');
        if (this.state.supplies - s.repairCost < 1 && !confirmed)
            return this.feedback.result(false, '修复后将不足以支付每日消耗。仍要修复吗？', true);
        this.state.supplies -= s.repairCost;
        s.repairSpent = s.repairCost;
        s.repaired = true;
        this.state.armor = 10;
        this.feedback.log(`支付 ${s.repairCost} 点物资，护甲完全修复。每日消耗尚未扣除。`);
        return this.feedback.result(true, '护甲已恢复至 10。每日物资将在结束结算时扣除。');
    }
    finishDay(): ActionResult {
        const s = this.state.settlement;
        if (this.state.phase !== 'shelter' || !s)
            return this.feedback.result(false, '请先回到避难所。');
        s.dailySpent = Math.min(1, this.state.supplies);
        s.dailyShortfall = 1 - s.dailySpent;
        this.state.supplies -= s.dailySpent;
        this.feedback.log(
            s.dailyShortfall
                ? '结算最后：每日需求 1，实际支付 0，缺口 1。'
                : '结算最后：扣除每日生存物资 1。'
        );
        this.state.day = this.scenario.completionDay;
        this.state.phase = 'day2';
        return this.feedback.result(true, '第 2 天日志已解锁，教学原型结束。');
    }
}
