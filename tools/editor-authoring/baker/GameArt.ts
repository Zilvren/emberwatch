import { EDITOR } from 'cc/env';
import { NativeArtReferences } from './NativeArtReferences';
import { assetManager, resources, Rect, Size, SpriteFrame, SpriteAtlas, Texture2D, Vec2 } from 'cc';
import { CardKind } from './SurvivalRules';
export type ArtName = 'survivor' | 'survivor-unarmed' | 'wanderer' | 'brute' | 'card-art' | 'battle-street' | 'shelter' | 'dusk-depot';
export class GameArt {
    private originals = new Map<ArtName, SpriteFrame>();
    private frames = new Map<string, SpriteFrame>();
    private atlases = new Map<string, SpriteAtlas>();
    async load(): Promise<void> {
        await Promise.all((['survivor', 'survivor-unarmed', 'wanderer', 'brute', 'card-art', 'battle-street', 'shelter', 'dusk-depot'] as ArtName[]).map(name => new Promise<void>((resolve, reject) => {
            (EDITOR ? (id:any,type:any,callback:any)=>assetManager.loadAny({uuid:NativeArtReferences[name].image,type},callback) : resources.load.bind(resources))(`art/${name}/spriteFrame`, SpriteFrame, (error, frame) => {
                if (error || !frame) {
                    reject(error ?? new Error(`Missing art: ${name}`));
                    return;
                }
                frame.texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
                this.originals.set(name, frame);
                (EDITOR ? (id:any,type:any,callback:any)=>assetManager.loadAny({uuid:NativeArtReferences[name].atlas,type},callback) : resources.load.bind(resources))(`art/${name}-frames`, SpriteAtlas, (atlasError, atlas) => { if(atlasError || !atlas){reject(atlasError);return;} this.atlases.set(name, atlas); resolve(); });
            });
        })));
    }
    get(name: ArtName): SpriteFrame { return this.originals.get(name)!; }
    private crop(name: ArtName, key: string, x: number, y: number, w: number, h: number): SpriteFrame {
        if (this.frames.has(key))
            return this.frames.get(key)!;
        const frame = new SpriteFrame();
        frame.name = key;
        frame.texture = this.get(name).texture;
        frame.rect = new Rect(x, y, w, h);
        frame.originalSize = new Size(w, h);
        frame.offset = new Vec2(0, 0);
        this.frames.set(key, frame);
        return frame;
    }
    pose(name: 'survivor' | 'survivor-unarmed' | 'wanderer' | 'brute', index = 0): SpriteFrame {
        const native = this.atlases.get(name)?.getSpriteFrame(`${name}-${index}`);if(native)return native;
        const source = this.get(name);
        const w = source.texture.width, h = source.texture.height;
        // Pose cells have transparent spacing; these cuts preserve the extended attack silhouettes.
        const cuts = name === 'wanderer' ? [0, .276, .704, 1] : name.indexOf('survivor') === 0 ? [0, .304, .700, 1] : [0, 1 / 3, 2 / 3, 1];
        const left = Math.round(cuts[index] * w), right = Math.round(cuts[index + 1] * w);
        return this.crop(name, `${name}-${index}`, left, 0, right - left, h);
    }
    cover(name: ArtName, aspect: number): SpriteFrame {
        const native=this.atlases.get(name)?.getSpriteFrame("cover");if(native)return native;
        const source = this.get(name), tw = source.texture.width, th = source.texture.height;
        const w = Math.min(tw, Math.round(th * aspect)), h = Math.min(th, Math.round(tw / aspect));
        return this.crop(name, `${name}-cover-${aspect}`, Math.floor((tw - w) / 2), Math.floor((th - h) / 2), w, h);
    }
    card(kind: CardKind, aspect = 1): SpriteFrame {
        const choices=[{name:"square",aspect:1},{name:"hand",aspect:(156-18)/(242*.44)},{name:"reward",aspect:(236-18)/(345*.44)},{name:"fly",aspect:(118-18)/(174*.44)}];const usage=choices.sort((a,b)=>Math.abs(a.aspect-aspect)-Math.abs(b.aspect-aspect))[0].name;const key=kind==="slash"||kind==="cash"?"knife":kind;const native=this.atlases.get("card-art")?.getSpriteFrame(`${usage}-${key}`);if(native)return native;
        const index: Record<CardKind, number> = { attack: 0, dodge: 1, knife: 2, evade: 3, repair: 4, heavy: 5, slash: 2, cash: 2 };
        const source = this.get('card-art');
        const cellW = Math.floor(source.texture.width / 3), cellH = Math.floor(source.texture.height / 2), i = index[kind];
        const w = Math.min(cellW, Math.round(cellH * aspect)), h = Math.min(cellH, Math.round(cellW / aspect));
        return this.crop('card-art', `card-${kind}-${aspect}`, (i % 3) * cellW + Math.floor((cellW - w) / 2), Math.floor(i / 3) * cellH + Math.floor((cellH - h) / 2), w, h);
    }
    dispose(): void { for (const frame of this.frames.values())
        frame.destroy(); this.frames.clear(); }
}
