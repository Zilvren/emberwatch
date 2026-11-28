import { CardSet } from '../content/ContentRegistry';
import type { CardRarity } from '../content/CardCatalog';
import { ASHEN_MAP_LAST_LAYER } from '../content/ExpeditionMap';
import { fistFinisherTier } from '../content/FistCards';
import { ActionResult, CardKind, Rewards } from '../RulesTypes';
import { InventoryRules } from './InventoryRules';
import { RuleFeedback, RewardState, completeExplorationNode } from './RuleContext';
import { GameScenario, TUTORIAL_SCENARIO } from '../content/GameScenario';
import { Random } from '../Random';

const STANDARD_GRADES = ['common', 'rare', 'epic'] as const;
const LABYRINTH_REWARDS = {
    battle: { legendary: [0.014, 0.053], common: [74, 56], rare: [22, 29], epic: [4, 15] },
    supply: { legendary: [0.016, 0.070], common: [71, 60], rare: [23, 26], epic: [6, 14] },
} as const;

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
        const node = this.scenario.nodes[source];
        let cards: string[] = [];
        if (this.scenario.labyrinth && node?.type === 'scavenge' && node.supplyCard) {
            cards = this.labyrinthOffer(source, this.content.supplyPool, 1, 'supply');
        } else if (this.scenario.labyrinth && discoveries && pool.length) {
            cards = this.labyrinthOffer(source, pool.filter(kind => !this.content.cards[kind].fist), discoveries, 'battle');
        }
        this.offerFieldCards(source, amount, { cards });
    }
    collectBattleRewards(source: string, amount: number, count: number, unlockedHere: readonly CardKind[]): void {
        if (this.scenario.fieldDeck && !this.scenario.labyrinth) {
            this.collectFieldSupplies(source, amount);
            return;
        }
        const pool = this.scenario.labyrinth ? this.state.discoveryPool ?? [] : this.content.rewardPool;
        const offer = this.battleOffer(source, pool, count, unlockedHere);
        if (this.scenario.labyrinth) {
            this.state.supplies += amount;
            this.offerFieldCards(source, amount, offer);
        } else {
            this.state.phase = 'rewards';
            this.state.rewards = { source, supplies: amount, supplyTaken: false, cardTaken: false, ...offer };
        }
    }
    private battleOffer(
        source: string,
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
            ? this.labyrinthOffer(source, available, slots, 'battle', guaranteedFinisher)
            : this.random!.weightedSample(available,
                (kind) => (this.content.rewardWeights[kind] ?? 1) * (boosts[kind] ?? 1), slots);
        if (guaranteedFinisher) cards.unshift(guaranteedFinisher);
        return { cards, ...(guaranteedFinisher ? { guaranteedFinisher } : {}) };
    }
    private labyrinthOffer(
        source: string,
        pool: readonly CardKind[],
        count: number,
        type: keyof typeof LABYRINTH_REWARDS,
        guaranteed?: CardKind
    ): CardKind[] {
        if (!count || !pool.length) return [];
        const random = this.random!;
        const layer = this.state.expeditionMap?.points.find(point => point.id === source)?.layer ?? this.state.pathIndex;
        const depth = Math.min(1, layer / ASHEN_MAP_LAST_LAYER);
        const table = LABYRINTH_REWARDS[type];
        const weight = (grade: CardRarity) => {
            const [early, late] = table[grade];
            return early + (late - early) * depth;
        };
        const bands: Record<CardRarity, CardKind[]> = { common: [], rare: [], epic: [], legendary: [] };
        for (const kind of pool) bands[this.content.cards[kind].rarity ?? 'common'].push(kind);
        const cardWeight = (kind: CardKind) => this.content.rewardWeights[kind] ?? 1;
        // Decide once whether this offer contains gold, then draw within the available grades.
        const gold = bands.legendary.length && (!guaranteed || this.content.cards[guaranteed].rarity !== 'legendary') &&
            random.next() < weight('legendary')
            ? random.weightedSample(bands.legendary, cardWeight, 1)[0] : undefined;
        const cards: CardKind[] = [];
        while (cards.length < count - Number(!!gold)) {
            const [grade] = random.weightedSample(STANDARD_GRADES, grade => bands[grade].length ? weight(grade) : 0, 1);
            if (!grade) break;
            const band = bands[grade];
            const [kind] = random.weightedSample(band, cardWeight, 1);
            band.splice(band.indexOf(kind), 1);
            cards.push(kind);
        }
        if (gold) cards.splice(random.int(0, cards.length), 0, gold);
        return cards;
    }
    private offerFieldCards(source: string, amount: number, offer: Pick<Rewards, 'cards' | 'guaranteedFinisher'>): void {
        if (offer.cards.length) {
            this.state.rewards = {
                source, supplies: amount, ...offer,
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
        let message = '已略过发现。';
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
        this.state.rewards = null;
        completeExplorationNode(this.state, reward.source, this.scenario.fixedNodeId);
        return this.feedback.result(true, message);
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
