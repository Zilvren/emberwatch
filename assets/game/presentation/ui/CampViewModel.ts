import type { GameReadModel } from '../../core/GameReadModel';
export { atGateCamp } from '../../core/content/GateCamp';

export const CAMP_PAGES = ['camp-skills', 'camp-warehouse', 'camp-journal', 'camp-keeper'] as const;
export type CampPage = typeof CAMP_PAGES[number];

export function isCampPage(id: string): id is CampPage {
    return CAMP_PAGES.some(page => id === page);
}

export const CAMP_SHELF_PAGE_SIZE = 6;

export function campShelfPage<T>(items: readonly T[], page: number) {
    const pages = Math.max(1, Math.ceil(items.length / CAMP_SHELF_PAGE_SIZE));
    const current = Math.max(0, Math.min(page, pages - 1));
    const first = current * CAMP_SHELF_PAGE_SIZE;
    return { current, pages, items: items.slice(first, first + CAMP_SHELF_PAGE_SIZE) };
}
export function warehousePage(game: GameReadModel, page: number) {
    const stored = game.storedSupplies ?? {};
    const kinds = Object.keys(stored).filter(kind => game.content.cards[kind]?.role === 'supply' && stored[kind] > 0);
    return { ...campShelfPage(kinds, page), slots: Math.min(kinds.length, CAMP_SHELF_PAGE_SIZE) };
}

const KEEPER_LINES = [
    { line: '“这些老物件经得起折腾。挑中哪件，往后进门都带在身上。”', next: '问问练功的事' },
    { line: '“左边那盏灯是给练功的人留的。牌能丢，自己学会的本事，门收不走。”', next: '问问仓库的事' },
    { line: '“好东西先带回来，搁右边的箱子。缺物资点时，在仓库里就能卖。”', next: '问问遗物的事' },
];

export function nextKeeperTopic(current: number): number {
    return (current + 1) % KEEPER_LINES.length;
}

export function keeperDialogue(topic: number) {
    return KEEPER_LINES[topic];
}
