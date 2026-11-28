import { _decorator, Component, instantiate, Label, Sprite, SpriteAtlas, SpriteFrame } from 'cc';
import { CAMP_RELICS, ownsRelic, relicPurchaseBlocked, type CampRelicId } from '../../core/content/GateCamp';
import type { GameReadModel } from '../../core/GameReadModel';
import { ButtonAction } from './ButtonAction';
import { place, placeDetail, placeLedges, placePager, roomLayout, shelfSlots } from './CampRoomLayout';
import { CAMP_SHELF_PAGE_SIZE, campShelfPage } from './CampViewModel';
const { ccclass, property } = _decorator;

@ccclass('CampRelicShop')
export class CampRelicShop extends Component {
    @property(ButtonAction) exhibit: ButtonAction = null!;
    @property(SpriteAtlas) artwork: SpriteAtlas = null!;
    @property(SpriteFrame) fallbackArt: SpriteFrame = null!;
    @property(Label) nameLabel: Label = null!;
    @property(Label) effect: Label = null!;
    @property(ButtonAction) exchange: ButtonAction = null!;
    @property(ButtonAction) previous: ButtonAction = null!;
    @property(ButtonAction) next: ButtonAction = null!;
    @property(Label) folio: Label = null!;
    private readonly slots: ButtonAction[] = [];

    render(game: GameReadModel, selected: CampRelicId): void {
        const index = Math.max(0, CAMP_RELICS.findIndex(item => item.id === selected));
        const relic = CAMP_RELICS[index];
        const page = campShelfPage(CAMP_RELICS, Math.floor(index / CAMP_SHELF_PAGE_SIZE));
        const frame = roomLayout(this.node, 218);
        const grid = shelfSlots(frame.shelf, Math.min(CAMP_RELICS.length, CAMP_SHELF_PAGE_SIZE));
        const size = Math.min(1, (grid.width - 8) / 194, (grid.height - 8) / 184);
        this.node.getChildByName('DisplayTrays')!.children.forEach((tray, row) => {
            const first = row * grid.columns;
            tray.active = first < page.items.length;
            if (!tray.active) return;
            const width = frame.shelf.width - 8, height = Math.min(grid.height - 3, 197 * size);
            place(tray, frame.shelf.x, grid.y(first), width, height);
            place(tray.getChildByName('Velvet')!, 0, 0, width - 10, height - 10);
        });
        placeLedges(this.node.getChildByName('Ledges')!, frame.shelf, grid, page.items.length, 34 * size);
        if (!this.slots.length) this.slots.push(this.exhibit);
        while (this.slots.length < page.items.length) {
            const node = instantiate(this.exhibit.node);
            this.exhibit.node.parent!.addChild(node);
            this.slots.push(node.getComponent(ButtonAction)!);
        }
        this.slots.forEach((slot, i) => {
            const item = page.items[i];
            slot.node.active = !!item;
            if (!item) return;
            const surface = slot.node.getChildByName('ButtonSurface')!;
            slot.actionId = 'camp-relic-' + item.id;
            slot.payload = item.id;
            slot.setText(item.name);
            surface.getChildByName('Price')!.getComponent(Label)!.string =
                ownsRelic(game, item.id) ? '已持有' : item.price + ' 物资点';
            const icon = surface.getChildByName('Object')!.getComponent(Sprite)!;
            icon.spriteFrame = this.artwork.getSpriteFrame(item.id) ?? this.fallbackArt;
            surface.getChildByName('SelectionMark')!.active = item.id === relic.id;
            place(slot.node, grid.x(i), grid.y(i));
            slot.node.setScale(size, size, 1);
        });
        const desk = this.nameLabel.node.parent!;
        placeDetail(desk, frame.detail, frame.side);
        desk.getChildByName('Emblem')!.getComponent(Sprite)!.spriteFrame = this.artwork.getSpriteFrame(relic.id) ?? this.fallbackArt;
        desk.getChildByName('DetailMeta')!.getComponent(Label)!.string = `现有 ${game.supplies} 物资点`;
        this.nameLabel.string = relic.name;
        this.effect.string = relic.effect;
        const blocked = relicPurchaseBlocked(relic, game.permanentRelics ?? [], game.supplies);
        this.exchange.payload = relic.id;
        this.exchange.setText(blocked || `兑换　·　${relic.price} 物资点`);
        this.exchange.setEnabled(!blocked);
        const footer = this.folio.node.parent!;
        place(footer.getChildByName('camp-talk')!, -frame.inner / 2 + 69, 0);
        placePager(footer, frame.inner);
        this.folio.node.active = page.pages > 1;
        this.folio.string = `${page.current + 1} / ${page.pages}`;
        this.previous.node.active = this.next.node.active = page.pages > 1;
        this.previous.setEnabled(page.current > 0);
        this.next.setEnabled(page.current + 1 < page.pages);
    }
}
