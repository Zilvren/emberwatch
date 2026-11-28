import type { CardDefinition } from '../content/CardCatalog';
import type { Battle, CalmBattle } from '../RulesTypes';

export const CALM_LIMIT = 4;
export const CALM_PER_TURN = 3;
export const MAX_CALM_LIMIT = 12;
export const MAX_BONUS_STAMINA = 99;

export function initialCalm(): CalmBattle {
    return {
        persistent: 0, temporary: 0, applied: 0, limit: CALM_LIMIT, deferred: null,
        freeSkill: false, calibrated: false, spent: 0, guardPerLayer: 0,
        drawOnDefer: 0, counter: 0, retained: null,
    };
}

function skill(card: CardDefinition): boolean {
    return ['block', 'draw', 'heal', 'skill'].indexOf(card.effect.type) >= 0;
}

export function staminaCost(card: CardDefinition, calm?: CalmBattle): number {
    return calm?.freeSkill && skill(card) ? 0 : card.cost;
}

export function consumeDiscount(card: CardDefinition, calm?: CalmBattle): void {
    if (calm?.freeSkill && skill(card)) calm.freeSkill = false;
}

export function labyrinthDamage(battle: Battle, card: CardDefinition, base: number): number {
    const calm = battle.calm;
    if (!calm) return base;
    const extra = card.effect.labyrinth;
    const damage = base + (extra?.rule === 'deferred-damage' && calm.deferred ? extra.amount : 0);
    return calm.calibrated && !calm.deferred
        ? damage * Math.max(1, calm.persistent + calm.temporary)
        : damage;
}

function spend(battle: Battle, calm: CalmBattle, persistent: number, temporary: number): void {
    calm.persistent -= persistent;
    calm.temporary -= temporary;
    const amount = persistent + temporary;
    calm.spent += amount;
    battle.block += calm.guardPerLayer * amount;
}

export function consumeCalibration(battle: Battle): void {
    const calm = battle.calm;
    if (!calm?.calibrated) return;
    calm.calibrated = false;
    if (!calm.deferred) spend(battle, calm, calm.persistent, calm.temporary);
}

export function applyLabyrinthEffect(
    battle: Battle,
    card: CardDefinition,
    draw: (count: number) => void
): void {
    const calm = battle.calm, effect = card.effect.labyrinth;
    if (!calm || !effect) return;
    const { rule, amount } = effect;
    switch (rule) {
        case 'calm':
        case 'temporary-calm': {
            if (calm.deferred) break;
            const added = Math.min(amount, CALM_PER_TURN - calm.applied, calm.limit - calm.persistent - calm.temporary);
            if (added <= 0) break;
            calm.applied += added;
            calm[rule === 'calm' ? 'persistent' : 'temporary'] += added;
            if (calm.persistent + calm.temporary === calm.limit) {
                calm.deferred = 'scheduled';
                draw(calm.drawOnDefer);
            }
            break;
        }
        case 'gain-stamina':
            battle.stamina = Math.min(MAX_BONUS_STAMINA, battle.stamina + amount);
            break;
        case 'next-skill-free':
            calm.freeSkill = true;
            break;
        case 'calm-block':
            if (calm.persistent + calm.temporary >= effect.threshold!) battle.block += amount;
            break;
        case 'draw-on-defer':
            calm.drawOnDefer = Math.min(6, calm.drawOnDefer + amount);
            break;
        case 'temporary-to-block':
            if (!calm.deferred) {
                battle.block += calm.temporary * amount;
                spend(battle, calm, 0, calm.temporary);
            }
            break;
        case 'raise-calm-limit':
            calm.limit = Math.min(MAX_CALM_LIMIT, calm.limit + amount);
            break;
        case 'calibrate-attack':
            calm.calibrated = true;
            break;
        case 'block-per-spent-calm':
            if (amount > calm.guardPerLayer) {
                battle.block += calm.spent * (amount - calm.guardPerLayer);
                calm.guardPerLayer = amount;
            }
            break;
        case 'deferred-draw':
            if (calm.deferred) draw(amount);
            break;
        case 'deferred-counter':
            if (calm.deferred) calm.counter = Math.max(calm.counter, amount);
            break;
        case 'discard-to-top':
        case 'retain-hand': {
            const cards = rule === 'discard-to-top' ? battle.discard : battle.hand;
            if (cards.length) battle.cardChoice = { mode: rule, ids: cards.map((entry) => entry.id) };
            break;
        }
    }
}

/** The original intent remains on Battle for the whole extra turn. */
export function advanceCalmRound(calm: CalmBattle): void {
    if (calm.deferred) calm.persistent = 0;
    calm.deferred = calm.deferred === 'scheduled' ? 'extra-turn' : null;
    calm.temporary = 0;
    calm.applied = 0;
    calm.freeSkill = false;
    calm.calibrated = false;
    calm.spent = 0;
    calm.guardPerLayer = 0;
    calm.counter = 0;
    calm.retained = null;
}
