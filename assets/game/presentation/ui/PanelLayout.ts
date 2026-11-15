export interface PanelLayoutInput {
    availableWidth: number;
    availableHeight: number;
    width: number;
    height: number;
    titleHeight: number;
    subtitleHeight: number;
    actionWidths: number[];
    padding: number;
    margin: number;
    gap: number;
    buttonHeight: number;
}
/** Geometry is calculated independently of engine nodes and game state. */
export function panelLayout(input: PanelLayoutInput) {
    const width = Math.max(1, Math.min(input.width, input.availableWidth - input.margin * 2));
    const padding = Math.min(input.padding, Math.max(16, width * 0.05));
    const innerWidth = Math.max(1, width - padding * 2);
    const widths = input.actionWidths.map((value) => Math.min(value, innerWidth));
    const totalWidth =
        widths.reduce((sum, value) => sum + value, 0) + Math.max(0, widths.length - 1) * input.gap;
    const stacked = totalWidth > innerWidth;
    const footerHeight = widths.length
        ? padding * 2 +
          (stacked ? widths.length : 1) * input.buttonHeight +
          (stacked ? Math.max(0, widths.length - 1) * input.gap : 0)
        : padding;
    const headerHeight =
        padding * 2 + input.titleHeight + (input.subtitleHeight ? input.subtitleHeight + 6 : 0);
    const height = Math.max(
        1,
        Math.min(
            Math.max(input.height, headerHeight + footerHeight + 128 + input.gap * 2),
            input.availableHeight - input.margin * 2
        )
    );
    const top = height / 2 - headerHeight - input.gap;
    const bottom = -height / 2 + footerHeight + input.gap;
    let left = width / 2 - padding - totalWidth;
    const actions = widths.map((value, index) => {
        const actionWidth = stacked ? innerWidth : value;
        const x = stacked ? 0 : left + actionWidth / 2;
        left += actionWidth + input.gap;
        const y =
            -height / 2 +
            padding +
            input.buttonHeight / 2 +
            (stacked ? (widths.length - index - 1) * (input.buttonHeight + input.gap) : 0);
        return { x, y, width: actionWidth, height: input.buttonHeight };
    });
    return {
        width,
        height,
        padding,
        innerWidth,
        headerHeight,
        footerHeight,
        bodyY: (top + bottom) / 2,
        bodyHeight: Math.max(0, top - bottom),
        stacked,
        actions,
    };
}
