import { _decorator, Color, Component, instantiate, Label, Node, Prefab, Sprite, UITransform } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { MAX_SUPPLY_POINTS } from '../../core/RulesTypes';
import { SelectableCard } from '../cards/SelectableCard';
import { ButtonAction } from './ButtonAction';
import type { warehousePage } from './CampViewModel';
import { place, placeDetail, placeLedges, placePager, roomLayout, shelfSlots } from './CampRoomLayout';
const { ccclass, property } = _decorator;

@ccclass('CampWarehouse')
export class CampWarehouse extends Component {
    @property(Prefab) cardPrefab: Prefab = null!;
    @property(Node) shelf: Node = null!;
    @property(Node) ticketTemplate: Node = null!;
    @property(Node) empty: Node = null!;
    @property(ButtonAction) sell: ButtonAction = null!;
    @property(Label) nameLabel: Label = null!;
    @property(Label) description: Label = null!;
    @property(Label) value: Label = null!;
    @property(Label) folio: Label = null!;
    @property(ButtonAction) previous: ButtonAction = null!;
    @property(ButtonAction) next: ButtonAction = null!;
    private readonly cards: SelectableCard[] = [];

    render(game: GameReadModel, page: ReturnType<typeof warehousePage>, selected: string): void {
        const stock = game.storedSupplies ?? {};
        const { current, pages, items: visible } = page;
        const frame = roomLayout(this.node, 235, pages > 1);
        const footer = this.folio.node.parent!;
        const desk = this.nameLabel.node.parent!;
        placePager(footer, frame.inner);
        this.empty.active = !visible.length;
        desk.active = !!selected;
        this.shelf.active = !!visible.length;
        const ledges = this.node.getChildByName('Ledges')!;
        ledges.active = !!visible.length;
        this.sell.payload = selected;
        this.folio.string = pages > 1 ? `${current + 1} / ${pages}` : '';
        this.previous.node.active = this.next.node.active = pages > 1;
        this.previous.setEnabled(current > 0);
        this.next.setEnabled(current + 1 < pages);
        if (!visible.length) {
            const size = this.node.getComponent(UITransform)!;
            // The top of the painted counter is 69% down the original storehouse image.
            const counter = -.19 * Math.max(size.width / 1440, size.height / 900) * 900;
            const scale = Math.min(1, frame.body.width / (frame.side ? 730 : 550), frame.body.height / 300);
            const labelX = frame.side ? 65 : 0, labelY = frame.side ? 57 : -40;
            const lower = frame.body.y - frame.body.height / 2;
            place(this.empty, 0, Math.max(counter, lower + (frame.side ? 10 : 125) * scale));
            this.empty.setScale(scale, scale, 1);
            place(this.empty.getChildByName('Satchel')!, frame.side ? -170 : 0, 58);
            place(this.empty.getChildByName('InventoryTag')!, labelX, labelY);
            place(this.empty.getChildByName('EmptyTitle')!, labelX, labelY);
            return;
        }
        if (selected) {
            const definition = game.content.cards[selected];
            const price = definition.supplyValue ?? 1;
            const canSell = price <= MAX_SUPPLY_POINTS - game.supplies;
            this.nameLabel.string = definition.name;
            this.description.string = definition.text;
            this.value.string = `库存 ${stock[selected]} 张`;
            this.sell.setText(canSell ? `出售一张 · +${price} 物资点` : '物资点空间不足');
            this.sell.setEnabled(canSell);
            placeDetail(desk, frame.detail, frame.side);
        }
        const area = selected ? frame.shelf : frame.body;
        const grid = shelfSlots(area, page.slots);
        const scale = Math.min(.82, (grid.width - 16) / 262, (grid.height - 60) / 425);
        placeLedges(ledges, area, grid, visible.length, 182 * scale);
        while (this.cards.length < visible.length) {
            const node = instantiate(this.cardPrefab);
            this.shelf.addChild(node);
            const card = node.getComponent(SelectableCard)!;
            const plate = instantiate(this.ticketTemplate);
            card.badge!.node.parent!.addChild(plate);
            plate.setSiblingIndex(card.badge!.node.getSiblingIndex());
            plate.active = true;
            this.cards.push(card);
        }
        this.cards.forEach((card, slot) => {
            const entry = visible[slot];
            card.node.active = !!entry;
            if (!entry) return;
            place(card.node, grid.x(slot), grid.y(slot));
            card.show(entry, game, 'camp-stock-inspect', entry === selected, game.content.cards[entry].name + '　×' + stock[entry]);
            const artwork = card.card?.artwork?.spriteFrame;
            if (entry === selected && artwork) {
                const emblem = desk.getChildByName('Emblem')!;
                const bounds = emblem.getComponent(UITransform)!;
                const fit = Math.min(bounds.width / artwork.rect.width, bounds.height / artwork.rect.height);
                emblem.getComponent(Sprite)!.spriteFrame = artwork;
                bounds.setContentSize(artwork.rect.width * fit, artwork.rect.height * fit);
            }
            card.action!.payload = entry;
            card.node.setScale(scale, scale, 1);
            const ticket = card.badge!;
            const ticketWidth = Math.min(grid.width - 16, 218) / scale;
            const ticketY = -203 - 15 / scale;
            place(ticket.node, 0, ticketY, ticketWidth - 12 / scale, 31 / scale);
            place(ticket.node.parent!.getChildByName('ShelfTag')!, 0, ticketY, ticketWidth, 31 / scale);
            ticket.fontFamily = 'KaiTi, "Kaiti SC", STKaiti, serif';
            ticket.fontSize = 21 / scale;
            ticket.lineHeight = 27 / scale;
            ticket.isBold = false;
            ticket.color = new Color().fromHEX(entry === selected ? '#ffdb94' : '#f0ddc4');
            ticket.enableOutline = false;
            card.node.getComponent(UITransform)!.setContentSize(Math.max(236, ticketWidth), 406 + 60 / scale);
        });
    }
}
