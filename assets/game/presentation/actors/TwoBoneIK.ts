/** Planar two-bone solve, angles measured from the downward local Y axis. */
export function solveTwoBone(
    x: number,
    y: number,
    upper: number,
    lower: number,
    bend: 1 | -1
): { upper: number; lower: number } {
    if (upper <= 0 || lower <= 0) throw new Error('Bone lengths must be positive');
    const distance = Math.max(
        Math.abs(upper - lower) + 0.0001,
        Math.min(upper + lower - 0.0001, Math.hypot(x, y))
    );
    const knee =
        bend *
        Math.acos(
            Math.max(
                -1,
                Math.min(
                    1,
                    (distance * distance - upper * upper - lower * lower) / (2 * upper * lower)
                )
            )
        );
    const hip =
        Math.atan2(x, -y) - Math.atan2(lower * Math.sin(knee), upper + lower * Math.cos(knee));
    return { upper: (hip * 180) / Math.PI, lower: (knee * 180) / Math.PI };
}
