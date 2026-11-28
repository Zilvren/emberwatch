import { CardSet } from '../content/ContentRegistry';
import { LABYRINTH_SPARE_PARTS } from '../content/CardCatalog';
import { fistFinisherTier } from '../content/FistCards';
import { ActionResult, CardKind, Rewards } from '../RulesTypes';
import { InventoryRules } from './InventoryRules';
import { RuleFeedback, RewardState, completeExplorationNode } from './RuleContext';
import { GameScenario, nodeDefinition, TUTORIAL_SCENARIO } from '../content/GameScenario';
import { Random } from '../Random';

export const BONUS_ROOM_REWARD_CHANCE = 30;

export class RewardRules {
    constructor(
        private readonly state: RewardState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly inventory: InventoryRules,
        private readonly fail: (reason: string) => void,
        private readonly scenario: GameScenario = TUTORIAL_SCENARIO,
        private readonly random?: Random
    ) {}
    collectFieldSupplies(source: string, amount: number, discoveries = 0): void {
        this.state.supplies += amount;
        const pool = this.state.discoveryPool ?? [];
        const node = nodeDefinition(this.scenario, source, this.state.expeditionMap);
        if (this.state.expeditionMap?.version === 2) {
            const nextCards = this.rollBonus() ? this.fieldDiscoveries(3) : [];
            this.offerFieldCards(source, amount, { cards: this.drawStock(true), nextCards });
            return;
        }
        const cards = this.scenario.labyrinth && node?.type === 'scavenge' && node.supplyCard
            ? this.drawStock(false)
            : this.scenario.labyrinth && discoveries && pool.length ? this.fieldDiscoveries(discoveries) : [];
        this.offerFieldCards(source, amount, { cards });
    }
    collectBattleRewards(source: string, amount: number, count: number, unlockedHere: readonly CardKind[]): void {
        if (this.scenario.fieldDeck && !this.scenario.labyrinth) {
            this.collectFieldSupplies(source, amount);
            return;
        }
        const pool = this.scenario.labyrinth ? this.state.discoveryPool ?? [] : this.content.rewardPool;
        const dualRewards = this.state.expeditionMap?.version === 2;
        const offer = this.battleOffer(pool, dualRewards ? Math.max(1, count) : count, unlockedHere);
        if (this.scenario.labyrinth) {
            this.state.supplies += amount;
            this.offerFieldCards(source, amount, {
                ...offer,
                ...(dualRewards && this.rollBonus() ? { nextCards: this.drawStock(true) } : {}),
            });
        } else {
            this.state.phase = 'rewards';
            this.state.rewards = { source, supplies: amount, supplyTaken: false, cardTaken: false, ...offer };
        }
    }
    private rollBonus(): boolean {
        return this.random!.int(1, 100) <= BONUS_ROOM_REWARD_CHANCE;
    }
    private drawStock(guaranteed: boolean): CardKind[] {
        const stock = this.random!.weightedSample(this.content.supplyPool, (kind) => this.content.rewardWeights[kind], 1);
        return stock.length || !guaranteed ? stock : [LABYRINTH_SPARE_PARTS];
    }
    private fieldDiscoveries(count: number): CardKind[] {
        const pool = (this.state.discoveryPool ?? []).filter((kind) => !this.content.cards[kind].fist);
        return this.random!.shuffle(pool).slice(0, count);
    }
    private battleOffer(
        pool: readonly CardKind[],
        count: number,
        unlockedHere: readonly CardKind[]
    ): Pick<Rewards, 'cards' | 'guaranteedFinisher'> {
        const tier = (kind: CardKind) => fistFinisherTier(this.content.cards[kind]);
        const highest = Math.max(0, ...unlockedHere.map(tier));
        const tied = unlockedHere.filter((kind) => tier(kind) === highest);
        const guaranteedFinisher = tied.length === 1 ? tied[0]
            : tied.length ? tied[this.random!.int(0, tied.length - 1)] : undefined;
        const available = [...new Set([...pool, ...(this.state.fistUnlocks ?? [])])]
            .filter((kind) => unlockedHere.indexOf(kind) < 0);
        const slots = Math.max(0, count - Number(!!guaranteedFinisher));
        const boosts = this.state.synthesisRewardBoosts ?? {};
        const cards = this.scenario.labyrinth
            ? slots ? this.random!.shuffle(available).slice(0, slots) : []
            : this.random!.weightedSample(available,
                (kind) => (this.content.rewardWeights[kind] ?? 1) * (boosts[kind] ?? 1), slots);
        if (guaranteedFinisher) cards.unshift(guaranteedFinisher);
        return { cards, ...(guaranteedFinisher ? { guaranteedFinisher } : {}) };
    }
    private offerFieldCards(
        source: string, amount: number, offer: Pick<Rewards, 'cards' | 'guaranteedFinisher' | 'nextCards'>
    ): void {
        if (offer.cards.length) {
            this.state.rewards = {
                source, supplies: amount, cards: offer.cards,
                ...(offer.guaranteedFinisher ? { guaranteedFinisher: offer.guaranteedFinisher } : {}),
                ...(offer.nextCards?.length ? { nextCards: offer.nextCards } : {}),
                supplyTaken: true, cardTaken: false, discovery: true,
            };
            this.state.phase = 'rewards';
        } else completeExplorationNode(this.state, source, this.scenario.fixedNodeId);
    }
    discover(kind: string | null): ActionResult {
        const reward = this.state.rewards;
        if (this.state.phase !== 'rewards' || !reward?.discovery ||
            (kind !== null && reward.cards.indexOf(kind) < 0))
            return this.feedback.result(false, '这次发现已处理或不包含该牌。');
        const map = this.state.expeditionMap;
        if (kind === null && map) {
            map.deferredRewards = reward;
            this.state.rewards = null;
            completeExplorationNode(this.state, reward.source, this.scenario.fixedNodeId);
            return this.feedback.result(true, '奖励暂留在此处。点击当前地点继续选择。');
        }
        let message = '已略过奖励。';
        if (kind !== null) {
            const card = this.content.cards[kind];
            const blocked = this.inventory.rewardCardBlocked(kind);
            if (blocked) return this.feedback.result(false, blocked);
            const zone = this.inventory.rewardZone(kind);
            this.inventory.addDiscovery(kind, zone);
            message = card.role !== 'supply' ? `已收下${card.name}，下场战斗可抽取。` :
                zone === 'base' ? `${card.name}已放入行囊，成功返营后入库。` :
                    `${card.name}已暂存，返营前需腾出行囊空间。`;
        }
        if (reward.nextCards?.length) {
            this.offerFieldCards(reward.source, reward.supplies, {
                cards: reward.nextCards,
                guaranteedFinisher: reward.nextCards[0] === reward.guaranteedFinisher ? reward.guaranteedFinisher : undefined,
            });
            return this.feedback.result(true, message + '还有一份卡牌奖励。');
        }
        this.state.rewards = null;
        completeExplorationNode(this.state, reward.source, this.scenario.fixedNodeId);
        return this.feedback.result(true, message);
    }
    switchRoomReward(): ActionResult {
        const reward = this.state.rewards;
        if (this.state.phase !== 'rewards' || !reward?.nextCards?.length)
            return this.feedback.result(false, '当前只有一类卡牌奖励。');
        const current = reward.cards;
        reward.cards = reward.nextCards;
        reward.nextCards = current;
        return this.feedback.result(true, '');
    }
    claimSupplies(): ActionResult {
        const r = this.state.rewards;
        if (this.state.phase !== 'rewards' || !r || r.supplyTaken)
            return this.feedback.result(false, '没有可领取的物资。');
        const amount = r.supplies;
        this.state.supplies += amount;
        r.supplyTaken = true;
        return this.feedback.result(true, `领取 ${amount} 点物资。`);
    }
    claimCard(index: number): ActionResult {
        const r = this.state.rewards;
        if (this.state.phase !== 'rewards' || !r || r.discovery || r.cardTaken || !r.cards[index])
            return this.feedback.result(false, '卡牌奖励已处理。');
        const kind = r.cards[index];
        const blocked = this.inventory.rewardCardBlocked(kind);
        if (blocked) return this.feedback.result(false, blocked);
        const zone = this.inventory.rewardZone(kind);
        this.inventory.addDiscovery(kind, zone);
        r.cardTaken = true;
        const destination =
            zone === 'overflow'
                ? '临时溢出区'
                : this.content.cards[kind].role === 'supply'
                  ? '行囊'
                  : '本局卡组';
        return this.feedback.result(true, `卡牌已放入${destination}。`);
    }
    finishRewards(): ActionResult {
        const r = this.state.rewards;
        if (this.state.phase !== 'rewards' || !r)
            return this.feedback.result(false, '当前没有待处理奖励。');
        if (r.discovery) return this.discover(null);
        completeExplorationNode(this.state, r.source, this.scenario.fixedNodeId);
        this.state.rewards = null;
        const depleted = this.scenario.battleResource !== 'stamina' && this.state.supplies === 0;
        if (depleted) this.fail('节点奖励处理后，物资仍为 0。');
        return this.feedback.result(
            true,
            depleted ? '物资耗尽，教学探索重置。' : '节点完成，返回路线图。'
        );
    }
}
