/** Small synthesized feedback sounds. No network, autoplay music, or external audio dependency. */
export class GameAudio {
    muted = false;
    private context: AudioContext | null = null;
    play(kind: 'tap' | 'attack' | 'block' | 'heal' | 'loot' | 'enemy'): void {
        if (this.muted || typeof AudioContext === 'undefined')
            return;
        try {
            const ctx = this.context ?? (this.context = new AudioContext());
            if (ctx.state === 'suspended')
                void ctx.resume();
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            const values = { tap: [440, 320, .055], attack: [180, 55, .14], block: [620, 220, .13], heal: [520, 880, .22], loot: [660, 1050, .14], enemy: [105, 42, .22] }[kind];
            osc.type = kind === 'attack' || kind === 'enemy' ? 'triangle' : 'sine';
            const now = ctx.currentTime;
            osc.frequency.setValueAtTime(values[0], now);
            osc.frequency.exponentialRampToValueAtTime(values[1], now + values[2]);
            gain.gain.setValueAtTime(.0001, now);
            gain.gain.exponentialRampToValueAtTime(.055, now + .008);
            gain.gain.exponentialRampToValueAtTime(.0001, now + values[2]);
            osc.start(now);
            osc.stop(now + values[2] + .01);
        }
        catch { /* Browser audio restrictions must never block a game action. */ }
    }
    dispose(): void { if (this.context)
        void this.context.close(); }
}
