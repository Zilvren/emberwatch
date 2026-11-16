import { NativeViewWriter } from './ui/NativeViewWriter';
import { PopupPresenter } from './ui/PopupPresenter';
import { RewardScreenPresenter } from './cards/RewardScreenPresenter';
import { Node } from 'cc';
import type { GameReadModel } from '../core/GameReadModel';
import { nodeTitle } from '../core/content/GameScenario';
import type { SceneBindings } from './ui/GameView';
import { ActorPresentation } from './actors/ActorPresentation';
import { HandPresentation } from './cards/HandPresentation';
import { MapPointPresentation } from './map/MapPointPresentation';
import { ButtonAction } from './ui/ButtonAction';
import { UIProgress } from './ui/UIProgress';
import type { UiState } from './ui/UiState';
import { UIValue } from './ui/UIValue';
import { StatusBar } from './ui/StatusBar';
import { RouteMap } from './map/RouteMap';
import { shelterSummary } from './ui/ShelterSummaryModel';
import { rulesNotice } from './ui/RulesNoticeModel';
/** Native view binding only. No game commands, storage or input subscriptions. */
export class GameRenderer extends NativeViewWriter {
    private readonly popups: PopupPresenter;
    private readonly rewards: RewardScreenPresenter;
    hero: ActorPresentation | null = null;
    enemy: ActorPresentation | null = null;
    activeScreen: Node | null = null;
    revision = -1;
    constructor(
        game: GameReadModel,
        private readonly ui: UiState,
        private readonly scene: SceneBindings,
        private readonly hand: HandPresentation | null,
        private readonly isMuted: () => boolean,
        private readonly saveStatus: () => string,
        private readonly newGameRuleset: () => string = () => 'stamina-v1'
    ) {
        super(game);
        this.popups = new PopupPresenter(game, ui, scene.popups, this, newGameRuleset);
        this.rewards = new RewardScreenPresenter(game, ui, this);
    }
    render(): void {
        const g = this.game;
        if (g.phase !== 'rewards') {
            this.ui.rewardSelection = -1;
            this.ui.rewardContext = '';
        }
        for (const phase of Object.keys(this.scene.screens))
            this.scene.screens[phase].active = phase === g.phase;
        this.activeScreen = this.scene.screens[g.phase];
        const screen = this.activeScreen;
        const actors = screen.getComponentsInChildren(ActorPresentation);
        this.hero = actors.find((actor) => actor.actorId === 'player') ?? null;
        this.hero?.setArmed(g.phase === 'battle' && !!g.battle?.weapon);
        this.renderStatusBar();
        if (g.phase === 'journal')
            this.text(screen, {
                'journal/text3': `物资 ${g.supplies} · 护甲 ${g.armor} · 战斗牌 ${g.usableCards.length} 张\n${g.scenario.suppliesHaveWeight === false ? '物品负重' : '初始总负重'} ${g.baseWeight} / 30`,
            });
        if (g.phase === 'map') {
            const initial = g.scenario.nodes[g.scenario.fixedNodeId];
            const fee =
                initial.type === 'scavenge'
                    ? (g.scenario.scavengeFees?.[g.scenario.fixedNodeId] ?? initial.cost)
                    : 0;
            const salvage =
                initial.type === 'scavenge'
                    ? `${initial.supplies[0] === initial.supplies[1] ? initial.supplies[0] : initial.supplies.join('–')} 物资 + ${initial.cardReward === 'fixed' ? g.content.cards[g.content.catalog.fixedReward].name : '随机物品'}`
                    : '';
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
                'map/fixedReward': `${fee ? `支付 ${fee} 物资 → ` : ''}${salvage}\n完成固定搜刮后，才能选择后续路线。`,
            });
            const map = screen.getComponentInChildren(RouteMap);
            if (map) map.refresh(g);
            else {
                screen.getChildByName('RouteGraph')!.active = g.fixedDone;
                screen.getChildByName('InitialHint')!.active = !g.fixedDone;
                screen
                    .getComponentsInChildren(MapPointPresentation)
                    .forEach((point) => point.refresh(g));
                for (const route of Object.keys(g.scenario.routes))
                    this.button(screen, 'route-' + route, undefined, g.currentNode === 'choice');
            }
        }
        if (g.phase === 'battle') this.renderBattle(screen);
        if (g.phase === 'rewards') this.rewards.render(screen);
        if (g.phase === 'rest') {
            const cash = g.cards.some((c) => c.kind === 'cash');
            this.text(screen, {
                'banner/text2': g.critical
                    ? '感染临界无法恢复护甲。趁现在整理行囊。'
                    : '进入时已恢复最多 2 点护甲。物资不会恢复。',
                'rest/text1': `${g.content.cards.cash.name}已经不再有用。\n丢弃后释放 ${g.content.cards.cash.weight} 点负重，暂存卡会自动转入。`,
                'rest/text3': `${g.usableCards.length} 张可用牌 · ${g.cards.filter((c) => c.zone === 'overflow').length} 张暂存\n移出战斗不释放负重，永久丢弃才释放。`,
                'rest/text5': `护甲 ${g.armor}/10  ·  物资 ${g.supplies}  ·  负重 ${g.baseWeight}/30`,
            });
            this.button(
                screen,
                'rest-cash',
                cash
                    ? `丢弃${g.content.cards.cash.name} · 释放 ${g.content.cards.cash.weight} 负重`
                    : '现金已丢弃',
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
            for (const binding of screen.getComponentsInChildren(UIValue)) {
                if (binding.key === 'shelter/repair-hint') binding.setAlert(summary.repairRisk);
                if (binding.key === 'shelter/daily-summary')
                    binding.setAlert(summary.dailyShortfall);
            }
            this.button(screen, 'shelter-done', summary.doneCaption);
        }
        if (g.phase === 'day2') {
            const s = g.settlement!;
            this.text(screen, {
                'journal/text3': `带回 ${s.returnedCards} 张卡牌  /  物资剩余 ${g.supplies}`,
                'journal/text4': s.dailyShortfall
                    ? '最后结算：每日物资缺口 1。你选择优先修复。'
                    : `修复花费 ${s.repairSpent}，最后扣除每日物资 ${s.dailySpent}。`,
            });
        }
        if (g.phase === 'failure')
            this.text(screen, {
                'journal/text2': `${g.failureReason}\n\n本次教学探索已完整重置。\n卡牌没有永久损失，\n每日生存物资也没有扣除。`,
            });
        this.popups.render();
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
        const definition = g.scenario.enemies[b.enemy];
        const actors = world.getComponentsInChildren(ActorPresentation);
        for (const actor of actors)
            if (actor.actorId !== 'player')
                actor.node.active = actor.actorId === definition.actorId;
        this.enemy = actors.find((actor) => actor.actorId === definition.actorId) ?? null;
        if (!this.enemy) throw new Error('缺少敌人表现绑定：' + definition.actorId);
        this.text(screen, {
            'banner/text0': `ENCOUNTER / ROUND ${b.turn}`,
            'banner/text1': definition.title,
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
}
