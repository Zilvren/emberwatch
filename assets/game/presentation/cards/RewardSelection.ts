import { _decorator, Component, Label, Node } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { ButtonAction } from '../ui/ButtonAction';
import { missingSynthesisMaterials } from '../../core/content/RecipeCatalog';
import { SelectableCard } from './SelectableCard';
const { ccclass, property } = _decorator;

@ccclass('RewardSelection')
export class RewardSelection extends Component {
    @property({ type: [Node] }) cardHolders: Node[] = [];
    @property(ButtonAction) confirm: ButtonAction | null = null;
    @property(Label) hint: Label | null = null;
    refresh(game: GameReadModel, selection: number): void {
        const reward = game.rewards;
        if (!reward) return;
        const missing = game.scenario.runDeck
            ? missingSynthesisMaterials(game.content.catalog.recipes, game.usableCards)
            : new Set<string>();
        this.cardHolders.forEach((holder, slot) => {
            const index = reward.cards.length === 1 ? 0 : slot;
            const kind =
                reward.cards.length === 1
                    ? slot === 1
                        ? reward.cards[0]
                        : undefined
                    : reward.cards[slot];
            holder.active = !!kind;
            if (!kind) return;
            const view = holder.getComponentInChildren(SelectableCard);
            if (!view) throw new Error('Reward candidate holder has no SelectableCard instance.');
            view.show(
                kind,
                game,
                'reward-select-' + index,
                selection === index,
                '',
                !reward.cardTaken,
                game.rewardCardBlocked(kind),
                missing.has(kind)
            );
        });
        const kind = reward.cards[selection],
            reason = kind ? game.rewardCardBlocked(kind) : '';
        if (this.confirm) {
            this.confirm.actionId = kind ? 'claim-card-' + selection : 'reward-confirm';
            this.confirm.setText(
                reward.cardTaken
                    ? '卡牌已收下'
                    : kind
                      ? '确认选择 · ' + game.content.cards[kind].name
                      : '先选择一张卡'
            );
            this.confirm.setEnabled(!!kind && !reward.cardTaken && !reason);
        }
        if (this.hint)
            this.hint.string = reward.cardTaken
                ? '这次奖励的卡牌已处理'
                : reason ||
                  (!kind
                      ? '选择候选卡只作比较，确认后才领取'
                      : game.rewardZone(kind) === 'overflow'
                        ? '确认后进入暂存区'
                        : game.scenario.runDeck && game.content.cards[kind].role !== 'supply'
                          ? '确认后加入本局卡组'
                          : '确认后放入行囊');
    }
}
