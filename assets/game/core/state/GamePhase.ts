export const GAME_PHASES = [
    'journal',
    'map',
    'battle',
    'rewards',
    'rest',
    'shelter',
    'failure',
] as const;
export type Phase = (typeof GAME_PHASES)[number];
export function isPhase(value: unknown): value is Phase {
    return typeof value === 'string' && (GAME_PHASES as readonly string[]).indexOf(value) >= 0;
}
