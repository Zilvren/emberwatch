import type { CardDefinition } from '../content/CardCatalog';
import type { CardSet } from '../content/ContentRegistry';
import {
    FIST_HOOKS, FIST_MOVES, fistFinisherFor, fistMove, fistSupport, fistTargetMatches,
    fistTemporaryKind, type FistMove, type FistTargetAction,
} from '../content/FistCards';
import type { Random } from '../Random';
import type { Battle, CombatCard, CombatCardChoice, FistBattle } from '../RulesTypes';
import { MAX_BONUS_STAMINA } from './LabyrinthCombat';
import type { CombatState } from './RuleContext';

export class FistCombat {
    constructor(
        private readonly state: Pick<CombatState, 'fistUnlocks'>,
        private readonly content: CardSet,
        private readonly random: Random,
        private readonly newId: (prefix: string) => string
    ) {}

    private progress(battle: Battle): FistBattle {
        return battle.fist ??= {
            moves: [], unlockedHere: [], damageBonus: 0, blockBonus: 0, counters: [], recoveredStamina: false,
        };
    }

    resetTurn(battle: Battle): void {
        const progress = battle.fist;
        if (!progress) return;
        progress.moves = [];
        delete progress.finisherId;
        delete progress.lastPlayed;
        progress.counters = [];
        progress.recoveredStamina = false;
    }

    private missingHooks(battle: Battle): CombatCard[] {
        const inHand = new Set(battle.hand.map((card) => fistMove(this.content.cards[card.kind])));
        const available = new Map<FistMove, CombatCard>();
        for (const card of battle.draw) {
            const move = fistMove(this.content.cards[card.kind]);
            if (move && FIST_HOOKS.indexOf(move) >= 0 && !inHand.has(move) && !available.has(move))
                available.set(move, card);
        }
        return [...available.values()];
    }

    private targets(battle: Battle, action: FistTargetAction): string[] {
        return battle.hand.filter((card) => fistTargetMatches(action, this.content.cards[card.kind]))
            .map((card) => card.id);
    }

    blocked(battle: Battle, card: CardDefinition): string {
        switch (fistSupport(card)) {
            case 'fetch-hook':
                return this.missingHooks(battle).length ? '' : '抽牌堆里没有手中缺少的勾拳';
            case 'switch-stance':
                return this.targets(battle, 'switch-stance').length ? '' : '手中需要一张直拳或招架';
            case 'recover-stamina':
                if (battle.fist?.recoveredStamina) return '本回合已使用过换气';
                return this.targets(battle, 'recover-stamina').length ? '' : '手中需要一张基础招式';
            case 'after-finisher': {
                const last = battle.fist?.lastPlayed;
                return last?.temporary && this.content.cards[last.kind].fist?.type === 'finisher'
                    ? '' : '必须紧接一张临时收招打出';
            }
            default:
                return '';
        }
    }

    targetChoice(battle: Battle, card: CombatCard): CombatCardChoice | undefined {
        const mode = fistSupport(this.content.cards[card.kind]);
        if (mode === 'switch-stance' || mode === 'recover-stamina')
            return { mode, sourceId: card.id, ids: this.targets(battle, mode) };
        return undefined;
    }

    applySupport(battle: Battle, definition: CardDefinition, handLimit: number, targetId?: string): string {
        const action = fistSupport(definition);
        if (action === 'fetch-hook') {
            const hooks = this.missingHooks(battle);
            const card = hooks[this.random.int(0, hooks.length - 1)];
            battle.draw.splice(battle.draw.indexOf(card), 1);
            battle.hand.push(card);
            return `摆架 · 拿到${this.content.cards[card.kind].name}。`;
        }
        if (action !== 'switch-stance' && action !== 'recover-stamina') return '';
        const [target] = battle.hand.splice(battle.hand.findIndex((card) => card.id === targetId), 1);
        if (battle.calm?.retained === target.id) battle.calm.retained = null;
        if (action === 'switch-stance') {
            battle.discard.push(target);
            const move = fistMove(this.content.cards[target.kind]) === 'straight' ? 'parry' : 'straight';
            const variant = this.generate(battle, this.content.fist!.moves[move], handLimit);
            return `变招 · 获得临时${this.content.cards[variant.kind].name}。`;
        }
        const previous = battle.stamina;
        battle.stamina = Math.min(MAX_BONUS_STAMINA, previous + (target.temporary ? 2 : 1));
        this.progress(battle).recoveredStamina = true;
        return `换气 · 获得 ${battle.stamina - previous} 点体力。`;
    }

    applyFinisher(battle: Battle, definition: CardDefinition): void {
        const finisher = definition.fist;
        if (finisher?.type !== 'finisher') return;
        const progress = this.progress(battle);
        if (finisher.counter) progress.counters.push(definition.id);
        progress.damageBonus += finisher.damagePerHit ?? 0;
        progress.blockBonus += finisher.blockPerCard ?? 0;
    }

    counterDamage(battle: Battle, incoming: number, fullyBlocked: boolean): number {
        return (battle.fist?.counters ?? []).reduce((total, kind) => {
            const finisher = this.content.cards[kind].fist;
            const counter = finisher?.type === 'finisher' ? finisher.counter : undefined;
            return counter ? total + (fullyBlocked ? incoming : counter.partial) + counter.extra : total;
        }, 0);
    }

    afterPlay(battle: Battle, card: CombatCard, handLimit: number): string {
        const progress = this.progress(battle), definition = this.content.cards[card.kind];
        if (definition.fist) battle.block += progress.blockBonus;
        this.applyFinisher(battle, definition);
        const move = fistMove(definition);
        const combo = this.advanceCombo(battle, move, handLimit);
        if (move && !card.temporary && progress.lastPlayed && battle.hp > 0) {
            if (this.content.cards[progress.lastPlayed.kind].fist) {
                const options = this.random.shuffle(FIST_MOVES).slice(0, 3)
                    .map((item) => fistTemporaryKind(this.content.fist!.moves[item]));
                battle.cardChoice = { mode: 'fist-discovery', ids: options };
            } else {
                const options = this.ownedChoices(battle);
                if (options.length) battle.cardChoice = { mode: 'deck-discovery', ids: options };
            }
        }
        progress.lastPlayed = { kind: card.kind, temporary: card.temporary };
        return combo;
    }

    private ownedChoices(battle: Battle): string[] {
        const available = new Map<string, CombatCard>();
        for (const card of [...battle.draw, ...battle.discard])
            if (!card.temporary && card.origin && !available.has(card.kind)) available.set(card.kind, card);
        return this.random.shuffle([...available.values()]).slice(0, 3).map((card) => card.id);
    }

    resolveDiscovery(battle: Battle, mode: 'fist-discovery' | 'deck-discovery', id: string, handLimit: number): string {
        const zone = mode === 'deck-discovery'
            ? battle.draw.some((card) => card.id === id) ? battle.draw : battle.discard
            : undefined;
        const index = zone?.findIndex((card) => card.id === id) ?? -1;
        if (zone && index < 0) return '';
        const card: CombatCard = zone ? zone.splice(index, 1)[0]
            : { id: this.newId('card'), kind: id, temporary: true };
        const inHand = this.addToHand(battle, card, handLimit);
        return `${this.content.cards[card.kind].name}${inHand ? '已入手' : '已放到抽牌堆顶'}。`;
    }

    private advanceCombo(battle: Battle, move: FistMove | undefined, handLimit: number): string {
        const progress = this.progress(battle);
        const previous = progress.moves;
        if (!move || previous.indexOf(move) >= 0 ||
            (move === 'straight' && previous.indexOf('parry') >= 0) ||
            (move === 'parry' && previous.indexOf('straight') >= 0)) {
            progress.moves = move ? [move] : [];
            delete progress.finisherId;
            return '';
        }
        previous.push(move);
        const combo = fistFinisherFor(previous);
        if (!combo) return '';
        const kind = this.content.fist!.finishers[combo];
        const existing = battle.hand.find((card) => card.id === progress.finisherId) ??
            battle.draw.find((card) => card.id === progress.finisherId);
        const finisher = existing ?? this.generate(battle, kind, handLimit);
        finisher.kind = fistTemporaryKind(kind);
        progress.finisherId = finisher.id;
        const unlocked = this.state.fistUnlocks ??= [];
        if (unlocked.indexOf(kind) < 0) {
            unlocked.push(kind);
            progress.unlockedHere.push(kind);
        }
        if (previous.length === 4) {
            progress.moves = [];
            delete progress.finisherId;
        }
        const position = battle.hand.indexOf(finisher) >= 0 ? '' : '（抽牌堆顶）';
        return `${existing ? '升级为' : '生成'}「${this.content.cards[kind].name}」${position}`;
    }

    private generate(battle: Battle, kind: string, handLimit: number): CombatCard {
        const card: CombatCard = { id: this.newId('card'), kind: fistTemporaryKind(kind), temporary: true };
        this.addToHand(battle, card, handLimit);
        return card;
    }

    private addToHand(battle: Battle, card: CombatCard, handLimit: number): boolean {
        if (battle.hand.length >= handLimit) {
            battle.draw.unshift(card);
            return false;
        }
        battle.hand.push(card);
        return true;
    }
}
