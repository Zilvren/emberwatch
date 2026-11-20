import { bindScene, type SceneBindings } from './ui/GameView';
import {
    _decorator,
    Component,
    instantiate,
    JsonAsset,
    Label,
    Node,
    Prefab,
    ResolutionPolicy,
    resources,
    sys,
    UITransform,
    Vec2,
    Vec3,
    view,
} from 'cc';
import { GameCommand, GameSession } from '../application/GameSession';
import { installCatalog } from '../core/content/CardCatalog';
import { installJournalCatalog } from '../core/content/JournalCatalog';
import type { GameReadModel } from '../core/GameReadModel';
import { CardKind } from '../core/SurvivalGame';
import { SaveRepository } from '../infrastructure/SaveRepository';
import { ActorPresentation } from './actors/ActorPresentation';
import { GameAudio } from './audio/GameAudio';
import { HandPresentation } from './cards/HandPresentation';
import { GameRenderer } from './GameRenderer';
import { MapPointPresentation } from './map/MapPointPresentation';
import { ButtonAction } from './ui/ButtonAction';
import { StatusBar } from './ui/StatusBar';
import { SceneAtmosphere } from './effects/SceneAtmosphere';
import { enterEncounterPreview } from './dev/EncounterPreview';
import {
    RUN_DECK_SCENARIO,
    STAMINA_SCENARIO,
    TUTORIAL_SCENARIO,
} from '../core/content/GameScenario';
import { UiActionRouter } from './ui/UiActionRouter';
import { ACTION_EVENT, ActionInputEvent, CARD_DROP_EVENT, CardDropInputEvent } from './ui/UIEvents';
import { initialUiState } from './ui/UiState';
const { ccclass, property } = _decorator;

/** Scene controller. All fixed layout, art, controls and clips live in native assets. */

@ccclass('GameDirector')
export class GameDirector extends Component {
    private readonly ui = initialUiState();
    private renderer!: GameRenderer;
    private router!: UiActionRouter;
    private get hero(): ActorPresentation | null {
        return this.renderer?.hero ?? null;
    }
    private get enemy(): ActorPresentation | null {
        return this.renderer?.enemy ?? null;
    }
    private refresh(): void {
        this.renderer.render();
        this.syncActorMotionPreference();
        // Keep transient feedback clear of overlay headings and the map's paper sheet.
        const toastY = this.ui.overlay ? 388 : this.game.phase === 'map' ? -416 : 345;
        this.toastRoot?.setPosition(0, toastY, 0);
    }
    private refreshBattle(screen: Node): void {
        this.renderer.renderBattle(screen);
    }
    private syncActorMotionPreference(): void {
        for (const actor of this.renderer.activeScreen?.getComponentsInChildren(
            ActorPresentation
        ) ?? [])
            actor.setReducedMotion(this.ui.reduced);
    }
    private attackKind(kind: CardKind): boolean {
        return this.game.content.cards[kind].effect.type === 'damage';
    }
    @property(Node) hud: Node | null = null;
    @property(Node) screensRoot: Node | null = null;
    @property(Node) popupRoot: Node | null = null;
    @property(Node) effectsRoot: Node | null = null;
    @property(Node) dragLayer: Node | null = null;
    @property(Node) toastRoot: Node | null = null;
    @property(Label) toastLabel: Label | null = null;
    @property({
        type: [Node],
        tooltip: 'GameView 标识的屏幕根节点，顺序任意',
    })
    screenRoots: Node[] = [];
    private scene!: SceneBindings;
    @property({
        type: [Node],
        tooltip: 'GameView 标识的弹窗根节点，顺序任意',
    })
    popupRoots: Node[] = [];
    @property(Prefab) floatTemplate: Prefab | null = null;
    @property(Prefab) attackTemplate: Prefab | null = null;
    @property(Prefab) blockTemplate: Prefab | null = null;
    @property(Prefab) healTemplate: Prefab | null = null;
    private game!: GameReadModel;
    private session!: GameSession;
    private audio = new GameAudio();
    private toastTime = 0;
    private motionQuery: MediaQueryList | null = null;
    private motionChanged = (event: MediaQueryListEvent) => {
        this.ui.reduced = event.matches;
        if (!this.renderer) return;
        this.syncActorMotionPreference();
        // A hit may already advance the rules phase while its animation finishes.
        // Existing completion callbacks own that screen switch.
        if (!this.ui.busy) this.refresh();
    };
    private hand: HandPresentation | null = null;
    onLoad(): void {
        this.message('正在读取卡牌配置…');
        void this.initialize().catch((error) => {
            this.message(`游戏初始化失败：${String(error)}`);
            this.toastTime = 0;
            console.error('[the end] initialization', error);
        });
    }
    private async initialize(): Promise<void> {
        const live =
            typeof location !== 'undefined' &&
            new URLSearchParams(location.search).get('cards') === 'live';
        if (live) {
            const response = await fetch('/api/cards', { cache: 'no-store' });
            if (!response.ok)
                throw new Error('本地卡牌编辑器服务不可用，请通过编辑器的试玩入口打开。');
            installCatalog((await response.json()).catalog);
        } else {
            const asset = await new Promise<JsonAsset>((resolve, reject) =>
                resources.load('data/cards', JsonAsset, (error, asset) =>
                    error ? reject(error) : resolve(asset)
                )
            );
            installCatalog(asset.json);
        }
        const journalAsset = await new Promise<JsonAsset>((resolve, reject) =>
            resources.load('data/journals', JsonAsset, (error, asset) =>
                error ? reject(error) : resolve(asset)
            )
        );
        installJournalCatalog(journalAsset.json);
        if (!this.isValid) return;
        const seed =
            typeof location === 'undefined'
                ? null
                : new URLSearchParams(location.search).get('seed');
        const query = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
        const saving =
            query?.get('save') !== 'off' && (seed === null || query?.get('save') === 'on');
        this.session = new GameSession(
            seed === null ? undefined : Number(seed),
            saving ? new SaveRepository(sys.localStorage) : undefined,
            seed !== null && query?.get('ruleset') === 'tutorial-v1'
                ? TUTORIAL_SCENARIO
                : seed !== null && query?.get('ruleset') === 'stamina-v1'
                  ? STAMINA_SCENARIO
                  : RUN_DECK_SCENARIO,
            query?.get('save') === 'off' && query?.get('mapCraft') === '1'
        );
        if (!saving && seed !== null && query?.get('preview') === 'encounter')
            enterEncounterPreview(this.session);
        this.game = this.session.view;
        this.motionQuery =
            typeof matchMedia === 'undefined'
                ? null
                : matchMedia('(prefers-reduced-motion: reduce)');
        this.ui.reduced = this.motionQuery?.matches ?? false;
        this.motionQuery?.addEventListener('change', this.motionChanged);
        view.setDesignResolutionSize(1440, 900, ResolutionPolicy.SHOW_ALL);
        this.scene = bindScene(this.hud, this.screenRoots, this.popupRoots, this.game.scenario);
        this.hand = this.scene.screens.battle.getComponentInChildren(HandPresentation);
        if (this.hand) this.hand.dragLayer = this.dragLayer;
        this.renderer = new GameRenderer(
            this.game,
            this.ui,
            this.scene,
            this.hand,
            () => this.audio.muted,
            () => this.session.saveStatus,
            () => this.session.newGameRuleset,
            () => ({
                blocked: this.session.synthesisBlocked,
                canUndo: this.session.canUndoSynthesis,
            })
        );
        this.router = new UiActionRouter(this.session, this.ui, {
            act: (command, sound) => this.act(command, sound),
            refresh: () => this.refresh(),
            playCard: (id) => this.playCard(id),
            enemyTurn: () => this.enemyTurn(),
            message: (text) => this.message(text),
            sound: (name) => this.audio.play(name),
            toggleAudio: () => {
                this.audio.muted = !this.audio.muted;
            },
            healEffect: () => this.effect('heal', this.hero, '+护甲'),
        });
        this.node.on(ACTION_EVENT, this.onActionInput, this);
        this.node.on(CARD_DROP_EVENT, this.onDropInput, this);
        this.refresh();
        this.message(this.session.startupMessage);
        Object.assign(globalThis, {
            __survivalGame: this.session.game,
            __emberUI: { snapshot: () => this.snapshot() },
        });
    }
    onDestroy(): void {
        this.node.off(ACTION_EVENT, this.onActionInput, this);
        this.node.off(CARD_DROP_EVENT, this.onDropInput, this);
        this.motionQuery?.removeEventListener('change', this.motionChanged);
        this.audio.dispose();
    }
    update(dt: number): void {
        if (!this.renderer) return;
        const previousPhase = this.game.phase;
        if (!this.ui.busy) this.session.advanceTime(dt);
        if (
            previousPhase === 'map' &&
            (this.game.phase === 'shelter' || this.game.phase === 'journal')
        )
            this.message(
                this.game.phase === 'journal'
                    ? '已返回避难所，有一篇新的关键日志。'
                    : this.game.scenario.runDeck
                      ? '已返回避难所，可以兑换物资卡并整备下一局。'
                      : '已返回避难所，可以整备后再次出发。'
            );
        if (this.game.revision !== this.renderer.revision && !this.ui.busy) this.refresh();
        if (this.toastTime > 0) {
            this.toastTime -= dt;
            if (this.toastTime <= 0 && this.toastRoot) this.toastRoot.active = false;
        }
    }
    private message(text: string): void {
        if (this.toastLabel) this.toastLabel.string = text;
        if (this.toastRoot) this.toastRoot.active = !!text;
        this.toastTime = 2.8;
    }
    private act(command: GameCommand, sound: 'tap' | 'loot' | 'heal' = 'tap'): void {
        const result = this.session.execute(command);
        this.audio.play(result.ok ? sound : 'tap');
        this.message(result.message);
        if (this.game.phase === 'failure' || this.game.phase === 'journal') this.ui.overlay = null;
        this.ui.selectedCard = '';
        this.refresh();
    }
    private onActionInput(event: ActionInputEvent): void {
        event.propagationStopped = true;
        this.router.handle(event.detail);
    }
    private onDropInput(event: CardDropInputEvent): void {
        event.propagationStopped = true;
        this.onCardDrop(event.detail);
    }
    private onCardDrop(event: { id: string; point: Vec2; accept: () => void }): void {
        if (this.ui.busy || this.ui.overlay) return;
        const card = this.game.battle?.hand.find((c) => c.id === event.id),
            screen = this.scene.screens.battle;
        if (!card) return;
        const target = this.attackKind(card.kind)
            ? screen.getChildByName('enemy-target')
            : screen.getChildByName('PlayArea');
        if (
            target?.getComponent(UITransform)?.getBoundingBoxToWorld().contains(event.point) &&
            !this.game.cardBlocked(card)
        ) {
            event.accept();
            this.playCard(event.id);
        } else {
            this.ui.selectedCard = '';
            this.refresh();
        }
    }
    private playCard(id: string): void {
        const g = this.game,
            b = g.battle,
            card = b?.hand.find((c) => c.id === id);
        if (this.ui.busy || !b || !card) return;
        const reason = g.cardBlocked(card);
        if (reason) {
            this.message(reason);
            return;
        }
        this.ui.busy = true;
        this.ui.selectedCard = '';
        this.refreshBattle(this.scene.screens.battle);
        const oldHp = b.hp,
            oldArmor = g.armor,
            oldBlock = b.block,
            run = g.run;
        let pending = 1;
        const complete = () => {
            if (--pending || g.run !== run) return;
            this.ui.busy = false;
            this.refresh();
        };
        const impact = () => {
            if (g.run !== run) return;
            const result = this.session.execute({ type: 'play-card', id });
            if (this.attackKind(card.kind)) {
                if (this.enemy) {
                    pending++;
                    this.enemy.playAction(
                        g.phase === 'rewards' ? 'death' : 'hurt',
                        this.ui.reduced,
                        undefined,
                        complete
                    );
                }
                this.effect('attack', this.enemy, `−${oldHp - (g.battle?.hp ?? 0)}`);
            } else if (this.game.content.cards[card.kind].effect.type === 'heal')
                this.effect('heal', this.hero, `+${g.armor - oldArmor} 护甲`);
            else
                this.effect(
                    'block',
                    this.hero,
                    this.game.content.cards[card.kind].effect.type === 'equip'
                        ? '武器就绪'
                        : `+${(g.battle?.block ?? oldBlock) - oldBlock} 格挡`
                );
            this.message(result.message);
        };
        const presentation = this.hand?.getCard(id);
        this.audio.play(
            this.attackKind(card.kind)
                ? 'attack'
                : this.game.content.cards[card.kind].effect.type === 'heal'
                  ? 'heal'
                  : 'block'
        );
        if (this.attackKind(card.kind) && this.hero) {
            presentation?.playAction(
                () => {},
                () => {},
                this.ui.reduced
            );
            this.hero.playAction('attack', this.ui.reduced, impact, complete, this.enemy);
        } else if (presentation) presentation.playAction(impact, complete, this.ui.reduced);
        else {
            impact();
            complete();
        }
    }
    private enemyTurn(): void {
        const g = this.game,
            b = g.battle;
        if (this.ui.busy || !b) return;
        this.ui.busy = true;
        this.ui.selectedCard = '';
        this.refreshBattle(this.scene.screens.battle);
        const run = g.run,
            attacking = b.intent === 'attack',
            damage = Math.max(0, g.incomingDamage - b.block);
        this.audio.play(attacking ? 'enemy' : 'block');
        let pending = 1;
        const complete = () => {
            if (--pending) return;
            this.ui.busy = false;
            this.refresh();
        };
        const impact = () => {
            if (run !== g.run) return;
            const result = this.session.execute({ type: 'end-turn' });
            if (attacking) {
                if (damage && this.hero) {
                    pending++;
                    this.hero.playAction(
                        g.phase === 'failure' ? 'death' : 'hurt',
                        this.ui.reduced,
                        undefined,
                        complete
                    );
                }
                this.effect(
                    damage ? 'attack' : 'block',
                    this.hero,
                    damage ? `−${damage}` : '完全格挡'
                );
            } else this.effect('block', this.enemy, '正在蓄势');
            this.message(result.message);
        };
        if (this.enemy)
            this.enemy.playAction(
                attacking ? 'attack' : 'prepare',
                this.ui.reduced,
                impact,
                complete,
                this.hero
            );
        else {
            impact();
            complete();
        }
    }
    private effect(
        kind: 'attack' | 'block' | 'heal',
        actor: ActorPresentation | null,
        text: string
    ): void {
        if (kind === 'attack')
            this.renderer.activeScreen
                ?.getChildByName('World')
                ?.getComponent(SceneAtmosphere)
                ?.impact(this.ui.reduced);
        const template =
            kind === 'attack'
                ? this.attackTemplate
                : kind === 'block'
                  ? this.blockTemplate
                  : this.healTemplate;
        if (!actor || !this.effectsRoot || !template || !this.floatTemplate) return;
        const anchor = actor.impactAnchor ?? actor.node;
        const position = this.effectsRoot
            .getComponent(UITransform)!
            .convertToNodeSpaceAR(anchor.worldPosition);
        const effect = instantiate(template);
        effect.setPosition(position);
        this.effectsRoot.addChild(effect);
        const floating = instantiate(this.floatTemplate);
        floating.getComponentInChildren(Label)!.string = text;
        floating.setPosition(position);
        this.effectsRoot.addChild(floating);
    }
    private bounds(node: Node): { x: number; y: number; width: number; height: number } {
        const box = node.getComponent(UITransform)!.getBoundingBoxToWorld(),
            root = this.node.getComponent(UITransform)!;
        const low = root.convertToNodeSpaceAR(new Vec3(box.xMin, box.yMin, 0)),
            high = root.convertToNodeSpaceAR(new Vec3(box.xMax, box.yMax, 0));
        return { x: low.x + 720, y: 450 - high.y, width: high.x - low.x, height: high.y - low.y };
    }
    private snapshot(): object {
        const g = this.game;
        const hits = this.node
            .getComponentsInChildren(ButtonAction)
            .filter(
                (a) =>
                    a.node.activeInHierarchy && (!a.getComponent(MapPointPresentation) || a.enabled)
            )
            .map((a) => ({
                id: a.actionId,
                payload: a.payload,
                caption: a.caption?.string,
                ...this.bounds(a.node),
                enabled: a.enabled && !this.ui.busy,
            }));
        if (g.phase === 'battle')
            for (const card of this.hand?.entries() ?? [])
                hits.push({
                    id: 'card-' + card.cardId,
                    payload: card.cardId,
                    caption: undefined,
                    ...this.bounds(card.node),
                    enabled: !this.ui.busy && !this.ui.overlay,
                });
        return {
            phase: g.phase,
            ready: true,
            reducedMotion: this.ui.reduced,
            scenario: g.scenario.id,
            saveStatus: this.session.saveStatus,
            saveWarning: this.session.saveWarning,
            statusBar: this.hud?.getComponent(StatusBar)?.inspect(),
            sceneMotion: this.renderer.activeScreen
                ?.getChildByName('World')
                ?.getComponent(SceneAtmosphere)
                ?.inspect(),
            busy: this.ui.busy,
            overlay: this.ui.overlay,
            synthesisBlocked: this.session.synthesisBlocked,
            canUndoSynthesis: this.session.canUndoSynthesis,
            inventoryMode: this.ui.deckEdit ? 'deck' : 'inspect',
            inventoryReader: this.ui.bagReader,
            inspectedCard: this.ui.inspectedCard,
            inventoryFilter: this.ui.bagFilter,
            rewardSelection: this.ui.rewardSelection,
            ruleset: g.scenario.ruleset,
            entryTier: g.entryTier,
            stamina: g.battle?.stamina,
            maxStamina: g.battle?.maxStamina,
            selectedCard: this.ui.selectedCard,
            day: g.day,
            supplies: g.supplies,
            armor: g.armor,
            critical: g.critical,
            baseWeight: g.baseWeight,
            overflowWeight: g.overflowWeight,
            currentNode: g.currentNode,
            route: g.route,
            hand: g.battle?.hand.map((c) => ({
                id: c.id,
                kind: c.kind,
                blocked: g.cardBlocked(c),
            })),
            heroPose: this.hero?.pose,
            heroRenderer: this.hero?.rendererKind,
            heroRig: this.hero?.inspectRig(),
            heroMotion: this.hero?.motion,
            heroArmed: this.hero?.isArmed,
            enemyMotion: this.enemy?.motion,
            effects: this.effectsRoot?.children.length ?? 0,
            hits,
        };
    }
}
