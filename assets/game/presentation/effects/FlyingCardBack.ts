import { Node, Sprite, SpriteFrame, tween, UITransform, Vec3 } from 'cc';

/** The projectile belongs to the scene effects layer, independently of the actor's pose. */
export function flyCardBack(
    layer: Node,
    frame: SpriteFrame,
    start: Vec3,
    end: Vec3,
    arrived: () => void
): void {
    const card = new Node('FlyingCardBack');
    card.layer = layer.layer;
    card.addComponent(UITransform).setContentSize(24, 33);
    const sprite = card.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    layer.addChild(card);
    card.setPosition(start);
    const middle = Vec3.lerp(new Vec3(), start, end, .40);
    middle.y += 32;
    tween(card)
        .to(.12, { position: middle, angle: -13 }, { easing: 'sineOut' })
        .to(.16, { position: end, angle: -30, scale: new Vec3(.72, .72, 1) }, { easing: 'sineIn' })
        .call(() => {
            card.destroy();
            arrived();
        })
        .start();
}
