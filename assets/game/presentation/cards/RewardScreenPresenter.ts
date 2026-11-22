import type { Node } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
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
    render(screen: Node): void {
        const g = this.game;
        const openingDiscovery = g.battle?.discovery;
        const nodeDiscovery = !!g.rewards?.discovery;
        const choice = g.battle?.cardChoice;
        const discovery = openingDiscovery || nodeDiscovery || choice;
        const leave = screen.getChildByName('rewards-done')!;
        leave.setPosition(370, discovery ? -289 : -370);
        for (const name of ['claim-supplies', 'RewardSupplyAmount', 'reward-bag'])
            screen.getChildByName(name)!.active = !discovery;
        screen.getChildByName('World')!.active = !openingDiscovery && !choice;
        if (discovery) {
            const b = g.battle;
            const reward = g.rewards;
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
                    : `${g.scenario.nodes[reward!.source].title} · 已收下 ${reward!.supplies} 物资`,
            });
            if (choice && choice.ids.length > 3) {
                const previous = screen.getChildByName('claim-supplies')!;
                const next = screen.getChildByName('reward-bag')!;
                previous.active = next.active = true;
                this.view.button(screen, 'claim-supplies', '上一页', this.ui.rewardPage > 0);
                this.view.button(screen, 'reward-bag', '下一页', (this.ui.rewardPage + 1) * 3 < choice.ids.length);
            }
            screen.getComponent(RewardSelection)!.refresh(g, this.ui.rewardSelection, choice ? this.ui.rewardPage : 0);
            this.view.button(screen, 'rewards-done', choice ? '略过选择' : '略过发现', true, 'secondary');
            return;
        }
        this.view.button(screen, 'rewards-done', undefined, undefined, 'secondary');
        {
            const r = g.rewards!,
                battle = g.scenario.nodes[r.source]?.type === 'battle',
                claimable =
                    g.scenario.suppliesHaveWeight === false
                        ? r.supplies
                        : Math.max(0, Math.min(r.supplies, 30 - g.baseWeight));
            this.view.text(screen, {
                'banner/text0': battle ? 'VICTORY / SALVAGE' : 'SCAVENGE / SALVAGE',
                'banner/text1': battle ? '威胁已清除' : '废墟里，总有东西留下',
                'banner/text2':
                    g.scenario.suppliesHaveWeight === false
                        ? '最多选择一张卡牌；物资点单独领取，不占负重。'
                        : battle
                          ? '最多选择一张卡牌。物资需要单独领取。'
                          : '整理背包后再领取，顺序会影响携带空间。',
                'rewards/text0': `携带 ${g.baseWeight}/30  ·  暂存 ${g.overflowWeight}/10`,
                'rewards/text2': `物资 +${r.supplies}`,
                'rewards/text3': r.supplyTaken
                    ? '已领取'
                    : g.scenario.suppliesHaveWeight === false
                      ? `可领取 ${claimable} 物资点 · 不占负重`
                      : claimable === 0
                        ? '背包已满 · 先整理背包'
                        : claimable < r.supplies
                          ? `可装入 ${claimable} 点 · 其余 ${r.supplies - claimable} 点将放弃`
                          : `可全部装入 ${claimable} 点`,
            });
            const context = r.source + ':' + r.cards.join(',');
            if (this.ui.rewardContext !== context) {
                this.ui.rewardContext = context;
                this.ui.rewardSelection = -1;
            }
            const selection = screen.getComponent(RewardSelection);
            if (selection) selection.refresh(g, this.ui.rewardSelection);
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
