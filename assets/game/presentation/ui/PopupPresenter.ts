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
import { campDetail, isCampStation } from './CampViewModel';
import { CampStationPanel } from './CampStationPanel';
import { CampSkillTree } from './CampSkillTree';
import { BattlePilePanel } from '../cards/BattlePilePanel';
import { isCardPile } from '../cards/BattlePileModel';
/** Overlay projection only; input decisions are owned by UiActionRouter. */
export class PopupPresenter {
    constructor(
        private readonly game: GameReadModel,
        private readonly ui: UiState,
        private readonly popups: Record<PopupKey, Node>,
        private readonly view: NativeViewWriter,
        private readonly newGameRuleset: () => string,
        private readonly synthesisView: () => { blocked: string; canUndo: boolean },
        private readonly fieldUpdateAvailable: () => boolean,
        private readonly newGameDestination: () => string = () => '退潮盐原',
        private readonly isMuted: () => boolean = () => false
    ) {}
    render(): void {
        const g = this.game;
        const key = popupKey(this.ui.overlay);
        for (const id of Object.keys(this.popups)) this.popups[id].active = id === key;
        if (key === 'settings') this.view.button(this.popups.settings, 'audio', this.isMuted() ? '声音关' : '声音开');
        if (key === 'battle-pile' && isCardPile(this.ui.overlay))
            this.popups[key].getComponentInChildren(BattlePilePanel)?.render(g, this.ui.overlay, this.ui.pilePage, this.ui.pileSelection);
        if (key === 'camp-station' && isCampStation(this.ui.overlay)) {
            const sheet = this.popups[key].getComponentInChildren(CampStationPanel)!;
            const tree = this.popups[key].getComponentInChildren(CampSkillTree)!;
            tree.node.active = this.ui.overlay === 'camp-skills';
            sheet.node.active = !tree.node.active;
            if (this.ui.overlay === 'camp-skills') tree.render(g, this.ui.campSkill);
            else sheet.render(campDetail(g, this.ui.overlay, this.ui),
                this.ui.overlay === 'camp-fire' ? this.isMuted() : undefined);
        }
        if (key === 'inventory') {
            const popup = this.popups.inventory,
                max = Math.max(0, Math.ceil(g.cards.length / 6) - 1);
            this.ui.page = Math.max(0, Math.min(this.ui.page, max));
            this.view.text(popup, {
                'bag/text1': `随行牌组 · ${g.usableCards.length} 张`,
                'bag/text20': `${this.ui.page + 1} / ${max + 1}`,
                'bag/text21': g.scenario.runDeck || g.scenario.labyrinth ? '物资卡带回仓库，战斗牌进入本局卡组。'
                    : g.scenario.fieldDeck ? '发现的牌在本次探索内使用。' : '点击卡牌查看详情。',
            });
            const grid = popup.getComponent(InventoryGrid);
            if (grid) grid.refresh(g, this.ui);
            else
                popup
                    .getComponentsInChildren(InventoryRowPresentation)
                    .forEach((row, i) => row.refresh(g.cards[this.ui.page * 6 + i], g));
            this.view.button(popup, 'bag-prev', undefined, this.ui.page > 0);
            this.view.button(popup, 'bag-next', undefined, this.ui.page < max);
            for (const action of popup.getComponentsInChildren(ButtonAction))
                if (action.actionId === 'discard-supply')
                    action.node.active = false;
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
        if (key === 'help' && g.scenario.battleResource === 'stamina')
            this.view.text(this.popups.help, {
                'modal/text1': g.scenario.labyrinth
                    ? '发现的战斗牌从下一场开始抽取，返营恢复基础牌组。补给点搜到的物资卡占行囊空间，成功返营后可在仓库留存或兑换。失败会失去随身物资卡。\n\n普通镇静跨回合保留，临时镇静在回合结束时清除。叠至门槛会暂缓敌人动作，你先获得一个额外回合，那次动作会在额外回合结束时结算。\n\n攻击牌选敌或拖向敌人，其余牌点击使用。点牌堆可以查看其中的卡牌。体力每回合刷新，格挡清空。血量归零立即探索失败。'
                    : g.scenario.fieldDeck
                    ? '每场遭遇可选一张发现牌，也可略过。闸轮生命降至一半时还可发现一次。\n拿取免费，打出才支付体力。满手时新牌放到抽牌堆顶。\n发现牌本次探索有效，返家后恢复基础牌组。\n\n攻击牌点击后选择敌人，或直接拖向敌人。其余牌点击使用。\n体力每回合刷新，格挡在敌方行动后清空。\n格挡抵消伤害，血量归零立即探索失败。'
                    : rulesNotice(
                          g.scenario.ruleset,
                          this.newGameRuleset(),
                          this.fieldUpdateAvailable(),
                          this.newGameDestination()
                      ).help +
                      '攻击牌：点击后选择敌人，或拖向敌人。\n防御、治疗、武器牌：点击即可使用。\n\n卡牌消耗战斗体力，不扣避难所物资。\n进入档位决定每回合体力；回合结束余量清零，新回合重置。\n普通牌直接进入牌组，物资卡放入行囊。\n格挡抵消伤害，血量归零立即探索失败。\n正式探索成功或失败都会过去一天；日志在关键进度达成时出现。',
            });
        if (key === 'help' && g.scenario.battleResource !== 'stamina')
            this.view.text(this.popups.help, {
                'modal/text1': rulesNotice(g.scenario.ruleset, this.newGameRuleset(),
                    this.fieldUpdateAvailable(), this.newGameDestination()).help,
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
                    '累计天数、关键日志和当前探索进度将重置。\n初始物资、血量和卡牌恢复，随机内容重新生成。' +
                    (g.scenario.runDeck || g.scenario.labyrinth ? '\n仓库里的物资卡也会清空。' : '') +
                    (g.campSkills?.length ? '\n已学会的营地技能也会清空。' : '') +
                    rulesNotice(
                        g.scenario.ruleset,
                        this.newGameRuleset(),
                        this.fieldUpdateAvailable(),
                        this.newGameDestination()
                    ).restart;
                confirm = '重新开始';
                variant = 'danger';
            } else if (this.ui.overlay === 'discard') {
                title = `丢弃${c ? this.game.content.cards[c.kind].name : '卡牌'}？`;
                body = '确认后，这张牌会从本次探索中永久移除。';
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
