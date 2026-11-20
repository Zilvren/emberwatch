import { GameCommand, GameSession } from '../../application/GameSession';
import type { CardKind, Route } from '../../core/SurvivalGame';
import type { ButtonActionEvent } from './UIEvents';
import type { UiState } from './UiState';
import { entryTier, affordableEntryTier } from '../../core/content/EntryTiers';
import { initialRecipeBrowse, recipeBrowse } from './RecipePanelModel';
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
        if (this.ui.overlay === 'recipes' || id === 'recipe-open' || id === 'rest-synthesis') {
            this.recipeAction(event);
            return;
        }
        if (id === 'card-select') {
            if (!this.ui.overlay) this.selectCard(event.payload ?? '');
            return;
        }
        if (id === 'bag' || id === 'rest-bag' || id === 'reward-bag') {
            this.ui.overlay = 'bag';
            this.ui.page = 0;
            this.ui.deckEdit = id === 'rest-bag' && !g.scenario.runDeck;
            if (g.scenario.runDeck) this.ui.bagFilter = id === 'rest-bag' ? 'deck' : 'all';
            if (this.ui.deckEdit) this.ui.bagFilter = 'all';
            this.ui.bagReader = false;
            this.ui.bagDetails = false;
        } else if (id === 'map') {
            if (this.ui.overlay === 'map') this.ui.overlay = null;
            else if (!this.ui.overlay) this.ui.overlay = 'map';
            else return;
        } else if (id.startsWith('bag-filter-') && this.ui.overlay === 'bag') {
            const filter = id.slice(11);
            if (filter === 'all' || filter === 'deck' || filter === 'overflow')
                this.ui.bagFilter = filter;
        } else if (id === 'bag-sort' && this.ui.overlay === 'bag') {
            const sorts: UiState['bagSort'][] = ['original', 'name', 'cost', 'weight'];
            this.ui.bagSort = sorts[(sorts.indexOf(this.ui.bagSort) + 1) % sorts.length];
        } else if (
            id === 'bag-mode' &&
            this.ui.overlay === 'bag' &&
            g.phase === 'rest' &&
            !g.scenario.runDeck
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
            g.phase === 'rewards' &&
            !g.rewards?.cardTaken
        ) {
            const index = Number(id.slice(14));
            if (!Number.isInteger(index) || !g.rewards?.cards[index]) return;
            this.ui.rewardSelection = index;
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
        else if (id === 'help' || id === 'log' || id === 'restart') this.ui.overlay = id;
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
        } else if (id === 'discard-supply') {
            this.actions.act({ type: 'discard-supplies', amount: 1 });
            return;
        } else if (this.ui.overlay) return;
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
            this.actions.act({ type: 'enter-node' });
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
            if (g.scenario.suppliesHaveWeight === false) {
                this.actions.act({ type: 'claim-supplies' }, 'loot');
                return;
            }
            const capacity = Math.max(0, 30 - g.baseWeight);
            if (capacity === 0) {
                this.actions.message('背包已满，请先整理背包，再领取物资。');
                return;
            }
            if (capacity < r.supplies) {
                this.ui.overlay = 'supply-overflow';
                this.actions.refresh();
                return;
            }
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
            const result = this.session.execute({ type: 'repair' });
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
            this.ui.selectedCard = '';
            this.actions.refresh();
        } else if (this.ui.overlay === 'discard') {
            this.ui.overlay = this.ui.discardFromBag ? 'bag' : null;
            this.ui.bagReader = false;
            this.actions.act({ type: 'discard-card', id: this.ui.discardId });
        } else if (this.ui.overlay === 'reward-leave') {
            this.ui.overlay = null;
            this.actions.act({ type: 'finish-rewards' });
        } else if (this.ui.overlay === 'supply-overflow') {
            this.ui.overlay = null;
            this.actions.act({ type: 'claim-supplies' }, 'loot');
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
