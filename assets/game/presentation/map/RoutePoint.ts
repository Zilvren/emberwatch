import { _decorator, Color, Component, Graphics, Label, Node, UITransform } from 'cc';
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
    private landscape = false;
    show(data: RoutePointModel, readonly = false, landscape = false): void {
        this.data = data;
        this.landscape = landscape;
        this.node.setScale(landscape ? .75 : 1, landscape ? .75 : 1, 1);
        if (this.title) {
            this.title.string = data.title;
            this.title.color = new Color().fromHEX(landscape ? '#eee1d0' : '#e8dbce');
        }
        if (this.status) {
            this.status.color = new Color().fromHEX('#d0b58e');
            this.status.node.getComponent(UITransform)!.width = data.decisionHint ? 340 : 180;
            this.status.string =
                data.decisionHint ??
                (data.state === 'visited'
                    ? '已完成'
                    : data.state === 'available'
                      ? readonly
                          ? '当前位置'
                          : data.action.startsWith('route-')
                            ? '选择此路'
                            : '点击进入'
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
        const active = d.state === 'available',
            visited = d.state === 'visited';
        const ink = this.landscape ? active ? '#edcf9f' : d.state === 'excluded' ? '#7f7085' : '#bb9f88'
            : active ? '#6f5a34' : '#9c8799';
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
        const paper = this.landscape ? active ? '#75583e' : '#3f354b' : active ? '#cfbf98' : '#b9a6ba';
        if (this.landscape) {
            shape([-31, -19, -31, 19, -21, 28, 21, 28, 31, 19, 31, -19, 21, -28, -21, -28], paper);
            g.strokeColor = new Color().fromHEX(active ? '#f3d5a4' : '#c3a3a0');
            g.lineWidth = 2;
            switch (d.icon) {
                case 'battle':
                    line([-16, -14, 14, 16]);
                    line([-14, 14, 15, -15]);
                    line([-8, -11, -17, -2]);
                    break;
                case 'elite':
                    line([-17, -15, -17, 11, 0, 20, 17, 11, 17, -15, 0, -22, -17, -15]);
                    line([-9, -1, 9, -1]);
                    break;
                case 'rest':
                    line([-17, -14, -12, -7, -1, -9, 16, -15]);
                    line([-9, -2, -11, 7, -2, 17, 1, 7, 10, 12, 12, 1, 6, -5]);
                    break;
                case 'home':
                    line([-15, -15, -15, 15, 8, 15, 8, -15]);
                    line([-8, -19, -8, 8, 16, 8, 16, -19]);
                    break;
                default:
                    line([-18, 8, -18, -13, 18, -13, 18, 8, -18, 8]);
                    line([-18, 8, -12, 15, 13, 15, 18, 8]);
                    if (d.icon === 'supply') line([-5, -2, 5, -2, 0, -2, 0, -8, 0, 3]);
            }
        } else if (d.fieldSymbol === 'buoy') {
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
        if (this.status) this.status.node.active = active || visited || this.hovering;
    }
}
