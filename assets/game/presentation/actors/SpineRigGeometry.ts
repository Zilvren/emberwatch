export type SpineMotion = 'idle' | 'attack' | 'prepare' | 'hurt' | 'death';
export type BoneInfluence = readonly [number, number, number, number];
export interface SpineRigContract {
    schemaVersion: 1;
    actor: string;
    sourceSha256: string;
    baseline: number;
    boneNames: readonly string[];
    influences: readonly (readonly BoneInfluence[])[];
    triangles: readonly number[];
    neutralVertices: readonly (readonly [number, number])[];
    motions: Record<SpineMotion, { duration: number; loop: boolean; contact?: number }>;
    contactTip: readonly [number, number];
    contactBone: string;
    approachBone: string;
}
export interface BoneTransform {
    a: number;
    b: number;
    c: number;
    d: number;
    worldX: number;
    worldY: number;
}
export function skinVertex(
    weights: readonly BoneInfluence[],
    bones: readonly BoneTransform[]
): { x: number; y: number } {
    let x = 0,
        y = 0;
    for (const [index, lx, ly, weight] of weights) {
        const bone = bones[index];
        x += (bone.a * lx + bone.b * ly + bone.worldX) * weight;
        y += (bone.c * lx + bone.d * ly + bone.worldY) * weight;
    }
    return { x, y };
}
export function silhouetteAtHeight(
    vertices: readonly { x: number; y: number }[],
    triangles: readonly number[],
    height: number,
    fromLeft: boolean
): number | null {
    let edge = fromLeft ? Infinity : -Infinity;
    for (let i = 0; i < triangles.length; i += 3) {
        for (let k = 0; k < 3; k++) {
            const a = vertices[triangles[i + k]],
                b = vertices[triangles[i + ((k + 1) % 3)]];
            if (
                Math.abs(a.y - b.y) < 1e-7 ||
                height < Math.min(a.y, b.y) ||
                height > Math.max(a.y, b.y)
            )
                continue;
            const x = a.x + ((b.x - a.x) * (height - a.y)) / (b.y - a.y);
            edge = fromLeft ? Math.min(edge, x) : Math.max(edge, x);
        }
    }
    return Number.isFinite(edge) ? edge : null;
}
