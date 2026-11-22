import {
    _decorator,
    Color,
    Component,
    Graphics,
    instantiate,
    Label,
    Node,
    Prefab,
    ScrollView,
    UITransform,
    Vec2,
} from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { ButtonAction } from '../ui/ButtonAction';
import { routeMapModel, RouteMapModel } from './RouteMapModel';
import { RoutePoint } from './RoutePoint';
const { ccclass, property } = _decorator;

@ccclass('RouteMap')
export class RouteMap extends Component {
    @property(Prefab) pointPrefab: Prefab | null = null;
    @property(Node) content: Node | null = null;
    @property(Graphics) paths: Graphics | null = null;
    @property(ScrollView) scroll: ScrollView | null = null;
    @property(Label) title: Label | null = null;
    @property(Label) hint: Label | null = null;
    @property(ButtonAction) close: ButtonAction | null = null;
    @property(ButtonAction) enter: ButtonAction | null = null;
    private readonly points = new Map<string, RoutePoint>();
    private focusKey = '';
    private model: RouteMapModel | null = null;
    onEnable(): void {
        this.focusKey = '';
    }
    refresh(game: GameReadModel, readonly = false): void {
        if (!this.content || !this.pointPrefab) return;
        this.model = routeMapModel(game);
        this.content.getComponent(UITransform)!.height = this.model.height;
        const used = new Set(this.model.points.map((point) => point.id));
        for (const [id, view] of this.points)
            if (!used.has(id)) {
                view.node.destroy();
                this.points.delete(id);
            }
        for (const data of this.model.points) {
            let view = this.points.get(data.id);
            if (!view) {
                const node = instantiate(this.pointPrefab);
                node.parent = this.content;
                view = node.getComponent(RoutePoint)!;
                this.points.set(data.id, view);
            }
            view.node.setPosition(data.x, data.y);
            view.show(data, readonly, this.model.landscape);
        }
        this.drawPaths(!!game.scenario.fieldDeck && !game.scenario.labyrinth);
        if (this.title) this.title.string = `第 ${game.day} 天 · ${game.scenario.title}`;
        const next = this.model.points.find((point) => point.state === 'available');
        if (this.hint)
            this.hint.string = readonly
                ? '查看本次探索路线 · 当前房间内不能移动'
                : game.currentNode === 'choice'
                  ? game.scenario.labyrinth ? '选一条路。两条路在折光回廊汇合。' : game.scenario.fieldDeck
                      ? '选择行进路线 · 两条路都通往营地'
                      : '选择一条路径，然后前往高亮地点'
                  : (game.scenario.labyrinth ? '下一站 · ' : '滚动查看路线 · ') + (next?.title ?? '正在返回避难所');
        if (this.close) this.close.node.active = readonly;
        if (this.enter) {
            this.enter.node.active = !readonly;
            this.enter.setText(
                game.currentNode === 'choice'
                    ? '先选择一条路径'
                    : '前往 · ' + (next?.title ?? '避难所')
            );
            this.enter.setEnabled(
                !!next && game.currentNode !== 'choice' && game.currentNode !== 'return'
            );
        }
        const key = game.currentNode + ':' + game.route + ':' + game.pathIndex + ':' + readonly;
        if (key !== this.focusKey) {
            const height = this.scroll?.node.getComponent(UITransform)?.height ?? 600;
            const offset = Math.max(
                0,
                Math.min(this.model.height - height, -this.model.focusY - height * 0.5)
            );
            this.scroll?.scrollToOffset(new Vec2(0, offset), 0);
            this.focusKey = key;
        }
    }
    private drawPaths(field: boolean): void {
        const g = this.paths,
            model = this.model;
        if (!g || !model) return;
        g.clear();
        if (model.landscape) {
            // Slate survey markings behind the native clickable route graph.
            g.strokeColor = new Color(195, 166, 145, 28);
            g.lineWidth = .7;
            for (let x = -522; x <= 522; x += 58) {
                g.moveTo(x, -66);
                g.lineTo(x, -505);
            }
            for (let y = -66; y >= -505; y -= 56) {
                g.moveTo(-522, y);
                g.lineTo(522, y);
            }
            g.stroke();
        } else if (field) this.drawTideLines(g, model.height);
        const points = new Map(model.points.map((point) => [point.id, point]));
        for (const edge of model.edges) {
            const a = points.get(edge.from)!,
                b = points.get(edge.to)!;
            const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 15);
            g.fillColor = new Color().fromHEX(
                model.landscape ? edge.visited ? '#e0bd86' : edge.excluded ? '#584960' : '#926f73'
                    : edge.visited ? '#586e4b' : edge.excluded ? '#bab8a1' : field ? '#816e4c' : '#8b9177'
            );
            for (let i = 2; i < steps - 1; i++) {
                const t = i / steps,
                    x = a.x + (b.x - a.x) * t + Math.sin(Math.PI * t) * Math.sin(a.x * 0.1) * 16,
                    y = a.y + (b.y - a.y) * t;
                g.circle(x, y, edge.visited ? 2.1 : 1.7);
                g.fill();
            }
        }
        if (model.landscape) return;
        g.strokeColor = new Color(120, 126, 102, 25);
        g.lineWidth = 1;
        for (let band = 0; band < 7; band++) {
            const x = -470 + band * 156;
            g.moveTo(x, -70);
            for (let y = 100; y < model.height; y += 50)
                g.lineTo(x + Math.sin(y * 0.009 + band) * 38, -y);
            g.stroke();
        }
    }
    private drawTideLines(g: Graphics, height: number): void {
        // Former shorelines and gauge ticks stay outside the playable routes.
        for (const side of [-1, 1]) {
            g.strokeColor = new Color(69, 107, 104, 59);
            for (let band = 0; band < 3; band++) {
                g.lineWidth = band ? 1 : 2;
                for (let y = 0; y <= height; y += 32) {
                    const x =
                        side *
                        (408 +
                            28 * band +
                            48 * Math.sin(y / 174 + side) +
                            22 * Math.sin(y / 63 + band / 5));
                    if (y === 0) g.moveTo(x, 0);
                    else g.lineTo(x, -y);
                }
                g.stroke();
            }
            for (let y = 24; y < height; y += 32) {
                g.moveTo(side * 530, -y);
                g.lineTo(side * (y % 128 === 24 ? 512 : 522), -y);
                g.stroke();
            }
        }
    }
    inspect(): object {
        return {
            points: this.model?.points,
            edges: this.model?.edges,
            scrollOffset: this.scroll?.getScrollOffset(),
            focus: this.focusKey,
        };
    }
}
