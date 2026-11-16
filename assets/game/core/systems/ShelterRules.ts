import { CardSet } from '../content/ContentRegistry';
import { GameScenario } from '../content/GameScenario';
import { ActionResult } from '../RulesTypes';
import { RuleFeedback, RuleState } from './RuleContext';
import { mapClearMilestone } from '../content/JournalCatalog';
import { JournalRules } from './JournalRules';
export class ShelterRules {
    constructor(
        private readonly state: RuleState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly scenario: GameScenario,
        private readonly journal: JournalRules
    ) {}
    returnToShelter(): void {
        if (
            this.state.phase !== 'map' ||
            !this.state.route ||
            this.state.pathIndex < this.scenario.routes[this.state.route].length
        )
            return;
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
        };
        this.state.critical = false;
        this.state.phase = 'shelter';
        this.state.day++;
        this.journal.record(mapClearMilestone(this.scenario.id));
        if (this.journal.current) this.state.phase = 'journal';
        this.feedback.log('返回避难所，带回物品已入库，感染临界已解除。');
        this.state.revision++;
    }
    repairAtShelter(): ActionResult {
        const s = this.state.settlement;
        if (this.state.phase !== 'shelter') return this.feedback.result(false, '当前不在避难所。');
        if (this.state.armor === 10)
            return this.feedback.result(false, '护甲已满，无需支付修复费用。');
        const cost = s?.repairCost ?? (this.state.critical ? 2 : 1);
        if (this.state.supplies < cost)
            return this.feedback.result(false, '物资不足以支付修复费用。');
        this.state.supplies -= cost;
        if (s) {
            s.repairSpent = cost;
            s.repaired = true;
        }
        this.state.armor = 10;
        this.state.critical = false;
        this.feedback.log(`支付 ${cost} 点物资，护甲完全修复。`);
        return this.feedback.result(true, '护甲已恢复至 10。');
    }
}
