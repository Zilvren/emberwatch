export type Overlay =
    | 'bag'
    | 'help'
    | 'restart'
    | 'discard'
    | 'repair-risk'
    | 'reward-leave'
    | 'supply-overflow'
    | 'log'
    | null;
export interface UiState {
    overlay: Overlay;
    selectedCard: string;
    discardId: string;
    discardFromBag: boolean;
    page: number;
    busy: boolean;
    reduced: boolean;
}
export function initialUiState(): UiState {
    return {
        overlay: null,
        selectedCard: '',
        discardId: '',
        discardFromBag: false,
        page: 0,
        busy: false,
        reduced: false,
    };
}
