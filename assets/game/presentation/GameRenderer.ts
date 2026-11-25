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
import { StatusBar } from './ui/StatusBar';
import { RouteMap } from './map/RouteMap';
import { shelterSummary } from './ui/ShelterSummaryModel';
import { rulesNotice } from './ui/RulesNoticeModel';
import { SceneAtmosphere } from './effects/SceneAtmosphere';
import { TideBattleLayout } from './ui/TideBattleLayout';
import { generatedCards } from '../core/content/CardCatalog';
/** Native view binding only. No game commands, storage or input subscriptions. */
export class GameRenderer extends NativeViewWriter {
    private readonly popups: PopupPresenter;
    private readonly rewards: RewardScreenPresenter;
    hero: ActorPresentation | null = null;
    enemy: ActorPresentation | null = null;
    activeScreen: Node | null = null;
    revision = -1;
    private look: 'legacy' | 'tide' | 'labyrinth' | null = null;
    private hiddenCombatUi: Node[] = [];
    private readonly battleLayout: TideBattleLayout;
    constructor(
        game: GameReadModel,
        private readonly ui: UiState,
        private readonly scene: SceneBindings,
        private readonly hand: HandPresentation | null,
        private readonly isMuted: () => boolean,
        private readonly saveStatus: () => string,
        private readonly newGameRuleset: () => string = () => 'stamina-v1',
        synthesisView: () => { blocked: string; canUndo: boolean } = () => ({
            blocked: '',
            canUndo: false,
        }),
        private readonly fieldUpdateAvailable: () => boolean = () => false,
        private readonly newGameDestination: () => string = () => '退潮盐原'
    ) {
        super(game);
        this.battleLayout = new TideBattleLayout(scene.screens.battle);
        this.popups = new PopupPresenter(
            game,
            ui,
            scene.popups,
            this,
            newGameRuleset,
            synthesisView,
            fieldUpdateAvailable,
            newGameDestination
        );
        this.rewards = new RewardScreenPresenter(game, ui, this);
    }
    render(): void {
        const g = this.game;
        const discovery = !!g.battle?.discovery || !!g.battle?.cardChoice;
        const look = g.scenario.labyrinth ? 'labyrinth' : g.scenario.fieldDeck ? 'tide' : 'legacy';
        if (this.look !== look) {
            this.look = look;
            for (const key of Object.keys(this.scene.screens)) {
                const root = this.scene.screens[key];
                root.getComponentInChildren(SceneAtmosphere)?.setLook(look);
                for (const actor of root.getComponentsInChildren(ActorPresentation)) actor.setLook(look);
            }
        }
        if (!discovery && this.hiddenCombatUi.length) {
            for (const node of this.hiddenCombatUi) node.active = true;
            this.hiddenCombatUi = [];
        }
        const screenKey = discovery
            ? 'rewards'
            : g.phase === 'journal' && g.currentJournal?.id !== 'departure'
              ? 'day2'
              : g.phase;
        if (g.phase !== 'rewards' && !discovery) {
            this.ui.rewardSelection = -1;
            this.ui.rewardContext = '';
            this.ui.rewardPage = 0;
        }
        for (const phase of Object.keys(this.scene.screens))
            this.scene.screens[phase].active =
                phase === screenKey || (discovery && phase === 'battle');
        this.activeScreen = this.scene.screens[screenKey];
        const screen = this.activeScreen;
        const actors = (discovery ? this.scene.screens.battle : screen).getComponentsInChildren(ActorPresentation);
        this.hero = actors.find((actor) => actor.actorId === 'player') ?? null;
        this.hero?.setArmed(g.phase === 'battle' && !!g.battle?.weapon);
        this.renderStatusBar();
        if (g.phase === 'journal' && g.currentJournal) {
            const entry = g.currentJournal;
            this.text(screen, {
                'journal/text0': 'SURVIVAL JOURNAL / 关键记录',
                'journal/text1': `第 ${entry.day} 天 · ${entry.title}`,
                'journal/text2': entry.body,
                'journal/text3': g.scenario.fieldDeck
                    ? `物资 ${g.supplies} · 护甲 ${g.armor}/10 · 基础牌组 ${g.usableCards.length} 张`
                    : `物资 ${g.supplies} · 护甲 ${g.armor} · 战斗牌 ${g.usableCards.length} 张\n${g.scenario.suppliesHaveWeight === false ? '物品负重' : '初始总负重'} ${g.baseWeight} / 30`,
                'journal/text4': g.scenario.fieldDeck
                    ? '目的地 · ' + g.scenario.title
                    : '余烬之中，仍有人守夜。',
                'journal/text5': '',
                'journal/text6': '',
            });
            this.button(
                screen,
                'journal-start',
                g.pendingJournalCount > 1
                    ? '下一篇日志'
                    : entry.id === 'departure'
                      ? g.scenario.fieldDeck
                          ? '前往' + g.scenario.title
                          : '整备出发'
                      : '返回避难所'
            );
        }
        if (g.phase === 'map') {
            const initial = g.scenario.nodes[g.scenario.fixedNodeId];
            const fee =
                initial.type === 'scavenge'
                    ? (g.scenario.scavengeFees?.[g.scenario.fixedNodeId] ?? initial.cost)
                    : 0;
            const salvage =
                initial.type === 'scavenge'
                    ? `${initial.supplies[0] === initial.supplies[1] ? initial.supplies[0] : initial.supplies.join('–')} 物资` +
                        (g.scenario.fieldDeck ? '' : ` + ${initial.cardReward === 'fixed' ? g.content.cards[g.content.catalog.fixedReward].name : '随机物品'}`)
                    : '';
            this.text(screen, {
                'banner/text2':
                    g.currentNode === 'return'
                        ? '路已走完。正在自动返回避难所……'
                        : '前往亮起的地点。全程无法主动撤离。',
                'map/text0': g.scenario.fieldDeck ? `已走过 ${g.visited.length} 处 · 随行牌组 ${g.cards.length} 张`
                    : `负重 ${g.baseWeight}/30  ·  暂存 ${g.overflowWeight}/10`,
                'map/text1':
                    g.scenario.labyrinth ? '战后与指定搜刮点可以发现卡牌。'
                        : g.scenario.suppliesHaveWeight === false
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
        if (g.phase === 'battle' && !this.hiddenCombatUi.length) {
            const battle = this.scene.screens.battle;
            this.renderBattle(battle);
            if (discovery) {
                this.hiddenCombatUi = battle.children.filter(
                    (node) => node.name !== 'World' && node.active
                );
                for (const node of this.hiddenCombatUi) node.active = false;
            }
        }
        if (g.phase === 'rewards' || discovery) this.rewards.render(screen);
        if (g.phase === 'rest') {
            const cash = g.cards.some((c) => c.kind === 'cash');
            this.text(screen, {
                'banner/text2': g.critical
                    ? '感染临界无法恢复护甲。趁现在整理行囊。'
                    : '进入时已恢复最多 2 点护甲。物资不会恢复。',
                'rest/text0': g.scenario.runDeck ? '合成' : '整理背包',
                'rest/text1': g.scenario.runDeck
                    ? '使用本局卡组里的材料。\n可以连续合成。'
                    : `${g.content.cards.cash.name}已经不再有用。\n丢弃后释放 ${g.content.cards.cash.weight} 点负重，暂存卡会自动转入。`,
                'rest/text2': g.scenario.runDeck ? '本局卡组' : '出手卡组',
                'rest/text3': g.scenario.runDeck
                    ? `${g.usableCards.length} 张战斗牌 · 本局使用\n搜刮的物资卡放在行囊里。`
                    : `${g.usableCards.length} 张可用牌 · ${g.cards.filter((c) => c.zone === 'overflow').length} 张暂存\n移出战斗不释放负重，永久丢弃才释放。`,
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
            for (const action of screen.getComponentsInChildren(ButtonAction)) {
                if (action.actionId === 'rest-cash')
                    action.node.active = !g.scenario.runDeck && !g.scenario.fieldDeck;
                if (action.actionId === 'rest-synthesis') action.node.active = !!g.scenario.runDeck;
                if (action.actionId === 'rest-bag')
                    action.setText(g.scenario.runDeck ? '查看本局卡组' : '整理出手卡组');
            }
            if (g.scenario.fieldDeck) {
                const nextId = g.scenario.routes[g.route!][g.pathIndex + 1];
                const next = g.scenario.nodes[nextId];
                const enemy = next?.type === 'battle' ? g.scenario.enemies[next.enemyId] : null;
                this.text(screen, {
                    'banner/text1': nodeTitle(g.scenario, g.currentNode),
                    'banner/text2': g.scenario.labyrinth ? '岩壁挡住了风。可以在这里恢复护甲。'
                        : '舱壳隔开了盐风。通往潮闸的最后一段路就在窗外。',
                    'rest/text0': '护甲状况',
                    'rest/text1': g.critical
                        ? g.scenario.labyrinth ? '护甲临界 · 此处无法修复' : '压力服临界 · 此处无法修复'
                        : `休息后护甲 ${g.armor} / 10`,
                    'rest/text2': '随行牌组',
                    'rest/text3': `${g.cards.length} 张 · 其中 ${g.cards.filter((c) => c.found).length} 张为本次发现\n下一场战斗会重新洗牌。`,
                    'rest/text4': enemy
                        ? `下一站 · ${enemy.title}\n生命 ${enemy.hp} · 普攻 ${enemy.attack} · 蓄势后 ${enemy.strongAttack}`
                        : '下一站 · ' + (next?.title ?? '避难所'),
                    'rest/text5': '',
                });
                this.button(screen, 'rest-bag', '查看随行牌组');
            }
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
                'journal/text2': g.scenario.runDeck
                    ? `${g.failureReason}\n\n本局卡组和行囊已清空。下次出发使用固定初始卡组。`
                    : `${g.failureReason}\n\n初始补给、牌组和护甲已恢复。\n${g.scenario.kind === 'tutorial' ? '教学仍停留在第 1 天。' : '一天过去了，已经走过的时间和关键记录仍然保留。'}`,
                'journal/text3': `物资 ${g.supplies} · 护甲 ${g.armor} · 战斗牌 ${g.usableCards.length} 张`,
                'journal/text5': '',
            });
            this.button(screen, 'journal-start', '返回避难所');
        }
        this.popups.render();
        this.hand?.setLocked(discovery || this.ui.busy || !!this.ui.overlay);
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
            fieldCards: g.scenario.fieldDeck ? g.cards.length : undefined,
            saveStatus: this.saveStatus(),
            muted: this.isMuted(),
            actionsEnabled: !this.ui.busy && !this.ui.overlay,
            recipesVisible: !g.scenario.labyrinth && (g.phase === 'map' || g.phase === 'battle'),
            rulesNotice: rulesNotice(
                g.scenario.ruleset,
                this.newGameRuleset(),
                this.fieldUpdateAvailable(),
                this.newGameDestination()
            ).caption,
        });
    }
    renderBattle(screen: Node): void {
        this.renderStatusBar();
        const g = this.game,
            b = g.battle!,
            attack = b.intent === 'attack',
            world = screen.getChildByName('World')!;
        const shieldSpearEquipped = (b.weapons ?? (b.weapon ? [b.weapon] : []))
            .some((weapon) => (g.content.cards[weapon.kind].weaponSlots ?? 1) === 2);
        const gauge = screen.getChildByName('StaminaGauge');
        if (gauge) gauge.active = g.scenario.battleResource === 'stamina';
        const definition = g.scenario.enemies[b.enemy];
        this.battleLayout.show(!!g.scenario.fieldDeck, definition.actorId === 'brute', !!g.scenario.labyrinth);
        if (g.scenario.labyrinth)
            world.getComponent(SceneAtmosphere)?.setLook(definition.actorId === 'veil-idol' ? 'court' : 'labyrinth');
        const actors = world.getComponentsInChildren(ActorPresentation);
        for (const actor of actors)
            if (actor.actorId !== 'player')
                actor.node.active = actor.actorId === definition.actorId;
        this.enemy = actors.find((actor) => actor.actorId === definition.actorId) ?? null;
        if (!this.enemy) throw new Error('缺少敌人表现绑定：' + definition.actorId);
        const calm = b.calm;
        const calmLabel = screen.getChildByName('banner-text2');
        if (calmLabel) {
            calmLabel.active = !!calm;
            if (calm) calmLabel.setPosition(-353, 280);
        }
        const calmText = calm ? `镇静 ${calm.persistent + calm.temporary} / ${calm.limit}` +
            (calm.temporary ? ` · 临时 ${calm.temporary}` : '') +
            (calm.freeSkill ? ' · 下张技能免费' : '') + (calm.calibrated ? ' · 已校准' : '') : '';
        this.text(screen, {
            'banner/text0': `ENCOUNTER / ROUND ${b.turn}`,
            'banner/text1': definition.title,
            ...(calm ? { 'banner/text2': calmText } : {}),
            'battle/text0': attack
                ? `${g.scenario.fieldDeck && b.boosted ? '强击' : '攻击'} ${g.incomingDamage}`
                : '蓄势 · 准备',
            'battle/text1': calm?.deferred === 'scheduled' ? '已暂缓 · 即将额外行动'
                : attack
                ? Math.max(0, g.incomingDamage - b.block) === 0
                    ? '已完全格挡'
                    : g.critical
                      ? '结束回合将失守'
                      : `结束回合将受伤 ${Math.max(0, g.incomingDamage - b.block)}`
                : `下次攻击 ${b.strongAttack}`,
            'battle/text2': shieldSpearEquipped && b.rage !== undefined
                ? `盾矛蓄势 ${'●'.repeat(b.rage)}${'○'.repeat(5 - b.rage)}`
                : '',
            'battle/text3': `护甲 ${g.armor}/10`,
            'battle/text4': `格挡 ${b.block}`,
            'battle/text5': `敌人生命 ${b.hp}/${b.maxHp}`,
            'battle/text6': g.scenario.labyrinth ? '护甲临界 · 再次受伤即失守' : g.scenario.fieldDeck
                ? '压力服临界 · 再次受伤即失守'
                : '感染临界：再次实际受伤即失败',
            'battle/text7': '',
            'battle/text8': '',
            'battle/text9': this.ui.busy
                ? '正在行动…'
                : this.ui.selectedCard
                  ? '已选攻击牌 · 再次点击可取消\n点击敌人或拖向敌人'
                  : g.scenario.fieldDeck
                    ? b.turn === 1
                        ? '攻击牌点选敌人 · 长按手牌查看说明'
                        : ''
                    : '攻击牌选敌人，其余牌点击即用\n长按看详情 · 拖出场地可取消',
            'battle/text10': `回合 ${b.turn} · 手牌 ${b.hand.length} / ${g.scenario.runDeck ? 10 : 6}`,
            'drawPile/text0': b.draw.length,
            'discardPile/text0': b.discard.length,
            'battle/stamina-value': `${b.stamina}/${b.maxStamina}`,
            'battle/stamina-hint': `每回合 ${b.maxStamina}`,
        });
        screen.getChildByName('CriticalWarning')!.active = g.critical;
        screen.getChildByName('WeaponSlot')!.active = !!b.weapon;
        if (b.weapon) {
            const equipped = b.weapons ?? [b.weapon];
            const names = equipped.map((weapon) => {
                const definition = this.game.content.cards[weapon.kind];
                return `${definition.name}：${generatedCards(definition.effect).map((id) => this.game.content.cards[id].name).join('、')}`;
            });
            this.text(screen, {
                'battle/text7': names.join(' · '),
                'battle/text8': `${b.turn === b.equippedTurn ? '下回合起生成' : '每回合生成'}${names.map((name) => name.split('：')[1] ?? '').join(' · ')}`,
            });
        }
        screen.getChildByName('TargetGuide')!.active = !!this.ui.selectedCard;
        for (const progress of screen.getComponentsInChildren(UIProgress))
            progress.setRatio(progress.key === 'armor' ? g.armor / 10 : b.hp / b.maxHp);
        this.hand?.refresh(
            g,
            this.ui.selectedCard,
            this.ui.busy || !!this.ui.overlay,
            this.ui.reduced
        );
        this.button(screen, 'end-turn', calm?.deferred === 'scheduled' ? '进入额外回合' : '结束回合',
            !this.ui.busy && !this.ui.overlay && !b.discovery && !b.cardChoice);
    }
}
