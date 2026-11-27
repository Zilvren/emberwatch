import { CardSet } from '../content/ContentRegistry';
import { GameScenario, currentNodeId } from '../content/GameScenario';
import { ActionResult } from '../RulesTypes';
import { RuleFeedback, ShelterState } from './RuleContext';
import { mapClearMilestone } from '../content/JournalCatalog';
import { JournalRules } from './JournalRules';
export class ShelterRules {
    constructor(
        private readonly state: ShelterState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly scenario: GameScenario,
        private readonly journal: JournalRules,
        private readonly restoreStarter: () => void
    ) {}
    returnToShelter(): void {
        if (
            this.state.phase !== 'map' ||
            currentNodeId(this.state, this.scenario) !== 'return'
        )
            return;
        const lost = this.state.cards
            .filter((c) => c.zone === 'overflow')
            .map((c) => this.content.cards[c.kind].name);
        this.state.cards = this.state.cards.filter((c) => c.zone === 'base');
        const discoveries = this.state.cards.filter((card) => card.found).length;
        if (this.scenario.runDeck) {
            this.state.cards = this.state.cards.filter(
                (card) => this.content.cards[card.kind].role === 'supply'
            );
            const stored = this.state.storedSupplies ?? (this.state.storedSupplies = {});
            for (const { kind } of this.state.cards) stored[kind] = (stored[kind] ?? 0) + 1;
        } else if (this.scenario.fieldDeck) {
            this.restoreStarter();
        }
        this.state.battle = null;
        this.state.settlement = {
            returnedSupplies: this.state.supplies,
            returnedCards: this.state.cards.length,
            ...(this.scenario.fieldDeck ? { discoveredCards: discoveries } : {}),
            lostOverflow: lost,
            treatmentCost: this.scenario.runDeck || this.state.health === 10 ? 0 : 1,
            treated: false,
            treatmentSpent: 0,
        };
        if (this.scenario.runDeck) this.state.cards = [];
        this.state.phase = 'shelter';
        this.state.day++;
        this.journal.record(mapClearMilestone(this.scenario.id));
        if (this.journal.current) this.state.phase = 'journal';
        this.feedback.log(
            this.scenario.fieldDeck
                ? `返回避难所，本次发现 ${discoveries} 张牌。下次从基础牌组出发。`
                : '返回避难所，带回物品已入库。'
        );
        this.state.revision++;
    }
    healAtShelter(): ActionResult {
        const s = this.state.settlement;
        if (this.state.phase !== 'shelter') return this.feedback.result(false, '当前不在避难所。');
        if (this.scenario.runDeck)
            return this.feedback.result(false, '下一局出发时会恢复初始血量。');
        if (this.state.health === 10)
            return this.feedback.result(false, '血量已满，无需支付治疗费用。');
        const cost = s?.treatmentCost ?? 1;
        if (this.state.supplies < cost)
            return this.feedback.result(false, '物资不足以支付治疗费用。');
        this.state.supplies -= cost;
        if (s) {
            s.treatmentSpent = cost;
            s.treated = true;
        }
        this.state.health = 10;
        this.feedback.log(`支付 ${cost} 点物资，血量完全恢复。`);
        return this.feedback.result(true, '血量已恢复至 10。');
    }
    redeemAllSupplies(): ActionResult {
        if (!this.scenario.runDeck || (this.state.phase !== 'shelter' && this.state.phase !== 'journal'))
            return this.feedback.result(false, '请回避难所兑换物资卡。');
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
        const message = '已兑换 ' + cards + ' 张物资卡，获得 ' + value + ' 点物资。';
        this.feedback.log(message);
        return this.feedback.result(true, message);
    }
}
