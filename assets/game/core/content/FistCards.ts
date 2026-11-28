import type { CardDefinition, CardKind } from './CardCatalog';

export const FIST_MOVES = ['left-hook', 'right-hook', 'uppercut', 'straight', 'parry'] as const;
export type FistMove = (typeof FIST_MOVES)[number];
export const FIST_HOOKS: readonly FistMove[] = ['left-hook', 'right-hook', 'uppercut'];
const FINISHER_TIERS = {
    'strike-two': 2,
    'parry-two': 2,
    'hooks-three': 3,
    'straight-three': 3,
    'parry-three': 3,
    'straight-four': 4,
    'parry-four': 4,
} as const;
export type FistFinisher = keyof typeof FINISHER_TIERS;
const SUPPORT_ACTIONS = ['fetch-hook', 'switch-stance', 'after-finisher', 'recover-stamina'] as const;
export type FistSupport = (typeof SUPPORT_ACTIONS)[number];
export type FistTargetAction = 'switch-stance' | 'recover-stamina';

export type FistCard =
    | { type: 'move'; move: FistMove }
    | {
          type: 'finisher';
          combo: FistFinisher;
          temporaryCost: number;
          counter?: { partial: number; extra: number };
          damagePerHit?: number;
          blockPerCard?: number;
      }
    | { type: 'support'; action: FistSupport };

export function fistFinisherTier(card: CardDefinition): number {
    return card.fist?.type === 'finisher' ? FINISHER_TIERS[card.fist.combo] : 0;
}

export function fistMove(card: CardDefinition): FistMove | undefined {
    return card.fist?.type === 'move' ? card.fist.move : undefined;
}

export function fistSupport(card: CardDefinition): FistSupport | undefined {
    return card.fist?.type === 'support' ? card.fist.action : undefined;
}

export function fistTargetMatches(action: FistTargetAction, card: CardDefinition): boolean {
    const move = fistMove(card);
    return action === 'recover-stamina' ? move !== undefined : move === 'straight' || move === 'parry';
}

export function fistFinisherFor(moves: readonly FistMove[]): FistFinisher | undefined {
    const parry = moves.indexOf('parry') >= 0, straight = moves.indexOf('straight') >= 0;
    if (moves.length === 2) return parry ? 'parry-two' : 'strike-two';
    if (moves.length === 3) return parry ? 'parry-three' : straight ? 'straight-three' : 'hooks-three';
    if (moves.length === 4) return parry ? 'parry-four' : 'straight-four';
    return undefined;
}

export function fistTemporaryKind(kind: CardKind): CardKind {
    return kind + '_temp';
}

export function isFistBattleReward(card: CardDefinition): boolean {
    return !!card.fist && card.role === 'normal' && card.reward && card.fist.type !== 'finisher';
}

export function withFistVariants(cards: readonly CardDefinition[]): CardDefinition[] {
    const variants = [...cards];
    for (const card of cards) {
        const fist = card.fist;
        if (card.role !== 'normal' || !fist || fist.type === 'support') continue;
        variants.push({
            ...card,
            id: fistTemporaryKind(card.id),
            tag: card.tag.replace(' · 连击', ''),
            role: 'temporary',
            reward: false,
            cost: fist.type === 'finisher' ? fist.temporaryCost : card.cost,
        });
    }
    return variants;
}

export function validateFistCard(card: CardDefinition, issues: string[]): FistCard | undefined {
    const fist = card.fist;
    if (fist === undefined) return undefined;
    const invalid = () => {
        issues.push(`${card.name}：拳流派规则或投放配置无效。`);
        return undefined;
    };
    if (!fist || card.role !== 'normal' || card.initialCount !== 0 || card.weight !== 0 ||
        card.chapter || card.synthesisOnly || card.oncePerBattle || card.effect.labyrinth ||
        typeof card.id !== 'string' || card.id.length > 43)
        return invalid();
    if (fist.type === 'move') {
        if (FIST_MOVES.indexOf(fist.move) < 0 || !card.reward ||
            card.effect.type !== (fist.move === 'parry' ? 'block' : 'damage'))
            return invalid();
        return { type: 'move', move: fist.move };
    }
    if (fist.type === 'support') {
        if (SUPPORT_ACTIONS.indexOf(fist.action) < 0 || !card.reward ||
            card.effect.type !== (fist.action === 'after-finisher' ? 'draw' : 'skill'))
            return invalid();
        return { type: 'support', action: fist.action };
    }
    if (fist.type !== 'finisher' || !Object.prototype.hasOwnProperty.call(FINISHER_TIERS, fist.combo))
        return invalid();
    const integer = (value: unknown, min: number, max: number) =>
        Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
    const parry = fist.combo.startsWith('parry-');
    const counter = fist.counter;
    if (card.reward || !integer(fist.temporaryCost, 0, card.cost - 1) ||
        card.effect.type !== (parry ? 'block' : 'damage') ||
        (parry ? !counter || !integer(counter.partial, 1, 999) || !integer(counter.extra, 0, 999) : counter !== undefined) ||
        (fist.damagePerHit !== undefined && (!integer(fist.damagePerHit, 1, 99) || parry)) ||
        (fist.blockPerCard !== undefined && (!integer(fist.blockPerCard, 1, 99) || !parry)))
        return invalid();
    return {
        type: 'finisher',
        combo: fist.combo,
        temporaryCost: fist.temporaryCost,
        ...(counter ? { counter: { partial: counter.partial, extra: counter.extra } } : {}),
        ...(fist.damagePerHit === undefined ? {} : { damagePerHit: fist.damagePerHit }),
        ...(fist.blockPerCard === undefined ? {} : { blockPerCard: fist.blockPerCard }),
    };
}

export function validateFistSet(cards: readonly CardDefinition[], issues: string[]): void {
    const faction = cards.filter((card) => card.fist);
    if (!faction.length) return;
    const ids = new Set(cards.map((card) => card.id));
    const moves = new Set<FistMove>(), finishers = new Set<FistFinisher>(), supports = new Set<FistSupport>();
    for (const card of faction) {
        const fist = card.fist!;
        if (fist.type !== 'support' && ids.has(fistTemporaryKind(card.id)))
            issues.push(`${card.name}：临时牌 ID 与现有卡牌重复。`);
        if (fist.type === 'move') {
            if (moves.has(fist.move)) issues.push(`${card.name}：基础招式重复。`);
            moves.add(fist.move);
        } else if (fist.type === 'finisher') {
            if (finishers.has(fist.combo)) issues.push(`${card.name}：收招配置重复。`);
            finishers.add(fist.combo);
        } else {
            if (supports.has(fist.action)) issues.push(`${card.name}：辅助牌规则重复。`);
            supports.add(fist.action);
        }
    }
    if (moves.size !== FIST_MOVES.length || finishers.size !== Object.keys(FINISHER_TIERS).length)
        issues.push('拳流派需要配置完整的五种基础招式和七种收招。');
}
