import { CardKind } from '../content/CardCatalog';
import { CardSet } from '../content/ContentRegistry';
import { ActionResult, OwnedCard } from '../RulesTypes';
import { RuleFeedback, RuleState } from './RuleContext';
export class InventoryRules {
    constructor(
        private readonly state: RuleState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly newId: (prefix: string) => string
    ) {}
    owned(kind: CardKind, found = false, zone: 'base' | 'overflow' = 'base'): OwnedCard {
        return { id: this.newId('card'), kind, found, zone, selected: kind !== 'cash' };
    }
    get baseWeight(): number {
        return (
            this.state.supplies +
            this.state.cards
                .filter((c) => c.zone === 'base')
                .reduce((n, c) => n + this.content.cards[c.kind].weight, 0)
        );
    }
    get overflowWeight(): number {
        return this.state.cards
            .filter((c) => c.zone === 'overflow')
            .reduce((n, c) => n + this.content.cards[c.kind].weight, 0);
    }
    get usableCards(): OwnedCard[] {
        return this.state.cards.filter((c) => c.zone === 'base' && c.selected && c.kind !== 'cash');
    }
    spend(amount: number): void {
        this.state.supplies -= amount;
        this.promoteOverflow();
    }
    promoteOverflow(): void {
        for (const card of this.state.cards.filter((c) => c.zone === 'overflow')) {
            if (this.baseWeight + this.content.cards[card.kind].weight > 30) break;
            card.zone = 'base';
            this.feedback.log(`${this.content.cards[card.kind].name}从溢出区转入可用卡组。`);
            if (this.state.battle && card.selected)
                this.state.battle.discard.push({
                    id: card.id,
                    kind: card.kind,
                    origin: card.id,
                    temporary: false,
                });
        }
    }
    rewardCardBlocked(kind: CardKind): string {
        if (this.baseWeight + this.content.cards[kind].weight <= 30) return '';
        return this.overflowWeight + this.content.cards[kind].weight <= 10
            ? ''
            : '基础负重和临时溢出区均不足';
    }
    discardCard(id: string): ActionResult {
        if (this.state.phase !== 'rewards' && this.state.phase !== 'rest')
            return this.feedback.result(false, '只能在奖励或休整时整理背包。');
        const index = this.state.cards.findIndex((c) => c.id === id);
        if (index < 0) return this.feedback.result(false, '卡牌不存在。');
        const card = this.state.cards[index];
        if (card.kind === 'attack' || card.kind === 'dodge')
            return this.feedback.result(false, '基础能力永久保留，可在休整时选择不带入战斗。');
        if (card.kind === 'cash' && this.state.phase !== 'rest')
            return this.feedback.result(false, '现金只能在休整节点删除。');
        this.state.cards.splice(index, 1);
        this.feedback.log(
            `永久丢弃${this.content.cards[card.kind].name}，释放 ${this.content.cards[card.kind].weight} 负重。`
        );
        this.promoteOverflow();
        return this.feedback.result(true, '卡牌已从本次探索中永久移除。');
    }
    discardSupplies(amount: number): ActionResult {
        if (this.state.phase !== 'rewards' && this.state.phase !== 'rest')
            return this.feedback.result(false, '只能在奖励或休整时丢弃物资。');
        if (!Number.isInteger(amount) || amount <= 0 || amount > this.state.supplies)
            return this.feedback.result(false, '没有足够物资可丢弃。');
        this.spend(amount);
        this.feedback.log(`丢弃 ${amount} 点物资。`);
        return this.feedback.result(true, `已释放 ${amount} 点负重。`);
    }
    toggleCard(id: string): ActionResult {
        if (this.state.phase !== 'rest')
            return this.feedback.result(false, '只有休整节点可调整出手卡组。');
        const card = this.state.cards.find((c) => c.id === id);
        if (!card || card.kind === 'cash') return this.feedback.result(false, '现金不进入战斗。');
        if (!card.selected && card.zone === 'overflow')
            return this.feedback.result(false, '临时溢出卡尚不能用于战斗。');
        card.selected = !card.selected;
        return this.feedback.result(
            true,
            card.selected ? '已加入出手卡组。' : '本次不抽取此牌，卡牌仍占负重并可带回。'
        );
    }
}
