import { CardKind, carriedWeight, isBattleCard } from '../content/CardCatalog';
import { CardSet } from '../content/ContentRegistry';
import { ActionResult, OwnedCard } from '../RulesTypes';
import { RuleFeedback, InventoryState } from './RuleContext';
import { GameScenario, TUTORIAL_SCENARIO } from '../content/GameScenario';
export class InventoryRules {
    constructor(
        private readonly state: InventoryState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly newId: (prefix: string) => string,
        private readonly scenario: GameScenario = TUTORIAL_SCENARIO
    ) {}
    owned(kind: CardKind, found = false, zone: 'base' | 'overflow' = 'base'): OwnedCard {
        const definition = this.content.cards[kind];
        return {
            id: this.newId('card'),
            kind,
            found,
            zone,
            selected: isBattleCard(definition),
            ...(definition.role === 'supply' ? { packedWeight: definition.weight } : {}),
        };
    }
    get carriedCards(): OwnedCard[] {
        return this.scenario.runDeck || this.scenario.labyrinth
            ? this.state.cards.filter((card) => this.content.cards[card.kind].role === 'supply')
            : this.state.cards;
    }
    restoreStarter(): void {
        const starter = this.scenario.labyrinth
            ? this.content.catalog.labyrinth?.starter
            : this.content.catalog.expedition?.starter;
        if (this.scenario.fieldDeck && starter) {
            this.state.cards = [];
            for (const kind of Object.keys(starter))
                for (let i = 0; i < starter[kind]; i++) this.state.cards.push(this.owned(kind));
        } else {
            this.state.cards = this.content.initialDeck
                .filter((kind) => !this.scenario.runDeck || isBattleCard(this.content.cards[kind]))
                .map((kind) => this.owned(kind));
        }
    }
    private boostCompanionMaterial(kind: CardKind): void {
        const boostedRecipes = this.state.synthesisMaterialBoostedRecipes ??
            (this.state.synthesisMaterialBoostedRecipes = []);
        const boosts = this.state.synthesisRewardBoosts ??
            (this.state.synthesisRewardBoosts = {});
        for (const recipe of this.content.catalog.recipes) {
            if (boostedRecipes.indexOf(recipe.id) >= 0 ||
                !recipe.materials.some((material) => material.card === kind)) continue;
            const companions = recipe.materials.filter(
                (material) => material.card !== kind && this.content.cards[material.card]?.reward
            );
            if (!companions.length) continue;
            for (const material of companions)
                boosts[material.card] = Math.max(2, boosts[material.card] ?? 1);
            boostedRecipes.push(recipe.id);
        }
    }
    addDiscovery(kind: CardKind, zone: OwnedCard['zone'] = 'base'): OwnedCard {
        delete this.state.synthesisRewardBoosts?.[kind];
        this.boostCompanionMaterial(kind);
        const card = this.owned(kind, true, zone);
        this.state.cards.push(card);
        return card;
    }

    get baseWeight(): number {
        return this.state.cards.filter(c => c.zone === 'base')
            .reduce((sum, c) => sum + carriedWeight(this.content.cards[c.kind], c.packedWeight), 0);
    }
    get overflowWeight(): number {
        return this.state.cards.filter(c => c.zone === 'overflow')
            .reduce((sum, c) => sum + carriedWeight(this.content.cards[c.kind], c.packedWeight), 0);
    }
    get usableCards(): OwnedCard[] {
        return this.state.cards.filter(
            (card) =>
                isBattleCard(this.content.cards[card.kind]) &&
                (this.scenario.runDeck || (card.zone === 'base' && card.selected))
        );
    }
    spend(amount: number): void {
        this.state.supplies -= amount;
        this.promoteOverflow();
    }
    promoteOverflow(): void {
        for (const card of this.state.cards.filter((c) => c.zone === 'overflow')) {
            if (this.baseWeight + carriedWeight(this.content.cards[card.kind], card.packedWeight) > 30) break;
            card.zone = 'base';
            if (this.state.battle && card.selected)
                this.state.battle.discard.push({
                    id: card.id,
                    kind: card.kind,
                    origin: card.id,
                    temporary: false,
                });
        }
    }
    rewardZone(kind: CardKind): OwnedCard['zone'] {
        return this.baseWeight + carriedWeight(this.content.cards[kind]) <= 30
            ? 'base'
            : 'overflow';
    }
    rewardCardBlocked(kind: CardKind): string {
        if (this.rewardZone(kind) === 'base') return '';
        return this.overflowWeight + carriedWeight(this.content.cards[kind]) <= 10
            ? ''
            : '行囊和暂存区已满';
    }
    discardCard(id: string): ActionResult {
        const index = this.state.cards.findIndex((c) => c.id === id);
        if (index < 0) return this.feedback.result(false, '卡牌不存在。');
        const card = this.state.cards[index];
        if (this.scenario.fieldDeck && !(this.scenario.labyrinth && this.content.cards[card.kind].role === 'supply'))
            return this.feedback.result(false, '探索中已持有的牌会随牌组一起使用。');
        if (this.state.phase !== 'rewards' && this.state.phase !== 'rest')
            return this.feedback.result(false, '只能在奖励或休整时整理背包。');
        if (this.scenario.runDeck && this.content.cards[card.kind].role !== 'supply')
            return this.feedback.result(false, '行囊只整理物资卡。');
        if (card.kind === 'attack' || card.kind === 'dodge')
            return this.feedback.result(false, '本次教学可在休整时调整基础牌的出场状态。');
        if (card.kind === 'cash' && this.state.phase !== 'rest')
            return this.feedback.result(false, '现金只能在休整节点删除。');
        this.state.cards.splice(index, 1);
        this.promoteOverflow();
        return this.feedback.result(true, '卡牌已从本次探索中永久移除。');
    }
    discardSupplies(_amount: number): ActionResult {
        return this.feedback.result(false, '物资点直接计入营地储备。');
    }
    toggleCard(id: string): ActionResult {
        if (this.scenario.runDeck || this.scenario.fieldDeck)
            return this.feedback.result(false, '探索牌组中的每张牌都会参与抽取。');
        if (this.state.phase !== 'rest')
            return this.feedback.result(false, '只有休整节点可调整出手卡组。');
        const card = this.state.cards.find((c) => c.id === id);
        if (!card || !isBattleCard(this.content.cards[card.kind]))
            return this.feedback.result(false, '这张卡无法编入战斗牌组。');
        if (!card.selected && card.zone === 'overflow')
            return this.feedback.result(false, '临时溢出卡尚不能用于战斗。');
        card.selected = !card.selected;
        return this.feedback.result(
            true,
            card.selected ? '已加入出手卡组。' : '本次不抽取此牌，可以带回营地。'
        );
    }
}
