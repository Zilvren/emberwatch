export type EntryTierId = 'emergency' | 'low' | 'standard' | 'high';
export interface EntryTier {
    id: EntryTierId;
    name: string;
    cost: number;
    stamina: number;
}
/** User workbook: 进入档位. Baselines are editable content, not UI constants. */
export const ENTRY_TIERS: Readonly<Record<EntryTierId, Readonly<EntryTier>>> = Object.freeze({
    emergency: Object.freeze({ id: 'emergency', name: '紧急', cost: 0, stamina: 1 }),
    low: Object.freeze({ id: 'low', name: '低投入', cost: 4, stamina: 2 }),
    standard: Object.freeze({ id: 'standard', name: '标准', cost: 8, stamina: 3 }),
    high: Object.freeze({ id: 'high', name: '高投入', cost: 14, stamina: 4 }),
});
export const ENTRY_TIER_IDS: EntryTierId[] = ['emergency', 'low', 'standard', 'high'];
export function entryTier(id: unknown): Readonly<EntryTier> | undefined {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(ENTRY_TIERS, id)
        ? ENTRY_TIERS[id as EntryTierId]
        : undefined;
}
export function affordableEntryTier(supplies: number): EntryTierId {
    return supplies >= ENTRY_TIERS.standard.cost
        ? 'standard'
        : supplies >= ENTRY_TIERS.low.cost
          ? 'low'
          : 'emergency';
}
