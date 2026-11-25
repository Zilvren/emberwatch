import { _decorator, Color, Component, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { CardKind, OwnedCard } from '../../core/SurvivalGame';
import { ButtonAction } from '../ui/ButtonAction';
import { effectSummary } from '../../core/content/CardCatalog';
const { ccclass, property } = _decorator;
const order: CardKind[] = ['attack', 'dodge', 'knife', 'evade', 'repair', 'heavy', 'slash', 'cash'];
@ccclass('InventoryRowPresentation')
export class InventoryRowPresentation extends Component {
    @property(Label) nameLabel: Label | null = null;
    @property(Label) weightLabel: Label | null = null;
    @property(Label) statusLabel: Label | null = null;
    @property(Label) detailLabel: Label | null = null;
    @property(Sprite) artwork: Sprite | null = null;
    @property(Node) cashGlyph: Node | null = null;
    @property({ type: [SpriteFrame] }) illustrations: SpriteFrame[] = [];
    @property artworkSize = 40;
    @property(ButtonAction) toggle: ButtonAction | null = null;
    @property(ButtonAction) discard: ButtonAction | null = null;
    refresh(card: Readonly<OwnedCard> | undefined, game: GameReadModel): void {
        this.node.active = !!card;
        if (!card) return;
        const definition = game.content.cards[card.kind];
        if (this.nameLabel) this.nameLabel.string = definition.name;
        if (this.weightLabel) this.weightLabel.string = '';
        if (this.detailLabel)
            this.detailLabel.string = effectSummary(definition, game.content.cards);
        if (this.statusLabel)
            this.statusLabel.string =
                card.zone === 'overflow'
                    ? '暂存 / 不可战斗'
                    : card.kind === 'cash'
                      ? '不进入抽牌'
                      : card.selected
                        ? '已入卡组'
                        : '携带 / 不抽取';
        if (this.artwork) {
            this.artwork.node.active = true;
            this.artwork.spriteFrame =
                this.illustrations[order.indexOf(definition.art)] ?? this.illustrations[2];
            const rect = this.artwork.spriteFrame?.rect;
            if (rect) {
                const scale = this.artworkSize / Math.max(rect.width, rect.height);
                this.artwork
                    .getComponent(UITransform)
                    ?.setContentSize(rect.width * scale, rect.height * scale);
            }
        }
        if (this.cashGlyph) this.cashGlyph.active = false;
        if (this.statusLabel)
            this.statusLabel.color = new Color().fromHEX(
                card.zone === 'overflow' ? '#8c5547' : card.selected ? '#4c5d3d' : '#555d47'
            );
        if (this.toggle) {
            this.toggle.node.active = game.phase === 'rest' && card.kind !== 'cash';
            this.toggle.actionId = 'toggle-' + card.id;
            this.toggle.setText(card.selected ? '移出战斗' : '加入战斗');
            this.toggle.setEnabled(card.zone === 'base');
        }
        if (this.discard) {
            this.discard.actionId = 'discard-' + card.id;
            this.discard.setText(
                card.kind === 'attack' || card.kind === 'dodge'
                    ? '基础保留'
                    : card.kind === 'cash' && game.phase !== 'rest'
                      ? '仅营地丢弃'
                      : game.phase !== 'rest' && game.phase !== 'rewards'
                        ? '仅可查看'
                        : '丢弃'
            );
            this.discard.setEnabled(
                (game.phase === 'rest' || game.phase === 'rewards') &&
                    card.kind !== 'attack' &&
                    card.kind !== 'dodge' &&
                    (card.kind !== 'cash' || game.phase === 'rest')
            );
        }
    }
}
