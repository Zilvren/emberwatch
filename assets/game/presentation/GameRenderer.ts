import { Node } from 'cc';
import type { GameReadModel } from '../core/GameReadModel';
import { CARD, NODE_NAMES, Phase } from '../core/SurvivalGame';
import { ActorPresentation } from './actors/ActorPresentation';
import { HandPresentation } from './cards/HandPresentation';
import { InventoryRowPresentation } from './cards/InventoryRowPresentation';
import { RewardChoice } from './cards/RewardChoice';
import { MapPointPresentation } from './map/MapPointPresentation';
import { ButtonAction } from './ui/ButtonAction';
import type { ButtonVariant } from './ui/ButtonStyle';
import { UIProgress } from './ui/UIProgress';
import type { UiState } from './ui/UiState';
import { UIValue } from './ui/UIValue';
import { StatusBar } from './ui/StatusBar';
import { InventoryGrid } from './cards/InventoryGrid';
import { RewardSelection } from './cards/RewardSelection';
import { RouteMap } from './map/RouteMap';
import { EntrySelection } from './ui/EntrySelection';
import { shelterSummary } from './ui/ShelterSummaryModel';
import { rulesNotice } from './ui/RulesNoticeModel';
const screenIndices: Record<Phase, number> = {
    journal: 0,
    map: 1,
    battle: 2,
    rewards: 3,
    rest: 4,
    shelter: 5,
    failure: 7,
};
export interface SceneBindings {
    hud: Node;
    screens: Node[];
    popups: Node[];
}
/** Native view binding only. No game commands, storage or input subscriptions. */
export class GameRenderer {
    hero: ActorPresentation | null = null;
    enemy: ActorPresentation | null = null;
    activeScreen: Node | null = null;
    revision = -1;
    constructor(
        private readonly game: GameReadModel,
        private readonly ui: UiState,
        private readonly scene: SceneBindings,
        private readonly hand: HandPresentation | null,
        private readonly isMuted: () => boolean,
        private readonly saveStatus: () => string,
        private readonly newGameRuleset: () => string = () => 'stamina-v1'
    ) {}
    text(root: Node, values: Record<string, string | number>): void {
        for (const binding of root.getComponentsInChildren(UIValue)) {
            if (Object.prototype.hasOwnProperty.call(values, binding.key))
                binding.setValue(values[binding.key]);
            if (binding.key === 'battle/text3') binding.setAlert(this.game.critical);
            if (binding.key === 'battle/text0')
                binding.setAlert(this.game.battle?.intent === 'attack');
        }
    }
    button(
        root: Node,
        id: string,
        caption?: string,
        enabled?: boolean,
        variant?: ButtonVariant
    ): void {
        for (const action of root.getComponentsInChildren(ButtonAction))
            if (action.actionId === id) {
                if (caption !== undefined) action.setText(caption);
                if (enabled !== undefined) action.setEnabled(enabled);
                if (variant !== undefined) action.setVariant(variant);
            }
    }
    render(): void {
        const g = this.game,
            phaseIndex =
                g.phase === 'journal' && g.currentJournal?.id !== 'departure'
                    ? 6
                    : screenIndices[g.phase];
        if (g.phase !== 'rewards') {
            this.ui.rewardSelection = -1;
            this.ui.rewardContext = '';
        }
        this.scene.screens.forEach((screen, i) => (screen.active = i === phaseIndex));
        this.activeScreen = this.scene.screens[phaseIndex];
        const screen = this.activeScreen;
        this.hero =
            screen
                .getChildByName('World')
                ?.getChildByName('Player')
                ?.getComponent(ActorPresentation) ?? null;
        this.hero?.setArmed(g.phase === 'battle' && !!g.battle?.weapon);
        this.renderStatusBar();
        if (g.phase === 'journal' && g.currentJournal) {
            const entry = g.currentJournal;
            this.text(screen, {
                'journal/text0': 'SURVIVAL JOURNAL / 关键记录',
                'journal/text1': `第 ${entry.day} 天 · ${entry.title}`,
                'journal/text2': entry.body,
                'journal/text3': `物资 ${g.supplies} · 护甲 ${g.armor} · 战斗牌 ${g.usableCards.length} 张\n${g.scenario.suppliesHaveWeight === false ? '物品负重' : '初始总负重'} ${g.baseWeight} / 30`,
                'journal/text4': '余烬之中，仍有人守夜。',
                'journal/text5': '',
                'journal/text6': '',
            });
            this.button(
                screen,
                'journal-start',
                g.pendingJournalCount > 1
                    ? '下一篇日志'
                    : entry.id === 'departure'
                      ? '整备出发'
                      : '返回避难所'
            );
        }
        if (g.phase === 'map') {
            this.text(screen, {
                'banner/text2':
                    g.currentNode === 'return'
                        ? '路已走完。正在自动返回避难所……'
                        : '前往亮起的地点。全程无法主动撤离。',
                'map/text0': `负重 ${g.baseWeight}/30  ·  暂存 ${g.overflowWeight}/10`,
                'map/text1':
                    g.scenario.suppliesHaveWeight === false
                        ? '物资点不占负重；丢弃物品后，暂存卡可自动转入。'
                        : g.overflowWeight
                          ? '消耗物资后，暂存卡可自动转入。'
                          : '搜刮和出牌都会改变携带空间。',
                'map/fixedReward': `${g.scenario.scavengeFees?.fixed ? `支付 ${g.scenario.scavengeFees.fixed} 物资 → ` : ''}4 物资 + ${this.game.content.cards[this.game.content.catalog.fixedReward].name}\n完成固定搜刮后，才能选择后续路线。`,
            });
            const map = screen.getComponentInChildren(RouteMap);
            if (map) map.refresh(g);
            else {
                screen.getChildByName('RouteGraph')!.active = g.fixedDone;
                screen.getChildByName('InitialHint')!.active = !g.fixedDone;
                screen
                    .getComponentsInChildren(MapPointPresentation)
                    .forEach((point) => point.refresh(g));
                this.button(screen, 'route-A', undefined, g.currentNode === 'choice');
                this.button(screen, 'route-B', undefined, g.currentNode === 'choice');
            }
        }
        if (g.phase === 'battle') this.renderBattle(screen);
        if (g.phase === 'rewards') {
            const r = g.rewards!,
                battle = r.source === 'enemy1' || r.source === 'enemy2',
                claimable =
                    g.scenario.suppliesHaveWeight === false
                        ? r.supplies
                        : Math.max(0, Math.min(r.supplies, 30 - g.baseWeight));
            this.text(screen, {
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
            this.button(
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
            this.button(
                screen,
                'rewards-done',
                r.supplyTaken && r.cardTaken ? '继续探索' : '离开 · 放弃余下奖励'
            );
        }
        if (g.phase === 'rest') {
            const cash = g.cards.some((c) => c.kind === 'cash');
            this.text(screen, {
                'banner/text2': g.critical
                    ? '感染临界无法恢复护甲。趁现在整理行囊。'
                    : '进入时已恢复最多 2 点护甲。物资不会恢复。',
                'rest/text1': `${CARD.cash.name}已经不再有用。\n丢弃后释放 ${CARD.cash.weight} 点负重，暂存卡会自动转入。`,
                'rest/text3': `${g.usableCards.length} 张可用牌 · ${g.cards.filter((c) => c.zone === 'overflow').length} 张暂存\n移出战斗不释放负重，永久丢弃才释放。`,
                'rest/text5': `护甲 ${g.armor}/10  ·  物资 ${g.supplies}  ·  负重 ${g.baseWeight}/30`,
            });
            this.button(
                screen,
                'rest-cash',
                cash ? `丢弃${CARD.cash.name} · 释放 ${CARD.cash.weight} 负重` : '现金已丢弃',
                cash
            );
        }
        if (g.phase === 'shelter') {
            const summary = shelterSummary(g);
            this.text(screen, summary.values);
            this.button(screen, 'shelter-repair', summary.repairCaption, summary.repairEnabled);
            for (const action of screen.getComponentsInChildren(ButtonAction))
                if (action.actionId === 'shelter-repair')
                    action.node.active = summary.repairVisible;
            this.button(screen, 'shelter-done', summary.doneCaption);
        }
        if (g.phase === 'failure') {
            this.text(screen, {
                'journal/text1':
                    g.scenario.kind === 'tutorial'
                        ? '第 1 天 · 再试一次'
                        : `第 ${g.day} 天 · 还不是终点`,
                'journal/text2': `${g.failureReason}\n\n初始补给、牌组和护甲已恢复。\n${g.scenario.kind === 'tutorial' ? '教学仍停留在第 1 天。' : '一天过去了，已经走过的时间和关键记录仍然保留。'}`,
                'journal/text3': `物资 ${g.supplies} · 护甲 ${g.armor} · 战斗牌 ${g.usableCards.length} 张`,
                'journal/text5': '',
            });
            this.button(screen, 'journal-start', '返回避难所');
        }
        this.renderPopups();
        this.hand?.setLocked(this.ui.busy || !!this.ui.overlay);
        this.revision = g.revision;
    }
    private renderStatusBar(): void {
        const g = this.game;
        this.scene.hud.getComponent(StatusBar)?.render({
            day: g.day,
            supplies: g.supplies,
            armor: g.armor,
            armorMax: 10,
            critical: g.critical,
            carried: g.baseWeight,
            capacity: 30,
            overflow: g.overflowWeight,
            overflowCapacity: 10,
            saveStatus: this.saveStatus(),
            muted: this.isMuted(),
            actionsEnabled: !this.ui.busy && !this.ui.overlay,
            rulesNotice: rulesNotice(g.scenario.ruleset, this.newGameRuleset()).caption,
        });
    }
    renderBattle(screen: Node): void {
        this.renderStatusBar();
        const g = this.game,
            b = g.battle!,
            attack = b.intent === 'attack',
            world = screen.getChildByName('World')!;
        const gauge = screen.getChildByName('StaminaGauge');
        if (gauge) gauge.active = g.scenario.battleResource === 'stamina';
        world.getChildByName('Wanderer')!.active = b.enemy === 'enemy1';
        world.getChildByName('Brute')!.active = b.enemy === 'enemy2';
        this.enemy = world
            .getChildByName(b.enemy === 'enemy1' ? 'Wanderer' : 'Brute')!
            .getComponent(ActorPresentation);
        this.text(screen, {
            'banner/text0': `ENCOUNTER / ROUND ${b.turn}`,
            'banner/text1': NODE_NAMES[b.enemy],
            'battle/text0': attack ? `攻击 ${g.incomingDamage}` : '蓄势 · 准备',
            'battle/text1': attack
                ? Math.max(0, g.incomingDamage - b.block) === 0
                    ? '已完全格挡 · 本回合安全'
                    : `结束回合将受伤 ${Math.max(0, g.incomingDamage - b.block)}`
                : `下次攻击 ${b.strongAttack}`,
            'battle/text3': `护甲 ${g.armor}/10`,
            'battle/text4': `格挡 ${b.block}`,
            'battle/text5': `敌人护甲 ${b.hp}/${b.maxHp}`,
            'battle/text8': b.turn === b.equippedTurn ? '下回合生成挥砍' : '每回合生成挥砍',
            'battle/text9': this.ui.busy
                ? '正在行动…'
                : this.ui.selectedCard
                  ? '已选攻击牌 · 再次点击可取消\n点击敌人或拖向敌人'
                  : '攻击牌选敌人，其余牌点击即用\n长按看详情 · 拖出场地可取消',
            'battle/text10': `回合 ${b.turn} · 手牌 ${b.hand.length} / 6`,
            'drawPile/text0': b.draw.length,
            'discardPile/text0': b.discard.length,
            'battle/stamina-value': `${b.stamina}/${b.maxStamina}`,
            'battle/stamina-hint': `每回合 ${b.maxStamina}`,
        });
        screen.getChildByName('CriticalWarning')!.active = g.critical;
        screen.getChildByName('WeaponSlot')!.active = !!b.weapon;
        if (b.weapon)
            this.text(screen, {
                'battle/text7': `${this.game.content.cards[b.weapon.kind].name}已装备`,
                'battle/text8': `${b.turn === b.equippedTurn ? '下回合起生成' : '每回合生成'}${this.game.content.cards[this.game.content.cards[b.weapon.kind].effect.generatedCard!].name}`,
            });
        screen.getChildByName('TargetGuide')!.active = !!this.ui.selectedCard;
        for (const progress of screen.getComponentsInChildren(UIProgress))
            progress.setRatio(progress.key === 'armor' ? g.armor / 10 : b.hp / b.maxHp);
        this.hand?.refresh(
            g,
            this.ui.selectedCard,
            this.ui.busy || !!this.ui.overlay,
            this.ui.reduced
        );
        this.button(screen, 'end-turn', undefined, !this.ui.busy);
    }
    renderPopups(): void {
        const g = this.game;
        const index =
            this.ui.overlay === 'bag'
                ? 0
                : this.ui.overlay === 'help'
                  ? 1
                  : this.ui.overlay === 'log'
                    ? 2
                    : this.ui.overlay === 'entry'
                      ? 5
                      : this.ui.overlay === 'map'
                        ? 4
                        : this.ui.overlay
                          ? 3
                          : -1;
        this.scene.popups.forEach((popup, i) => (popup.active = i === index));
        if (index === 0) {
            const popup = this.scene.popups[0],
                max = Math.max(0, Math.ceil(g.cards.length / 6) - 1);
            this.ui.page = Math.max(0, Math.min(this.ui.page, max));
            this.text(popup, {
                'bag/text1': `基础 ${g.baseWeight}/30  ·  暂存 ${g.overflowWeight}/10  ·  可战斗 ${g.usableCards.length} 张`,
                'bag/text20': `${this.ui.page + 1} / ${max + 1}`,
                'bag/text21':
                    g.phase === 'rest'
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
            this.button(popup, 'bag-prev', undefined, this.ui.page > 0);
            this.button(popup, 'bag-next', undefined, this.ui.page < max);
            this.button(
                popup,
                'discard-supply',
                undefined,
                (g.phase === 'rest' || g.phase === 'rewards') && g.supplies > 0
            );
            for (const action of popup.getComponentsInChildren(ButtonAction))
                if (action.actionId === 'discard-supply')
                    action.node.active = g.scenario.suppliesHaveWeight !== false;
        }
        if (index === 4) this.scene.popups[4]?.getComponentInChildren(RouteMap)?.refresh(g, true);
        if (index === 5)
            this.scene.popups[5]
                ?.getComponentInChildren(EntrySelection)
                ?.refresh(g, this.ui.entryTier);
        if (index === 2)
            this.text(this.scene.popups[2], { 'modal/text1': g.logs.slice(0, 9).join('\n\n') });
        if (index === 1 && g.scenario.battleResource === 'stamina')
            this.text(this.scene.popups[1], {
                'modal/text1':
                    '攻击牌：点击后选择敌人，或拖向敌人。\n防御、修复、武器牌：点击即可使用。\n\n卡牌消耗战斗体力，不扣避难所物资。\n进入档位决定每回合体力；回合结束余量清零，新回合重置。\n物资点不占探索负重，物品仍占负重，暂存物品不能战斗。\n护甲降至 0 不立即失败，再次受到实际伤害才失败。\n正式探索成功或失败都会过去一天；日志在关键进度达成时出现。',
            });
        if (index === 1 && g.scenario.battleResource !== 'stamina')
            this.text(this.scene.popups[1], {
                'modal/text1': rulesNotice(g.scenario.ruleset, this.newGameRuleset()).help,
            });
        if (index === 3) {
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
            this.text(this.scene.popups[3], { 'modal/text0': title, 'modal/text1': body });
            this.button(this.scene.popups[3], 'modal-confirm', confirm, undefined, variant);
            this.button(this.scene.popups[3], 'modal-cancel', cancel);
        }
    }
}
