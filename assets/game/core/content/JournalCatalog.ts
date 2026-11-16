export interface JournalDefinition {
    id: string;
    title: string;
    body: string;
    conditions: { milestone: string; count: number }[];
    prerequisites: string[];
}
export interface JournalCatalog {
    version: 1;
    entries: JournalDefinition[];
}
export interface JournalRecord {
    id: string;
    day: number;
    read: boolean;
}
let installed: JournalCatalog | null = null;
export const validMilestoneId = (value: unknown): value is string =>
    typeof value === 'string' && /^[a-z][a-z0-9:-]{0,119}$/.test(value);

/** Authored conditions refer to progress events; elapsed days never unlock an entry. */
export function validateJournalCatalog(raw: unknown): JournalCatalog {
    const input = raw as JournalCatalog;
    if (input?.version !== 1 || !Array.isArray(input.entries) || input.entries.length > 500)
        throw new Error('关键日志配置格式无效。');
    const entries = new Map<string, JournalDefinition>();
    for (const entry of input.entries) {
        if (!entry || !validMilestoneId(entry.id) || entries.has(entry.id))
            throw new Error('关键日志 ID 无效或重复。');
        if (
            typeof entry.title !== 'string' ||
            !entry.title.trim() ||
            entry.title.length > 80 ||
            typeof entry.body !== 'string' ||
            !entry.body.trim() ||
            entry.body.length > 5000
        )
            throw new Error(`关键日志文案无效：${entry.id}`);
        if (
            !Array.isArray(entry.conditions) ||
            !entry.conditions.length ||
            entry.conditions.length > 50 ||
            entry.conditions.some(
                (condition) =>
                    !condition ||
                    !validMilestoneId(condition.milestone) ||
                    !Number.isSafeInteger(condition.count) ||
                    condition.count < 1 ||
                    condition.count > 1000000000
            )
        )
            throw new Error(`关键日志条件无效：${entry.id}`);
        if (
            !Array.isArray(entry.prerequisites) ||
            entry.prerequisites.length > 50 ||
            entry.prerequisites.some((id) => !validMilestoneId(id))
        )
            throw new Error(`关键日志前置条件无效：${entry.id}`);
        entries.set(entry.id, entry);
    }
    const opening = entries.get('departure');
    if (
        !opening ||
        opening.prerequisites.length ||
        opening.conditions.length !== 1 ||
        opening.conditions[0].milestone !== 'campaign-started' ||
        opening.conditions[0].count !== 1
    )
        throw new Error('关键日志必须包含以 campaign-started 触发的 departure 开局条目。');
    const visiting = new Set<string>(),
        visited = new Set<string>();
    const visit = (id: string): void => {
        if (visited.has(id)) return;
        if (visiting.has(id)) throw new Error('关键日志前置条件存在循环。');
        const entry = entries.get(id);
        if (!entry) throw new Error(`关键日志前置条目不存在：${id}`);
        visiting.add(id);
        entry.prerequisites.forEach(visit);
        visiting.delete(id);
        visited.add(id);
    };
    entries.forEach((_, id) => visit(id));
    return JSON.parse(JSON.stringify(input));
}
export function installJournalCatalog(raw: unknown): void {
    installed = validateJournalCatalog(raw);
}
export function getJournalCatalog(): JournalCatalog {
    if (!installed) throw new Error('关键日志配置尚未加载。');
    return JSON.parse(JSON.stringify(installed));
}
export function mapClearMilestone(scenarioId: string): string {
    return `map-cleared:${scenarioId}`;
}
