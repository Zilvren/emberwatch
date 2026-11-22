const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { servePreview } = require('../serve-preview.cjs');
const { PNG } = require('./bestiary-assets.cjs');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'output/playwright/survivor-golden');
const rig = path.join(root,'art-source/ashen-labyrinth/battle-survivor/spine-flick-golden');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', {
    paths:[root, path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')],
}));
const crop = { x:187, y:32, width:752, height:504 };
const cards = ['lantern', 'guard', 'repel'];
const groups = {
    right:['q-near-knuckles-art','q-near-fist-art'], left:['q-left-cup'],
    rightFore:['q-near-arm-art'], leftFore:['q-left-wrap'],
    rightUpper:['q-near-upper-art','q-near-under-sleeve'], leftUpper:['q-left-upper-art'], face:['q-face-art'],
    neckline:['q-face-art','q-head-art','q-tunic-art','q-mantle-art','q-near-mantle-art'],
    ...Object.fromEntries(cards.map(n=>[n,['float-'+n]])),
};

function ink(png, skinOnly) {
    const {data,width,height}=PNG.sync.read(png), mask=new Uint8Array(width*height);
    for(let i=0;i<mask.length;i++){
        const j=4*i,r=data[j],g=data[j+1],b=data[j+2];
        mask[i]=skinOnly ? +(r>75 && r-g>18 && g-b>8) : +(Math.max(r,g,b)>25);
    }
    return mask;
}
function overlap(a,b){
    let n=0;
    for(let i=0;i<a.length;i++)if(a[i]&&b[i])n++;
    return n;
}
function visibleCoverage(full,hidden,hand){
    const a=PNG.sync.read(full).data,b=PNG.sync.read(hidden).data;
    let total=0,exposed=0;
    for(let i=0;i<hand.length;i++)if(hand[i]){
        total++;
        const j=4*i;
        if(Math.max(Math.abs(a[j]-b[j]),Math.abs(a[j+1]-b[j+1]),Math.abs(a[j+2]-b[j+2]))>=5)exposed++;
    }
    return {total,exposed,fraction:exposed/Math.max(total,1)};
}
function pixelsInRegion(mask,vertices){
    const p=vertices.map(([x,y])=>[x-crop.x,y-crop.y]);
    const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]);
    let count=0;
    for(let y=Math.max(0,Math.floor(Math.min(...ys)));y<=Math.min(crop.height-1,Math.ceil(Math.max(...ys)));y++){
        for(let x=Math.max(0,Math.floor(Math.min(...xs)));x<=Math.min(crop.width-1,Math.ceil(Math.max(...xs)));x++){
            if(!mask[y*crop.width+x])continue;
            let inside=false;
            for(let i=0,j=p.length-1;i<p.length;j=i++){
                const [a,b]=p[i],[c,d]=p[j];
                if((b>y+.5)!==(d>y+.5) && x+.5<(c-a)*(y+.5-b)/(d-b)+a)inside=!inside;
            }
            if(inside)count++;
        }
    }
    return count;
}
function gap(a,b){
    if(overlap(a,b))return 0;
    const edge=m=>{
        const result=[];
        for(let i=0;i<m.length;i++)if(m[i]&&(!m[i-1]||!m[i+1]||!m[i-crop.width]||!m[i+crop.width])){
            result.push([i%crop.width,Math.floor(i/crop.width)]);
        }
        return result;
    };
    const aa=edge(a),bb=edge(b);let nearest=Infinity;
    for(const [x,y] of aa)for(const [u,v] of bb)nearest=Math.min(nearest,(x-u)**2+(y-v)**2);
    return Math.sqrt(nearest);
}
function necklineGap(mask,center){
    const cx=Math.round(center[0])-crop.x,cy=Math.round(center[1])-crop.y;
    let widest=0;
    for(let y=cy+6;y<=cy+23;y++){
        let last=-1;
        for(let x=cx-36;x<=cx+54;x++)if(mask[y*crop.width+x]){
            if(last>=0)widest=Math.max(widest,x-last-1);
            last=x;
        }
    }
    return widest;
}
function lineAcrossNeck(face,clothAndSkin,center){
    const cx=Math.round(center[0])-crop.x,cy=Math.round(center[1])-crop.y;
    let longest=0;
    for(let y=cy-7;y<=cy+1;y++){
        let run=0;
        for(let x=cx-11;x<=cx+17;x++){
            const i=y*crop.width+x;
            run=face[i]&&!clothAndSkin[i]?run+1:0;
            longest=Math.max(longest,run);
        }
    }
    return longest;
}

async function main(){
    fs.mkdirSync(output,{recursive:true});
    const server=servePreview({directory:path.join(root,'build/survivor-flick-golden'),port:0,label:'Painted joints'});
    await once(server,'listening');
    let browser;
    try{
        browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
            args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
        const page=await browser.newPage({viewport:{width:1080,height:675},deviceScaleFactor:1});
        await page.goto('http://127.0.0.1:'+server.address().port);
        await page.waitForFunction(()=>globalThis.cc?.director.getScene()?.getComponentsInChildren('SurvivorFlickSpineReview')?.[0]?.skeleton?.findSlot('q-face-art'));
        const regions=JSON.parse(fs.readFileSync(path.join(rig,'source-reuse.json'),'utf8')).headLocalContactRegions;
        await page.evaluate(({groups,regions})=>{
            const r=cc.director.getScene().getComponentsInChildren('SurvivorFlickSpineReview')[0],s=r.skeleton;
            r.enabled=false;
            for(const node of r.node.children)node.active=node===s.node;
            s.node.setScale(2.30,2.30,1);s.node.setPosition(-118,-632,0);
            globalThis.renderJoint=(id,t,group)=>{
                s.paused=false;s.clearTracks();s.setToSetupPose();
                const e=s.setAnimation(0,id+'-flick',false);e.mixDuration=0;e.trackTime=t;
                s.updateAnimation(0);s._skeleton.updateWorldTransform();s.paused=true;
                if(group==='without-support')s.findSlot('q-left-cup').setAttachment(null);
                else if(group)for(const slot of s._skeleton.slots)if(!groups[group].includes(slot.data.name))slot.setAttachment(null);
            };
            globalThis.headPeg=()=>{
                const bone=s.findBone('head'),w=new cc.Vec3();
                cc.Vec3.transformMat4(w,new cc.Vec3(bone.worldX,bone.worldY,0),s.node.worldMatrix);
                const c=document.querySelector('canvas').getBoundingClientRect(),v=cc.view.getVisibleSize();
                return [c.left+w.x*c.width/v.width,c.bottom-w.y*c.height/v.height];
            };
            globalThis.faceRegions=()=>{
                const b=s.findBone('head'),c=document.querySelector('canvas').getBoundingClientRect(),v=cc.view.getVisibleSize();
                return Object.fromEntries(Object.entries(regions).map(([k,outline])=>[k,outline.map(([x,y])=>{
                    const w=new cc.Vec3();
                    cc.Vec3.transformMat4(w,new cc.Vec3(b.worldX+b.a*x+b.b*y,b.worldY+b.c*x+b.d*y,0),s.node.worldMatrix);
                    return [c.left+w.x*c.width/v.width,c.bottom-w.y*c.height/v.height];
                })]));
            };
        },{groups,regions});
        async function render(id,t,group){
            await page.evaluate(([id,t,g])=>renderJoint(id,t,g),[id,t,group]);
            await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
            return page.screenshot({clip:crop});
        }
        async function supportingHand(t){
            const isolated=await render('guard',t,'left');
            const full=await render('guard',t,''),hidden=await render('guard',t,'without-support');
            return {palm:visibleCoverage(full,hidden,ink(isolated,false)),
                fingertips:visibleCoverage(full,hidden,ink(isolated,true))};
        }
        if(process.argv.includes('--support-only')){
            console.log(JSON.stringify(await supportingHand(0)));
            return;
        }
        const exposedAtRest=await supportingHand(0);
        const results={};
        for(const id of cards){
            const phases=id==='guard' ? [0,.10,.15,.20,.235,.275,.31,.345,.375,.385,.405,.425,.44,.465,.49,.52,.57,.65,.76,.85,.94,1.055,1.2]
                : [0,.15,.235,.31,.375,.385,.415,.44,.465,.52,.65,.78,.91,1.2];
            results[id]=[];
            for(const t of phases){
                const m={};
                for(const g of Object.keys(groups)){
                    if(g==='neckline' && (id!=='guard'||![0,.235,.44,.52,.76,1.2].includes(t)))continue;
                    const pixels=await render(id,t,g);
                    m[g]=ink(pixels,g==='face');
                    if(g==='neckline')m.visibleNeckSkin=ink(pixels,true);
                }
                const sample={t,handToHand:overlap(m.right,m.left),rightOnFace:overlap(m.right,m.face),
                    rightWrist:overlap(m.right,m.rightFore),leftWrist:overlap(m.left,m.leftFore),
                    rightElbow:overlap(m.rightUpper,m.rightFore),leftElbow:overlap(m.leftUpper,m.leftFore),
                    supportingPalm:overlap(m.left,m.rightFore),
                    forearmOverlap:overlap(m.rightFore,m.leftFore),
                    nonselected:Object.fromEntries(cards.filter(n=>n!==id).map(n=>[n,overlap(m.right,m[n])]))};
                const areas=await page.evaluate(()=>faceRegions());
                sample.rightHandOnCheek=pixelsInRegion(m.right,areas.cheek);
                sample.rightHandOnMouth=pixelsInRegion(m.right,areas.mouth);
                sample.rightHandOnEye=pixelsInRegion(m.right,areas.eye);
                if(!sample.rightWrist)sample.rightCuffGap=gap(m.right,m.rightFore);
                if(!sample.leftWrist)sample.leftCuffGap=gap(m.left,m.leftFore);
                if(!sample.rightElbow)sample.rightElbowGap=gap(m.rightUpper,m.rightFore);
                if(!sample.leftElbow)sample.leftElbowGap=gap(m.leftUpper,m.leftFore);
                if(t===0||t===1.2)sample.jawGap=gap(m.right,m.face);
                if(t>=.385&&t<=.44)sample.contactGap=gap(m.right,m[id]);
                if(m.neckline){
                    const peg=await page.evaluate(()=>headPeg());
                    sample.necklineHolePixels=necklineGap(m.neckline,peg);
                    sample.frontClothAcrossJaw=lineAcrossNeck(m.face,m.visibleNeckSkin,peg);
                }
                results[id].push(sample);
                if(id==='guard'&&[0,.235,.345,.385,.44,.52,.76,1.2].includes(t)){
                    fs.writeFileSync(path.join(output,'detail-'+String(t).replace('.','p')+'.png'),await render(id,t,''));
                }
            }
        }
        const samples=Object.values(results).flat();
        const peak=(fn)=>Math.max(...samples.map(fn));
        const summary={samples:samples.length,handToHand:peak(s=>s.handToHand),
            unselected:peak(s=>Math.max(...Object.values(s.nonselected))),
            rightWristGap:peak(s=>s.rightCuffGap??0),leftWristGap:peak(s=>s.leftCuffGap??0),
            rightElbowGap:peak(s=>s.rightElbowGap??0),leftElbowGap:peak(s=>s.leftElbowGap??0),
            jaw:peak(s=>s.jawGap??0),brush:peak(s=>s.contactGap??0),
            necklineHolePixels:peak(s=>s.necklineHolePixels??0),
            frontClothAcrossJaw:peak(s=>s.frontClothAcrossJaw??0),
            supportAtRest:Math.min(...samples.filter(s=>s.t===0||s.t===1.2).map(s=>s.supportingPalm)),
            forearmOverlapAtRelease:Math.max(...samples.filter(s=>s.t===.44).map(s=>s.forearmOverlap)),
            cheekAtRest:Math.min(...samples.filter(s=>s.t===0||s.t===1.2).map(s=>s.rightHandOnCheek)),
            cheekDuringFlick:Math.max(...samples.filter(s=>s.t>=.31&&s.t<=.76).map(s=>s.rightHandOnCheek)),
            mouthOverlap:peak(s=>s.rightHandOnMouth),eyeOverlap:peak(s=>s.rightHandOnEye),
            exposedSupportingHand:exposedAtRest};
        fs.writeFileSync(path.join(output,'hands-check.json'),JSON.stringify({zoom:2.3,crop,summary,results},null,2)+'\n');
        console.log(JSON.stringify(summary));
        assert.equal(summary.handToHand,0);assert.equal(summary.unselected,0);
        assert.equal(summary.forearmOverlapAtRelease,0);
        assert.ok(summary.cheekAtRest>25 && summary.cheekDuringFlick===0);
        assert.equal(summary.mouthOverlap,0);assert.equal(summary.eyeOverlap,0);
        assert.ok(summary.supportAtRest>0 && summary.jaw<2.5 && summary.brush<3.5);
        assert.ok(exposedAtRest.palm.fraction>.78 && exposedAtRest.fingertips.fraction>.78);
        assert.ok(summary.necklineHolePixels<=2);
        assert.ok(summary.frontClothAcrossJaw<=2);
        for(const key of ['rightWristGap','leftWristGap','rightElbowGap','leftElbowGap'])assert.ok(summary[key]<2.1,key);
    }finally{
        if(browser)await browser.close();
        await new Promise(done=>server.close(done));
    }
}
main().catch(err=>{console.error(err.stack);process.exitCode=1;});
