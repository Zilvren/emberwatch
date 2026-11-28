import { Node, UITransform } from 'cc';

export interface RoomArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function fitCampRoom(content: Node, width: number, height: number): void {
    const scale = Math.min(width / 640, height / 640, Math.max(width / 1440, height / 920));
    content.setScale(scale, scale, 1);
    content.getComponent(UITransform)!.setContentSize(width / scale, height / scale);
}

export function place(node: Node, x: number, y: number, width?: number, height?: number): void {
    node.setPosition(x, y);
    if (width !== undefined && height !== undefined)
        node.getComponent(UITransform)!.setContentSize(width, height);
}

/** All three rooms use the complete visible canvas and the same inner margins. */
export function roomBody(content: Node, showFooter: boolean) {
    const { width, height } = content.getComponent(UITransform)!;
    content.getChildByName('RimLight')!.getComponent(UITransform)!.setContentSize(width, height);
    const margin = Math.min(56, Math.max(22, width * .042));
    const inner = width - 2 * margin;
    const top = height / 2 - Math.min(38, height * .035);
    const bottom = -height / 2 + Math.min(34, height * .035);
    const short = height < 740;
    const header = content.getChildByName('Header')!;
    const footer = content.getChildByName('Footer');
    place(header, 0, top);
    place(header.getChildByName('Title')!, -87, -25, inner - 174, 56);
    place(header.getChildByName('camp-back')!, (inner - 144) / 2, -26);
    if (footer) {
        footer.active = showFooter;
        if (showFooter) place(footer, 0, bottom + 26);
    }
    const upper = top - (short ? 64 : 73), lower = bottom + (showFooter ? 64 : 0);
    const body: RoomArea = { x: 0, y: (upper + lower) / 2, width: inner, height: upper - lower };
    const side = width >= 1000 && width / height >= 1.24;
    return { inner, body, side };
}

export function roomLayout(content: Node, compactDetail: number, showFooter = true) {
    const { inner, body, side } = roomBody(content, showFooter);
    const gap = side ? 30 : 16;
    const detailWidth = side ? Math.min(408, inner * .32) : inner;
    const detailHeight = side ? Math.min(body.height, 430) : compactDetail + (inner < 690 ? 25 : 0);
    const lower = body.y - body.height / 2;
    const shelf: RoomArea = side
        ? { x: -(detailWidth + gap) / 2, y: body.y, width: inner - detailWidth - gap, height: body.height }
        : { x: 0, y: body.y + (detailHeight + gap) / 2, width: inner, height: body.height - detailHeight - gap };
    const detail: RoomArea = { x: side ? (inner - detailWidth) / 2 : 0,
        y: side ? body.y : lower + detailHeight / 2, width: detailWidth, height: detailHeight };
    return { inner, body, shelf, detail, side };
}

/** Positions material, inscription, copy and action inside the same physical plaque. */
export function placeDetail(desk: Node, area: RoomArea, side: boolean): void {
    const { width: w, height: h } = area;
    place(desk, area.x, area.y, w, h);
    const edge = side ? 27 : 24, top = h / 2, inner = w - 2 * edge;
    const mark = desk.getChildByName('Emblem')!;
    const small = !side || h < 415;
    const iconSize = small ? 62 : 102;
    place(mark, small ? (inner - iconSize) / 2 : 0, small ? top - 47 : top - 74, iconSize, iconSize);
    const meta = desk.getChildByName('DetailMeta')!, name = desk.getChildByName('DetailName')!;
    const headingWidth = small ? inner - iconSize - 12 : inner;
    const headingX = (headingWidth - inner) / 2;
    const start = small ? top - 23 : top - 152;
    place(meta, headingX, start, headingWidth, 34);
    place(name, headingX, start - 49, headingWidth, 61);
    const ruleY = start - (side ? 86 : 74);
    place(desk.getChildByName('Rule')!, 0, ruleY, inner, 1);
    const action = desk.getChildByName('camp-stock-sell') ?? desk.getChildByName('camp-buy-relic');
    const actionY = -top + (side ? 54 : 35);
    const bottom = action ? actionY + 30 : -top + 9;
    const copyHeight = Math.max(35, ruleY - 6 - bottom);
    place(desk.getChildByName('DetailEffect')!, 0, ruleY - 6 - copyHeight / 2, inner, copyHeight);
    if (action) place(action, side ? 0 : (inner - 224) / 2, actionY);
}

export function placePager(footer: Node, inner: number): void {
    const right = inner / 2;
    place(footer.getChildByName('Previous')!, right - 190, 0);
    place(footer.getChildByName('PageNumber')!, right - 116, 0);
    place(footer.getChildByName('Next')!, right - 34, 0);
}

export function shelfSlots(area: RoomArea, kinds: number) {
    const columns = area.width < 680 ? 2 : 3;
    const rows = Math.max(1, Math.ceil(kinds / columns));
    const cellWidth = area.width / columns, cellHeight = area.height / rows;
    return {
        columns, width: cellWidth, height: cellHeight,
        x: (i: number) => area.x + (i % columns + .5 - columns / 2) * cellWidth,
        y: (i: number) => area.y + (rows / 2 - Math.floor(i / columns) - .5) * cellHeight,
    };
}

export function placeLedges(parent: Node, area: RoomArea, grid: ReturnType<typeof shelfSlots>, visible: number, drop: number): void {
    parent.children.forEach((ledge, row) => {
        const first = row * grid.columns;
        ledge.active = first < visible;
        if (ledge.active) place(ledge, area.x, grid.y(first) - drop, area.width - 12, 15);
    });
}
