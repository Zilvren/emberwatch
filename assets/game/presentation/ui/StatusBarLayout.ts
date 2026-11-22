export interface StatusSlot { x: number; y: number; width: number; height: number }
export function statusBarLayout(width: number, _presentation: 'strip' | 'floating' = 'strip', recipesVisible = false) {
    const narrow = width < 720;
    const padding = narrow ? 12 : 26;
    const height = narrow ? 112 : 76;
    const mode = narrow ? 'narrow' : width < 1180 ? 'compact' : 'wide';
    const count = recipesVisible ? 4 : 3;
    const gap = narrow ? 6 : 10;
    const button = narrow ? 42 : 50;
    const menu = count * button + (count - 1) * gap;
    const available = width - padding * 2 - (narrow ? 0 : menu + 28);
    const widths = [40, 100, 112, 160, 100];
    const scale = Math.min(1, (available - gap * 4) / widths.reduce((a,b) => a + b, 0));
    let x = -width / 2 + padding;
    const sections: StatusSlot[] = widths.map(base => {
        const w = base * scale;
        const slot = { x: x + w / 2, y: narrow ? 24 : 0, width: w, height: 44 };
        x += w + gap;
        return slot;
    });
    const utilities: StatusSlot[] = [];
    let left = width / 2 - padding - menu;
    for (let i = 0; i < count; i++) {
        utilities.push({ x: left + button / 2, y: narrow ? -28 : 0, width: button, height: 42 });
        left += button + gap;
    }
    return {width, height, padding, mode, sections, utilities};
}
