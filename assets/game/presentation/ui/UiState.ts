export type Overlay =
    | 'bag'
    | 'help'
    | 'restart'
    | 'discard'
    | 'repair-risk'
    | 'reward-leave'
    | 'supply-overflow'
    | 'log'
    | 'map'
    | 'entry'
    | null;
export interface UiState {
    overlay: Overlay;
    selectedCard: string;
    discardId: string;
    discardFromBag: boolean;
    page: number;
    bagFilter: 'all' | 'deck' | 'overflow';
    bagSort: 'original' | 'name' | 'cost' | 'weight';
    deckEdit: boolean;
    inspectedCard: string;
    bagReader: boolean;
    bagDetails: boolean;
    rewardSelection: number;
    rewardContext: string;
    entryTier: 'emergency' | 'low' | 'standard' | 'high';
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
        bagFilter: 'all',
        bagSort: 'original',
        deckEdit: false,
        inspectedCard: '',
        bagReader: false,
        bagDetails: false,
        rewardSelection: -1,
        rewardContext: '',
        entryTier: 'standard',
        busy: false,
        reduced: false,
    };
}
