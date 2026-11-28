import { Node, UITransform } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { nodeDefinition, nodeTitle } from '../../core/content/GameScenario';
import { expeditionRoomId } from '../../core/content/ExpeditionMap';
import { SceneAtmosphere } from '../effects/SceneAtmosphere';
import type { UiState } from '../ui/UiState';
import type { NativeViewWriter } from '../ui/NativeViewWriter';
import { RewardChoice } from './RewardChoice';
import { RewardSelection } from './RewardSelection';
export class RewardScreenPresenter {
    constructor(
        private readonly game: GameReadModel,
        private readonly ui: UiState,
        private readonly view: NativeViewWriter
    ) {}
    fitWindow(screen: Node, width: number, height: number): void {
        screen.getComponent(UITransform)!.setContentSize(width, height);
        screen.getChildByName('World')!.getComponent(SceneAtmosphere)?.fitBackdrop(width, height);
        for (const name of ['SceneEdgeShade', 'RewardScrim'])
            screen.getChildByName(name)!.getComponent(UITransform)!.setContentSize(width, height);
    }
    render(screen: Node): void {
        const g = this.game;
        const openingDiscovery = g.battle?.discovery;
        const nodeDiscovery = !!g.rewards?.discovery;
        const choice = g.battle?.cardChoice;
        const discovery = openingDiscovery || nodeDiscovery || choice;
        const canReadDetails = !this.ui.overlay && !this.ui.busy;
        const leave = screen.getChildByName('rewards-done')!;
        leave.setPosition(370, discovery ? -289 : -370);
        for (const name of ['claim-supplies', 'RewardSupplyAmount', 'reward-bag'])
            screen.getChildByName(name)!.active = !discovery;
        const world = screen.getChildByName('World')!;
        world.active = !openingDiscovery && !choice;
        if (world.active && g.scenario.labyrinth && g.rewards)
            world.getComponent(SceneAtmosphere)?.setRoom(expeditionRoomId(g.expeditionMap, g.rewards.source));
        if (discovery) {
            const b = g.battle;
            const reward = g.rewards;
            const nextKind = reward?.nextCards?.[0];
            const otherReward = nextKind && (g.content.cards[nextKind].role === 'supply' ? '物资卡' : '战斗牌');
            const context = choice ? choice.mode + ':' + choice.ids.join(',')
                : nodeDiscovery ? reward!.source + ':' + reward!.cards.join(',')
                : 'combat:' + b!.turn + ':' + openingDiscovery!.join(',');
            if ((choice || nodeDiscovery) && this.ui.rewardContext !== context) {
                this.ui.rewardContext = context;
                this.ui.rewardPage = 0;
                this.ui.rewardSelection = -1;
            }
            this.view.text(screen, {
                'rewards/text0': b ? `${g.scenario.enemies[b.enemy].title} · ${b.calm?.deferred ? '行动已暂缓' : b.intent === 'attack' ? '即将攻击 ' + g.incomingDamage : '正在蓄势'}   /   剩余 ${b.stamina} 体力`
                    : `${nodeTitle(g.scenario, reward!.source, g.expeditionMap)} · 已收下 ${reward!.supplies} 物资`,
            });
            if (choice && choice.ids.length > 3) {
                const previous = screen.getChildByName('claim-supplies')!;
                const next = screen.getChildByName('reward-bag')!;
                previous.active = next.active = true;
                this.view.button(screen, 'claim-supplies', '上一页', this.ui.rewardPage > 0);
                this.view.button(screen, 'reward-bag', '下一页', (this.ui.rewardPage + 1) * 3 < choice.ids.length);
            }
            if (nodeDiscovery && otherReward) {
                screen.getChildByName('claim-supplies')!.active = true;
                this.view.button(screen, 'claim-supplies', `查看${otherReward}`, true);
            }
            if (nodeDiscovery && reward?.cards.some((kind) =>
                g.content.cards[kind].role === 'supply' && g.rewardZone(kind) === 'overflow')) {
                screen.getChildByName('reward-bag')!.active = true;
                this.view.button(screen, 'reward-bag', '整理物资行囊', true);
            }
            screen.getComponent(RewardSelection)!.refresh(
                g, this.ui.rewardSelection, choice ? this.ui.rewardPage : 0, canReadDetails
            );
            const cancelsPlay = choice?.mode === 'switch-stance' || choice?.mode === 'recover-stamina';
            const discoveryChoice = choice?.mode === 'deck-discovery' || choice?.mode === 'fist-discovery';
            const canResume = nodeDiscovery && !!g.expeditionMap;
            this.view.button(screen, 'rewards-done',
                cancelsPlay ? '取消出牌' : canResume ? '略过 · 可回到当前地点继续选'
                    : !choice || discoveryChoice ? '略过发现' : '略过选择', true, 'secondary');
            return;
        }
        this.view.button(screen, 'rewards-done', undefined, undefined, 'secondary');
        this.view.button(screen, 'reward-bag', '查看行囊', true);
        {
            const r = g.rewards!,
                battle = nodeDefinition(g.scenario, r.source, g.expeditionMap)?.type === 'battle',
                claimable = r.supplies;
            this.view.text(screen, {
                'banner/text0': battle ? 'VICTORY / SALVAGE' : 'SCAVENGE / SALVAGE',
                'banner/text1': battle ? '威胁已清除' : '废墟里，总有东西留下',
                'banner/text2': '可以选一张卡牌，并领取物资。',
                'rewards/text0': '',
                'rewards/text2': `物资 +${r.supplies}`,
                'rewards/text3': r.supplyTaken ? '已领取' : '',
            });
            const context = r.source + ':' + r.cards.join(',');
            if (this.ui.rewardContext !== context) {
                this.ui.rewardContext = context;
                this.ui.rewardSelection = -1;
            }
            const selection = screen.getComponent(RewardSelection);
            if (selection) selection.refresh(g, this.ui.rewardSelection, 0, canReadDetails);
            else
                screen
                    .getComponentsInChildren(RewardChoice)
                    .forEach((choice, i) =>
                        choice.refresh(
                            r.cards.length === 1 ? (i === 1 ? r.cards[0] : undefined) : r.cards[i],
                            r.cards.length === 1 ? 0 : i,
                            g
                        )
                    );
            this.view.button(
                screen,
                'claim-supplies',
                r.supplyTaken
                    ? '已领取'
                    : claimable === 0
                      ? '背包已满'
                      : claimable < r.supplies
                        ? `领取 ${claimable} / ${r.supplies} 物资`
                        : '领取物资',
                !r.supplyTaken && claimable > 0
            );
            this.view.button(
                screen,
                'rewards-done',
                r.supplyTaken && r.cardTaken ? '继续探索' : '离开 · 放弃余下奖励'
            );
        }
    }
}
