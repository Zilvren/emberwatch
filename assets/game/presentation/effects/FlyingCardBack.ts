import { Node, Sprite, SpriteFrame, tween, UIOpacity, UITransform, Vec3 } from 'cc';

/** An open palm sends the paper a few card lengths into the air, where it fades away. */
export function flyCardBack(
    layer: Node,
    frame: SpriteFrame,
    start: { position: Vec3; angle: number; width: number; height: number }
): void {
    const card = new Node('FlyingCardBack');
    card.layer = layer.layer;
    card.addComponent(UITransform).setContentSize(start.width, start.height);
    const sprite = card.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    sprite.type = Sprite.Type.FILLED;
    sprite.fillType = Sprite.FillType.VERTICAL;
    sprite.fillRange = 1;
    const opacity = card.addComponent(UIOpacity);
    layer.addChild(card);
    card.setPosition(start.position);
    card.angle = start.angle;
    const position = new Vec3();
    const reach = start.width * 4.8;
    const rise = start.height * 1.6;
    tween(card)
        .to(.38, { angle: start.angle - 48 }, {
            onUpdate: (_node, ratio) => {
                const travel = 1 - (1 - ratio) ** 2;
                position.set(start.position.x + reach * travel,
                    start.position.y + rise * (travel + .18 * Math.sin(Math.PI * travel)), start.position.z);
                card.setPosition(position);
                const fade = Math.max(0, (ratio - .46) / .54);
                const dissolved = fade * fade * (3 - 2 * fade);
                sprite.fillStart = .76 * dissolved;
                sprite.fillRange = 1 - sprite.fillStart;
                opacity.opacity = Math.round(255 * (1 - dissolved));
            },
        })
        .call(() => card.destroy())
        .start();
}
