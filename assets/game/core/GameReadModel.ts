import type { SurvivalGame } from './SurvivalGame';
/** UI selectors only. Commands and persistence are owned by GameSession. */
type ReadonlyValue<T> = T extends (...args: any[]) => any
    ? T
    : T extends readonly (infer Item)[]
      ? readonly ReadonlyValue<Item>[]
      : T extends object
        ? { readonly [Key in keyof T]: ReadonlyValue<T[Key]> }
        : T;
export type GameReadModel = ReadonlyValue<
    Pick<
        SurvivalGame,
        | 'phase'
        | 'day'
        | 'milestones'
        | 'journalEntries'
        | 'currentJournal'
        | 'pendingJournalCount'
        | 'supplies'
        | 'campSkills'
        | 'entryTier'
        | 'health'
        | 'lowHealth'
        | 'cards'
        | 'carriedCards'
        | 'storedSupplies'
        | 'route'
        | 'expeditionMap'
        | 'fixedDone'
        | 'pathIndex'
        | 'visited'
        | 'battle'
        | 'rewards'
        | 'settlement'
        | 'failureReason'
        | 'revision'
        | 'run'
        | 'baseWeight'
        | 'overflowWeight'
        | 'usableCards'
        | 'currentNode'
        | 'incomingDamage'
        | 'strength'
        | 'scenario'
        | 'content'
    >
> &
    Pick<SurvivalGame, 'cardBlocked' | 'rewardCardBlocked' | 'rewardZone' | 'attackDamage' | 'cardCost' | 'journalAt'>;
