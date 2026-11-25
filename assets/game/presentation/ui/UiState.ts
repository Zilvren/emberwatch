import { initialRecipeBrowse, RecipeBrowseState } from './RecipePanelModel';
import type { CampStation } from './CampViewModel';
import type { BattlePile } from '../cards/BattlePileModel';

export type Overlay =
    | 'bag'
    | 'help'
    | 'restart'
    | 'discard'
    | 'reward-leave'
    | 'log'
    | 'map'
    | 'entry'
    | 'recipes'
    | 'settings'
    | BattlePile
    | CampStation
    | null;
export interface UiState {
    overlay: Overlay;
    selectedCard: string;
    discardId: string;
    discardFromBag: boolean;
    page: number;
    bagFilter: 'all' | 'deck' | 'overflow' | 'found';
    bagSort: 'original' | 'name' | 'cost';
    deckEdit: boolean;
    inspectedCard: string;
    bagReader: boolean;
    bagDetails: boolean;
    rewardSelection: number;
    rewardContext: string;
    rewardPage: number;
    entryTier: 'emergency' | 'low' | 'standard' | 'high';
    campJournalPage: number;
    settingsReturn: boolean;
    pilePage: number;
    pileSelection: number;
    recipes: RecipeBrowseState;
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
        rewardPage: 0,
        entryTier: 'standard',
        campJournalPage: 0,
        settingsReturn: false,
        pilePage: 0,
        pileSelection: -1,
        recipes: initialRecipeBrowse(),
        busy: false,
        reduced: false,
    };
}
