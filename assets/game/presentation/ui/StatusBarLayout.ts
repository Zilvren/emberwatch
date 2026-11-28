export interface StatusSlot { x: number; y: number; width: number; height: number }
export function statusBarLayout(width: number, presentation: 'strip' | 'floating' = 'strip', recipesVisible = false, healthVisible = true) {
    const narrow = width < 820;
    const padding = narrow ? 12 : Math.min(66, Math.round(width * .047));
    const height = narrow ? 112 : 76;
    const mode = narrow ? 'narrow' : width < 1180 ? 'compact' : 'wide';
    const count = recipesVisible ? 4 : 3;
    const gap = narrow ? 6 : mode === 'compact' ? 10 : 18;
    const button = narrow ? 44 : mode === 'compact' ? 48 : 58;
    const buttonHeight = presentation === 'floating' ? 50 : 42;
    const bagWidth = narrow ? 62 : mode === 'compact' ? 72 : 84;
    const menu = bagWidth + count * (button + gap);
    const roundWidth = healthVisible ? 0 : narrow ? 90 : mode === 'compact' ? 126 : 180;
    const available = width - padding * 2 - (narrow ? 0 : menu + gap) - (roundWidth ? roundWidth + gap : 0);
    const widths = [64, 100, 100, healthVisible ? 138 : 0];
    const scale = Math.min(1, (available - gap * (healthVisible ? 3 : 2)) / widths.reduce((a, b) => a + b, 0));
    let x = -width / 2 + padding;
    const sections: StatusSlot[] = widths.map(base => {
        const w = base * scale;
        const slot = { x: x + w / 2, y: narrow ? 26 : 0, width: w, height: 44 };
        if (w) x += w + gap;
        return slot;
    });
    const y = narrow ? -28 : 0;
    let left = narrow ? -menu / 2 : width / 2 - padding - menu;
    const roundRight = narrow ? width / 2 - padding : left - gap;
    const roundX = Math.min(roundRight - roundWidth / 2, Math.max(narrow ? roundRight : 0, x + roundWidth / 2));
    const round = { x: roundX, y: narrow ? 26 : 0, width: roundWidth, height: 40 };
    sections.push({ x: left + bagWidth / 2, y, width: bagWidth, height: buttonHeight });
    left += bagWidth + gap;
    const utilities: StatusSlot[] = [];
    for (let i = 0; i < count; i++) {
        utilities.push({ x: left + button / 2, y, width: button, height: buttonHeight });
        left += button + gap;
    }
    return {width, height, padding, mode, sections, utilities, round};
}
