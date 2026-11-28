// Read back the published player skeleton through Pink at one source texel per pixel.
// The reference quad calibrates the same camera, blending and texture decoding.
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { PNG } = require('./bestiary-assets.cjs');
const { servePreview } = require('../serve-preview.cjs');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'art-source/ashen-labyrinth/lantern-keeper');
const registration = require(path.join(source, 'standing-registration.json'));
const output = path.join(root, 'output/playwright/lantern-keeper-reference-pixels');
const stage = process.argv[2];
if (!['before', 'after'].includes(stage)) throw Error('Choose before or after.');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', {
    paths: [root, path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')],
}));
const launch = require('../playwright.config.json').browser.launchOptions;

function saveReadback(name, encoded) {
    const [width, height] = registration.canvas;
    const black = Buffer.from(encoded.black, 'base64'), white = Buffer.from(encoded.white, 'base64');
    assert.equal(black.length, width * height * 4);
    assert.equal(white.length, black.length);
    const pm = new PNG({ width, height }), rgba = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const from = 4 * ((height - y - 1) * width + x), to = 4 * (y * width + x);
            const t0 = white[from] - black[from], t1 = white[from+1] - black[from+1], t2 = white[from+2] - black[from+2];
            const transmission = t0 + t1 + t2 - Math.min(t0,t1,t2) - Math.max(t0,t1,t2);
            black.copy(pm.data, to, from, from+3);
            pm.data[to+3] = Math.min(255,Math.max(0,255-transmission));
        }
    }
    for (let i = 0; i < pm.data.length; i += 4) {
        const a = pm.data[i + 3];
        for (let c = 0; c < 3; c++) rgba.data[i + c] = a ? Math.min(255, Math.round(255 * pm.data[i + c] / a)) : 0;
        rgba.data[i + 3] = a;
    }
    fs.writeFileSync(path.join(output, name + '-pm.png'), PNG.sync.write(pm));
    fs.writeFileSync(path.join(output, name + '.png'), PNG.sync.write(rgba));
}

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const server = servePreview({ directory: path.join(root, 'build/web-desktop'), port: 0, label: 'Native pixel comparison' });
    let browser;
    try {
        await once(server, 'listening');
        browser = await chromium.launch(launch);
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/__keeper-reference.png', route => route.fulfill({ path: path.join(source, registration.reference), contentType: 'image/png' }));
        await page.goto('http://127.0.0.1:' + server.address().port + '/?seed=17&preview=encounter&save=off');
        await page.waitForFunction(() => globalThis.__emberUI?.snapshot().heroRig?.actor === 'ashen-lantern-keeper' &&
            globalThis.__emberUI.snapshot().heroRig.runtimeReady);
        await page.screenshot({ path: path.join(output, stage + '-battle.png') });
        const [width, height] = registration.canvas;
        await page.setViewportSize({ width, height });
        const info = await page.evaluate(async ({ canvas: [w,h], origin: [ox,oy], unitsPerPixel: unit, checkFingers }) => {
            const cc = await globalThis.System.import('cc');
            const scene = cc.director.getScene(), canvas = scene.getChildByName('Canvas');
            const rig = scene.getComponentsInChildren('SpineActorRig').find(r => r.ready && r.inspect().actor === 'ashen-lantern-keeper');
            const s = rig.skeleton, data = s.skeletonData, n = s.node;
            const asset = { name: data.name, uuid: data._uuid, textures: data.textureNames, slots: data.skeletonJson.slots.map(slot => slot.name) };
            const draw = () => new Promise(resolve => cc.director.once(cc.Director.EVENT_AFTER_DRAW, resolve));
            cc.view.setDesignResolutionSize(w, h, cc.ResolutionPolicy.SHOW_ALL);
            await draw();
            const cam = canvas.getComponent(cc.Canvas).cameraComponent;
            rig.enabled = false;
            n.setParent(canvas);
            canvas.getChildByName('GameRoot').active = false;
            n.active = true;
            const target = new cc.RenderTexture();
            target.reset({ width: w, height: h });
            cam.targetTexture = target;
            cam.rect = new cc.Rect(0, 0, 1, 1);
            cam.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
            cam.clearColor = new cc.Color(0, 0, 0, 0);
            cam.orthoHeight = h / 2;
            await draw();
            const c = cam.node.worldPosition;
            function place(node) {
                node.setWorldScale(1 / unit, 1 / unit, 1);
                node.setWorldPosition(c.x + ox - w / 2, c.y + h / 2 - oy, 0);
            }
            place(n);
            function pose(clip, time) {
                s.paused = false;
                s.clearTracks();
                s.setToSetupPose();
                s.setAnimation(0, clip, clip === 'idle');
                s.updateAnimation(0);
                if (time) s.updateAnimation(time);
                if (clip === 'idle') s.findSlot('card').setAttachment(null);
                s._skeleton.updateWorldTransform();
                s.paused = true;
            }
            function measureFingers() {
                pose('idle',0);
                const mesh = data.skeletonJson.skins[0].attachments['cast-fingers']['cast-fingers'];
                const influences=[];
                for (let k=0; k<mesh.vertices.length;) {
                    const count=mesh.vertices[k++], weights=[];
                    for (let j=0;j<count;j++,k+=4) weights.push(mesh.vertices.slice(k,k+4));
                    influences.push(weights);
                }
                const bones=data.skeletonJson.bones.map(b=>s.findBone(b.name));
                function vertex(i) {
                    let x=0,y=0;
                    for (const [index,px,py,weight] of influences[i]) {
                        const b=bones[index];
                        x+=weight*(b.a*px+b.b*py+b.worldX);
                        y+=weight*(b.c*px+b.d*py+b.worldY);
                    }
                    return [x,y];
                }
                const setup=influences.map((_,i)=>vertex(i));
                const tips=[[974,282],[951,303],[925,317],[878,319]];
                const probes=tips.map(([px,py])=>{
                    const x=(px+.5-ox)*unit,y=(oy-py-.5)*unit;
                    for (let k=0;k<mesh.triangles.length;k+=3) {
                        const indices=mesh.triangles.slice(k,k+3);
                        const [[ax,ay],[bx,by],[cx,cy]]=indices.map(i=>setup[i]);
                        const det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
                        const a=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/det;
                        const b=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/det;
                        if (a>=-1e-6 && b>=-1e-6 && a+b<=1.000001) return {indices,weights:[a,b,1-a-b]};
                    }
                    throw Error('Fingertip outside the visible mesh at '+[px,py]);
                });
                function wristLocal({indices,weights}) {
                    const w=s.findBone('Wrist');
                    const points=indices.map(vertex);
                    const x=points.reduce((v,p,i)=>v+weights[i]*p[0],0)-w.worldX;
                    const y=points.reduce((v,p,i)=>v+weights[i]*p[1],0)-w.worldY;
                    const det=w.a*w.d-w.b*w.c;
                    return [(w.d*x-w.b*y)/det,(w.a*y-w.c*x)/det];
                }
                const rest=probes.map(wristLocal), checks={};
                for (const [clip,duration] of [['attack',.66],['prepare',.58]]) {
                    let maxDelta=0;
                    for (let frame=0;frame<=40;frame++) {
                        pose(clip,duration*frame/40);
                        probes.map(wristLocal).forEach(([x,y],i)=>{
                            maxDelta=Math.max(maxDelta,Math.hypot(x-rest[i][0],y-rest[i][1])/unit);
                        });
                    }
                    checks[clip]={frames:41, maxWristLocalDeltaInSourcePixels:maxDelta};
                    if (maxDelta>.01) throw Error(clip+' deforms the fingers by '+maxDelta+' source pixels');
                }
                return { sourceFingertips:tips, ...checks };
            }
            const fingerSamples=checkFingers ? measureFingers() : undefined;
            // A calibration control only. The production actor above keeps the
            // game's imported SkeletonData, atlas, mesh topology and materials.
            const image = await new Promise((resolve, reject) =>
                cc.assetManager.loadRemote('/__keeper-reference.png', { ext: '.png' }, (error, result) => error ? reject(error) : resolve(result)));
            const texture = new data.textures[0].constructor();
            texture.image = image;
            const control = new data.constructor();
            control._uuid = 'lantern-keeper-reference-readback';
            control.skeletonJson = {
                skeleton: { spine: '3.8.75' }, bones: [{name:'root'}],
                slots: [{name:'paper',bone:'root',attachment:'image'}],
                skins: [{ name:'default', attachments:{ paper:{ image:{
                    type:'region', path:'image', x:(w/2-ox)*unit, y:(oy-h/2)*unit, width:w*unit, height:h*unit,
                } } } }], animations:{ idle:{} },
            };
            control.atlasText = ['','reference.png','size: '+w+','+h,'format: RGBA8888','filter: Linear,Linear','repeat: none',
                'image','  rotate: false','  xy: 0, 0','  size: '+w+', '+h,'  orig: '+w+', '+h,'  offset: 0, 0','  index: -1',''].join('\n');
            control.textures = [texture];
            control.textureNames = ['reference.png'];
            const ref = new cc.Node('Reference calibration');
            ref.layer = n.layer;
            ref.parent = canvas;
            const refSkeleton = ref.addComponent(s.constructor);
            refSkeleton.premultipliedAlpha = s.premultipliedAlpha;
            refSkeleton.skeletonData = control;
            place(ref);
            globalThis.__keeperReadPixels = async (clip, time, reference) => {
                n.active = !reference;
                ref.active = reference;
                if (!reference) pose(clip, time);
                async function readAgainst(color) {
                    cam.clearColor = new cc.Color(color,color,color,255);
                    await draw();
                    await draw();
                    const raw = target.readPixels(0, 0, w, h);
                    const chunks = [];
                    for (let i = 0; i < raw.length; i += 24576)
                        chunks.push(btoa(String.fromCharCode(...raw.subarray(i, i + 24576))));
                    return chunks.join('');
                }
                return { black: await readAgainst(0), white: await readAgainst(255) };
            };
            return { asset, cameraHeight: cam.orthoHeight, registration: { w,h,ox,oy,unit }, premultipliedAlpha: s.premultipliedAlpha, fingerSamples };
        }, { ...registration, checkFingers:stage==='after' });
        for (const [name, clip, time, control] of [
            [stage + '-idle', 'idle', 0, false], [stage + '-control', 'idle', 0, true],
            ...(stage === 'after' ? [['after-breath','idle',1.25,false], ['after-grip','attack',.38,false], ['after-hurt','hurt',.055,false],
                ['after-fall-start','death',0,false], ['after-kneel','death',.94,false]] : []),
        ]) {
            const raw = await page.evaluate(([clip,time,control]) => globalThis.__keeperReadPixels(clip,time,control), [clip,time,control]);
            saveReadback(name, raw);
        }
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, stage + '-capture.json'), JSON.stringify({ ...info, errors }, null, 2));
        console.log(stage, JSON.stringify(info));
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
