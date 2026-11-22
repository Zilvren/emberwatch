import { _decorator, Component, Label, Node } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { ButtonAction } from '../ui/ButtonAction';
import { missingSynthesisMaterials } from '../../core/content/RecipeCatalog';
import { SelectableCard } from './SelectableCard';
const { ccclass, property } = _decorator;

@ccclass('RewardSelection')
export class RewardSelection extends Component {
    @property(Label) heading: Label | null = null;
    @property({ type: [Node] }) cardHolders: Node[] = [];
    @property(ButtonAction) confirm: ButtonAction | null = null;
    @property(Label) hint: Label | null = null;
    refresh(game: GameReadModel, selection: number, page = 0): void {
        const missing = game.scenario.runDeck
            ? missingSynthesisMaterials(game.content.catalog.recipes, game.usableCards)
            : new Set<string>();
        const discovery = game.battle?.discovery;
        const battleChoice = game.battle?.cardChoice;
        const fieldDiscovery = !!game.rewards?.discovery;
        const pile = battleChoice?.mode === 'retain-hand' ? game.battle?.hand : game.battle?.discard;
        const cards = battleChoice
            ? battleChoice.ids.slice(page * 3, page * 3 + 3).map((id) => pile!.find((card) => card.id === id)!.kind)
            : discovery ?? game.rewards?.cards ?? [];
        const taken = !!game.rewards?.cardTaken;
        if (this.heading)
            this.heading.string = discovery
                ? game.battle?.coreExposed
                    ? '闸芯暴露 · 再次发现'
                    : '战场发现'
                : battleChoice ? battleChoice.mode === 'retain-hand' ? '保留到下回合' : '放回抽牌堆顶'
                : fieldDiscovery ? '发现一张卡牌' : '选择一张卡牌';
        this.cardHolders.forEach((holder, slot) => {
            const index = (cards.length === 1 ? 0 : slot) + page * 3;
            const kind = cards.length === 1 ? (slot === 1 ? cards[0] : undefined) : cards[slot];
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
                !taken,
                battleChoice ? '' : game.rewardCardBlocked(kind),
                missing.has(kind)
            );
        });
        const kind = cards[selection - page * 3],
            reason = kind && !battleChoice ? game.rewardCardBlocked(kind) : '';
        if (this.confirm) {
            this.confirm.actionId = battleChoice ? 'resolve-choice-confirm' : discovery || fieldDiscovery
                ? 'discover-confirm'
                : kind
                  ? 'claim-card-' + selection
                  : 'reward-confirm';
            this.confirm.setText(
                taken
                    ? '卡牌已收下'
                    : kind
                      ? (discovery || fieldDiscovery ? '拿取 · ' : '确认 · ') + game.content.cards[kind].name
                      : '先选择一张卡'
            );
            this.confirm.setEnabled(!!kind && !taken && !reason);
        }
        if (this.hint)
            this.hint.string = battleChoice
                ? `第 ${page + 1} / ${Math.ceil(battleChoice.ids.length / 3)} 页 · 可以略过`
                : fieldDiscovery ? '收下后加入本趟牌组，从下一场战斗开始可抽到。'
                : discovery
                ? kind
                    ? `拿取后${game.battle!.hand.length < 6 ? '立即入手' : '置于牌堆顶'} · 使用消耗 ${game.content.cards[kind].cost} 体力`
                    : '选一张带入本次探索，也可以略过。返家后恢复基础牌组。'
                : taken
                  ? '这次奖励的卡牌已处理'
                  : reason ||
                    (!kind
                        ? '选择候选卡只作比较，确认后才领取'
                        : game.rewardZone(kind) === 'overflow'
                          ? '确认后进入暂存，暂存卡不能参战'
                          : game.scenario.runDeck && game.content.cards[kind].role !== 'supply'
                            ? '确认后加入本局卡组'
                            : '确认后加入本次探索的行囊');
    }
}
