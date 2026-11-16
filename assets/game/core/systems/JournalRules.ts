import { JournalCatalog, JournalDefinition } from '../content/JournalCatalog';
import { ActionResult } from '../RulesTypes';
import { RuleFeedback, RuleState } from './RuleContext';

/** Records progress, queues eligible stories once, and remembers their original dates. */
export class JournalRules {
    constructor(
        private readonly state: RuleState,
        private readonly feedback: RuleFeedback,
        readonly catalog: JournalCatalog
    ) {}
    get current(): (JournalDefinition & { day: number }) | null {
        const record = this.state.journalEntries.find((entry) => !entry.read);
        if (!record) return null;
        const definition = this.catalog.entries.find((entry) => entry.id === record.id)!;
        return { ...definition, day: record.day };
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
                this.feedback.log(`关键日志已解锁：${definition.title}。`);
            }
        } while (added);
    }
    continue(): ActionResult {
        const entry = this.state.journalEntries.find((entry) => !entry.read);
        if (this.state.phase !== 'journal' || !entry)
            return this.feedback.result(false, '当前没有待阅读的关键日志。');
        entry.read = true;
        this.state.phase = this.current ? 'journal' : 'shelter';
        return this.feedback.result(
            true,
            this.current ? '还有一篇关键日志。' : '可以在避难所整备后出发。'
        );
    }
}
