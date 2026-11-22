import { _decorator, Component, instantiate, Label, Node, Prefab } from 'cc';
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
    @property(ButtonAction) previous: ButtonAction | null = null;
    @property(ButtonAction) next: ButtonAction | null = null;
    private cards: SelectableCard[] = [];

    render(game: GameReadModel, pile: BattlePile, page: number, selection: number): void {
        const entries = battlePileEntries(game, pile);
        const pages = Math.max(1, Math.ceil(entries.length / PILE_PAGE_SIZE));
        const current = Math.min(Math.max(page, 0), pages - 1);
        const draw = pile === 'draw-pile';
        const count = draw ? game.battle!.draw.length : game.battle!.discard.length;
        if (this.title) this.title.string = (draw ? '抽牌堆' : '弃牌堆') + '　' + count;
        if (this.hint) this.hint.string = !count ? '牌堆为空' :
            (draw ? '同名牌归组 · 按牌名排列' : '按弃置顺序排列 · 最近的在前');
        if (this.pageLabel) this.pageLabel.string = count ? `${current + 1} / ${pages}` : '';
        this.previous?.setEnabled(current > 0);
        this.next?.setEnabled(current + 1 < pages);
        for (let i = 0; i < this.holders.length; i++) {
            const index = current * PILE_PAGE_SIZE + i, entry = entries[index];
            const host = this.holders[i];
            host.active = !!entry;
            if (!entry) continue;
            if (!this.cards[i]) {
                const node = instantiate(this.cardPrefab!);
                host.addChild(node);
                this.cards[i] = node.getComponent(SelectableCard)!;
            }
            const view = this.cards[i];
            const badge = [draw ? '×' + entry.count : '', entry.temporary ? '临时' : ''].filter(Boolean).join(' · ');
            view.show(entry.kind, game, 'pile-inspect-' + index, index === selection, badge);
            view.card?.setExpanded(index === selection);
        }
    }
}
