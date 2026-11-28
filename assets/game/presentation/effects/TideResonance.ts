import { Color, Graphics, Node, UIOpacity, Vec3, tween } from 'cc';

function mark(layer: Node, name: string, position: Vec3): Graphics {
    const node = new Node(name);
    node.layer = layer.layer;
    node.parent = layer;
    node.setPosition(position);
    const ink = node.addComponent(Graphics);
    ink.strokeColor = new Color(100, 238, 224, 255);
    return ink;
}
export function launchPulse(
    layer: Node,
    from: Vec3,
    to: Vec3,
    seconds: number
): void {
    const ink = mark(layer, 'TidalPulse', from);
    ink.node.angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
    for (const offset of [-10, 0]) {
        ink.lineWidth = offset ? 2 : 4;
        ink.moveTo(offset - 5, -14);
        ink.quadraticCurveTo(offset + 10, 0, offset - 5, 14);
        ink.stroke();
    }
    tween(ink.node)
        .to(seconds, { position: to })
        .call(() => ink.node.destroy())
        .start();
}
export function ringImpact(layer: Node, at: Vec3, reduced: boolean): void {
    const ink = mark(layer, 'PressureImpact', at);
    ink.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI * 2) / 3 + 0.24;
        ink.arc(0, 0, 24, angle, angle + 1.52, false);
        ink.stroke();
    }
    ink.strokeColor = new Color(243, 242, 206, 240);
    ink.lineWidth = 2;
    ink.circle(0, 0, 9);
    ink.stroke();
    const node = ink.node;
    if (!reduced) {
        node.setScale(0.65, 0.65, 1);
        tween(node)
            .to(0.16, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'quadOut' })
            .start();
    }
    tween(node.addComponent(UIOpacity))
        .delay(0.07)
        .to(0.15, { opacity: 0 })
        .call(() => node.destroy())
        .start();
}
