import { createCardSet } from '../core/content/ContentRegistry';
import { getScenario } from '../core/content/GameScenario';
import { GameState, validateGameState } from '../core/state/GameState';
import type { RunPersistence, SaveLoad } from '../application/RunPersistence';
export type { SaveLoad } from '../application/RunPersistence';
export interface SaveStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
function hash(text: string): string {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0).toString(16);
}
class SaveReadError extends Error {
    constructor(
        message: string,
        readonly preserve: boolean
    ) {
        super(message);
    }
}

/** Platform adapter. Storage writes are atomic per key; the previous valid save is retained. */
export class SaveRepository implements RunPersistence {
    readonly content = createCardSet();
    private blocked = false;
    status = '自动保存';
    warning = '';
    constructor(
        private readonly storage: SaveStorage,
        readonly key = 'the-end.run.v1'
    ) {}
    private decode(text: string): GameState {
        const envelope = JSON.parse(text);
        if (envelope?.format !== 'the-end-save') throw new Error('存档格式无效。');
        if (envelope.version !== 1)
            throw new SaveReadError('存档版本暂不受支持，原存档已保留。', true);
        const { checksum, ...body } = envelope;
        if (checksum !== hash(JSON.stringify(body))) throw new Error('存档完整性校验失败。');
        if (body.catalogHash !== hash(JSON.stringify(this.content.catalog)))
            throw new SaveReadError(
                '卡牌配置已改变，未加载或覆盖原存档。可恢复原配置，或通过“重开”开始新进度。',
                true
            );
        try {
            getScenario(body.state?.scenarioId, body.state?.scenarioVersion);
        } catch {
            throw new SaveReadError('存档的章节版本暂不受支持，原存档已保留。', true);
        }
        return validateGameState(body.state, this.content.cards);
    }
    load(): SaveLoad {
        const result: SaveLoad = { state: null, recovered: false, warning: '' };
        try {
            const primary = this.storage.getItem(this.key);
            if (primary !== null) {
                try {
                    result.state = this.decode(primary);
                    this.status = '已恢复进度';
                    return result;
                } catch (error) {
                    if (error instanceof SaveReadError && error.preserve) throw error;
                }
            }
            const backup = this.storage.getItem(this.key + '.backup');
            if (backup !== null) {
                result.state = this.decode(backup);
                result.recovered = true;
                this.status = '已恢复备份';
                result.warning = '主存档不可用，已从备份恢复上一份有效进度。';
                this.warning = result.warning;
                return result;
            }
            if (primary !== null)
                throw new Error('存档损坏且没有可用备份，原数据已保留。可通过“重开”开始新进度。');
        } catch (error) {
            this.blocked = true;
            this.status = '原存档已保留';
            result.warning = String(error instanceof Error ? error.message : error);
            this.warning = result.warning;
        }
        return result;
    }
    allowNewGame(): void {
        this.blocked = false;
        this.warning = '';
    }
    save(state: GameState): void {
        if (this.blocked) return;
        try {
            const body = {
                format: 'the-end-save',
                version: 1,
                savedAt: new Date().toISOString(),
                catalogHash: hash(JSON.stringify(this.content.catalog)),
                state: validateGameState(state, this.content.cards),
            };
            const encoded = JSON.stringify({ ...body, checksum: hash(JSON.stringify(body)) });
            const previous = this.storage.getItem(this.key);
            if (previous !== null) {
                let valid = false;
                try {
                    this.decode(previous);
                    valid = true;
                } catch {
                    /* Never replace a valid backup with corrupt data. */
                }
                if (valid) this.storage.setItem(this.key + '.backup', previous);
            }
            this.storage.setItem(this.key, encoded);
            this.status = '进度已保存';
            this.warning = '';
        } catch (error) {
            this.status = '保存失败，请勿关闭';
            this.warning = `进度保存失败：${String(error instanceof Error ? error.message : error)}`;
        }
    }
}
