import { CardSet } from '../content/ContentRegistry';
import { GameScenario } from '../content/GameScenario';
import { ActionResult } from '../RulesTypes';
import { RuleFeedback, RuleState } from './RuleContext';
export class SettlementRules {
    constructor(
        private readonly state: RuleState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly scenario: GameScenario,
        private readonly startNextRun: () => void
    ) {}
    returnToShelter(): void {
        const lost = this.state.cards
            .filter((c) => c.zone === 'overflow')
            .map((c) => this.content.cards[c.kind].name);
        this.state.cards = this.state.cards.filter((c) => c.zone === 'base');
        this.state.battle = null;
        if (this.scenario.runDeck) {
            this.state.cards = this.state.cards.filter(
                (card) => this.content.cards[card.kind].role === 'supply'
            );
            const stored = this.state.storedSupplies ?? (this.state.storedSupplies = {});
            for (const { kind } of this.state.cards) stored[kind] = (stored[kind] ?? 0) + 1;
        }
        this.state.settlement = {
            returnedSupplies: this.state.supplies,
            returnedCards: this.state.cards.length,
            lostOverflow: lost,
            wasCritical: this.state.critical,
            repairCost: this.scenario.runDeck ? 0 : this.state.armor === 10 ? 0 : this.state.critical ? 2 : 1,
            repaired: false,
            repairSpent: 0,
            dailySpent: 0,
            dailyShortfall: 0,
        };
        if (this.scenario.runDeck) this.state.cards = [];
        this.state.critical = false;
        this.state.phase = 'shelter';
        this.feedback.log('返回避难所，带回物品已入库，感染临界已解除。');
        this.state.revision++;
    }
    redeemAllSupplies(): ActionResult {
        if (!this.scenario.runDeck || (this.state.phase !== 'shelter' && this.state.phase !== 'journal'))
            return this.feedback.result(false, '只能在新版避难所兑换物资卡。');
        const stored = this.state.storedSupplies ?? {};
        let cards = 0;
        let value = 0;
        for (const kind of Object.keys(stored)) {
            const count = stored[kind];
            const definition = this.content.cards[kind];
            if (!definition || definition.role !== 'supply' || count <= 0) continue;
            cards += count;
            value += count * (definition.supplyValue ?? 1);
        }
        if (!cards) return this.feedback.result(false, '仓库里没有可兑换的物资卡。');
        this.state.supplies += value;
        this.state.storedSupplies = {};
        this.feedback.log(`兑换 ${cards} 张物资卡，获得 ${value} 点物资。`);
        return this.feedback.result(true, `已兑换 ${cards} 张物资卡，获得 ${value} 点物资。`);
    }
    repairAtShelter(confirmed = false): ActionResult {
        const s = this.state.settlement;
        if (this.state.phase !== 'shelter' || !s)
            return this.feedback.result(false, '当前不在避难所。');
        if (this.scenario.runDeck)
            return this.feedback.result(false, '新版避难所不修复护甲，下一局会重新开始。');
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
        if (this.scenario.runDeck) {
            this.startNextRun();
            return this.feedback.result(true, '本局已结束，开始下一局探索。');
        }
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
