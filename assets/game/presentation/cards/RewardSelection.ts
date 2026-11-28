import { _decorator, Component, EventMouse, game as engine, Label, Node, screen, UITransform, Vec2 } from 'cc';
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
    private canReadDetails = false;
    private canvas: HTMLCanvasElement | null = null;
    private detailCards: SelectableCard[] = [];
    private pressedCard: SelectableCard | null = null;

    onEnable(): void {
        if (typeof window === 'undefined') return;
        this.canvas = engine.canvas;
        this.canvas?.addEventListener('mousedown', this.rightDown, true);
        window.addEventListener('mouseup', this.rightUp, true);
    }
    onDisable(): void {
        this.canvas?.removeEventListener('mousedown', this.rightDown, true);
        if (typeof window !== 'undefined') window.removeEventListener('mouseup', this.rightUp, true);
        this.canvas = null;
        this.detailCards = [];
        this.pressedCard = null;
        this.canReadDetails = false;
    }
    private cardAt(event: MouseEvent): SelectableCard | null {
        const rect = this.canvas?.getBoundingClientRect();
        if (!rect) return null;
        const dpr = screen.devicePixelRatio;
        const point = new Vec2((event.clientX - rect.left) * dpr, (rect.bottom - event.clientY) * dpr);
        return this.detailCards.find(view =>
            view.node.activeInHierarchy && view.getComponent(UITransform)?.hitTest(point)
        ) ?? null;
    }
    // Cocos turns desktop mouse clicks into touch events for its buttons.
    // Capture the secondary button before it can act as a left click.
    private rightDown = (event: MouseEvent): void => {
        if (!this.canReadDetails || event.button !== EventMouse.BUTTON_RIGHT) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.pressedCard = this.cardAt(event);
    };
    private rightUp = (event: MouseEvent): void => {
        if (event.button !== EventMouse.BUTTON_RIGHT) return;
        const pressed = this.pressedCard;
        this.pressedCard = null;
        if (!this.canReadDetails || (!pressed && event.target !== this.canvas)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!pressed || pressed !== this.cardAt(event)) return;
        const opening = !pressed.card?.expanded;
        for (const view of this.detailCards) view.setDetailsExpanded(opening && view === pressed);
    };
    refresh(game: GameReadModel, selection: number, page = 0, canReadDetails = true): void {
        this.canReadDetails = canReadDetails;
        this.detailCards = [];
        this.pressedCard = null;
        const missing = game.scenario.runDeck
            ? missingSynthesisMaterials(game.content.catalog.recipes, game.usableCards)
            : new Set<string>();
        const discovery = game.battle?.discovery;
        const battleChoice = game.battle?.cardChoice;
        const fieldDiscovery = !!game.rewards?.discovery;
        const mode = battleChoice?.mode;
        const battle = game.battle;
        const pile = mode === 'replace-weapon' ? (battle?.weapons ?? (battle?.weapon ? [battle.weapon] : []))
            : mode === 'discard-to-top' ? battle?.discard
            : mode === 'deck-discovery' ? [...battle!.draw, ...battle!.discard] : battle?.hand;
        const cards = battleChoice
            ? battleChoice.ids.slice(page * 3, page * 3 + 3).map((id) =>
                mode === 'fist-discovery' ? id : pile!.find((card) => card.id === id)!.kind)
            : discovery ?? game.rewards?.cards ?? [];
        const taken = !!game.rewards?.cardTaken;
        const supplyOffer = fieldDiscovery && game.content.cards[cards[0]]?.role === 'supply';
        const choiceTitle = {
            'retain-hand': '保留到下回合',
            'replace-weapon': '选择替换的武器',
            'discard-to-top': '放回抽牌堆顶',
            'deck-discovery': '连击 · 牌组发现',
            'fist-discovery': '连击 · 特殊发现',
            'switch-stance': '变招 · 选择要弃掉的招式',
            'recover-stamina': '换气 · 选择要移出的招式',
        };
        if (this.heading)
            this.heading.string = discovery
                ? game.battle?.coreExposed
                    ? '闸芯暴露 · 再次发现'
                    : '战场发现'
                : mode ? choiceTitle[mode]
                : supplyOffer ? '物资卡奖励' : fieldDiscovery && game.expeditionMap?.version === 2
                    ? '战斗牌奖励' : fieldDiscovery ? '发现一张卡牌' : '选择一张卡牌';
        this.cardHolders.forEach((holder, slot) => {
            const index = (cards.length === 1 ? 0 : slot) + page * 3;
            const kind = cards.length === 1 ? (slot === 1 ? cards[0] : undefined) : cards[slot];
            holder.active = !!kind;
            if (!kind) return;
            const view = holder.getComponentInChildren(SelectableCard);
            if (!view) throw new Error('Reward candidate holder has no SelectableCard instance.');
            view.detailsPreviewEnabled = canReadDetails && game.content.cards[kind].role !== 'supply';
            if (view.detailsPreviewEnabled) this.detailCards.push(view);
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
        const stock = supplyOffer ? cards[0] : undefined;
        const pages = battleChoice ? Math.ceil(battleChoice.ids.length / 3) : 1;
        const choiceHint = mode === 'switch-stance' ? '弃掉这张牌，获得另一种招式的临时牌。'
            : mode === 'recover-stamina' ? '从本场移出这张牌。正式招式回 1 体力，临时招式回 2 体力。'
            : mode === 'deck-discovery' ? '选一张已有的牌入手。手牌满时放到抽牌堆顶。'
            : mode === 'fist-discovery' ? '选一张临时招式继续连段。手牌满时放到抽牌堆顶。'
            : '可以略过。';
        const unlocked = game.rewards?.guaranteedFinisher;
        const unlockHint = unlocked && cards.indexOf(unlocked) >= 0 && !taken && !kind
            ? `本场解锁「${game.content.cards[unlocked].name}」的奖励版。` : '';
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
                      ? (mode === 'recover-stamina' ? '移出 · ' : mode === 'switch-stance' ? '弃掉 · '
                          : discovery || fieldDiscovery || mode === 'deck-discovery' || mode === 'fist-discovery' ? '拿取 · ' : '确认 · ')
                          + game.content.cards[kind].name
                      : '先选择一张卡'
            );
            this.confirm.setEnabled(!!kind && !taken && !reason);
        }
        if (this.hint)
            this.hint.string = battleChoice
                ? (pages > 1 ? `第 ${page + 1} / ${pages} 页 · ` : '') + choiceHint
                : stock ? game.rewardCardBlocked(stock) ? '行囊和暂存区都放不下这张卡，可以先整理行囊。'
                    : (game.rewardZone(stock) === 'overflow'
                    ? '行囊空间不足，可先放入暂存区。返营前需腾出行囊空间。'
                    : '可放入行囊。成功返营后存入仓库，兑换时才获得物资点。')
                : unlockHint || (fieldDiscovery ? (kind ? '收下后加入本趟牌组，从下一场战斗开始可抽到。'
                    : '右键查看详细描述。左键选中后确认领取。')
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
                            : '确认后加入本次探索的行囊'));
    }
}
