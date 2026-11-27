import { CardSet } from '../content/ContentRegistry';
import { activeDiscoveryCards, generatedCards } from '../content/CardCatalog';
import { ASHEN_LABYRINTH_SCENARIO, GameScenario, currentNodeId, hasId, nodeTitle } from '../content/GameScenario';
import { generateAshenLabyrinthMap, nextMapNodes } from '../content/ExpeditionMap';
import { Random } from '../Random';
import { ActionResult, NodeKind, Route } from '../RulesTypes';
import { CombatRules } from './CombatRules';
import { InventoryRules } from './InventoryRules';
import { RuleFeedback, ExplorationState, completeExplorationNode } from './RuleContext';
import { ShelterRules } from './ShelterRules';
import { EntryTierId, entryTier, affordableEntryTier } from '../content/EntryTiers';
export class ExplorationRules {
    constructor(
        private readonly state: ExplorationState,
        private readonly feedback: RuleFeedback,
        private readonly content: CardSet,
        private readonly inventory: InventoryRules,
        private readonly combat: CombatRules,
        private readonly shelter: ShelterRules,
        private readonly random: Random,
        private readonly scenario: GameScenario,
        private readonly fail: (reason: string) => void,
        private readonly collectSupplies: (source: string, amount: number, discoveries?: number) => void
    ) {}
    private randomReward(pool: readonly string[]): string {
        const boosts = this.state.synthesisRewardBoosts ?? {};
        return this.random.weightedSample(
            pool,
            (kind) => (this.content.rewardWeights[kind] ?? 1) * (boosts[kind] ?? 1),
            1
        )[0] ?? pool[0];
    }
    get currentNode(): NodeKind | 'choice' | 'return' {
        return currentNodeId(this.state, this.scenario);
    }
    start(tierId?: EntryTierId): ActionResult {
        if (this.state.phase !== 'journal' && this.state.phase !== 'shelter')
            return this.feedback.result(false, '当前不能出发。');
        const usesStamina = this.scenario.battleResource === 'stamina';
        const tier = usesStamina ? entryTier(tierId ?? affordableEntryTier(this.state.supplies)) : null;
        if (usesStamina && !tier) return this.feedback.result(false, '进入档位不存在。');
        if (tier && this.state.supplies < tier.cost)
            return this.feedback.result(false, '物资不足以支付该档位入场费。');
        const map = this.scenario.id === ASHEN_LABYRINTH_SCENARIO.id
            ? generateAshenLabyrinthMap(this.state.seed, this.state.day, this.scenario.nodes)
            : null;
        if (tier) {
            this.inventory.spend(tier.cost);
            this.state.entryTier = tier.id;
            this.feedback.log(
                `${tier.name}档出发：支付 ${tier.cost} 物资，每回合体力 ${tier.stamina}。`
            );
        }
        this.state.route = null;
        this.state.expeditionMap = map;
        this.state.fixedDone = false;
        this.state.pathIndex = 0;
        this.state.visited = [];
        this.state.battle = null;
        this.state.rewards = null;
        this.state.discoveryPool = this.scenario.labyrinth
            ? activeDiscoveryCards(this.content.catalog.labyrinth!)
            : undefined;
        this.state.settlement = null;
        this.state.failureReason = '';
        this.state.returnElapsed = 0;
        this.state.phase = 'map';
        return this.feedback.result(
            true,
            this.scenario.battleResource === 'stamina'
                ? '探索开始。战斗费用消耗体力，物资留作避难所储备。'
                : '教学探索开始。完成补给站后选择路线。'
        );
    }
    chooseRoute(route: Route): ActionResult {
        if (this.state.expeditionMap)
            return this.feedback.result(false, '请选择地图上相连的下一个地点。');
        if (this.state.phase !== 'map' || this.currentNode !== 'choice')
            return this.feedback.result(false, '请先完成固定搜刮。');
        if (!hasId(this.scenario.routes, route)) return this.feedback.result(false, '路线不存在。');
        this.state.route = route;
        this.feedback.log(
            `选择路线 ${route}：${this.scenario.routeDescriptions?.[route] ?? this.scenario.routes[route].map((id) => nodeTitle(this.scenario, id)).join(' → ')}。`
        );
        return this.feedback.result(true, `已选择路线 ${route}。`);
    }
    enterNode(target?: NodeKind): ActionResult {
        if (this.state.phase !== 'map') return this.feedback.result(false, '请先完成当前事件。');
        const map = this.state.expeditionMap;
        const node = target ?? this.currentNode;
        if (node === 'choice') return this.feedback.result(false, '选择一条路线。');
        if (node === 'return') return this.feedback.result(false, '正在返回避难所。');
        const reachable = map
            ? nextMapNodes(map, this.state.visited[this.state.visited.length - 1])
            : [this.currentNode];
        if (reachable.indexOf(node) < 0) return this.feedback.result(false, '当前位置无法前往该地点。');
        const definition = this.scenario.nodes[node];
        if (!definition) return this.feedback.result(false, '地点配置不存在。');
        if (definition.type === 'scavenge') {
            const fee = this.scenario.scavengeFees?.[node] ?? definition.cost;
            if (this.state.supplies < fee)
                return this.feedback.result(
                    false,
                    `进入需要 ${fee} 点物资，目前只有 ${this.state.supplies} 点。` +
                        (map ? '' : '可以重新开始教学。')
                );
            if (map) map.activeNode = node;
            this.inventory.spend(fee);
            const supplies =
                definition.supplies[0] === definition.supplies[1]
                    ? definition.supplies[0]
                    : this.random.int(definition.supplies[0], definition.supplies[1]);
            if (this.scenario.fieldDeck) {
                this.collectSupplies(node, supplies, definition.discover ? 3 : 0);
                return this.feedback.result(true, `${definition.title} · 找到 ${supplies} 物资`);
            }
            this.state.phase = 'rewards';
            const pool = this.scenario.runDeck
                ? [...this.content.supplyPool, ...this.content.rewardPool]
                : this.content.rewardPool;
            this.state.rewards = {
                source: node,
                supplies,
                cards: [
                    definition.cardReward === 'fixed'
                        ? this.content.catalog.fixedReward
                        : this.randomReward(pool),
                ],
                supplyTaken: false,
                cardTaken: false,
            };
            this.feedback.log(
                `${nodeTitle(this.scenario, node)}：支付 ${fee} 点物资。奖励需要主动领取。`
            );
        } else {
            if (map) map.activeNode = node;
            if (definition.type === 'rest') {
                this.state.phase = 'rest';
                const restored = Math.min(definition.restoreHealth, 10 - this.state.health);
                this.state.health += restored;
                this.feedback.log(`进入营地，恢复 ${restored} 点血量。`);
            } else this.combat.startBattle(definition.enemyId);
        }
        return this.feedback.result(true, `进入${nodeTitle(this.scenario, node)}。`);
    }
    finishRest(): ActionResult {
        if (this.state.phase !== 'rest') return this.feedback.result(false, '当前不在营地。');
        if (
            !this.scenario.runDeck &&
            !this.inventory.usableCards.some(
                (c) =>
                    this.content.cards[c.kind].effect.type === 'damage' ||
                    (this.content.cards[c.kind].effect.type === 'equip' &&
                        generatedCards(this.content.cards[c.kind].effect).some(
                            (kind) => this.content.cards[kind].effect.type === 'damage'
                        ))
            )
        )
            return this.feedback.result(false, '至少选择一张能够造成伤害的牌再出发。');
        completeExplorationNode(this.state, this.currentNode, this.scenario.fixedNodeId);
        if (this.scenario.battleResource !== 'stamina' && this.state.supplies === 0)
            this.fail('休整结束时物资为 0。');
        return this.feedback.result(true, '休整结束。');
    }
    advanceTime(seconds: number): void {
        if (this.state.phase !== 'map' || this.currentNode !== 'return') return;
        this.state.returnElapsed += seconds;
        if (this.state.returnElapsed >= 0.8) this.shelter.returnToShelter();
    }
}
