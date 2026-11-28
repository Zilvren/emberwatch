import { loadCampfireLoop } from './CampfireLoop';

export class GameAudio {
    private silent = false;
    private atCamp = false;
    private context: AudioContext | null = null;
    private effects: GainNode | null = null;
    private fireBuffer: AudioBuffer | null = null;
    private loadingFire = false;
    private fire: AudioBufferSourceNode | null = null;
    private fireGain: GainNode | null = null;
    private readonly activationEvents = ['pointerdown', 'pointerup', 'keydown', 'click'];

    listenForActivation(): void {
        if (typeof window === 'undefined') return;
        for (const event of this.activationEvents) window.addEventListener(event, this.unlock, true);
        document.addEventListener('visibilitychange', this.syncCamp);
        window.addEventListener('pageshow', this.syncCamp);
    }

    get muted(): boolean { return this.silent; }
    set muted(value: boolean) {
        this.silent = value;
        this.syncCamp();
    }

    setCampAmbience(active: boolean): void {
        if (this.atCamp === active) return;
        this.atCamp = active;
        if (this.effects) this.effects.gain.value = active ? 0 : 1;
        this.syncCamp();
    }

    private audioContext(): AudioContext | null {
        if (!this.context && typeof AudioContext !== 'undefined') {
            try {
                this.context = new AudioContext();
                this.context.onstatechange = this.syncFire;
            } catch { /* A device without audio can still play the game. */ }
        }
        return this.context;
    }

    private unlock = (): void => {
        if (this.silent || (typeof document !== 'undefined' && document.hidden)) return;
        const ctx = this.audioContext();
        if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {});
        if (this.atCamp) this.syncFire();
    };

    private syncCamp = (): void => {
        if (this.atCamp && !this.silent && (typeof document === 'undefined' || !document.hidden)) this.unlock();
        else this.syncFire();
    };

    private async prepareFire(ctx: AudioContext): Promise<void> {
        this.loadingFire = true;
        try {
            const buffer = await loadCampfireLoop(ctx);
            if (this.context !== ctx) return;
            this.fireBuffer = buffer;
            this.syncFire();
        } catch (error) {
            console.warn('[the end] Campfire audio unavailable', error);
        } finally {
            this.loadingFire = false;
        }
    }

    private syncFire = (): void => {
        const audible = this.atCamp && !this.silent && (typeof document === 'undefined' || !document.hidden);
        const ctx = audible ? this.audioContext() : null;
        if (!ctx || ctx.state === 'closed') {
            if (this.fire) {
                this.fire.stop();
                this.fire.disconnect();
                this.fireGain?.disconnect();
                this.fire = null;
                this.fireGain = null;
            }
            return;
        }
        if (this.fire) return;
        if (!this.fireBuffer) {
            if (!this.loadingFire) void this.prepareFire(ctx);
            return;
        }
        // A suspended audio clock holds the loop and its fade at the start until playback is allowed.
        const source = ctx.createBufferSource(), gain = ctx.createGain();
        source.buffer = this.fireBuffer;
        source.loop = true;
        source.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.021, ctx.currentTime + 2);
        this.fire = source;
        this.fireGain = gain;
        source.start();
    };

    play(kind: 'tap' | 'attack' | 'block' | 'heal' | 'loot' | 'enemy'): void {
        if (this.atCamp || this.muted || typeof AudioContext === 'undefined') return;
        try {
            const ctx = this.audioContext();
            if (!ctx) return;
            if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
            if (!this.effects) {
                this.effects = ctx.createGain();
                this.effects.connect(ctx.destination);
            }
            const osc = ctx.createOscillator(),
                gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(this.effects);
            const values = {
                tap: [440, 320, 0.055],
                attack: [180, 55, 0.14],
                block: [620, 220, 0.13],
                heal: [520, 880, 0.22],
                loot: [660, 1050, 0.14],
                enemy: [105, 42, 0.22],
            }[kind];
            osc.type = kind === 'attack' || kind === 'enemy' ? 'triangle' : 'sine';
            const now = ctx.currentTime;
            osc.frequency.setValueAtTime(values[0], now);
            osc.frequency.exponentialRampToValueAtTime(values[1], now + values[2]);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.055, now + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + values[2]);
            osc.start(now);
            osc.stop(now + values[2] + 0.01);
        } catch {
            /* Browser audio restrictions must never block a game action. */
        }
    }
    dispose(): void {
        this.setCampAmbience(false);
        if (typeof window !== 'undefined') {
            for (const event of this.activationEvents) window.removeEventListener(event, this.unlock, true);
            document.removeEventListener('visibilitychange', this.syncCamp);
            window.removeEventListener('pageshow', this.syncCamp);
        }
        this.effects?.disconnect();
        this.effects = null;
        if (this.context) {
            this.context.onstatechange = null;
            void this.context.close().catch(() => {});
            this.context = null;
        }
        this.fireBuffer = null;
    }
}
