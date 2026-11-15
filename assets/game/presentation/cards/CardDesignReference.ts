/** Workbook-derived presentation data. It is not an executable gameplay catalog. */
export interface CardDesignReference {
    id: string;
    name: string;
    type: string;
    combatEligibility: 'yes' | 'no' | 'configurable';
    staminaCost: number | null;
    weight: number;
    afterUse: string;
    combatText: string;
    utilityText: string;
    keywords: string[];
    art: string;
    sourceRow: number;
}
