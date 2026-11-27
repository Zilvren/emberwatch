import type { GameCommand, GameSession } from '../../application/GameSession';

/** Reproduce the first encounter using ordinary commands in an explicitly temporary preview. */
export function enterEncounterPreview(session: GameSession): void {
    const commands: GameCommand[] = [
        { type: 'start' },
        { type: 'enter-node' },
        ...(session.view.scenario.fieldDeck
            ? []
            : ([
                  { type: 'claim-supplies' },
                  { type: 'claim-card', index: 0 },
                  { type: 'finish-rewards' },
              ] as GameCommand[])),
    ];
    function execute(command: GameCommand): void {
        const result = session.execute(command);
        if (!result.ok) throw new Error(`战斗预览初始化失败：${result.message}`);
    }
    for (const command of commands) execute(command);
    const map = session.view.expeditionMap;
    if (map) {
        const id = map.points[0].next.find(node => session.view.scenario.nodes[node].type === 'battle');
        if (!id) throw new Error('当前地图缺少入口战斗。');
        execute({ type: 'enter-node', id });
    } else {
        execute({ type: 'choose-route', route: 'A' });
        execute({ type: 'enter-node' });
    }
    if (session.view.battle?.discovery) session.execute({ type: 'discover', kind: null });
}
