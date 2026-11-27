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
    Sprite,
    SpriteFrame,
    UITransform,
    Vec2,
} from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { ButtonAction } from '../ui/ButtonAction';
import { routeMapModel, RouteMapModel, RouteEdgeModel, RoutePointModel } from './RouteMapModel';
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
    @property(SpriteFrame) parchmentMap: SpriteFrame | null = null;
    @property(Label) depth: Label | null = null;
    @property(Graphics) progress: Graphics | null = null;
    @property(Node) key: Node | null = null;
    private readonly points = new Map<string, RoutePoint>();
    private readonly floorLabels: Label[] = [];
    private focusKey = '';
    private model: RouteMapModel | null = null;
    private parchmentLayer: Sprite | null = null;
    onEnable(): void {
        this.focusKey = '';
    }
    refresh(game: GameReadModel, readonly = false): void {
        if (!this.content || !this.pointPrefab) return;
        this.model = routeMapModel(game);
        const layers = Math.max(...this.model.points.map((point) => point.layer)) + 1;
        const contentSize = this.content.getComponent(UITransform)!;
        contentSize.height = this.model.height;
        this.paths?.node.getComponent(UITransform)?.setContentSize(contentSize.width, this.model.height);
        this.refreshParchment(this.content, !!game.scenario.labyrinth);
        const onParchment = this.parchmentLayer?.enabled === true;
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
            view.show(data, readonly, !!game.scenario.labyrinth, onParchment);
        }
        const folio = onParchment && !!game.expeditionMap;
        const here = this.model.points.find(point => point.state === 'current') ??
            this.model.points.find(point => point.state === 'available') ??
            this.model.points[this.model.points.length - 1];
        this.drawPaths(!!game.scenario.labyrinth, !!game.scenario.fieldDeck && !game.scenario.labyrinth, folio, here.layer);
        if (this.title) this.title.string = folio ? game.scenario.title :
            `第 ${game.day} 天 · ${game.scenario.title}${readonly ? ' · 路线图' : ''}`;
        if (this.key) this.key.active = folio;
        if (this.depth) {
            this.depth.node.active = folio;
            this.depth.string = `第 ${here.layer + 1} 层  /  ${layers}`;
        }
        if (this.progress) {
            this.progress.node.active = folio;
            if (folio) this.drawProgress(this.progress, layers, here.layer);
        }
        const legend = this.node.getChildByName('RouteLegend')?.getComponent(Label);
        if (legend) legend.enabled = !folio;
        const next = this.model.points.find((point) => point.state === 'available');
        if (this.hint) {
            this.hint.node.active = readonly || !!game.scenario.labyrinth;
            this.hint.string = readonly
                ? '滚动查看路线 · 关闭后继续探索'
                : game.expeditionMap && next
                  ? '点击双圈地点前往 · 滚动查看路线'
                  : game.currentNode === 'choice'
                    ? game.scenario.labyrinth ? '选一条路。两条路在折光回廊汇合。' : game.scenario.fieldDeck
                      ? '选择行进路线 · 两条路都通往营地'
                      : '选择一条路径，然后前往高亮地点'
                    : (game.scenario.labyrinth ? '下一站 · ' : '滚动查看路线 · ') + (next?.title ?? '正在返回避难所');
        }
        if (this.close) this.close.node.active = readonly;
        if (this.enter) {
            this.enter.node.active = !readonly && !game.scenario.labyrinth;
            this.enter.setText(
                game.currentNode === 'choice'
                    ? '先选择一条路径'
                    : '前往 · ' + (next?.title ?? '避难所')
            );
            this.enter.setEnabled(
                !!next && game.currentNode !== 'choice' && game.currentNode !== 'return'
            );
        }
        const key = game.expeditionMap
            ? `${game.expeditionMap.seed}:${game.visited.length}:${game.currentNode}:${readonly}`
            : `${game.currentNode}:${game.route}:${game.pathIndex}:${readonly}`;
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
    private refreshParchment(content: Node, visible: boolean): void {
        if (!visible || !this.parchmentMap) {
            if (this.parchmentLayer) this.parchmentLayer.enabled = false;
            return;
        }
        if (!this.parchmentLayer) {
            this.parchmentLayer = content.addComponent(Sprite);
            this.parchmentLayer.sizeMode = Sprite.SizeMode.CUSTOM;
            this.parchmentLayer.trim = false;
            this.parchmentLayer.color = new Color(240, 235, 231);
        }
        if (this.parchmentLayer.spriteFrame !== this.parchmentMap)
            this.parchmentLayer.spriteFrame = this.parchmentMap;
        this.parchmentLayer.enabled = true;
    }
    private drawProgress(g: Graphics, count: number, current: number): void {
        g.clear();
        const pitch = Math.min(10, 176 / count);
        for (let i = 0; i < count; i++) {
            g.fillColor = new Color().fromHEX(i <= current ? '#d5aa76' : '#60525c');
            const h = i === current ? 13 : 5;
            g.rect((i - (count - 1) / 2) * pitch - 3, -h / 2, Math.min(6, pitch - 1), h);
            g.fill();
        }
    }

    private drawDepthScale(g: Graphics, model: RouteMapModel, current: number): void {
        const left = -this.content!.getComponent(UITransform)!.width / 2;
        const x = left + 55;
        const rows = new Map(model.points.map(point => [point.layer, point.y]));
        g.strokeColor = new Color(111, 79, 45, 95);
        g.lineWidth = 1;
        g.moveTo(x + 23, -18);
        g.lineTo(x + 23, 18 - model.height);
        g.stroke();
        for (const [layer, y] of rows) {
            let label = this.floorLabels[layer];
            if (!label) {
                const marker = new Node('Floor-' + (layer + 1));
                marker.layer = g.node.layer;
                marker.parent = g.node;
                marker.addComponent(UITransform).setContentSize(40, 26);
                label = marker.addComponent(Label);
                label.fontFamily = 'Georgia, serif';
                label.fontSize = 18;
                label.lineHeight = 23;
                label.overflow = Label.Overflow.SHRINK;
                label.string = String(layer + 1);
                this.floorLabels[layer] = label;
            }
            label.node.active = true;
            label.node.setPosition(x - 8, y);
            label.isBold = layer === current;
            label.color = new Color().fromHEX(layer === current ? '#65401f' : '#80694c');
            g.strokeColor = new Color().fromHEX(layer === current ? '#89562c' : '#9f8059');
            g.lineWidth = layer === current ? 3 : 1;
            g.moveTo(x + 17, y);
            g.lineTo(x + (layer === current ? 43 : 32), y);
            g.stroke();
        }
        for (let i = rows.size; i < this.floorLabels.length; i++) this.floorLabels[i].node.active = false;
    }

    private drawPaths(labyrinth: boolean, field: boolean, folio: boolean, current: number): void {
        const g = this.paths,
            model = this.model;
        if (!g || !model) return;
        g.clear();
        if (folio) this.drawDepthScale(g, model, current);
        else for (const label of this.floorLabels) label.node.active = false;
        const onParchment = this.parchmentLayer?.enabled === true;
        if (labyrinth && !onParchment) {
            // Slate survey markings behind the native clickable route graph.
            g.strokeColor = new Color(195, 166, 145, 34);
            g.lineWidth = .7;
            const bottom = -model.height + 55;
            for (let x = -522; x <= 522; x += 58) {
                g.moveTo(x, -66);
                g.lineTo(x, bottom);
            }
            for (let y = -66; y >= bottom; y -= 56) {
                g.moveTo(-522, y);
                g.lineTo(522, y);
            }
            g.stroke();
        } else if (field) this.drawTideLines(g, model.height);
        const points = new Map(model.points.map((point) => [point.id, point]));
        for (const edge of model.edges) {
            const a = points.get(edge.from)!,
                b = points.get(edge.to)!;
            if (folio) {
                this.drawTrail(g, a, b, edge);
                continue;
            }
            const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12);
            const ink = onParchment
                ? edge.visited ? '#78521d' : edge.excluded ? '#aa896a' : edge.available ? '#874816' : '#796047'
                : labyrinth ? edge.visited ? '#e0bd86' : edge.excluded ? '#65536c' : edge.available ? '#e2b286' : '#ad8890'
                    : edge.visited ? '#586e4b' : edge.excluded ? '#bab8a1' : field ? '#816e4c' : '#8b9177';
            const color = new Color().fromHEX(ink);
            g.fillColor = color;
            for (let i = 1; i < steps; i++) {
                const t = i / steps,
                    x = a.x + (b.x - a.x) * t + Math.sin(Math.PI * t) * Math.sin(a.x * 0.1) * 7,
                    y = a.y + (b.y - a.y) * t;
                if (Math.abs(y - b.y + 60) < 11 && Math.abs(x - b.x) < 48) continue;
                g.circle(x, y, edge.visited || edge.available ? 2.1 : 1.5);
                g.fill();
            }
        }
        if (labyrinth) return;
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
    private drawTrail(g: Graphics, a: RoutePointModel, b: RoutePointModel, edge: RouteEdgeModel): void {
        const dx = b.x - a.x, dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        const bow = Math.sin((a.x + b.x) * .013) * 7;
        const afterChoice = !!a.decisionHint && !edge.excluded;
        const stroke = edge.visited ? '#76502c' : edge.available ? '#9b5629' : edge.excluded ? '#ac926f' : afterChoice ? '#795436' : '#806849';
        const hasTitle = !!b.decisionHint || b.title !== '未知地点' || b.state === 'available' || b.state === 'current' || b.state === 'visited';
        g.strokeColor = new Color().fromHEX(stroke);
        g.lineWidth = edge.visited ? 3.7 : edge.available ? 3 : edge.excluded ? 1.1 : afterChoice ? 2.4 : 1.8;
        const dashSpacing = edge.available ? 19 : afterChoice ? 15 : 12;
        const dashLength = edge.available ? 13 : afterChoice ? 9 : 5;
        let drawing = false;
        for (let distance = 47; distance < length - 42; distance += 2) {
            const t = distance / length;
            const x = a.x + dx * t + Math.sin(Math.PI * t) * bow, y = a.y + dy * t;
            const inCaption = hasTitle && Math.abs(x - b.x) < 58 && Math.abs(y - b.y + 60) < 13;
            const inStatus = (b.state === 'available' || b.state === 'current' || !!b.decisionHint) &&
                Math.abs(x - b.x) < (b.decisionHint ? 86 : 44) && Math.abs(y - b.y + 85) < 11;
            const mark = edge.visited || distance % dashSpacing < dashLength;
            if (!mark || inCaption || inStatus) {
                drawing = false;
                continue;
            }
            if (drawing) g.lineTo(x, y);
            else g.moveTo(x, y);
            drawing = true;
        }
        g.stroke();
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
