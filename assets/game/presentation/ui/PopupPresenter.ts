import { ButtonAction } from './ButtonAction';
import type { Node } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import type { UiState } from './UiState';
import type { PopupKey } from './ViewBindings';
import { popupKey } from './ViewBindings';
import type { NativeViewWriter } from './NativeViewWriter';
import type { ButtonVariant } from './ButtonStyle';
import { InventoryGrid } from '../cards/InventoryGrid';
import { InventoryRowPresentation } from '../cards/InventoryRowPresentation';
import { RouteMap } from '../map/RouteMap';
import { EntrySelection } from './EntrySelection';
import { RecipePanel } from './RecipePanel';
import { rulesNotice } from './RulesNoticeModel';
/** Overlay projection only; input decisions are owned by UiActionRouter. */
export class PopupPresenter {
    constructor(
        private readonly game: GameReadModel,
        private readonly ui: UiState,
        private readonly popups: Record<PopupKey, Node>,
        private readonly view: NativeViewWriter,
        private readonly newGameRuleset: () => string,
        private readonly synthesisView: () => { blocked: string; canUndo: boolean }
    ) {}
    render(): void {
        const g = this.game;
        const key = popupKey(this.ui.overlay);
        for (const id of Object.keys(this.popups)) this.popups[id].active = id === key;
        if (key === 'inventory') {
            const popup = this.popups.inventory,
                max = Math.max(0, Math.ceil(g.cards.length / 6) - 1);
            this.ui.page = Math.max(0, Math.min(this.ui.page, max));
            this.view.text(popup, {
                'bag/text1': `基础 ${g.baseWeight}/30  ·  暂存 ${g.overflowWeight}/10  ·  可战斗 ${g.usableCards.length} 张`,
                'bag/text20': `${this.ui.page + 1} / ${max + 1}`,
                'bag/text21':
                    g.scenario.runDeck
                        ? '行囊只装物资卡。战斗卡直接进入本局卡组。'
                        : g.phase === 'rest'
                        ? '移出战斗不释放负重。基础能力永久保留；现金可在这里丢弃。'
                        : g.phase === 'rewards'
                          ? g.scenario.suppliesHaveWeight === false
                              ? '物资点不占负重；普通物品可丢弃腾出空间。基础能力保留，现金仅营地可丢弃。'
                              : '物资不能暂存；可先丢弃普通物品腾出空间。基础能力保留，现金仅营地可丢弃。'
                          : '当前仅可查看。奖励和休整时可整理背包；调整战斗卡组需在营地进行。',
            });
            const grid = popup.getComponent(InventoryGrid);
            if (grid) grid.refresh(g, this.ui);
            else
                popup
                    .getComponentsInChildren(InventoryRowPresentation)
                    .forEach((row, i) => row.refresh(g.cards[this.ui.page * 6 + i], g));
            this.view.button(popup, 'bag-prev', undefined, this.ui.page > 0);
            this.view.button(popup, 'bag-next', undefined, this.ui.page < max);
            this.view.button(
                popup,
                'discard-supply',
                undefined,
                (g.phase === 'rest' || g.phase === 'rewards') && g.supplies > 0
            );
            for (const action of popup.getComponentsInChildren(ButtonAction))
                if (action.actionId === 'discard-supply')
                    action.node.active = g.scenario.suppliesHaveWeight !== false;
        }
        if (key === 'map') this.popups.map?.getComponentInChildren(RouteMap)?.refresh(g, true);
        if (key === 'recipes') {
            const { blocked, canUndo } = this.synthesisView();
            this.popups.recipes.getComponentInChildren(RecipePanel)?.refresh(g, this.ui.recipes, blocked, canUndo);
        }
        if (key === 'entry')
            this.popups.entry
                ?.getComponentInChildren(EntrySelection)
                ?.refresh(g, this.ui.entryTier);
        if (key === 'log')
            this.view.text(this.popups.log, { 'modal/text1': g.logs.slice(0, 9).join('\n\n') });
        if (key === 'help' && g.scenario.battleResource === 'stamina')
            this.view.text(this.popups.help, {
                'modal/text1':
                    '攻击牌：点击后选择敌人，或拖向敌人。\n防御、修复、武器牌：点击即可使用。\n\n卡牌消耗战斗体力，不扣避难所物资。\n进入档位决定每回合体力；回合结束余量清零，新回合重置。\n物资点不占探索负重，物品仍占负重，暂存物品不能战斗。\n护甲降至 0 不立即失败，再次受到实际伤害才失败。\n正式探索成功或失败都会过去一天；日志在关键进度达成时出现。',
            });
        if (key === 'help' && g.scenario.battleResource !== 'stamina')
            this.view.text(this.popups.help, {
                'modal/text1': rulesNotice(g.scenario.ruleset, this.newGameRuleset()).help,
            });
        if (key === 'confirmation') {
            const c = g.cards.find((c) => c.id === this.ui.discardId);
            let title = '',
                body = '',
                confirm = '确认',
                cancel = '取消',
                variant: ButtonVariant = 'primary';
            if (this.ui.overlay === 'restart') {
                title = '重新开始第 1 天？';
                body =
                    '累计天数、关键日志和当前探索进度将重置。\n初始物资、护甲和卡牌恢复，随机内容重新生成。' +
                    (g.scenario.runDeck ? '\n仓库里的物资卡也会清空。' : '') +
                    rulesNotice(g.scenario.ruleset, this.newGameRuleset()).restart;
                confirm = '重新开始';
                variant = 'danger';
            } else if (this.ui.overlay === 'discard') {
                title = `丢弃${c ? this.game.content.cards[c.kind].name : '卡牌'}？`;
                body = `这张牌将从本次探索中永久移除。\n${c ? `释放 ${this.game.content.cards[c.kind].weight} 点负重，暂存卡按顺序自动转入。` : ''}`;
                confirm = '永久丢弃';
                variant = 'danger';
            } else if (this.ui.overlay === 'reward-leave') {
                const r = g.rewards!,
                    pending = [
                        !r.supplyTaken && r.supplies > 0 ? `${r.supplies} 点物资` : '',
                        !r.cardTaken && r.cards.length ? '1 次选牌机会' : '',
                    ].filter(Boolean);
                title = '放弃余下奖励，继续前进？';
                body = `尚未领取：${pending.join('、')}。\n\n离开后无法返回领取。你也可以先整理背包，再决定带走什么。${g.scenario.battleResource !== 'stamina' && g.supplies === 0 ? '\n\n当前物资为 0，直接离开会导致本次教学探索失败。' : ''}`;
                confirm = '放弃并离开';
                cancel = '返回领取';
                variant = 'danger';
            } else if (this.ui.overlay === 'supply-overflow') {
                const r = g.rewards!,
                    amount = Math.max(0, Math.min(r.supplies, 30 - g.baseWeight));
                title = '部分物资装不下';
                body = `本次只能装入 ${amount} / ${r.supplies} 点物资。\n确认后，其余 ${r.supplies - amount} 点会立即放弃，不能再次领取。\n\n可先取消，整理背包后再领取。物资不能放入暂存区。`;
                confirm = `领取 ${amount} 点`;
                cancel = '先不领取';
            }
            this.view.text(this.popups.confirmation, { 'modal/text0': title, 'modal/text1': body });
            this.view.button(
                this.popups.confirmation,
                'modal-confirm',
                confirm,
                undefined,
                variant
            );
            this.view.button(this.popups.confirmation, 'modal-cancel', cancel);
        }
    }
}
