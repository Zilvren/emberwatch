import { _decorator, Animation, AnimationClip, AnimationState, Camera, Color, Component, EffectAsset, EventKeyboard, EventTouch,
    game, input, Input, instantiate, KeyCode, Label, Layers, Material, MeshRenderer, Node, Prefab, primitives,
    ResolutionPolicy, SkeletalAnimation, Texture2D, utils, Vec2, Vec3, Vec4, view } from 'cc';

const { ccclass, property } = _decorator;
const cards = ['Lantern', 'Guard', 'Repel'] as const;
const captions = ['照明', '格挡', '回击'];
const views = [0, 30, -60, -150, 115];

function findNode(root: Node, name: string): Node | null {
    if (root.name === name) return root;
    for (const child of root.children) {
        const hit = findNode(child, name);
        if (hit) return hit;
    }
    return null;
}

@ccclass('SurvivorToonReview')
export class SurvivorToonReview extends Component {
    @property(Prefab) model: Prefab | null = null;
    @property(EffectAsset) paint: EffectAsset | null = null;
    @property(Texture2D) passage: Texture2D | null = null;
    @property(Label) status: Label | null = null;
    @property(Label) frameCaption: Label | null = null;
    @property(Label) speedCaption: Label | null = null;
    @property(Label) poseCaption: Label | null = null;
    @property(Label) finishCaption: Label | null = null;
    actor: Node | null = null;
    camera3d: Camera | null = null;
    activeClip = '';
    private animation: Animation | null = null;
    private state: AnimationState | null = null;
    private stage: Node | null = null;
    private backdrop: Node | null = null;
    private grounding: Node | null = null;
    private wall: MeshRenderer | null = null;
    private passagePaint: Material | null = null;
    private studioPaint: Material | null = null;
    private floating: Node[] = [];
    private materials: Material[] = [];
    private figureSurfaces: { renderer: MeshRenderer; painted: Material[] }[] = [];
    private clayPaint: Material | null = null;
    private clay = false;
    private full = false;
    private beforeStandFull = false;
    private azimuth = 0;
    private requestedAngle = 0;
    private viewIndex = 0;
    private slow = false;
    private held = false;
    private queued = -1;
    private down: Vec2 | null = null;
    private dragAngle = 0;

    start(): void {
        view.setDesignResolutionSize(1440, 900, ResolutionPolicy.SHOW_ALL);
        if (!this.model || !this.paint) throw Error('主角模型或渲染材质尚未绑定');
        this.stage = new Node('SurvivorStage');
        this.stage.parent = this.node.scene;
        this.actor = instantiate(this.model);
        // The glTF importer defaults to baked poses. Choose live joints before activation so
        // Cocos creates live curve evaluators, including the three independent card nodes.
        this.animation = this.actor.getComponent(SkeletalAnimation) ?? this.actor.getComponent(Animation);
        if (!this.animation) throw Error('模型缺少骨骼动画轨道');
        if (this.animation instanceof SkeletalAnimation) this.animation.useBakedAnimation = false;
        this.actor.parent = this.stage;
        const cam = new Node('OrbitCamera'); cam.parent = this.stage;
        this.camera3d = cam.addComponent(Camera);
        this.camera3d.projection = Camera.ProjectionType.ORTHO;
        this.camera3d.priority = 0;
        this.camera3d.near = .05; this.camera3d.far = 20;
        this.camera3d.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        this.camera3d.clearColor = new Color(86, 74, 89);
        this.camera3d.visibility = Layers.Enum.DEFAULT;
        this.clayPaint=new Material();this.clayPaint.initialize({effectAsset:this.paint,technique:3,defines:{USE_BAKED_AO:true}});this.materials.push(this.clayPaint);
        for (const renderer of this.actor.getComponentsInChildren(MeshRenderer)) {
            renderer.node.layer = Layers.Enum.DEFAULT;
            const onCharacter = !renderer.node.name.startsWith('Card');
            const painted = renderer.sharedMaterials.map(original => {
                const texture = original?.getProperty('mainTexture');
                const material = new Material(); material.initialize({ effectAsset: this.paint!, defines: { USE_BAKED_AO: onCharacter } });
                if (texture instanceof Texture2D) material.setProperty('mainTexture', texture);
                this.materials.push(material);
                return material;
            });
            renderer.sharedMaterials=painted;
            if (onCharacter) this.figureSurfaces.push({ renderer,painted });
        }
        this.backdrop = new Node('LabyrinthPassage'); this.backdrop.parent = cam;
        this.backdrop.setPosition(0, 0, -8);
        const wall = this.backdrop.addComponent(MeshRenderer);
        this.wall=wall;
        wall.mesh = utils.createMesh(primitives.quad());
        const matte = new Material();
        matte.initialize({ effectName:'builtin-unlit', defines:{ USE_TEXTURE:true } });
        matte.setProperty('mainTexture', this.passage);
        matte.setProperty('tilingOffset', new Vec4(1, -1, 0, 1));
        matte.setProperty('mainColor', new Color(192, 187, 202));
        wall.setSharedMaterial(matte, 0); this.passagePaint=matte; this.materials.push(matte);
        this.studioPaint = new Material(); this.studioPaint.initialize({effectAsset:this.paint, technique:2});
        this.materials.push(this.studioPaint);
        this.grounding = new Node('FootContact'); this.grounding.parent = this.stage;
        this.grounding.setPosition(0, .005, -.19);
        this.grounding.setScale(.65, .055, 1);
        const shadow = this.grounding.addComponent(MeshRenderer);
        shadow.mesh = wall.mesh;
        const shadowPaint = new Material(); shadowPaint.initialize({effectAsset:this.paint, technique:1});
        shadow.setSharedMaterial(shadowPaint, 0); this.materials.push(shadowPaint);
        this.floating = cards.map(name => findNode(this.actor!, 'Card' + name)!);
        this.updateCamera(); this.play('Fan');
        input.on(Input.EventType.KEY_DOWN, this.key, this);
        input.on(Input.EventType.TOUCH_START, this.touchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
        input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
        if (typeof document !== 'undefined' && document.activeElement === document.body) game.canvas?.focus({ preventScroll:true });
    }

    onDestroy(): void {
        input.off(Input.EventType.KEY_DOWN, this.key, this);
        input.off(Input.EventType.TOUCH_START, this.touchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
        input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
        this.stage?.destroy();
        for (const material of this.materials) material.destroy();
    }

    private updateCamera(): void {
        if (!this.camera3d) return;
        const a = this.azimuth * Math.PI / 180;
        const target = new Vec3(this.full ? .12 : .13, this.full ? .81 : 1.38, .08);
        const cam = this.camera3d;
        cam.node.setPosition(target.x + 3.8 * Math.sin(a), target.y + .045, target.z + 3.8 * Math.cos(a));
        cam.node.lookAt(target);
        this.grounding?.setWorldRotation(cam.node.worldRotation);
        cam.orthoHeight = this.full ? 1.14 : .55;
        const aspect = cam.camera?.width && cam.camera?.height ? cam.camera.width / cam.camera.height : 1.6;
        const h = cam.orthoHeight * 2 * Math.max(1, aspect / 1.6);
        this.backdrop?.setScale(h * 1.6, h, 1);
    }

    private play(name: string, exact = false): void {
        const animation = this.animation!;
        const state = animation.getState(name);
        if (!state) throw Error('缺少动作 ' + name);
        const previous = this.activeClip;
        this.activeClip = name; this.state = state;
        state.wrapMode = name === 'Think' || name === 'Stand' ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;
        state.speed = this.slow ? .45 : 1;
        if (!exact && previous === 'Think' && name.startsWith('Flick')) animation.crossFade(name, .065);
        else animation.play(name);
        const index = cards.findIndex(card => name === 'Flick'+card);
        if (this.status) this.status.string = index >= 0 ? '弹出' + captions[index] : name === 'Fan' ? '展牌' : name === 'Stand' ? '站姿' : '思考';
        if (this.poseCaption) this.poseCaption.string = name === 'Stand' ? '看动作' : '看站姿';
        this.setBackdrop();
    }

    private select(index: number): void {
        if (!this.animation) return;
        this.held = false;
        if (this.activeClip === 'Stand') { this.setFraming(this.beforeStandFull); this.queued = index; this.play('Fan'); return; }
        if (this.activeClip.startsWith('Flick') || this.activeClip === 'Fan') { this.queued = index; return; }
        this.play('Flick' + cards[index]);
    }
    lantern(): void { this.select(0); }
    guard(): void { this.select(1); }
    repel(): void { this.select(2); }
    turn(): void {
        this.viewIndex = (this.viewIndex + 1) % views.length;
        const delta = (views[this.viewIndex] - this.azimuth) * Math.PI/180;
        this.requestedAngle = this.azimuth + Math.atan2(Math.sin(delta),Math.cos(delta))*180/Math.PI;
    }
    pose(): void {
        this.held=false; this.queued=-1;
        if(this.activeClip==='Stand'){this.setFraming(this.beforeStandFull);this.play('Fan',true);return;}
        this.beforeStandFull=this.full;this.setFraming(true);this.play('Stand',true);
    }
    finish(): void {
        this.clay=!this.clay;
        for(const {renderer,painted} of this.figureSurfaces) {
            renderer.sharedMaterials=this.clay&&this.clayPaint?painted.map(()=>this.clayPaint!):painted;
        }
        if(this.finishCaption) this.finishCaption.string=this.clay?'看上色':'看素模';
        this.setBackdrop();
    }
    private setBackdrop(): void {
        const material = this.clay || this.activeClip==='Stand' ? this.studioPaint : this.passagePaint;
        if(material) this.wall?.setSharedMaterial(material,0);
    }
    private setFraming(full:boolean): void { this.full=full; if(this.frameCaption)this.frameCaption.string=full?'拉近':'看全身';this.updateCamera(); }
    frame(): void { this.setFraming(!this.full); }
    speed(): void { this.slow = !this.slow; if (this.state) this.state.speed = this.slow ? .45 : 1; if (this.speedCaption) this.speedCaption.string = this.slow ? '速度 ×0.45' : '速度 ×1'; }

    private key(e: EventKeyboard): void {
        if (e.keyCode >= KeyCode.DIGIT_1 && e.keyCode <= KeyCode.DIGIT_3) this.select(e.keyCode - KeyCode.DIGIT_1);
        if (e.keyCode === KeyCode.KEY_V) this.turn();
    }
    private touchStart(e: EventTouch): void {
        if (e.getUILocation().y < 88) return;
        this.down = e.getLocation(); this.dragAngle = this.azimuth;
    }
    private touchMove(e: EventTouch): void {
        if (!this.down) return;
        const x = e.getLocationX() - this.down.x;
        if (Math.abs(x)>5) this.requestedAngle = this.dragAngle - x * .36;
    }
    private touchCancel(): void { this.down = null; }
    private touchEnd(e: EventTouch): void {
        if (!this.down) return;
        const p = e.getLocation(), down = this.down; this.down = null;
        if (Vec2.distance(p,down) > 8 || !this.camera3d) return;
        // Project the four corners of each moving card. Their outlines change when the camera or card turns.
        const hits = this.floating.map((node,index) => {
            const corners = [[-35,-49],[35,-49],[35,49],[-35,49]].map(([x,y]) => {
                const w = new Vec3(); Vec3.transformMat4(w, new Vec3(x/800,y/800,0),node.worldMatrix);
                return this.camera3d!.worldToScreen(w);
            });
            const signs = corners.map((a,i) => { const b = corners[(i+1)%4]; return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x); });
            return { index, depth: Vec3.distance(this.camera3d!.node.worldPosition,node.worldPosition), inside: node.scale.x>.2 && (signs.every(n=>n>=0) || signs.every(n=>n<=0)) };
        }).filter(hit=>hit.inside).sort((a,b)=>a.depth-b.depth);
        if (hits.length) this.select(hits[0].index);
    }

    update(dt: number): void {
        if (!this.state) return;
        if (Math.abs(this.azimuth-this.requestedAngle)>.02) {
            this.azimuth += (this.requestedAngle-this.azimuth)*(1-Math.exp(-12*dt)); this.updateCamera();
        }
        if (this.held || this.activeClip === 'Think' || this.activeClip === 'Stand' || (this.state.isPlaying && this.state.time < this.state.duration)) return;
        const next=this.queued; this.queued=-1; this.play(next<0?'Think':'Flick'+cards[next]);
    }

    /** Sample the imported clip for reproducible turntable frames and contact inspection. */
    reviewPose(clip: string, time: number, angle: number, full = false): void {
        this.queued=-1; this.held=true; this.azimuth=this.requestedAngle=angle; this.full=full;
        if (this.frameCaption) this.frameCaption.string = full ? '拉近' : '看全身';
        this.updateCamera(); this.play(clip, true);
        this.state!.pause(); this.state!.weight=1; this.state!.setTime(time); this.state!.sample();
    }
}
