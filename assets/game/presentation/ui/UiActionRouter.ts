import { GameCommand, GameSession } from '../../application/GameSession';
import type { CardKind, Route } from '../../core/SurvivalGame';
import type { ButtonActionEvent } from './UIEvents';
import type { UiState } from './UiState';
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
        if (id === 'card-select') {
            if (!this.ui.overlay) this.selectCard(event.payload ?? '');
            return;
        }
        if (id === 'bag' || id === 'rest-bag' || id === 'reward-bag') {
            this.ui.overlay = 'bag';
            this.ui.page = 0;
        } else if (id === 'help' || id === 'log' || id === 'restart') this.ui.overlay = id;
        else if (id === 'audio') this.actions.toggleAudio();
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
            if (g.phase === 'journal') this.actions.act({ type: 'start' });
            else if (g.phase === 'failure') {
                this.session.execute({ type: 'new-game' });
                this.actions.refresh();
            } else if (g.phase === 'day2') {
                this.ui.overlay = 'restart';
                this.actions.refresh();
            }
            return;
        } else if (id.startsWith('route-')) {
            this.actions.act({ type: 'choose-route', route: id.slice(6) as Route });
            return;
        } else if (id.startsWith('enter-')) {
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
            const result = this.session.execute({ type: 'repair' });
            if (result.warning) this.ui.overlay = 'repair-risk';
            else {
                this.actions.message(result.message);
                this.actions.sound('heal');
                this.actions.healEffect();
            }
        } else if (id === 'shelter-done') {
            this.actions.act({ type: 'finish-day' }, 'loot');
            return;
        }
        this.actions.sound('tap');
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
            this.actions.act({ type: 'discard-card', id: this.ui.discardId });
        } else if (this.ui.overlay === 'reward-leave') {
            this.ui.overlay = null;
            this.actions.act({ type: 'finish-rewards' });
        } else if (this.ui.overlay === 'supply-overflow') {
            this.ui.overlay = null;
            this.actions.act({ type: 'claim-supplies' }, 'loot');
        } else if (this.ui.overlay === 'repair-risk') {
            this.ui.overlay = null;
            this.actions.act({ type: 'repair', confirmed: true }, 'heal');
            this.actions.healEffect();
        }
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
