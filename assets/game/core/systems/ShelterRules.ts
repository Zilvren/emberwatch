import { CardSet } from '../content/ContentRegistry';
import { GameScenario, currentNodeId } from '../content/GameScenario';
import { ActionResult, MAX_SUPPLY_POINTS } from '../RulesTypes';
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
        const discoveries = this.state.cards.filter((card) => card.found && this.content.cards[card.kind].role !== 'supply').length;
        let returnedCards = this.state.cards.length;
        if (this.scenario.runDeck || this.scenario.labyrinth) {
            const supplies = this.state.cards.filter(
                (card) => this.content.cards[card.kind].role === 'supply'
            );
            if (supplies.length) {
                const stored = this.state.storedSupplies ?? (this.state.storedSupplies = {});
                for (const { kind } of supplies) stored[kind] = (stored[kind] ?? 0) + 1;
            }
            returnedCards = supplies.length;
        }
        if (this.scenario.fieldDeck) {
            this.restoreStarter();
            if (!this.scenario.labyrinth) returnedCards = this.state.cards.length;
        }
        this.state.battle = null;
        this.state.fistUnlocks = undefined;
        this.state.settlement = {
            returnedSupplies: this.state.supplies,
            returnedCards,
            ...(this.scenario.fieldDeck ? { discoveredCards: discoveries } : {}),
            lostOverflow: lost,
            treatmentCost: this.scenario.runDeck || this.state.health === 10 ? 0 : 1,
            treated: false,
            treatmentSpent: 0,
        };
        if (this.scenario.runDeck) this.state.cards = [];
        this.state.synthesisRewardBoosts = {};
        this.state.synthesisBoostedRecipes = [];
        this.state.synthesisMaterialBoostedRecipes = [];
        this.state.phase = 'shelter';
        this.state.day++;
        this.journal.record(mapClearMilestone(this.scenario.id));
        if (this.journal.current) this.state.phase = 'journal';
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
        return this.feedback.result(true, '血量已恢复至 10。');
    }
    redeemSupplies(kind?: string): ActionResult {
        if (!(this.scenario.runDeck || this.scenario.labyrinth) ||
            (this.state.phase !== 'shelter' && this.state.phase !== 'journal'))
            return this.feedback.result(false, '请回避难所兑换物资卡。');
        const stored = this.state.storedSupplies ?? {};
        let cards = 0;
        let value = 0;
        const kinds = kind === undefined ? Object.keys(stored) : [kind];
        for (const id of kinds) {
            const definition = this.content.cards[id];
            if (!definition || definition.role !== 'supply' || !(stored[id] > 0)) continue;
            const count = kind === undefined ? stored[id] : 1;
            cards += count;
            value += count * (definition.supplyValue ?? 1);
        }
        if (!cards) return this.feedback.result(false, '仓库里没有可兑换的物资卡。');
        if (value > MAX_SUPPLY_POINTS - this.state.supplies)
            return this.feedback.result(false, '物资点储备空间不足，请先使用物资点。');
        this.state.supplies += value;
        if (kind === undefined) this.state.storedSupplies = {};
        else if (--stored[kind] === 0) delete stored[kind];
        const item = kind === undefined ? `${cards} 张物资卡` : this.content.cards[kind].name;
        const message = `已兑换${item}，获得 ${value} 点物资。`;
        return this.feedback.result(true, message);
    }
}
