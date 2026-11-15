import type { GameCommand, GameSession } from '../../application/GameSession';

/** Reproduce the first encounter using ordinary commands in an explicitly temporary preview. */
export function enterEncounterPreview(session: GameSession): void {
    const commands: GameCommand[] = [
        { type: 'start' },
        { type: 'enter-node' },
        { type: 'claim-supplies' },
        { type: 'claim-card', index: 0 },
        { type: 'finish-rewards' },
        { type: 'choose-route', route: 'A' },
        { type: 'enter-node' },
    ];
    for (const command of commands) {
        const result = session.execute(command);
        if (!result.ok) throw new Error(`战斗预览初始化失败：${result.message}`);
    }
}
