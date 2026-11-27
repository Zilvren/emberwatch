export class Random {
    constructor(public state: number) {
        this.state = state >>> 0 || 1;
    }
    next(): number {
        let x = this.state;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.state = x >>> 0;
        return this.state / 4294967296;
    }
    int(min: number, max: number): number {
        return min + Math.floor(this.next() * (max - min + 1));
    }
    shuffle<T>(source: readonly T[]): T[] {
        const result = source.slice();
        for (let i = result.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    weightedSample<T>(source: readonly T[], weight: (value: T) => number, count: number): T[] {
        const remaining = source.slice(), result: T[] = [];
        while (remaining.length && result.length < count) {
            const total = remaining.reduce((sum, value) => sum + Math.max(0, weight(value)), 0);
            if (total <= 0) break;
            let cursor = this.next() * total;
            let index = remaining.length - 1;
            for (let i = 0; i < remaining.length; i++) {
                cursor -= Math.max(0, weight(remaining[i]));
                if (cursor < 0) {
                    index = i;
                    break;
                }
            }
            result.push(remaining.splice(index, 1)[0]);
        }
        return result;
    }
}
