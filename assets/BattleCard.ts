import { EventTouch, Node, Tween, tween, UITransform, Vec2, Vec3 } from 'cc';
import { GameArt } from './GameArt';
import { CARD, CardKind } from './SurvivalRules';
import { PixelUI, P } from './PixelUI';
export interface CardHooks {
    canInteract: () => boolean;
    select: () => void;
    drop: (x: number, y: number) => boolean;
    hover?: (enter: boolean) => void;
}
export function cardFace(ui: PixelUI, art: GameArt, kind: CardKind, x: number, y: number, w: number, h: number, disabled = '', caption = ''): Node {
    const node = ui.node(`Card ${CARD[kind].name}`, x, y, w, h);
    const c = new PixelUI(node, w, h), d = CARD[kind];
    c.frame(0, 0, w, h, '#dcc5a6', '#2b2230');
    c.rect(6, 6, w - 12, 5, d.color);
    c.image(art.card(kind, (w - 18) / (h * .44)), 9, 39, w - 18, h * .44);
    c.rect(8, 38, w - 16, 2, '#6a4b43');
    c.rect(8, 39 + h * .44, w - 16, 3, '#6a4b43');
    c.polygon([[5, 7], [40, 7], [47, 14], [47, 42], [40, 49], [5, 49]], disabled ? '#6f6460' : '#a56747');
    c.text(String(d.cost), 8, 10, 35, 33, 27, P.white, true, 'center');
    c.text(d.name, 52, 11, w - 62, 30, w < 190 ? 21 : 27, P.ink, true, 'center');
    const short: Record<CardKind, string> = { attack: '造成 2 点伤害', dodge: '获得 2 点格挡', knife: '下回合起\n每回合生成「挥砍」', evade: '获得 5 点格挡', repair: '恢复 3 点护甲\n护甲为 0 时禁用', heavy: '造成 5 点伤害', slash: '造成 4 点伤害', cash: '只能在休整时丢弃' };
    c.text(short[kind], 13, 49 + h * .44, w - 26, h * .20, w < 190 ? 17 : 21, P.ink, true, 'center');
    c.line([[12, h - 45], [w - 12, h - 45]], '#a28b76', 1);
    c.text(disabled || caption || d.tag, 10, h - 42, w - 20, 25, w < 190 ? 12 : 16, disabled ? '#90493e' : '#69534d', true, 'center');
    c.text(kind === 'slash' ? '本场临时' : `负重 ${d.weight}`, 10, h - 20, w - 20, 17, 11, '#7a6559', false, 'center');
    if (disabled)
        c.rect(0, 0, w, h, '#302633', undefined, node, 44);
    return node;
}
export function bindHandCard(node: Node, stage: Node, hooks: CardHooks, reduceMotion: boolean, angle: number, selected = false): void {
    const base = node.position.clone(), originalIndex = node.getSiblingIndex();
    let start: Vec2 | null = null;
    let dragging = false;
    node.angle = angle;
    const restore = () => {
        if (!node.isValid || !node.parent)
            return;
        Tween.stopAllByTarget(node);
        node.setSiblingIndex(originalIndex);
        tween(node).to(reduceMotion ? 0 : .16, { position: base, scale: new Vec3(1, 1, 1), angle }, { easing: 'quadOut' }).start();
    };
    const lift = () => {
        if (!hooks.canInteract())
            return;
        Tween.stopAllByTarget(node);
        node.setSiblingIndex(stage.children.length - 1);
        tween(node).to(reduceMotion ? 0 : .125, { position: new Vec3(base.x, base.y + (reduceMotion ? 0 : 48), base.z), scale: new Vec3(1.08, 1.08, 1), angle: 0 }, { easing: 'quadOut' }).start();
    };
    if (selected)
        lift();
    const hoverPointer = typeof matchMedia === 'undefined' || matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (hoverPointer) {
        node.on(Node.EventType.MOUSE_ENTER, () => { if (!dragging) {
            lift();
            hooks.hover?.(true);
        } });
        node.on(Node.EventType.MOUSE_LEAVE, () => { if (!dragging && !selected) {
            restore();
            hooks.hover?.(false);
        } });
    }
    node.on(Node.EventType.TOUCH_START, (event: EventTouch) => { if (!hooks.canInteract())
        return; start = event.getUILocation(); dragging = false; lift(); });
    node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
        if (!start || !hooks.canInteract())
            return;
        const p = event.getUILocation();
        if (Vec2.distance(start, p) > 14)
            dragging = true;
        if (!dragging)
            return;
        Tween.stopAllByTarget(node);
        const local = stage.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
        node.setPosition(local.x, local.y + 52, 0);
        node.angle = 0;
    });
    node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
        if (!start)
            return;
        const wasDragging = dragging;
        start = null;
        dragging = false;
        if (!hooks.canInteract()) {
            restore();
            return;
        }
        if (wasDragging) {
            const p = event.getUILocation();
            const local = stage.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
            if (!hooks.drop(local.x + 720, 450 - local.y))
                restore();
        }
        else
            hooks.select();
    });
    node.on(Node.EventType.TOUCH_CANCEL, () => { start = null; dragging = false; restore(); });
}
