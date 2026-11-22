const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { servePreview } = require('../serve-preview.cjs');
const root = path.resolve(__dirname,'../..');
const directory = path.join(root,'build/survivor-frames');
const evidence = path.join(root,'art-source/ashen-labyrinth/battle-survivor/frames/preview');
const film = path.join(root,'temp/survivor-frames/film');
const names = ['Lantern','Guard','Repel'];
const serve = port => servePreview({directory,port,label:'主角逐帧动画'});

async function verify() {
    const modules = process.env.SURVIVOR_NODE_MODULES;
    const {chromium} = require(modules ? path.join(modules,'playwright') : 'playwright');
    fs.mkdirSync(evidence,{recursive:true});
    const server = serve(0);
    await once(server,'listening');
    let browser;
    try {
        browser = await chromium.launch({headless:true,executablePath:process.env.SURVIVOR_CHROME || undefined,
            args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
        const page = await browser.newPage({viewport:{width:1080,height:675},deviceScaleFactor:1});
        const errors = [];
        page.on('pageerror',error=>errors.push(error.message));
        page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
        await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
        try {
            await page.waitForFunction(()=>globalThis.cc?.director?.getScene()?.getComponentsInChildren('SurvivorFramePlayer')[0]?.activeClip==='Think',null,{timeout:45000});
        } catch(e) {
            await page.screenshot({path:path.join(root,'temp/survivor-frames/startup.png')});
            throw Error(e.message+' '+errors.join(' | '));
        }
        const initial = await page.evaluate(() => {
            const scene=cc.director.getScene();
            const review=scene.getComponentsInChildren('SurvivorFrameReview')[0], p=review.player;
            const ids=['Lantern','Guard','Repel'];
            const a=p.node.getComponent('cc.Animation');
            const faces=ids.map(name=>p.node.getChildByPath(name+'/Face'));
            const body=p.node.getChildByName('Body').getComponent('cc.Sprite');
            const events=[]; p.node.on('card-release',index=>events.push(index));
            const h=globalThis.celQA={review,p,a,faces,body,events};
            h.pos=()=>faces.map(n=>[n.position.x,n.position.y]);
            h.pick=n=>{
                const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();
                const world=n.getWorldPosition(),size=cc.view.getVisibleSize();
                return [r.left+world.x/size.width*r.width,r.bottom-world.y/size.height*r.height];
            };
            h.sample=(name,time)=>{
                p.setPaused(true);
                if(p.activeClip!==name){p.activeClip=name; a.play(name); a.pause();}
                const s=a.getState(name);
                s.time=time; s.sample();
            };
            return {scene:scene.name,engine:cc.ENGINE_VERSION||cc.VERSION,clips:a.clips.map(c=>[c.name,c.duration]),
                textures:[body.spriteFrame,faces[0].getComponent('cc.Sprite').spriteFrame].map(f=>[f.texture.width,f.texture.height])};
        });
        await page.screenshot({path:path.join(evidence,'full.png')});
        if(process.argv.includes('--probe')) { console.log(JSON.stringify({initial,errors})); return; }
        const receipt = [];
        for(let i=0;i<3;i++) {
            const click = await page.evaluate(i=>celQA.pick(celQA.faces[i]),i);
            await page.mouse.click(...click);
            await page.waitForFunction(n=>celQA.p.activeClip==='Flick'+n,names[i],{timeout:3000});
            await page.waitForFunction(()=>celQA.p.activeClip==='Think',null,{timeout:6000});
            const after=await page.evaluate(()=>({events:celQA.events.slice(),active:celQA.faces.map(n=>n.parent.active)}));
            assert.deepEqual(after.events,Array.from({length:i+1},(_,j)=>j));
            assert.deepEqual(after.active,names.map((_,j)=>j>i));
            receipt.push({name:names[i],click,...after});
        }
        await page.keyboard.press('r');
        await page.waitForFunction(()=>celQA.p.activeClip==='Think' && celQA.faces.every(n=>n.parent.active));
        await page.keyboard.press('2');
        await page.waitForFunction(()=>celQA.p.activeClip==='FlickGuard');
        await page.keyboard.press('Space');
        const t0=await page.evaluate(()=>celQA.a.getState(celQA.p.activeClip).time);
        await page.waitForTimeout(170);
        const t1=await page.evaluate(()=>celQA.a.getState(celQA.p.activeClip).time);
        assert.equal(t0,t1);
        await page.keyboard.press('Space');
        await page.waitForFunction(()=>celQA.p.activeClip==='Think');
        await page.setViewportSize({width:1024,height:768});
        const speedBtn=await page.evaluate(()=>celQA.pick(celQA.review.node.getChildByPath('Controls/Speed')));
        await page.mouse.click(...speedBtn);
        assert.equal(await page.evaluate(()=>celQA.p.rate),.5);
        await page.keyboard.press('v');
        await page.screenshot({path:path.join(evidence,'gesture.png')});
        await page.keyboard.press('v');
        await page.setViewportSize({width:1080,height:675});

        const contactChecks=await page.evaluate(({names,tips})=>{
            const h=celQA, result=[];
            const actor=h.body.node.getComponent('cc.UITransform');
            function corners(node) {
                const ui=node.getComponent('cc.UITransform'), w=ui.width/2, y=ui.height/2;
                return [[-w,-y],[w,-y],[w,y],[-w,y]].map(([x,y])=>ui.convertToWorldSpaceAR(new cc.Vec3(x,y,0)));
            }
            function overlaps(a,b) {
                // Separate the projected quadrilaterals on their edge normals.
                for (const shape of [a,b]) for (let k=0;k<2;k++) {
                    const x=shape[k].y-shape[k+1].y, y=shape[k+1].x-shape[k].x;
                    const p=a.map(v=>v.x*x+v.y*y), q=b.map(v=>v.x*x+v.y*y);
                    if(Math.max(...p)<=Math.min(...q)||Math.max(...q)<=Math.min(...p)) return false;
                }
                return true;
            }
            for(let i=0;i<3;i++){
                h.faces.forEach(n=>n.parent.active=true);
                h.sample('Flick'+names[i],.44);
                const frameName=h.body.spriteFrame.name, pre=h.pos();
                const [x,y]=tips[['touch-low','touch-middle','touch-high'][i]];
                const tipWorld=actor.convertToWorldSpaceAR(new cc.Vec3(x-256,472-y,0));
                const ui=h.faces[i].getComponent('cc.UITransform');
                const tip=ui.convertToNodeSpaceAR(tipWorld);
                const inside=Math.abs(tip.x)<ui.width/2 && Math.abs(tip.y)<ui.height/2;
                h.sample('Flick'+names[i],.56);
                const post=h.pos();
                const overlapFrames=[];
                for(let frame=11;frame<=21;frame++){
                    h.sample('Flick'+names[i],frame/25);
                    const picked=corners(h.faces[i]);
                    if(h.faces.some((other,j)=>i!==j && overlaps(picked,corners(other)))) overlapFrames.push(frame);
                }
                result.push({name:names[i],frameName,inside,tipOnCard:[+tip.x.toFixed(2),+tip.y.toFixed(2)],
                    overlapFrames,travelled:pre.map((p,j)=>+Math.hypot(p[0]-post[j][0],p[1]-post[j][1]).toFixed(2))});
            }
            return result;
        },{names,tips:JSON.parse(fs.readFileSync(path.join(evidence,'../registration.json'))).fingers});
        for(const [i,c] of contactChecks.entries()){
            assert(c.inside,c.name+' fingertip missed');
            assert.equal(c.frameName,['touch-low','touch-middle','touch-high'][i]);
            assert(c.travelled[i]>85);
            assert(c.travelled.every((v,j)=>i===j||v<.01));
            assert.deepEqual(c.overlapFrames,[],c.name+' crossed another card');
        }
        const report={...initial,cardClicks:receipt,contacts:contactChecks,pauseTimeDelta:t1-t0,halfSpeed:true,
            smallerViewport:[1024,768],errors};
        if(!process.argv.includes('--checks-only')){
            fs.mkdirSync(film,{recursive:true});
            // The film samples the same imported AnimationStates at 25 Hz. Each
            // section keeps its actual duration; spent cards remain hidden.
            const segments=[['Fan',16,0],['Think',85,0],['FlickLantern',30,0],['Think',9,1],
                ['FlickGuard',30,1],['Think',9,3],['FlickRepel',30,3],['Think',12,7]];
            let index=0;
            for(const [name,count,mask] of segments){
                for(let k=0;k<count;k++){
                    await page.evaluate(async ({name,k,mask})=>{
                        const h=celQA; h.review.node.getChildByName('Controls').active=false;
                        h.faces.forEach((n,j)=>{n.parent.active=!(mask & (1<<j));});
                        h.sample(name,k/25);
                        await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
                    },{name,k,mask});
                    await page.screenshot({path:path.join(film,String(index++).padStart(3,'0')+'.png'),clip:{x:295,y:25,width:650,height:606}});
                }
            }
            report.film={frames:index,fps:25,duration:index/25,source:'Cocos Web Desktop AnimationState samples'};
        }
        assert.deepEqual(errors,[]);
        fs.writeFileSync(path.join(evidence,'runtime-check.json'),JSON.stringify(report,null,2)+'\n');
        console.log(JSON.stringify(report));
    } finally {
        if(browser) await browser.close();
        await new Promise(done=>server.close(done));
    }
}
if(process.argv.includes('--serve')) serve(Number(process.env.PORT || 7487));
else verify().catch(e=>{console.error(e);process.exitCode=1;});
