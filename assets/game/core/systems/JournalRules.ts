import { JournalCatalog, JournalDefinition, JournalRecord } from '../content/JournalCatalog';
import { ActionResult } from '../RulesTypes';
import { RuleFeedback, JournalState } from './RuleContext';

/** Records progress, queues eligible stories once, and remembers their original dates. */
export class JournalRules {
    constructor(
        private readonly state: JournalState,
        private readonly feedback: RuleFeedback,
        readonly catalog: JournalCatalog,
        private readonly scenario: { fieldDeck?: boolean; labyrinth?: true }
    ) {}
    get current(): (JournalDefinition & { day: number }) | null {
        return this.resolve(this.state.journalEntries.find((entry) => !entry.read));
    }
    at(index: number): (JournalDefinition & { day: number }) | null {
        return this.resolve(this.state.journalEntries[index]);
    }
    private resolve(record?: JournalRecord): (JournalDefinition & { day: number }) | null {
        if (!record) return null;
        const definition = this.catalog.entries.find((entry) => entry.id === record.id)!;
        return {
            ...definition,
            ...this.localText(definition),
            day: record.day,
        };
    }
    record(milestone: string): void {
        const previous = Object.prototype.hasOwnProperty.call(this.state.milestones, milestone)
            ? this.state.milestones[milestone]
            : 0;
        this.state.milestones[milestone] = previous + 1;
        const triggered = new Set(this.state.journalEntries.map((entry) => entry.id));
        let added: boolean;
        do {
            added = false;
            for (const definition of this.catalog.entries) {
                if (
                    triggered.has(definition.id) ||
                    !definition.prerequisites.every((id) => triggered.has(id)) ||
                    !definition.conditions.every(
                        ({ milestone, count }) => (this.state.milestones[milestone] ?? 0) >= count
                    )
                )
                    continue;
                this.state.journalEntries.push({
                    id: definition.id,
                    day: this.state.day,
                    read: false,
                });
                triggered.add(definition.id);
                added = true;
            }
        } while (added);
    }
    private localText(definition: JournalDefinition) {
        return this.scenario.labyrinth ? definition.labyrinthText
            : this.scenario.fieldDeck ? definition.fieldText : undefined;
    }
    continue(): ActionResult {
        const entry = this.state.journalEntries.find((entry) => !entry.read);
        if (this.state.phase !== 'journal' || !entry)
            return this.feedback.result(false, '当前没有待阅读的关键日志。');
        entry.read = true;
        this.state.phase = this.current ? 'journal' : 'shelter';
        return this.feedback.result(
            true,
            this.current ? '还有一篇关键日志。' : '已记入日志，可以再次出发。'
        );
    }
}
