import { initialRecipeBrowse, RecipeBrowseState } from './RecipePanelModel';
import type { CampPage } from './CampViewModel';
import { CAMP_RELICS, type CampRelicId } from '../../core/content/GateCamp';
import type { BattlePile } from '../cards/BattlePileModel';
import type { BagFilter } from '../cards/InventoryViewModel';

export type Overlay =
    | 'bag'
    | 'help'
    | 'restart'
    | 'discard'
    | 'reward-leave'
    | 'map'
    | 'entry'
    | 'recipes'
    | 'settings'
    | BattlePile
    | 'camp-talk'
    | null;
export interface UiState {
    overlay: Overlay;
    selectedCard: string;
    discardId: string;
    discardFromBag: boolean;
    page: number;
    bagFilter: BagFilter;
    bagSort: 'original' | 'name' | 'cost';
    deckEdit: boolean;
    inspectedCard: string;
    bagReader: boolean;
    bagDetails: boolean;
    rewardSelection: number;
    rewardContext: string;
    rewardPage: number;
    entryTier: 'emergency' | 'low' | 'standard' | 'high';
    campPage: CampPage | null;
    stockPage: number;
    warehouseKind: string;
    campSkill: string | null;
    shopRelic: CampRelicId;
    campTopic: number;
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
        campPage: null,
        stockPage: 0,
        warehouseKind: '',
        campSkill: null,
        shopRelic: CAMP_RELICS[0].id,
        campTopic: 0,
        settingsReturn: false,
        pilePage: 0,
        pileSelection: -1,
        recipes: initialRecipeBrowse(),
        busy: false,
        reduced: false,
    };
}
