import { CardSet } from '../content/ContentRegistry';
import { GameScenario } from '../content/GameScenario';
import { countKinds, recipeAvailability } from '../content/RecipeCatalog';
import { ActionResult, CardKind, OwnedCard } from '../RulesTypes';
import { RuleFeedback, RuleState } from './RuleContext';

export class SynthesisRules {
    private previous?: { cards: OwnedCard[]; revision: number };

    constructor(
        private readonly state: RuleState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly scenario: GameScenario,
        private readonly newCard: (kind: CardKind) => OwnedCard
    ) {}

    blocked(mapUnlocked: boolean): string {
        if (this.state.phase === 'battle') return '战斗中仅可查看配方。';
        if (!this.scenario.runDeck) return '开始新探索后可使用合成。';
        if (this.state.phase === 'rest') return '';
        if (this.state.phase === 'map')
            return mapUnlocked ? '' : '解锁对应的局外遗物后可在地图上合成。';
        return '请在营地合成。';
    }

    get canUndo(): boolean {
        return this.previous?.revision === this.state.revision;
    }

    close(): void {
        this.previous = undefined;
    }

    craft(recipeId: string, mapUnlocked: boolean): ActionResult {
        const blocked = this.blocked(mapUnlocked);
        if (blocked) return this.feedback.result(false, blocked);
        const recipe = this.content.catalog.recipes?.find(({ id }) => id === recipeId);
        if (!recipe) return this.feedback.result(false, '配方不存在。');
        if (recipeAvailability(recipe, countKinds(this.state.cards)).status !== 'ready')
            return this.feedback.result(false, '本局卡组缺少所需材料。');

        const needed = new Map(recipe.materials.map(({ card, count }) => [card, count]));
        const previousCards = this.state.cards;
        const cards = previousCards.filter(({ kind }) => {
            const remaining = needed.get(kind) ?? 0;
            if (!remaining) return true;
            needed.set(kind, remaining - 1);
            return false;
        });
        for (const { card, count } of recipe.products) {
            for (let index = 0; index < count; index++) cards.push(this.newCard(card));
        }
        this.state.cards = cards;
        const products = recipe.products.map(
            ({ card, count }) => `${this.content.cards[card].name} ×${count}`
        );
        const message = `已合成 ${products.join('、')}，产物已加入本局卡组。`;
        this.feedback.log(message);
        const result = this.feedback.result(true, message);
        this.previous = { cards: previousCards, revision: this.state.revision };
        return result;
    }

    undo(mapUnlocked: boolean): ActionResult {
        const blocked = this.blocked(mapUnlocked);
        if (blocked) return this.feedback.result(false, blocked);
        if (!this.previous || !this.canUndo)
            return this.feedback.result(false, '当前没有可撤销的合成。');
        this.state.cards = this.previous.cards;
        this.close();
        const message = '已撤销最近一次合成并归还材料。';
        this.feedback.log(message);
        return this.feedback.result(true, message);
    }
}
