import { _decorator, Color, Component, Graphics, Label, Node } from 'cc';
import { ButtonAction } from '../ui/ButtonAction';
import type { RoutePointModel } from './RouteMapModel';
const { ccclass, property, requireComponent } = _decorator;

@ccclass('RoutePoint')
@requireComponent(Graphics)
export class RoutePoint extends Component {
    @property(ButtonAction) action: ButtonAction | null = null;
    @property(Label) title: Label | null = null;
    @property(Label) status: Label | null = null;
    private data: RoutePointModel | null = null;
    private hovering = false;
    onEnable(): void {
        this.node.on(Node.EventType.MOUSE_ENTER, this.enter, this);
        this.node.on(Node.EventType.MOUSE_LEAVE, this.leave, this);
    }
    onDisable(): void {
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
    show(data: RoutePointModel, readonly = false): void {
        this.data = data;
        if (this.title) {
            this.title.string = data.title;
            this.title.color = new Color().fromHEX('#434b3c');
        }
        if (this.status) {
            this.status.string =
                data.state === 'visited'
                    ? '已完成'
                    : data.state === 'available'
                      ? readonly
                          ? '当前位置'
                          : data.action.startsWith('route-')
                            ? '选择此路'
                            : '点击进入'
                      : data.state === 'excluded'
                        ? '另一条路径'
                        : '未到达';
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
        const active = d.state === 'available',
            visited = d.state === 'visited';
        const ink = active ? '#6f5a34' : d.state === 'excluded' ? '#878b78' : '#48503e';
        g.clear();
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
        const paper = active ? '#cfbf98' : '#c2c0aa';
        if (d.icon === 'battle' || d.icon === 'elite') {
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
        if (this.status) this.status.node.active = active || visited || this.hovering;
    }
}
