import { _decorator, Component, instantiate, Node, Prefab, UITransform } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { Battle } from '../../core/SurvivalGame';
import { CardInteraction } from './CardInteraction';
import { CardPresentation } from './CardPresentation';
const { ccclass, property } = _decorator;
@ccclass('HandPresentation')
export class HandPresentation extends Component {
    @property(Prefab) cardTemplate: Prefab | null = null;
    @property(Node) dragLayer: Node | null = null;
    @property spacing = 10;
    @property fanCurve = 7;
    @property fanAngle = 2.2;
    @property hoverLift = 12;
    @property hoverScale = 1.025;
    private cards = new Map<string, CardPresentation>();
    private layoutKey = '';
    private game: GameReadModel | null = null;
    private selected = '';
    private locked = false;
    private reduced = false;
    private battle: GameReadModel['battle'] = null;
    refresh(game: GameReadModel, selected: string, locked: boolean, reduced: boolean): void {
        if (this.battle !== game.battle) {
            for (const card of this.cards.values()) card.node.destroy();
            this.cards.clear();
            this.layoutKey = '';
            this.battle = game.battle;
        }
        this.game = game;
        this.selected = selected;
        this.locked = locked;
        this.reduced = reduced;
        const hand = game.battle?.hand ?? [];
        const ids = hand.map((c) => c.id),
            key = ids.join('|');
        const shieldSpearEquipped = !!game.battle &&
            (game.battle.weapons ?? (game.battle.weapon ? [game.battle.weapon] : []))
                .some((weapon) => (game.content.cards[weapon.kind].weaponSlots ?? 1) === 2);
        for (const [id, card] of this.cards)
            if (ids.indexOf(id) < 0) {
                card.node.destroy();
                this.cards.delete(id);
            }
        hand.forEach((entry, i) => {
            let card = this.cards.get(entry.id);
            if (!card) {
                if (!this.cardTemplate) throw new Error('Hand card prefab is not assigned.');
                const node = instantiate(this.cardTemplate);
                node.active = true;
                this.node.addChild(node);
                card = node.getComponent(CardPresentation)!;
                card.cardId = entry.id;
                this.cards.set(entry.id, card);
                this.bindInput(card);
                card.playDraw(reduced);
            }
            card.configure(
                entry.kind,
                game.cardBlocked(entry),
                selected === entry.id
                    ? '选择敌人为目标'
                    : game.scenario.fieldDeck
                      ? ''
                      : '点击 / 拖动',
                entry.id,
                game.content.cards,
                game.scenario.battleResource === 'stamina' ? '体力' : '物资',
                {
                    field: game.scenario.fieldDeck,
                    runDeck: game.scenario.runDeck,
                    damage: game.content.cards[entry.kind].effect.type === 'damage' &&
                        !(game.battle?.rage !== undefined &&
                            !!game.content.cards[entry.kind].effect.rage &&
                            game.battle.rage >= game.content.cards[entry.kind].effect.rage!.threshold)
                        ? game.attackDamage(entry.kind)
                        : undefined,
                    cost: game.cardCost(entry.kind),
                    rageReady: shieldSpearEquipped &&
                        !!game.content.cards[entry.kind].effect.rage &&
                        game.battle.rage !== undefined &&
                        game.battle.rage >= game.content.cards[entry.kind].effect.rage!.threshold,
                }
            );
            card.setSelected(selected === entry.id);
            card.node.getComponent(CardInteraction)?.sync();
            if (key !== this.layoutKey) {
                const size = card.node.getComponent(UITransform)!.contentSize,
                    mid = (hand.length - 1) / 2;
                card.node.setParent(this.node);
                card.node.setPosition(
                    (i - mid) * (size.width + this.spacing),
                    -Math.abs(i - mid) * this.fanCurve,
                    0
                );
                card.node.angle = (mid - i) * this.fanAngle;
            }
        });
        this.layoutKey = key;
    }
    getCard(id: string): CardPresentation | null {
        return this.cards.get(id) ?? null;
    }
    entries(): CardPresentation[] {
        return [...this.cards.values()];
    }
    setLocked(value: boolean): void {
        this.locked = value;
    }
    private bindInput(card: CardPresentation): void {
        const input =
            card.node.getComponent(CardInteraction) ?? card.node.addComponent(CardInteraction);
        input.setup(card, {
            enabled: () => !this.locked && this.game?.phase === 'battle',
            selected: () => this.selected === card.cardId,
            reduced: () => this.reduced,
            dragLayer: () => this.dragLayer,
            lift: () => this.hoverLift,
            zoom: () => this.hoverScale,
            focus: () => {
                if (this.node.parent)
                    this.node.setSiblingIndex(this.node.parent.children.length - 1);
            },
        });
    }
}
