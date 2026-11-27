import { _decorator, Color, Component, Graphics, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { ButtonAction } from '../ui/ButtonAction';
import type { RoutePointModel } from './RouteMapModel';
const { ccclass, property, requireComponent } = _decorator;
const iconSlots: Record<RoutePointModel['icon'], number> = {
    battle: 0, elite: 1, rest: 2, scavenge: 3, supply: 3, home: 4,
};
const parchmentInk = {
    available: { fill: '#f6e2ad', border: '#85502b', glyph: '#5b301a' },
    current: { fill: '#44392f', border: '#a9683b', glyph: '#ffe7b5' },
    visited: { fill: '#c7c5a1', border: '#787453', glyph: '#464b37' },
    locked: { fill: '#e9cea0', border: '#aa8c60', glyph: '#705943' },
    excluded: { fill: '#e1c79d', border: '#bd9f77', glyph: '#a48a67' },
};

@ccclass('RoutePoint')
@requireComponent(Graphics)
export class RoutePoint extends Component {
    @property(ButtonAction) action: ButtonAction | null = null;
    @property(Label) title: Label | null = null;
    @property(Label) status: Label | null = null;
    /** Native RoutePoint prefab frames follow iconSlots. */
    @property({ type: [SpriteFrame] }) iconFrames: SpriteFrame[] = [];
    private data: RoutePointModel | null = null;
    private hovering = false;
    private glyph: Sprite | null = null;
    onEnable(): void {
        this.node.on(Node.EventType.MOUSE_ENTER, this.enter, this);
        this.node.on(Node.EventType.MOUSE_LEAVE, this.leave, this);
    }
    onDisable(): void {
        this.hovering = false;
        this.node.off(Node.EventType.MOUSE_ENTER, this.enter, this);
        this.node.off(Node.EventType.MOUSE_LEAVE, this.leave, this);
    }
    private enter(): void {
        this.hovering = true;
        this.draw();
    }
    private leave(): void {
        this.hovering = false;
        this.draw();
    }
    private labyrinth = false;
    private onParchment = false;
    frameFor(icon: RoutePointModel['icon']): SpriteFrame | null {
        return this.iconFrames[iconSlots[icon]] ?? null;
    }
    show(data: RoutePointModel, readonly = false, labyrinth = false, onParchment = false): void {
        this.data = data;
        this.labyrinth = labyrinth;
        this.onParchment = onParchment;
        if (labyrinth && !this.glyph) {
            const node = new Node('MapGlyph');
            node.layer = this.node.layer;
            this.node.addChild(node);
            node.addComponent(UITransform).setContentSize(62, 62);
            this.glyph = node.addComponent(Sprite);
            this.glyph.sizeMode = Sprite.SizeMode.CUSTOM;
            this.glyph.trim = false;
        }
        if (this.glyph) {
            this.glyph.node.active = labyrinth;
            const frame = this.frameFor(data.icon);
            if (frame && this.glyph.spriteFrame !== frame) this.glyph.spriteFrame = frame;
        }
        if (this.title) {
            this.title.string = data.title;
            this.title.color = new Color().fromHEX(onParchment
                ? data.state === 'excluded' ? '#796851' : '#382b23'
                : labyrinth ? '#eee1d0' : '#e8dbce');
        }
        if (this.status) {
            const forecast = onParchment && !!data.decisionHint && data.action.startsWith('enter-');
            this.status.isBold = forecast;
            this.status.fontSize = forecast ? 18 : 14;
            this.status.color = new Color().fromHEX(forecast ? '#50321e' : onParchment ? '#68472d' : '#d0b58e');
            this.status.node.getComponent(UITransform)!.width = data.decisionHint && !forecast ? 340 : 180;
            this.status.string =
                data.decisionHint ??
                (data.state === 'current' ? '当前位置' : data.state === 'visited'
                    ? '已完成'
                    : data.state === 'available'
                      ? readonly
                          ? '可前往'
                          : data.action.startsWith('route-')
                            ? '选择此路'
                            : onParchment ? '可前往' : '点击进入'
                      : data.state === 'excluded'
                        ? '另一条路径'
                        : '未到达');
        }
        if (this.action) {
            this.action.actionId = data.action || 'map-home';
            this.action.disabledOpacity = 255;
            this.action.setEnabled(data.state === 'available' && !readonly && !!data.action);
        }
        this.draw();
    }
    private draw(): void {
        const d = this.data,
            g = this.getComponent(Graphics);
        if (!d || !g) return;
        const active = d.state === 'available' || d.state === 'current',
            visited = d.state === 'visited';
        g.clear();
        if (this.status) this.status.node.active = active || visited || this.hovering;
        if (this.title) this.title.enabled = !this.onParchment || active || visited || this.hovering || !!d.decisionHint || d.title !== '未知地点';
        if (this.labyrinth) {
            const excluded = d.state === 'excluded';
            const tone = this.onParchment ? parchmentInk[d.state] : {
                fill: active ? '#624d3d' : visited ? '#3e4842' : '#383041',
                border: active ? '#e3bd87' : excluded ? '#74647e' : '#9e8596',
                glyph: active ? '#ffdfa9' : visited ? '#d7e3c7' : excluded ? '#ac9bad' : '#e8d2c4',
            };
            const fill = new Color().fromHEX(tone.fill);
            if (this.onParchment && !active && !visited) fill.a = excluded ? 90 : 160;
            g.fillColor = fill;
            g.strokeColor = new Color().fromHEX(tone.border);
            g.lineWidth = active ? 2.5 : 1.25;
            const radius = this.onParchment && !active ? 36 : 42;
            g.circle(0, 0, radius);
            g.fill();
            g.stroke();
            if (this.onParchment) {
                if (this.status) this.status.node.active = active || this.hovering || !!d.decisionHint;
                if (active) {
                    g.lineWidth = this.hovering ? 2.6 : 1.35;
                    g.circle(0, 0, 47);
                    g.stroke();
                }
                if (d.state === 'current') {
                    g.fillColor = new Color().fromHEX(tone.border);
                    g.moveTo(-5, 54);
                    g.lineTo(5, 54);
                    g.lineTo(0, 47);
                    g.close();
                    g.fill();
                }
            }
            if (this.glyph) this.glyph.color = new Color().fromHEX(tone.glyph);
            return;
        }
        const ink = active ? '#6f5a34' : '#9c8799';
        g.strokeColor = new Color().fromHEX(ink);
        g.lineWidth = active || this.hovering ? 2.2 : 1.7;
        if (active || visited || this.hovering) {
            g.strokeColor = new Color().fromHEX(active ? '#a48a53' : '#858c70');
            for (let i = 0; i <= 36; i++) {
                const a = (i / 36) * Math.PI * 2,
                    r = 38 + Math.sin(a * 3 + 0.7) * 1.3;
                const x = Math.cos(a) * r,
                    y = Math.sin(a) * r;
                if (i === 0) g.moveTo(x, y);
                else g.lineTo(x, y);
            }
            g.stroke();
        }
        g.strokeColor = new Color().fromHEX(ink);
        g.fillColor = new Color().fromHEX(active ? '#c7b47f' : '#b8bba2');
        const line = (points: number[]) => {
            g.moveTo(points[0], points[1]);
            for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
            g.stroke();
        };
        const shape = (points: number[], fill: string) => {
            g.fillColor = new Color().fromHEX(fill);
            g.moveTo(points[0], points[1]);
            for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
            g.close();
            g.fill();
            g.stroke();
        };
        const paper = active ? '#cfbf98' : '#b9a6ba';
        if (d.fieldSymbol === 'buoy') {
            shape([-29, 5, -17, 17, 13, 18, 29, 5, 21, -8, -20, -8], '#a4bab0');
            g.fillColor = new Color().fromHEX('#826236');
            g.circle(-17, 5, 4);
            g.fill();
            line([-17, -7, -24, -19, -31, -20]);
            line([-5, -7, -11, -23, -18, -24]);
            line([12, -7, 20, -19, 28, -20]);
            line([13, 18, 19, 29]);
        } else if (d.fieldSymbol === 'rotor') {
            g.lineWidth = 6;
            for (let i = 0; i < 3; i++) {
                const a = (i * Math.PI * 2) / 3 + 0.18;
                g.arc(0, 0, 25, a, a + 1.52, false);
                g.stroke();
            }
            g.fillColor = new Color().fromHEX('#61897d');
            g.circle(0, 0, 8);
            g.fill();
            g.lineWidth = 2;
            line([-10, 0, 10, 0]);
        } else if (d.icon === 'battle' || d.icon === 'elite') {
            if (d.icon === 'elite') {
                shape([-24, 24, 14, 29, 26, 18, 27, -18, 0, -28, -27, -18], paper);
                shape([14, 29, 24, 35, 34, 22, 26, 18], '#aa947e');
                g.fillColor = new Color().fromHEX(ink);
                g.rect(-16, 5, 31, 9);
                g.fill();
                for (const x of [-18, 18]) {
                    g.circle(x, -15, 2);
                    g.fill();
                }
                line([-11, -5, 10, -5]);
            } else {
                shape(
                    [
                        -20, 16, -12, 28, 6, 31, 22, 19, 25, 1, 15, -10, 12, -24, -11, -24, -14,
                        -10, -23, -1,
                    ],
                    paper
                );
                g.fillColor = new Color().fromHEX(ink);
                g.ellipse(-8, 8, 5, 6);
                g.ellipse(9, 9, 5, 6);
                g.fill();
                shape([-2, -2, 3, -2, 1, -7], ink);
                line([-11, -14, 12, -14]);
                for (const x of [-5, 2, 8]) line([x, -15, x, -24]);
            }
        } else if (d.icon === 'rest') {
            shape([-25, -24, -22, -16, 24, -25, 22, -31], '#aa947e');
            shape([-25, -28, -23, -21, 22, -14, 25, -20], '#aa947e');
            shape(
                [-17, -9, -22, 6, -9, 20, -3, 34, 12, 21, 21, 4, 13, -10],
                active ? '#c2a16b' : '#bca982'
            );
            shape([-5, -9, -8, 3, 3, 16, 9, 2, 4, -10], '#e2dac7');
        } else if (d.icon === 'home') {
            shape([-22, 1, -22, -26, 23, -26, 23, 1], paper);
            shape([-31, 0, -1, 30, 31, 1, 27, -4, -1, 21, -27, -5], '#8c927a');
            shape([-8, -26, -8, -7, 8, -7, 8, -26], '#aa947e');
            line([-18, -10, -12, -10]);
        } else {
            shape([-25, 19, -16, 29, 31, 29, 25, 19], '#cfbf98');
            shape([25, -21, 31, -11, 31, 29, 25, 19], '#aa947e');
            shape([-25, -21, 25, -21, 25, 19, -25, 19], paper);
            line([-22, -17, 21, 15]);
            line([-21, 15, 21, -17]);
            if (d.icon === 'supply') {
                g.fillColor = new Color().fromHEX('#e2dac7');
                g.circle(0, 0, 9);
                g.fill();
                g.stroke();
                line([-5, 0, 5, 0]);
                line([0, -5, 0, 5]);
            }
        }
        if (visited) {
            g.strokeColor = new Color().fromHEX('#687651');
            g.lineWidth = 3;
            line([23, 29, 29, 22, 42, 37]);
        }
    }
}
