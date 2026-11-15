import { CardSet } from '../content/ContentRegistry';
import { GameScenario } from '../content/GameScenario';
import { Random } from '../Random';
import { ActionResult, NODE_NAMES, NodeKind, Route } from '../RulesTypes';
import { CombatRules } from './CombatRules';
import { InventoryRules } from './InventoryRules';
import { RuleFeedback, RuleState } from './RuleContext';
import { SettlementRules } from './SettlementRules';
import { EntryTierId, entryTier, affordableEntryTier } from '../content/EntryTiers';
export class ExplorationRules {
    constructor(
        private readonly state: RuleState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly inventory: InventoryRules,
        private readonly combat: CombatRules,
        private readonly settlement: SettlementRules,
        private readonly random: Random,
        private readonly scenario: GameScenario,
        private readonly fail: (reason: string) => void
    ) {}
    get currentNode(): NodeKind | 'choice' | 'return' {
        if (!this.state.fixedDone) return 'fixed';
        if (!this.state.route) return 'choice';
        return this.scenario.routes[this.state.route][this.state.pathIndex] ?? 'return';
    }
    start(tierId?: EntryTierId): ActionResult {
        if (this.state.phase !== 'journal') return this.feedback.result(false, '当前不能出发。');
        if (this.scenario.battleResource === 'stamina') {
            const tier = entryTier(tierId ?? affordableEntryTier(this.state.supplies));
            if (!tier) return this.feedback.result(false, '进入档位不存在。');
            if (this.state.supplies < tier.cost)
                return this.feedback.result(false, '物资不足以支付该档位入场费。');
            this.inventory.spend(tier.cost);
            this.state.entryTier = tier.id;
            this.feedback.log(
                `${tier.name}档出发：支付 ${tier.cost} 物资，每回合体力 ${tier.stamina}。`
            );
        }
        this.state.phase = 'map';
        return this.feedback.result(
            true,
            this.scenario.battleResource === 'stamina'
                ? '探索开始。战斗费用消耗体力，物资留作避难所储备。'
                : '教学探索开始。完成补给站后选择路线。'
        );
    }
    chooseRoute(route: Route): ActionResult {
        if (this.state.phase !== 'map' || this.currentNode !== 'choice')
            return this.feedback.result(false, '请先完成固定搜刮。');
        this.state.route = route;
        this.feedback.log(
            `选择路线 ${route}：${route === 'A' ? '先战斗，后搜刮' : '先搜刮，后战斗'}。`
        );
        return this.feedback.result(true, `已选择路线 ${route}。`);
    }
    enterNode(): ActionResult {
        if (this.state.phase !== 'map') return this.feedback.result(false, '请先完成当前事件。');
        const node = this.currentNode;
        if (node === 'choice') return this.feedback.result(false, '选择一条路线。');
        if (node === 'return') return this.feedback.result(false, '正在返回避难所。');
        if (node === 'fixed' || node === 'scavenge') {
            const fee = this.scenario.scavengeFees?.[node] ?? (node === 'fixed' ? 2 : 3);
            if (this.state.supplies < fee)
                return this.feedback.result(
                    false,
                    `进入需要 ${fee} 点物资，目前只有 ${this.state.supplies} 点。可以重新开始教学。`
                );
            this.inventory.spend(fee);
            this.state.phase = 'rewards';
            this.state.rewards = {
                source: node,
                supplies: node === 'fixed' ? 4 : this.random.int(4, 6),
                cards: [
                    node === 'fixed'
                        ? this.content.catalog.fixedReward
                        : this.content.rewardPool[
                              this.random.int(0, this.content.rewardPool.length - 1)
                          ],
                ],
                supplyTaken: false,
                cardTaken: false,
            };
            this.feedback.log(`${NODE_NAMES[node]}：支付 ${fee} 点物资。奖励需要主动领取。`);
        } else if (node === 'rest') {
            this.state.phase = 'rest';
            const restored = this.state.critical ? 0 : Math.min(2, 10 - this.state.armor);
            this.state.armor += restored;
            this.feedback.log(
                this.state.critical
                    ? '感染临界，营地无法恢复护甲。'
                    : `进入营地，恢复 ${restored} 点护甲。`
            );
        } else this.combat.startBattle(node);
        return this.feedback.result(true, `进入${NODE_NAMES[node]}。`);
    }
    finishRest(): ActionResult {
        if (this.state.phase !== 'rest') return this.feedback.result(false, '当前不在营地。');
        if (
            !this.inventory.usableCards.some(
                (c) =>
                    this.content.cards[c.kind].effect.type === 'damage' ||
                    (this.content.cards[c.kind].effect.type === 'equip' &&
                        this.content.cards[this.content.cards[c.kind].effect.generatedCard!].effect
                            .type === 'damage')
            )
        )
            return this.feedback.result(false, '至少选择一张能够造成伤害的牌再出发。');
        this.state.visited.push('rest');
        this.state.pathIndex++;
        this.state.phase = 'map';
        if (this.scenario.battleResource !== 'stamina' && this.state.supplies === 0)
            this.fail('休整结束时物资为 0。');
        return this.feedback.result(true, '休整结束。');
    }
    advanceTime(seconds: number): void {
        if (this.state.phase !== 'map' || this.currentNode !== 'return') return;
        this.state.returnElapsed += seconds;
        if (this.state.returnElapsed >= 0.8) this.settlement.returnToShelter();
    }
}
