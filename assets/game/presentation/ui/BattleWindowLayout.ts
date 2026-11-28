/** Distances in battle-local coordinates, measured from the center of the visible window. */
export function battleWindowLayout(frameWidth: number, frameHeight: number) {
    const scale = Math.min(frameWidth / 960, frameHeight / 900);
    const width = frameWidth / scale, height = frameHeight / scale;
    const stacked = width < 1160;
    const edge = width / 2, bottom = -height / 2;
    const actorScale = Math.min(1, width / 1200);
    const healthY = stacked ? Math.max(bottom + 510, -height * .14) : -124;
    const rightInset = stacked ? 24 : 234;
    // In the single row the round energy seal needs less room than the turn button.
    const leftInset = !stacked && width < 1340 ? 180 : rightInset;
    return {
        width, height, scale, stacked, actorScale, healthY,
        // The actors' authored floor and both health bars move as one across aspect ratios.
        worldY: healthY + 124 * actorScale,
        healthX: Math.min(edge - 134, 580),
        pileX: edge - 85,
        pileY: bottom + 100,
        energyX: stacked ? -edge + 229 : -edge + 110,
        endX: stacked ? edge - 266 : edge - 130,
        actionY: bottom + (stacked ? 100 : 224),
        handX: (leftInset - rightInset) / 2,
        handY: bottom + (stacked ? 331 : 147),
        handWidth: width - leftInset - rightInset,
    };
}
