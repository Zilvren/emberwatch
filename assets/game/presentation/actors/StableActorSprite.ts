import { _decorator, JsonAsset, Sprite } from 'cc';
const { ccclass, property } = _decorator;

type RigVertex = [number, number, number, number, number, number];
interface RigGeometry {
    vertices: RigVertex[];
    indices: number[];
    sourceSha256: string;
}

/** SDK-specific UI mesh adapter, isolated for Pink COCOS 4.0.0-beta.1. */
@ccclass('StableActorSprite')
export class StableActorSprite extends Sprite {
    @property(JsonAsset) geometry: JsonAsset | null = null;
    private breathing = 0;
    private rigEnabled = true;
    @property
    get breath(): number {
        return this.breathing;
    }
    set breath(value: number) {
        this.breathing = value;
        this.markForUpdateRenderData();
    }
    get rig(): RigGeometry {
        return this.geometry!.json as RigGeometry;
    }
    setRigActive(active: boolean): void {
        if (this.rigEnabled === active) return;
        this.rigEnabled = active;
        this.breath = 0;
        this._flushAssembler();
    }
    protected _flushAssembler(): void {
        if (!this.rigEnabled || !this.geometry) {
            super._flushAssembler();
            return;
        }
        // The public Sprite API does not expose custom mesh installation.
        // Keep the pinned SDK bridge here; gameplay uses only setRigActive().
        const renderer = this as any;
        if (renderer._assembler !== stableMesh) {
            this.destroyRenderData();
            renderer._assembler = stableMesh;
        }
        if (!renderer._renderData) {
            const data = (renderer._renderData = stableMesh.createData(this));
            data.material = this.getRenderMaterial(0);
            this.markForUpdateRenderData();
            stableMesh.updateUVs(this);
            stableMesh.updateColor(this);
        }
    }
    rigSnapshot(): object {
        return {
            active: this.rigEnabled,
            breath: this.breath,
            source: this.rig?.sourceSha256,
            vertices: this.rig?.vertices.length,
        };
    }
}

const stableMesh = {
    createData(sprite: StableActorSprite): any {
        const data = sprite.requestRenderData();
        const count = sprite.rig.vertices.length;
        data.dataLength = count;
        data.resize(count, sprite.rig.indices.length);
        if (!data.chunk) throw new Error('Actor mesh exceeds the pinned SDK UI buffer capacity');
        data.chunk.setIndexBuffer(sprite.rig.indices);
        return data;
    },
    updateRenderData(sprite: StableActorSprite): void {
        const data = sprite.renderData;
        if (!data?.chunk || !sprite.spriteFrame) return;
        for (let i = 0; i < sprite.rig.vertices.length; i++) {
            const v = sprite.rig.vertices[i];
            data.data[i].x = v[0] + v[4] * sprite.breath;
            data.data[i].y = v[1] + v[5] * sprite.breath;
        }
        data.vertDirty = true;
        this.updateUVs(sprite);
        (data as any).updateRenderData(sprite, sprite.spriteFrame);
    },
    updateUVs(sprite: StableActorSprite): void {
        const data = sprite.renderData;
        if (!data?.chunk) return;
        const buffer = data.chunk.vb,
            stride = data.floatStride;
        sprite.rig.vertices.forEach((v, i) => {
            buffer[i * stride + 3] = v[2];
            buffer[i * stride + 4] = v[3];
        });
    },
    updateColor(sprite: StableActorSprite): void {
        const data = sprite.renderData;
        if (!data?.chunk) return;
        const buffer = data.chunk.vb,
            stride = data.floatStride,
            color = sprite.color;
        for (let i = 0; i < data.dataLength; i++) {
            const p = i * stride + 5;
            buffer[p] = color.r / 255;
            buffer[p + 1] = color.g / 255;
            buffer[p + 2] = color.b / 255;
            buffer[p + 3] = color.a / 255;
        }
    },
    fillBuffers(sprite: StableActorSprite): void {
        const data = sprite.renderData;
        if (!data?.chunk) return;
        const m = sprite.node.worldMatrix,
            chunk = data.chunk,
            buffer = chunk.vb,
            stride = data.floatStride;
        for (let i = 0; i < data.dataLength; i++) {
            const p = data.data[i],
                offset = i * stride;
            buffer[offset] = m.m00 * p.x + m.m04 * p.y + m.m12;
            buffer[offset + 1] = m.m01 * p.x + m.m05 * p.y + m.m13;
            buffer[offset + 2] = m.m02 * p.x + m.m06 * p.y + m.m14;
        }
        const mesh = chunk.meshBuffer,
            base = chunk.vertexOffset;
        let offset = mesh.indexOffset;
        for (const index of sprite.rig.indices) mesh.iData[offset++] = base + index;
        mesh.indexOffset = offset;
        data.vertDirty = false;
    },
};
