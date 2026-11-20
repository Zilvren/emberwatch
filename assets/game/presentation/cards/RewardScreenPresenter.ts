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
