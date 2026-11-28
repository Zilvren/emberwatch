import { GameCommand, GameSession } from '../../application/GameSession';
import type { CardKind, Route } from '../../core/SurvivalGame';
import type { ButtonActionEvent } from './UIEvents';
import type { UiState } from './UiState';
import { entryTier, affordableEntryTier } from '../../core/content/EntryTiers';
import { initialRecipeBrowse, recipeBrowse } from './RecipePanelModel';
import { atGateCamp, isCampStation, keeperLots, nextKeeperTopic } from './CampViewModel';
import { CAMP_SKILLS } from '../../core/content/GateCamp';
import { battlePileEntries, isCardPile, PILE_PAGE_SIZE } from '../cards/BattlePileModel';
export type UiSound = 'tap' | 'loot' | 'heal';
export interface UiActions {
    act(command: GameCommand, sound?: UiSound): void;
    refresh(): void;
    playCard(id: string): void;
    enemyTurn(): void;
    message(text: string): void;
    sound(name: UiSound): void;
    toggleAudio(): void;
    healEffect(): void;
}
/** Routes UI intent to application commands and presentation callbacks. No engine dependency. */
export class UiActionRouter {
    constructor(
        private readonly session: GameSession,
        private readonly ui: UiState,
        private readonly actions: UiActions
    ) {}
    handle(event: ButtonActionEvent): void {
        if (this.ui.busy || !this.session.view) return;
        const id = event.id,
            g = this.session.view;
        if (isCardPile(this.ui.overlay) || isCardPile(id)) {
            this.pileAction(id);
            return;
        }
        if (id === 'settings' && !this.ui.overlay) {
            this.ui.settingsReturn = false;
            this.ui.overlay = 'settings';
            this.actions.refresh();
            return;
        }
        if (this.ui.overlay === 'settings') {
            if (id === 'audio') this.actions.toggleAudio();
            else if (id === 'help' || id === 'restart') {
                this.ui.settingsReturn = true;
                this.ui.overlay = id;
            } else if (id === 'modal-close' || id === 'modal-cancel') this.ui.overlay = null;
            else return;
            this.actions.refresh();
            return;
        }
        if (this.ui.settingsReturn && (id === 'modal-close' || id === 'modal-cancel')) {
            this.ui.settingsReturn = false;
            this.ui.overlay = 'settings';
            this.actions.refresh();
            return;
        }
        if (id.startsWith('camp-')) {
            this.campAction(id, event.payload);
            return;
        }
        if (isCampStation(this.ui.overlay) && id !== 'modal-close' && id !== 'modal-cancel') return;
        const choice = g.battle?.cardChoice;
        if (this.ui.overlay === 'recipes' || id === 'recipe-open' || id === 'rest-synthesis') {
            if (!choice && !g.battle?.discovery) this.recipeAction(event);
            return;
        }
        if (choice && !this.ui.overlay && (id === 'claim-supplies' || id === 'reward-bag')) {
            this.ui.rewardPage = Math.max(0, Math.min(Math.ceil(choice.ids.length / 3) - 1,
                this.ui.rewardPage + (id === 'reward-bag' ? 1 : -1)));
            this.ui.rewardSelection = -1;
            this.actions.refresh();
            return;
        }
        if (choice && !this.ui.overlay && (id === 'resolve-choice-confirm' || id === 'rewards-done')) {
            const selected = choice.ids[this.ui.rewardSelection];
            if (id === 'resolve-choice-confirm' && !selected) return;
            this.actions.act({ type: 'resolve-combat-choice', id: id === 'rewards-done' ? null : selected });
            return;
        }
        if (id === 'card-select') {
            if (!this.ui.overlay) this.selectCard(event.payload ?? '');
            return;
        }
        if (id === 'bag' || id === 'rest-bag' || id === 'reward-bag') {
            this.ui.overlay = 'bag';
            this.ui.page = 0;
            this.ui.deckEdit = id === 'rest-bag' && !g.scenario.runDeck && !g.scenario.fieldDeck;
            if (g.scenario.runDeck) this.ui.bagFilter = id === 'reward-bag' ? 'all' : 'deck';
            if (id === 'reward-bag' && g.scenario.labyrinth && g.rewards?.discovery) this.ui.bagFilter = 'supplies';
            if (this.ui.deckEdit) this.ui.bagFilter = 'all';
            this.ui.bagReader = false;
            this.ui.bagDetails = false;
        } else if (id === 'map') {
            if (this.ui.overlay === 'map') this.ui.overlay = null;
            else if (!this.ui.overlay) this.ui.overlay = 'map';
            else return;
        } else if (id.startsWith('bag-filter-') && this.ui.overlay === 'bag') {
            const filter = id.slice(11);
            if (
                filter === 'all' ||
                filter === 'deck' ||
                filter === 'overflow' ||
                (filter === 'found' && g.scenario.fieldDeck) ||
                (filter === 'supplies' && g.scenario.labyrinth)
            )
                this.ui.bagFilter = filter;
        } else if (id === 'bag-sort' && this.ui.overlay === 'bag') {
            const sorts: UiState['bagSort'][] = ['original', 'name', 'cost'];
            this.ui.bagSort = sorts[(sorts.indexOf(this.ui.bagSort) + 1) % sorts.length];
        } else if (
            id === 'bag-mode' &&
            this.ui.overlay === 'bag' &&
            g.phase === 'rest' &&
            !g.scenario.runDeck &&
            !g.scenario.fieldDeck
        ) {
            this.ui.deckEdit = !this.ui.deckEdit;
            if (this.ui.deckEdit) this.ui.bagFilter = 'all';
            this.ui.bagReader = false;
        } else if (id === 'bag-details' && this.ui.overlay === 'bag')
            this.ui.bagDetails = !this.ui.bagDetails;
        else if (id === 'bag-reader-close' && this.ui.overlay === 'bag') this.ui.bagReader = false;
        else if (id.startsWith('inspect-') && this.ui.overlay === 'bag') {
            const card = g.cards.find((card) => card.id === id.slice(8));
            if (!card) return;
            this.ui.inspectedCard = card.id;
            this.ui.bagDetails = false;
            if (this.ui.deckEdit && g.phase === 'rest') {
                if (card.zone !== 'base' || card.kind === 'cash')
                    this.actions.message('此卡不能编入出战牌组');
                else {
                    this.actions.act({ type: 'toggle-card', id: card.id });
                    return;
                }
            } else this.ui.bagReader = true;
        } else if (
            id.startsWith('reward-select-') &&
            !this.ui.overlay &&
            (choice || g.battle?.discovery || (g.phase === 'rewards' && !g.rewards?.cardTaken))
        ) {
            const index = Number(id.slice(14));
            if (!Number.isInteger(index) || !(choice?.ids ?? g.battle?.discovery ?? g.rewards?.cards)?.[index])
                return;
            this.ui.rewardSelection = index;
        } else if (
            (g.battle?.discovery || g.rewards?.discovery) &&
            !this.ui.overlay &&
            (id === 'discover-confirm' || id === 'rewards-done')
        ) {
            const kind = (g.battle?.discovery ?? g.rewards!.cards)[this.ui.rewardSelection];
            if (id === 'discover-confirm' && !kind) return;
            this.ui.rewardSelection = -1;
            this.actions.act(
                { type: 'discover', kind: id === 'discover-confirm' ? kind : null },
                'loot'
            );
            return;
        } else if (id.startsWith('entry-tier-') && this.ui.overlay === 'entry') {
            const tier = entryTier(id.slice(11));
            if (!tier || g.supplies < tier.cost) return;
            this.ui.entryTier = tier.id;
        } else if (id === 'entry-confirm' && this.ui.overlay === 'entry') {
            const result = this.session.execute({ type: 'start', tier: this.ui.entryTier });
            if (result.ok) this.ui.overlay = null;
            this.actions.message(result.message);
            this.actions.refresh();
            return;
        } else if (id === 'rules-help') this.ui.overlay = 'help';
        else if (id === 'help' || id === 'restart') this.ui.overlay = id;
        else if (id === 'audio') this.actions.toggleAudio();
        else if (
            (id === 'modal-close' || id === 'modal-cancel') &&
            this.ui.overlay === 'bag' &&
            this.ui.bagReader
        )
            this.ui.bagReader = false;
        else if (id === 'modal-close' || id === 'modal-cancel')
            this.ui.overlay =
                this.ui.overlay === 'discard' && this.ui.discardFromBag ? 'bag' : null;
        else if (id === 'bag-prev') this.ui.page--;
        else if (id === 'bag-next') this.ui.page++;
        else if (id === 'modal-confirm') {
            this.confirm();
            return;
        } else if (id.startsWith('discard-') && id !== 'discard-supply') {
            this.ui.discardId = id.slice(8);
            this.ui.discardFromBag = this.ui.overlay === 'bag';
            this.ui.overlay = 'discard';
        } else if (id.startsWith('toggle-')) {
            this.actions.act({ type: 'toggle-card', id: id.slice(7) });
            return;
        } else if (this.ui.overlay) return;
        else if (g.battle?.discovery || choice || g.rewards?.discovery) return;
        else if (id === 'journal-start') {
            if (g.phase === 'journal') {
                if (g.currentJournal?.id === 'departure' && g.pendingJournalCount === 1)
                    this.openEntry();
                else this.actions.act({ type: 'continue-journal' });
            } else if (g.phase === 'failure') {
                this.actions.act({ type: 'retry' });
            }
            return;
        } else if (id.startsWith('route-')) {
            const route = id.slice(6);
            if (!Object.prototype.hasOwnProperty.call(g.scenario.routes, route)) return;
            this.actions.act({ type: 'choose-route', route });
            return;
        } else if (id.startsWith('enter-') || id === 'map-enter') {
            this.actions.act(g.expeditionMap && id.startsWith('enter-')
                ? { type: 'enter-node', id: id.slice(6) }
                : { type: 'enter-node' });
            return;
        } else if (id === 'end-turn') {
            this.actions.enemyTurn();
            return;
        } else if (id === 'enemy-target') {
            if (this.ui.selectedCard) this.actions.playCard(this.ui.selectedCard);
            return;
        } else if (id === 'claim-supplies') {
            const r = g.rewards;
            if (!r || r.supplyTaken) return;
            this.actions.act({ type: 'claim-supplies' }, 'loot');
            return;
        } else if (id.startsWith('claim-card-')) {
            this.actions.act({ type: 'claim-card', index: Number(id.slice(11)) }, 'loot');
            return;
        } else if (id === 'rewards-done') {
            const r = g.rewards;
            if (r && ((!r.supplyTaken && r.supplies > 0) || (!r.cardTaken && r.cards.length))) {
                this.ui.overlay = 'reward-leave';
                this.actions.refresh();
                return;
            }
            this.actions.act({ type: 'finish-rewards' });
            return;
        } else if (id === 'rest-cash') {
            this.ui.discardId = g.cards.find((c) => c.kind === 'cash')?.id ?? '';
            this.ui.discardFromBag = false;
            this.ui.overlay = 'discard';
        } else if (id === 'rest-done') {
            this.actions.act({ type: 'finish-rest' });
            return;
        } else if (id === 'shelter-repair') {
            if (g.scenario.runDeck) {
                this.actions.act({ type: 'redeem-supplies' }, 'loot');
                return;
            }
            const result = this.session.execute({ type: 'heal-at-shelter' });
            this.actions.message(result.message);
            if (result.ok) {
                this.actions.sound('heal');
                this.actions.healEffect();
            }
        } else if (id === 'shelter-done') {
            if (g.phase === 'shelter') this.openEntry();
            return;
        }
        this.actions.sound('tap');
        this.actions.refresh();
    }
    private pileAction(id: string): void {
        const g = this.session.view, active = this.ui.overlay;
        if (isCardPile(id)) {
            if (active) return;
            if (id !== 'supply-bag' && (!g.battle || g.phase !== 'battle' || g.battle.cardChoice || g.battle.discovery)) return;
            this.ui.overlay = id;
            this.ui.pilePage = 0;
            this.ui.pileSelection = -1;
        } else if (isCardPile(active)) {
            if (id === 'modal-close' || id === 'modal-cancel') this.ui.overlay = null;
            else {
                const entries = battlePileEntries(g, active);
                if (id === 'pile-prev' || id === 'pile-next') {
                    const last = Math.max(0, Math.ceil(entries.length / PILE_PAGE_SIZE) - 1);
                    this.ui.pilePage = Math.max(0, Math.min(last, this.ui.pilePage + (id === 'pile-prev' ? -1 : 1)));
                    this.ui.pileSelection = -1;
                } else if (id.startsWith('pile-inspect-')) {
                    const index = Number(id.slice('pile-inspect-'.length));
                    if (!Number.isInteger(index) || !entries[index] || Math.floor(index / PILE_PAGE_SIZE) !== this.ui.pilePage) return;
                    this.ui.pileSelection = this.ui.pileSelection === index ? -1 : index;
                } else return;
            }
        } else return;
        this.actions.sound('tap');
        this.actions.refresh();
    }
    private campAction(id: string, kind: string): void {
        const g = this.session.view;
        if (!atGateCamp(g)) return;
        const active = this.ui.overlay;
        if (id === 'camp-gate' && !active) {
            this.openEntry();
            return;
        } else if (!active && (id === 'camp-keeper' || id === 'camp-warehouse' || id === 'camp-fire' || id === 'camp-skills')) {
            this.ui.overlay = id;
            if (id === 'camp-skills') this.ui.campSkill = CAMP_SKILLS[0].id;
            if (id === 'camp-warehouse') this.ui.warehouseKind = '';
            if (id === 'camp-fire') this.ui.campJournalPage = Math.max(0, g.journalEntries.length - 1);
        } else if (active === 'camp-skills' && id === 'camp-select-' + kind && CAMP_SKILLS.some(skill => skill.id === kind)) {
            this.ui.campSkill = kind;
        } else if (active === 'camp-skills' && id === 'camp-learn' && kind === this.ui.campSkill) {
            this.actions.act({ type: 'learn-camp-skill', id: kind });
            return;
        } else if (active === 'camp-skills' && id === 'camp-equipment') {
            this.ui.overlay = 'camp-bench';
        } else if (active === 'camp-keeper' && id === 'camp-talk') {
            this.ui.overlay = 'camp-talk';
            this.ui.campTopic = 0;
        } else if (active === 'camp-talk' && id === 'camp-talk-next') {
            this.ui.campTopic = nextKeeperTopic(this.ui.campTopic);
        } else if ((id === 'camp-trade' && (active === 'camp-keeper' || active === 'camp-talk')) ||
            (id === 'camp-find-keeper' && active === 'camp-warehouse')) {
            this.ui.overlay = 'camp-trade';
            this.ui.tradeLot = '';
            this.ui.tradeReceipt = '';
        } else if (active === 'camp-trade') {
            const lots = keeperLots(g);
            const lot = lots.find(item => item.key === this.ui.tradeLot) ?? lots[0];
            if (id === 'camp-trade-browse') this.ui.tradeReceipt = '';
            else if (this.ui.tradeReceipt) return;
            else if (id === 'camp-trade-next' && lots.some(item => item.key === kind)) this.ui.tradeLot = kind;
            else if (id === 'camp-exchange' && lot && kind === lot.key) {
                const result = this.session.execute({ type: lot.buying ? 'buy-keeper-card' : 'redeem-supply', kind: lot.kind });
                if (result.ok) this.ui.tradeReceipt = result.message;
                else this.actions.message(result.message);
            } else return;
        } else if ((id === 'camp-stock' || id === 'camp-stock-next') && this.ui.overlay === 'camp-warehouse' && (g.storedSupplies?.[kind] ?? 0) > 0) {
            this.ui.warehouseKind = kind;
        } else if (id === 'camp-stock-back' && this.ui.overlay === 'camp-warehouse') {
            this.ui.warehouseKind = '';
        } else if (id === 'camp-redeem' && this.ui.overlay === 'camp-warehouse' && kind && kind === this.ui.warehouseKind) {
            this.actions.act({ type: 'redeem-supply', kind }, 'loot');
            return;
        } else if (id === 'camp-deck' && this.ui.overlay === 'camp-bench') {
            this.ui.overlay = 'bag';
            this.ui.page = 0;
            this.ui.bagFilter = 'all';
            this.ui.deckEdit = this.ui.bagReader = this.ui.bagDetails = false;
        } else if (id === 'camp-repair' && this.ui.overlay === 'camp-bench' && g.phase === 'shelter') {
            this.actions.act({ type: 'heal-at-shelter' }, 'heal');
            return;
        } else if (this.ui.overlay === 'camp-fire' && id === 'camp-audio') {
            this.actions.toggleAudio();
        } else if (this.ui.overlay === 'camp-fire' && (id === 'camp-prev' || id === 'camp-next')) {
            const page = this.ui.campJournalPage + (id === 'camp-next' ? 1 : -1);
            this.ui.campJournalPage = Math.max(0, Math.min(g.journalEntries.length - 1, page));
        } else return;
        this.actions.sound('tap');
        this.actions.refresh();
    }
    private recipeAction(event: ButtonActionEvent): void {
        const { id, payload = '' } = event;
        if (this.ui.overlay !== 'recipes') {
            if (this.ui.overlay || !this.session.execute({ type: 'open-recipes' }).ok) return;
            this.ui.recipes = initialRecipeBrowse();
            this.ui.overlay = 'recipes';
            this.actions.refresh();
            return;
        }
        const browse = this.ui.recipes;
        const model = recipeBrowse(this.session.view, browse);
        const resetSelection = () => {
            browse.recipeId = '';
            browse.card = '';
            browse.page = 0;
        };
        if (id === 'modal-close' || id === 'modal-cancel') {
            this.session.execute({ type: 'close-recipes' });
            this.ui.overlay = null;
        } else if (id === 'recipe-filter') {
            if (payload !== 'all' && payload !== 'ready' && payload !== 'partial') return;
            browse.filter = payload;
            resetSelection();
        } else if (id === 'recipe-category') {
            const categories = ['', ...model.categories];
            browse.category =
                categories[(categories.indexOf(browse.category) + 1) % categories.length];
            resetSelection();
        } else if (id === 'recipe-sort') {
            browse.byName = !browse.byName;
            resetSelection();
        } else if (id === 'recipe-prev' || id === 'recipe-next') {
            resetSelection();
            browse.page = Math.max(
                0,
                Math.min(model.totalPages - 1, model.page + (id === 'recipe-prev' ? -1 : 1))
            );
        } else if (id === 'recipe-pick' || id === 'recipe-link') {
            if (id === 'recipe-link') {
                browse.filter = 'all';
                browse.category = '';
            }
            browse.recipeId = payload;
            browse.card = '';
        } else if (id === 'recipe-card') browse.card = payload;
        else if (id === 'recipe-craft' && model.selected) {
            browse.recipeId = model.selected.recipe.id;
            this.actions.act({ type: 'synthesize', recipeId: model.selected.recipe.id }, 'loot');
            return;
        } else if (id === 'recipe-undo') {
            this.actions.act({ type: 'undo-synthesis' });
            return;
        } else return;
        this.actions.refresh();
    }
    private confirm(): void {
        if (this.ui.overlay === 'restart') {
            this.session.execute({ type: 'new-game' });
            this.ui.overlay = null;
            this.ui.settingsReturn = false;
            this.ui.selectedCard = '';
            this.actions.refresh();
        } else if (this.ui.overlay === 'discard') {
            this.ui.overlay = this.ui.discardFromBag ? 'bag' : null;
            this.ui.bagReader = false;
            this.actions.act({ type: 'discard-card', id: this.ui.discardId });
        } else if (this.ui.overlay === 'reward-leave') {
            this.ui.overlay = null;
            this.actions.act({ type: 'finish-rewards' });
        }
    }
    private openEntry(): void {
        if (this.session.view.scenario.battleResource === 'stamina') {
            this.ui.entryTier = affordableEntryTier(this.session.view.supplies);
            this.ui.overlay = 'entry';
            this.actions.refresh();
        } else this.actions.act({ type: 'start' });
    }
    private selectCard(id: string): void {
        const card = this.session.view.battle?.hand.find((c) => c.id === id);
        if (!card) return;
        const reason = this.session.view.cardBlocked(card);
        if (reason) {
            this.actions.message(reason);
            return;
        }
        if (this.attackKind(card.kind)) {
            this.ui.selectedCard = this.ui.selectedCard === id ? '' : id;
            this.actions.refresh();
        } else this.actions.playCard(id);
    }
    private attackKind(kind: CardKind): boolean {
        return this.session.view.content.cards[kind].effect.type === 'damage';
    }
}
