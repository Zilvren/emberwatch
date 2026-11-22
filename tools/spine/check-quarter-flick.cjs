const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { servePreview } = require('../serve-preview.cjs');
const { PNG } = require('./bestiary-assets.cjs');

const root = path.resolve(__dirname, '../..');
const art = path.join(root,'art-source/ashen-labyrinth/battle-survivor/spine-flick-golden');
const output = path.join(root,'output/playwright/survivor-golden');
const cards = ['lantern','guard','repel'];
const chromium = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', {
    paths:[root,path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')],
})).chromium;

function visibleTriangles() {
    const doc = JSON.parse(fs.readFileSync(path.join(art,'runtime/survivor-flick.json')));
    const result = {};
    for (const [slot, choices] of Object.entries(doc.skins[0].attachments)) {
        if (!slot.startsWith('q-')) continue;
        for (const [name, mesh] of Object.entries(choices)) {
            if (mesh.type !== 'mesh') continue;
            const texture = PNG.sync.read(fs.readFileSync(path.join(art,'parts',(mesh.path || name)+'.png')));
            const xy = index => [mesh.uvs[2*index]*texture.width, mesh.uvs[2*index+1]*texture.height];
            const indices = [], winding = [];
            for (let i=0; i<mesh.triangles.length; i+=3) {
                const tri=mesh.triangles.slice(i,i+3), [a,b,c]=tri.map(xy);
                let ink=0;
                for(let row=0;row<7;row++)for(let col=0;col<7-row;col++){
                    const u=(col+.33)/7,v=(row+.33)/7;
                    const x=Math.min(texture.width-1,Math.max(0,Math.floor(a[0]+u*(b[0]-a[0])+v*(c[0]-a[0]))));
                    const y=Math.min(texture.height-1,Math.max(0,Math.floor(a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]))));
                    if(texture.data[4*(y*texture.width+x)+3]>96) ink++;
                }
                if(ink>=2){
                    indices.push(...tri);
                    // Texture y runs down. Positive world y points up.
                    winding.push(-Math.sign((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])));
                }
            }
            (result[slot] ??= {})[name]={indices,winding};
        }
    }
    return result;
}

async function main() {
    fs.mkdirSync(output,{recursive:true});
    const server=servePreview({directory:path.join(root,'build/survivor-flick-golden'),port:0,label:'Golden turnaround review'});
    await once(server,'listening');
    let browser;
    try {
        browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
            args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
        const page=await browser.newPage({viewport:{width:1080,height:675},deviceScaleFactor:1});
        const errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
        await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
        try {
            await page.waitForFunction(()=>globalThis.cc?.director?.getScene()?.getComponentsInChildren('SurvivorFlickSpineReview')
                ?.[0]?.skeleton?.findBone('right-knuckle'),null,{timeout:35000});
        } catch(error){throw Error(error.message+' '+errors.join(' | '))}
        const setup=await page.evaluate(()=>{
            const scene=cc.director.getScene(),r=globalThis.review3q=scene.getComponentsInChildren('SurvivorFlickSpineReview')[0];
            const s=r.skeleton;
            const audit=globalThis.reviewInputs={starts:[],releases:[]};
            s.setStartListener(entry=>{
                if(entry.trackIndex!==0 || !entry.animation.name.endsWith('-flick'))return;
                audit.starts.push(entry.animation.name);
                s.setTrackEventListener(entry,(_,e)=>{if(e.data.name==='release')audit.releases.push(e.stringValue);});
            });
            globalThis.locate3q=(kind,id)=>{
                const canvas=document.querySelector('canvas').getBoundingClientRect(),view=cc.view.getVisibleSize();
                let x,y;
                if(kind==='button'){
                    const rect=r.node.getChildByName(id).getComponent('cc.UITransform').getBoundingBoxToWorld();
                    x=rect.center.x;y=rect.center.y;
                }else{
                    const bone=s.findBone('float-'+id);const w=new cc.Vec3();
                    cc.Vec3.transformMat4(w,new cc.Vec3(bone.worldX,bone.worldY,0),s.node.worldMatrix);
                    x=w.x;y=w.y;
                }
                return [canvas.left+x*canvas.width/view.width,canvas.bottom-y*canvas.height/view.height];
            };
            return {scene:scene.name,bones:s._skeleton.bones.length,ik:s._skeleton.ikConstraints.length,
                version:s.skeletonData.skeletonJson.skeleton.spine,pma:s.premultipliedAlpha};
        });
        assert.equal(setup.scene,'SurvivorFlickSpineReview');
        assert.equal(setup.ik,2);
        assert.equal(setup.version,'3.8.75');
        assert.equal(setup.pma,false);
        const click=async(kind,id)=>page.mouse.click(...await page.evaluate(([kind,id])=>locate3q(kind,id),[kind,id]));
        const waitTrack=n=>page.waitForFunction(n=>review3q.skeleton.getCurrent(0)?.animation?.name===n,n,{timeout:8000});
        const deal=async()=>{await click('button','Think');await waitTrack('think')};
        const visible=()=>page.evaluate(()=>['lantern','guard','repel'].filter(id=>review3q.skeleton.findSlot('float-'+id).getAttachment()));

        const observed=()=>page.evaluate(()=>structuredClone(reviewInputs));
        const backNames=()=>page.evaluate(()=>['lantern','guard','repel'].map(id=>review3q.skeleton.findSlot('float-'+id)?.getAttachment()?.name??null));
        await waitTrack('think');
        const initial=await page.evaluate(()=>review3q.skeleton.getCurrent(0).trackTime);
        await page.mouse.move(...await page.evaluate(()=>locate3q('back','guard')));
        await page.waitForFunction(t=>review3q.skeleton.getCurrent(0).trackTime>=t+3.22,initial,{timeout:10000});
        assert.deepEqual(await observed(),{starts:[],releases:[]});
        assert.deepEqual(await backNames(),cards.map(()=>'paper-back'));
        await page.keyboard.press('1');await page.keyboard.press('3');
        await click('button','Pause');await click('back','guard');
        assert.equal(await page.evaluate(()=>review3q.skeleton.paused && review3q.selected==='guard'),true);
        await click('button','Speed');await click('button','Speed');await click('button','Framing');
        await click('button','Framing');await click('button','Pause');await deal();
        assert.deepEqual(await observed(),{starts:[],releases:[]});
        const inputs=[];
        for(const card of cards){
            const n=inputs.length;
            const restName=await page.evaluate(()=>review3q.skeleton.getCurrent(0).animation.name);
            await click('back',card);
            await page.waitForTimeout(200);
            assert.equal(await page.evaluate(()=>review3q.selected),card);
            assert.equal(await page.evaluate(()=>review3q.skeleton.getCurrent(0).animation.name),restName);
            assert.equal((await observed()).starts.length,n);
            if(card==='guard')await page.keyboard.press('Enter');else await click('button','Flick');
            await waitTrack(card+'-flick');
            const start=await page.evaluate(()=>({now:performance.now(),at:review3q.skeleton.getCurrent(0).trackTime,speed:review3q.skeleton.timeScale}));
            await waitTrack('think-without-'+card);
            const elapsed=await page.evaluate(()=>performance.now())-start.now+start.at*1000/start.speed;
            inputs.push({back:card,elapsedMs:Math.round(elapsed),remaining:await visible()});
        }
        assert.deepEqual(inputs.map(i=>i.remaining),[['guard','repel'],['repel'],[]]);
        await page.keyboard.press('3');await page.keyboard.press('Enter');
        assert.deepEqual(await observed(),{starts:cards.map(c=>c+'-flick'),releases:cards});

        await deal();
        await click('button','Speed');await page.keyboard.press('2');await click('button','Flick');await waitTrack('guard-flick');
        await page.waitForFunction(()=>review3q.skeleton.getCurrent(0).trackTime>=.13);
        await click('button','Pause');const freeze=await page.evaluate(()=>review3q.skeleton.getCurrent(0).trackTime);
        await page.waitForTimeout(110);
        const frozen=await page.evaluate(()=>review3q.skeleton.getCurrent(0).trackTime);
        assert.equal(frozen,freeze);
        await click('button','Pause');
        const resume=await page.evaluate(()=>({t:review3q.skeleton.getCurrent(0).trackTime,now:performance.now()}));
        await page.keyboard.press('2');await page.keyboard.press('Enter');await page.keyboard.press('3');
        await waitTrack('think-without-guard');
        const halfMs=Math.round(await page.evaluate(()=>performance.now())-resume.now+resume.t*2000);
        assert.equal((await observed()).starts.length,4);
        assert.equal(await page.evaluate(()=>review3q.selected),'repel');
        await click('button','Speed');
        await page.keyboard.press('Enter');await waitTrack('repel-flick');
        await page.keyboard.press('1');await page.keyboard.press('Enter');
        await waitTrack('lantern-flick');await waitTrack('think-without-lantern');
        const interactions=await observed();
        assert.deepEqual(interactions.releases,[...cards,'guard','repel','lantern']);
        assert.deepEqual(interactions.starts,interactions.releases.map(c=>c+'-flick'));
        await deal();
        await click('button','Framing');const detail=await page.evaluate(()=>review3q.skeleton.node.scale.x);
        await click('button','Framing');assert.ok(detail>await page.evaluate(()=>review3q.skeleton.node.scale.x));

        // Record the actual preview canvas while the same public controls run
        // one normal-speed take and one half-speed close-up.
        await page.evaluate(()=>{
            const canvas=document.querySelector('canvas');
            const stream=canvas.captureStream(30),chunks=[];
            const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:4800000});
            globalThis.endReviewRecording=()=>new Promise((resolve,reject)=>{
                rec.onstop=()=>{
                    const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;
                    reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));
                    stream.getTracks().forEach(t=>t.stop());
                };rec.stop();
            });
            rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.start();
        });
        await page.waitForTimeout(480);
        await click('back','guard');await page.waitForTimeout(310);await click('button','Flick');
        await waitTrack('think-without-guard');await page.waitForTimeout(300);
        await deal();await click('button','Framing');await click('button','Speed');
        await click('back','guard');await page.waitForTimeout(420);await click('button','Flick');
        await waitTrack('think-without-guard');await page.waitForTimeout(430);
        const recording=Buffer.from(await page.evaluate(()=>endReviewRecording()),'base64');
        assert.ok(recording.length>40000);
        fs.writeFileSync(path.join(output,'right-wrist-flick.webm'),recording);
        await click('button','Speed');await click('button','Framing');await deal();

        const result=await page.evaluate(({triangles,ids})=>{
            const r=review3q,s=r.skeleton;r.enabled=false;
            const xy=b=>[b.worldX,b.worldY], dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
            const pt=id=>xy(s.findBone(id));
            const set=(name,t)=>{
                s.clearTracks();s.setToSetupPose();s.paused=false;s.timeScale=1;
                const e=s.setAnimation(0,name,false);e.mixDuration=0;e.trackTime=t;s.updateAnimation(0);
                s._skeleton.updateWorldTransform();s.paused=true;
            };
            globalThis.quarterSample=set;
            const natural=(b,p)=>{const x=p[0]-b.worldX,y=p[1]-b.worldY,d=b.a*b.d-b.b*b.c;
                return [(b.d*x-b.b*y)/d,(b.a*y-b.c*x)/d];};
            const right=s.findBone('contact-guard');
            if(s.findBone('right-cheek-pad')?.parent?.data?.name!=='near-hand'){
                throw Error('The cheek support and card impulse must share the anatomical right wrist.');
            }
            let ancestor=right,chain=[];
            while(ancestor){chain.push(ancestor.data.name);ancestor=ancestor.parent;}
            const results={};
            for(const chosen of ids){
                const clip=chosen+'-flick';const flips={};
                let reference,contact, worstHandDistance=0,leftTravel=0,maxHip=0,maxKnee=0,footDrift=0,shoulderChange=0,offscreen=false;
                let otherMotion=0, measured=0,worstFrame=null,visibleBacks=0;
                let farKneeTravel=0,shinSwing=0,soleAngle=0,faceLocalDrift=0,beforeContactDrift=0;
                const impacts={};
                const rightEdge=(cc.view.getVisibleSize().width-s.node.worldPosition.x)/s.node.worldScale.x;
                const times=[...new Set([...Array.from({length:121},(_,i)=>i/100),.384,.385,.415,.435,.445,1.115,1.119])].sort((a,b)=>a-b);
                for(const t of times){
                    set(clip,t);
                    const hands=['q-near-knuckles-art','q-near-fist-art'].map(id=>s.findSlot(id));
                    if(hands.filter(slot=>slot.getAttachment() && slot.color.a>.02).length!==1){
                        throw Error('The right hand has a missing or double silhouette at '+t);
                    }
                    const tip=pt('contact-'+chosen),knuckle=natural(s.findBone('head'),pt('right-knuckle')),left=pt('cast-palm');
                    const hip=pt('hips'),knee=pt('near-shin'),front=pt('far-boot'),rear=pt('rear-toe');
                    const farKnee=pt('far-shin');
                    const angle=n=>{const b=s.findBone(n);return Math.atan2(b.c,b.a)*180/Math.PI;};
                    const shins=['near-shin','far-shin'].map(angle),soles=['near-boot','far-boot'].map(angle);
                    const face=s.findSlot('q-face-art'),glove=face.getAttachment();
                    const coordinates=new Float32Array(glove.worldVerticesLength);
                    glove.computeWorldVertices(face,0,coordinates.length,coordinates,0,2);
                    const faceSamples=[];
                    for(let i=0;i<coordinates.length;i+=2)faceSamples.push(natural(s.findBone('head'),[coordinates[i],coordinates[i+1]]));
                    const shoulder=pt('near-sleeve')[0]-pt('cast-sleeve')[0];
                    if(!reference)reference={knuckle,left,tip,hip,knee,farKnee,shins,soles,faceSamples,front,rear,shoulder,
                        cards:Object.fromEntries(ids.map(n=>[n,pt('float-'+n)]))};
                    farKneeTravel=Math.max(farKneeTravel,dist(farKnee,reference.farKnee));
                    for(let i=0;i<2;i++){
                        shinSwing=Math.max(shinSwing,Math.abs(shins[i]-reference.shins[i]));
                        soleAngle=Math.max(soleAngle,Math.abs(soles[i]-reference.soles[i]));
                    }
                    faceSamples.forEach((v,i)=>{faceLocalDrift=Math.max(faceLocalDrift,dist(v,reference.faceSamples[i]));});
                    worstHandDistance=Math.max(worstHandDistance,dist(knuckle,reference.knuckle));
                    leftTravel=Math.max(leftTravel,dist(left,reference.left));
                    maxHip=Math.max(maxHip,dist(hip,reference.hip));
                    maxKnee=Math.max(maxKnee,dist(knee,reference.knee));
                    shoulderChange=Math.max(shoulderChange,Math.abs(shoulder-reference.shoulder));
                    footDrift=Math.max(footDrift,dist(front,reference.front),dist(rear,reference.rear));
                    for(const n of ids)if(n!==chosen)otherMotion=Math.max(otherMotion,dist(pt('float-'+n),reference.cards[n]));
                    const b=s.findBone('float-'+chosen),slot=s.findSlot('float-'+chosen),a=slot.getAttachment();
                    if(t<=.385)beforeContactDrift=Math.max(beforeContactDrift,dist(pt('float-'+chosen),reference.cards[chosen]));
                    if([.435,.44,.445].includes(t))impacts[t]=pt('float-'+chosen);
                    for(const id of ids){
                        const shown=s.findSlot('float-'+id).getAttachment(),back=s.findBone('float-'+id);
                        if(!shown){if(id!==chosen || t<1.12)throw Error('Card hid early');continue;}
                        if(id===chosen && t>1.12)throw Error('Spent card remained visible');
                        if(shown.name!=='paper-back' || back.a*back.d-back.b*back.c<=0)throw Error('Card face or reverse at '+t);
                        visibleBacks++;
                    }
                    if(t===.44){
                        const top=.12*a.height*a.scaleY;
                        const side=-a.width*a.scaleX/2;
                        const edge=[b.worldX+b.a*side+b.b*top,b.worldY+b.c*side+b.d*top];
                        contact={gap:dist(edge,tip),rightTravel:dist(reference.tip,tip),rightLeftHandSpace:dist(pt('near-hand'),pt('cast-palm'))};
                    }
                    if(t===1.119)offscreen=b.worldX-18>rightEdge && !!a;
                    for(const [slotName,choices] of Object.entries(triangles)){
                        const slot=s.findSlot(slotName),surface=slot?.getAttachment();
                        if(!surface||!surface.worldVerticesLength||slot.color.a<.02)continue;
                        const {indices,winding}=choices[surface.name]??Object.values(choices)[0], id=slotName+'-'+surface.name;
                        const verts=new Float32Array(surface.worldVerticesLength);
                        surface.computeWorldVertices(slot,0,verts.length,verts,0,2);
                        for(let i=0;i<indices.length;i+=3){
                            const [ia,ib,ic]=[indices[i]*2,indices[i+1]*2,indices[i+2]*2];
                            const value=(verts[ib]-verts[ia])*(verts[ic+1]-verts[ia+1])-(verts[ib+1]-verts[ia+1])*(verts[ic]-verts[ia]);
                            if(!Number.isFinite(value))throw Error('Invalid geometry '+id);
                            if(winding[i/3]*value<-.0002){
                                flips[id]=(flips[id]??0)+1;
                                worstFrame ??= {id,t,triangle:i/3};
                            }
                        }
                        measured+=indices.length/3;
                    }
                }
                const incoming=dist(impacts[.44],impacts[.435])/.005, outgoing=dist(impacts[.445],impacts[.44])/.005;
                results[chosen]={samples:times.length,worstHandDistance,leftTravel,maxHip,maxKnee,farKneeTravel,shinSwing,soleAngle,
                    faceLocalDrift,beforeContactDrift,releaseVelocity:{incoming,outgoing},footDrift,shoulderChange,
                    otherMotion,offscreen,contact,foldedTriangles:flips,measured,worstFrame,visibleBacks,
                    returnRightKnuckle:dist(reference.knuckle,natural(s.findBone('head'),pt('right-knuckle')))};
            }
            return {chain,results};
        },{triangles:visibleTriangles(),ids:cards});

        const marks=[['think',0],['leave',.22],['curl',.4],['flick',.44],['follow',.54],['recover',.80],['home',1.2]];
        for(const name of cards){
            for(const [tag,t] of (name==='guard' ? marks : [['flick',.44]])){
                await page.evaluate(([n,t])=>quarterSample(n+'-flick',t),[name,t]);
                await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
                await page.screenshot({path:path.join(output,name+'-'+tag+'.png'),clip:{x:0,y:0,width:1080,height:582}});
            }
        }
        // Capture the same two remaining card backs as the reported idle,
        // at native resolution for comparison with the user's enlarged crop.
        await page.setViewportSize({width:2160,height:1350});
        await page.evaluate(()=>quarterSample('think-without-guard',0));
        await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        await page.screenshot({path:path.join(output,'body-review.png'),clip:{x:0,y:0,width:2160,height:1164}});
        await page.setViewportSize({width:1440,height:900});
        const registrationIndex=process.argv.indexOf('--crop-registration');
        if(registrationIndex>=0){
            const reg=JSON.parse(fs.readFileSync(process.argv[registrationIndex+1],'utf8').replace(/^\uFEFF/,''));
            const [width,height]=reg.targetSize;
            assert.ok(width<=1440 && height<=900 && width>0 && height>0);
            const clip={x:Math.floor((1440-width)/2),y:Math.floor((900-height)/2),width,height};
            // Draw at the reported screenshot's pixel scale. Scaling a small
            // finished screenshot would soften the glove seams and boot soles.
            const previous=await page.evaluate(({reg,clip})=>{
                const n=review3q.node,p=n.position,z=n.scale;
                const previous=[p.x,p.y,p.z,z.x,z.y,z.z,n.angle];
                const [[a,b,tx],[c,d,ty]]=reg.matrix;
                const f=reg.sourceViewport[0]/1440;
                const originX=clip.x+tx+a*720*f+b*450*f;
                const originY=clip.y+ty+c*720*f+d*450*f;
                const scale=f*Math.hypot(a,c);
                n.setScale(scale,scale,1);n.angle=-Math.atan2(c,a)*180/Math.PI;
                n.setPosition(originX-720,450-originY,0);
                quarterSample('think-without-guard',0);
                return previous;
            },{reg,clip});
            await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
            await page.screenshot({path:path.join(output,'body-crop-native.png'),clip});
            const revision=JSON.parse(fs.readFileSync(path.join(art,'export-check.json'),'utf8')).projectSha256;
            fs.writeFileSync(path.join(output,'body-crop-register.json'),JSON.stringify({...reg,revision},null,2)+'\n');
            await page.evaluate(v=>{
                const n=review3q.node;n.setPosition(v[0],v[1],v[2]);n.setScale(v[3],v[4],v[5]);n.angle=v[6];
            },previous);
        }
        await page.evaluate(()=>{const n=review3q.skeleton.node;n.setPosition(-160,-751,0);n.setScale(2.65,2.65,1);});
        for(const [file,t] of [['cheek-rest',0],['wrist-flick',.44]]){
            await page.evaluate(t=>quarterSample('guard-flick',t),t);
            await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
            await page.screenshot({path:path.join(output,file+'.png'),clip:{x:365,y:23,width:708,height:616}});
        }
        // Render the same native idle on two solid backgrounds. The pair lets
        // the source comparison preserve the silhouette and partial coverage.
        await page.setViewportSize({width:1440,height:900});
        await page.evaluate(()=>{
            quarterSample('think',0);
                    const s=review3q.skeleton;
            for(const node of review3q.node.children)node.active=node===s.node;
            for(const id of ['lantern','guard','repel'])s.findSlot('float-'+id).setAttachment(null);
            s.node.setPosition(-78,-420,0);s.node.setScale(1.9,1.9,1);
        });
        for(const [label,value] of [['black',0],['white',255]]){
            await page.evaluate(v=>{
                for(const cam of cc.director.getScene().getComponentsInChildren('cc.Camera')){
                    cam.clearColor=new cc.Color(v,v,v,255);cam.clearFlags=7;
                }
            },value);
            await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
            await page.screenshot({path:path.join(output,'comparison-'+label+'.png')});
        }
        // Inspect the bound portrait itself at reading size. Use the same
        // actual native attachment with the hand away from the chin.
        await page.evaluate(()=>{
            quarterSample('think',0);
            const s=review3q.skeleton,slot=s.findSlot('q-face-art'),head=slot.getAttachment();
            const v=new Float32Array(head.worldVerticesLength);
            head.computeWorldVertices(slot,0,v.length,v,0,2);
            const xs=[],ys=[];
            for(let i=0;i<v.length;i+=2){xs.push(v[i]);ys.push(v[i+1]);}
            const low=Math.min(...ys),high=Math.max(...ys),k=585/(high-low);
            s.node.setScale(k,k,1);
            s.node.setPosition(-k*(Math.min(...xs)+Math.max(...xs))/2,-k*(low+high)/2,0);
            for(const item of s._skeleton.slots)if(item!==slot && item.data.name!=='q-face-art')item.setAttachment(null);
            for(const cam of cc.director.getScene().getComponentsInChildren('cc.Camera'))cam.clearColor=new cc.Color(148,136,151,255);
        });
        await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        await page.screenshot({path:path.join(output,'face-native.png'),clip:{x:467,y:145,width:506,height:615}});
        const report={setup,inputs,initialIdleSeconds:3.22,halfSpeedElapsedMs:halfMs,pauseDelta:frozen-freeze,
            interactions,recordingBytes:recording.length,errors,...result};
        fs.writeFileSync(path.join(output,'runtime-check.json'),JSON.stringify(report,null,2)+'\n');
        console.log(JSON.stringify(report));
        assert.deepEqual(errors,[]);
        assert.ok(result.chain.includes('near-hand')&&result.chain.includes('near-sleeve'));
        for(const entry of Object.values(result.results)){
            assert.ok(entry.contact.gap<1.5 && entry.contact.rightTravel>55 && entry.worstHandDistance>60);
            assert.ok(entry.leftTravel<entry.contact.rightTravel*.65 && entry.returnRightKnuckle<.15);
            assert.ok(entry.footDrift<.18 && entry.soleAngle<.12 && entry.shinSwing<2.5);
            assert.ok(Math.max(entry.maxKnee,entry.farKneeTravel)<3.8 && entry.shoulderChange>6);
            assert.ok(entry.faceLocalDrift<.02 && entry.beforeContactDrift<.18);
            const speed=entry.releaseVelocity;
            assert.ok(speed.incoming>500 && Math.abs(speed.outgoing/speed.incoming-1)<.30);
            assert.ok(entry.otherMotion<.001 && entry.offscreen);
            assert.equal(Object.keys(entry.foldedTriangles).length,0,JSON.stringify(entry.worstFrame));
        }
    } finally {
        if(browser)await browser.close();
        await new Promise(done=>server.close(done));
    }
}

main().catch(error=>{console.error(error.stack);process.exitCode=1;});
