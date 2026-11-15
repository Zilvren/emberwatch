export interface StatusSlot {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** A desktop strip, a two-row toolbar, or four readable rows in a narrow container. */
export function statusBarLayout(width: number, presentation: 'strip' | 'floating' = 'strip') {
    if (presentation === 'floating') {
        return {
            width,
            height: 80,
            padding: 24,
            mode: 'floating',
            sections: [100, 260, 400, 560, 780].map((x, index) => ({
                x: x - width / 2,
                y: 0,
                width: [140, 90, 120, 160, 190][index],
                height: 64,
            })),
            utilities: [1060, 1150, 1240, 1350].map((x, index) => ({
                x: x - width / 2,
                y: 0,
                width: index === 3 ? 100 : 76,
                height: 36,
            })),
        };
    }
    const padding = width < 720 ? 16 : 24,
        gap = width < 720 ? 8 : 16;
    const inner = Math.max(1, width - padding * 2);
    const mode = width >= 1180 ? 'wide' : width >= 720 ? 'compact' : 'narrow';
    const height = mode === 'wide' ? 80 : mode === 'compact' ? 144 : 264;
    const utilities: StatusSlot[] = [],
        sections: StatusSlot[] = [];
    const actionWidths = mode === 'narrow' ? Array(4).fill((inner - 24) / 4) : [72, 72, 80, 88];
    const menuWidth = actionWidths.reduce((sum, value) => sum + value, 0) + 24;
    if (mode !== 'narrow') {
        const weights = [1.1, 0.7, 1, 1.2, 1.4],
            total = weights.reduce((a, b) => a + b, 0);
        const available = inner - gap * 4 - (mode === 'wide' ? menuWidth + 24 : 0);
        let left = -width / 2 + padding;
        weights.forEach((weight) => {
            const w = (available * weight) / total;
            sections.push({ x: left + w / 2, y: mode === 'wide' ? 0 : 32, width: w, height: 64 });
            left += w + gap;
        });
    } else {
        const half = (inner - gap) / 2;
        sections.push(
            { x: -inner / 2 + half / 2, y: 96, width: half, height: 64 },
            { x: inner / 2 - half / 2, y: 96, width: half, height: 64 },
            { x: -inner / 2 + half / 2, y: 32, width: half, height: 64 },
            { x: inner / 2 - half / 2, y: 32, width: half, height: 64 },
            { x: 0, y: -32, width: inner, height: 64 }
        );
    }
    let cursor = width / 2 - padding - menuWidth;
    for (const w of actionWidths) {
        utilities.push({
            x: cursor + w / 2,
            y: mode === 'wide' ? 0 : mode === 'compact' ? -44 : -96,
            width: w,
            height: 40,
        });
        cursor += w + 8;
    }
    return { width, height, padding, mode, sections, utilities };
}
