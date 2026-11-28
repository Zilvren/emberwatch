import { _decorator, Component, instantiate, Label, Node, Prefab, UITransform } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { ButtonAction } from '../ui/ButtonAction';
import { SelectableCard } from './SelectableCard';
import { BattlePile, battlePileEntries, PILE_PAGE_SIZE } from './BattlePileModel';
const { ccclass, property } = _decorator;

@ccclass('BattlePilePanel')
export class BattlePilePanel extends Component {
    @property(Prefab) cardPrefab: Prefab | null = null;
    @property({type:[Node]}) holders: Node[] = [];
    @property(Label) title: Label | null = null;
    @property(Label) hint: Label | null = null;
    @property(Label) pageLabel: Label | null = null;
    @property(Node) emptyBag: Node | null = null;
    @property(Node) closeButton: Node | null = null;
    @property(ButtonAction) previous: ButtonAction | null = null;
    @property(ButtonAction) next: ButtonAction | null = null;
    private cards: SelectableCard[] = [];

    render(game: GameReadModel, pile: BattlePile, page: number, selection: number): void {
        const entries = battlePileEntries(game, pile);
        const pages = Math.max(1, Math.ceil(entries.length / PILE_PAGE_SIZE));
        const current = Math.min(Math.max(page, 0), pages - 1);
        const draw = pile === 'draw-pile', supply = pile === 'supply-bag';
        const count = entries.reduce((sum, entry) => sum + entry.count, 0);
        const emptyBag = supply && count === 0;
        const columns = Math.min(entries.length, PILE_PAGE_SIZE);
        const visibleCards = Math.min(entries.length - current * PILE_PAGE_SIZE, PILE_PAGE_SIZE);
        const width = supply ? (emptyBag ? 640 : Math.max(540, columns * 294 + 126)) : 1008;
        const height = emptyBag ? 478 : supply && pages === 1 ? 560 : 650;
        if (this.emptyBag) this.emptyBag.active = emptyBag;
        this.getComponent(UITransform)?.setContentSize(width, height);
        this.closeButton?.setPosition(width / 2 - 46, height / 2 - 46);
        if (this.title) {
            this.title.node.setPosition(0, height / 2 - (emptyBag ? 74 : 61));
            this.title.string = supply ? '物资背包' : (draw ? '抽牌堆' : '弃牌堆') + '　' + count;
        }
        if (this.hint) {
            this.hint.node.setPosition(0, emptyBag ? -165 : 218);
            this.hint.string = emptyBag ? '暂无物资卡' : supply ? '' : !count ? '牌堆为空' :
                (draw ? '同名牌归组 · 按牌名排列' : '按弃置顺序排列 · 最近的在前');
        }
        if (this.pageLabel) this.pageLabel.string = pages > 1 ? `${current + 1} / ${pages}` : '';
        for (const button of [this.previous, this.next]) {
            if (button) button.node.active = pages > 1;
        }
        this.previous?.setEnabled(current > 0);
        this.next?.setEnabled(current + 1 < pages);
        for (let i = 0; i < this.holders.length; i++) {
            const index = current * PILE_PAGE_SIZE + i, entry = entries[index];
            const host = this.holders[i];
            host.active = !!entry;
            if (!entry) continue;
            host.setPosition((i - (visibleCards - 1) / 2) * 295, supply && pages === 1 ? -24 : 4);
            if (!this.cards[i]) {
                const node = instantiate(this.cardPrefab!);
                host.addChild(node);
                this.cards[i] = node.getComponent(SelectableCard)!;
            }
            const view = this.cards[i];
            const badge = [draw || supply ? '×' + entry.count : '', entry.temporary ? '临时' : ''].filter(Boolean).join(' · ');
            view.show(entry.kind, game, 'pile-inspect-' + index, index === selection, badge, true, '', false, entry.packedWeight);
            const scale = supply && index === selection ? 1.06 : 1;
            view.node.setScale(scale, scale, 1);
            view.card?.setExpanded(index === selection);
        }
    }
}
