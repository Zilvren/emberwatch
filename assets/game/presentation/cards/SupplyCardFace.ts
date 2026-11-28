import { _decorator, Color, Component, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { type CardDisplayModel, supplyPictureLayout } from './CardViewModel';
const { ccclass, property } = _decorator;

@ccclass('SupplyCardFace')
export class SupplyCardFace extends Component {
    @property(Node) heading: Node = null!;
    @property(Label) nameLabel: Label = null!;
    @property(Label) valueLabel: Label = null!;
    @property(Label) description: Label = null!;
    @property(Label) weight: Label = null!;
    @property(Label) status: Label = null!;
    @property(UITransform) picture: UITransform = null!;
    @property(Sprite) illustration: Sprite = null!;
    @property(Node) weightMark: Node = null!;

    show(model: CardDisplayModel, frame: SpriteFrame | null, blocked: string): void {
        const longName = model.title.length > 8;
        this.nameLabel.string = model.title;
        this.nameLabel.fontSize = longName ? 17 : 22;
        this.nameLabel.lineHeight = longName ? 19 : 25;
        this.valueLabel.string = model.effect;
        this.weight.string = String(model.supplyWeight);
        this.status.string = blocked;
        this.status.node.active = !!blocked;

        const longCopy = model.description.length > 42;
        const rect = frame?.rect;
        const { height, headingShift } = supplyPictureLayout(model.description, rect ? rect.width / rect.height : 1, !!blocked);
        const top = 90 - headingShift, bottom = top - height;
        this.heading.setPosition(0, -headingShift);
        this.picture.height = height;
        this.picture.node.setPosition(0, top - height / 2);
        this.weightMark.setPosition(this.picture.width / 2 - 22, 5 - height / 2);
        this.illustration.spriteFrame = frame;
        this.illustration.color = blocked ? new Color(156, 145, 157) : Color.WHITE;
        if (frame) {
            const { width, height: artHeight } = frame.rect;
            const scale = Math.min((this.picture.width - 3) / width, (height - 3) / artHeight);
            this.illustration.node.getComponent(UITransform)!.setContentSize(width * scale, artHeight * scale);
        }
        this.description.node.active = !!model.description;
        if (model.description) {
            const textTop = bottom - 16, textBottom = blocked ? -137 : -155;
            this.description.node.setPosition(0, (textTop + textBottom) / 2);
            this.description.node.getComponent(UITransform)!.height = textTop - textBottom;
            this.description.fontSize = longCopy ? 12 : 14;
            this.description.lineHeight = longCopy ? 16 : 19;
            this.description.string = model.description;
        }
    }
}
