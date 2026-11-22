// Capture the actual Cocos scene, including its imported skin and 3D camera. --serve is the review entry point.
const fs=require('node:fs');
const path=require('node:path');
const {once}=require('node:events');
const {spawn}=require('node:child_process');
const {servePreview}=require('../serve-preview.cjs');
const root=path.resolve(__dirname,'../..');
const directory=path.join(root,'build/survivor-toon');
const output=process.env.SURVIVOR_CAPTURE||path.join(root,'art-source/ashen-labyrinth/battle-survivor/toon/preview');
const serve=port=>servePreview({directory,port,label:'主角三渲二动作预览'});

async function run(){
    const packages=process.env.SURVIVOR_NODE_MODULES;
    const from=n=>require(packages?path.join(packages,n):n);
    const {chromium}=from('playwright'),sharp=from('sharp');
    const server=serve(0);await once(server,'listening');fs.mkdirSync(output,{recursive:true});
    let browser;
    try{
        browser=await chromium.launch({headless:true,executablePath:process.env.SURVIVOR_CHROME||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
        const page=await browser.newPage({viewport:{width:1080,height:675},deviceScaleFactor:1});
        const errors=[],messages=[];
        page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(messages.length<100)messages.push([m.type(),m.text()]);});
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
        try{await page.waitForFunction(()=>globalThis.cc?.director?.getScene()?.getComponentsInChildren('SurvivorToonReview')?.[0]?.activeClip,null,{timeout:32000});}
        catch(err){await page.screenshot({path:path.join(output,'load-error.png')});throw Error(err.message+' '+JSON.stringify({errors,messages}).slice(0,5800));}
        const setup=await page.evaluate(()=>{
            const c=globalThis.review=cc.director.getScene().getComponentsInChildren('SurvivorToonReview')[0];
            const renderers=c.actor.getComponentsInChildren('cc.MeshRenderer').map(x=>{
                const paint=x.getSharedMaterial(0)?.getProperty('mainTexture');
                return {name:x.node.name,skin:!!x.skeleton,texture:paint?[paint.width,paint.height]:null};
            });
            return {scene:cc.director.getScene().name,clips:c.animation.clips.map(x=>x.name),renderers,view:c.camera3d.camera.width};
        });console.log(JSON.stringify(setup));
        const expected=['YouthPortrait','SculptedHair','WovenCostume','TravelEquipment','BootsAndTrousers','ArticulatedHands'];
        if(expected.some(name=>!setup.renderers.find(x=>x.name===name&&x.skin))||setup.renderers.some(x=>!x.texture||x.texture[0]<128))throw Error('An imported 3D surface is missing skin or paint');
        await page.waitForFunction(()=>review.activeClip==='Think');
        const watch = page.evaluate(()=>new Promise(resolve=>{
            const launch=review.floating[1].worldPosition.clone();let distance=0,playing=false;
            const sample=()=>{
                if(review.activeClip==='FlickGuard')playing=true;
                if(playing)distance=Math.max(distance,Math.hypot(review.floating[1].worldPosition.x-launch.x,review.floating[1].worldPosition.y-launch.y));
                if(playing&&review.activeClip==='Think')resolve(distance);else requestAnimationFrame(sample);
            };sample();
        }));
        await page.keyboard.press('2');
        const realThrow=await Promise.race([watch,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Natural playback failed to return to idle')),15000);timer.unref();})]);
        if(realThrow<.32)throw Error('Selected card did not leave the hand area during actual playback');
        const frame=async(clip,t,angle=0,full=false)=>{
            await page.evaluate(([c,t,a,f])=>{review.reviewPose(c,t,a,f);return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},[clip,t,angle,full]);
        };
        const clickControl=async name=>{
            const at=await page.evaluate(n=>{
                const cam=cc.director.getScene().getComponentsInChildren('cc.Camera').find(x=>x.node.name==='Camera');
                const pos=cam.worldToScreen(review.node.getChildByName(n).worldPosition),canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();
                return [rect.left+pos.x*rect.width/canvas.width,rect.bottom-pos.y*rect.height/canvas.height];
            },name);
            await page.mouse.click(...at);
        };
        await clickControl('Pose');await page.waitForFunction(()=>review.activeClip==='Stand'&&review.full);
        await clickControl('Finish');await page.waitForFunction(()=>review.clay);
        await page.mouse.move(850,270);await page.mouse.down();await page.mouse.move(265,270,{steps:8});await page.mouse.up();
        const dragDegrees=await page.evaluate(()=>review.requestedAngle);if(Math.abs(dragDegrees)<160)throw Error('Model orbit is restricted');
        await frame('Stand',.48,-22,false);await page.screenshot({path:path.join(output,'clay.png')});
        await clickControl('Finish');
        for(const [file,angle,full] of [['stand-front',30,true],['stand-side',-60,true],['stand-back',-150,true],['stand-close',0,false]]){
            await frame('Stand',.48,angle,full);await page.screenshot({path:path.join(output,file+'.png')});
        }
        for(const [file,clip,t,yaw,full] of [['think','Think',.48,0,false],['profile','Think',.48,-25,false],['release','FlickGuard',.44,0,false],['follow','FlickRepel',.54,-17,false],['full','Think',.48,12,true]]){
            await frame(clip,t,yaw,full);await page.screenshot({path:path.join(output,file+'.png')});
        }
        if(process.argv.includes('--inspect')){
            for(const [name,angle] of [['front',30],['right-side',-60],['back',-150]]){
                await frame('Think',.48,angle,false);await page.screenshot({path:path.join(output,name+'.png')});
            }
            console.log(JSON.stringify({errors,messages:messages.filter(x=>x[0]==='warning').slice(-15)}));return;
        }
        const input=[];
        for(const [i,card] of ['Lantern','Guard','Repel'].entries()){
            await frame('Think',.1,[0,-25,23][i]);
            const pt=await page.evaluate(i=>{const c=review.camera3d.worldToScreen(review.floating[i].worldPosition);const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();return [r.left+c.x*r.width/canvas.width,r.bottom-c.y*r.height/canvas.height];},i);
            await page.mouse.click(...pt);
            const clip=await page.evaluate(()=>review.activeClip);if(clip!=='Flick'+card)throw Error(`Card ${card} at ${pt} played ${clip}`);
            await frame(clip,.44,[0,-25,23][i]);
            const contacts=await page.evaluate(i=>{
                function node(a,n){if(a.name===n)return a;for(const c of a.children){const hit=node(c,n);if(hit)return hit;}}
                const fingertip=node(review.actor,'RIndexTip').worldPosition;
                const target=new cc.Vec3();cc.Vec3.transformMat4(target,new cc.Vec3(-26/800,-17/800,2.3/800),review.floating[i].worldMatrix);
                return {distancePx:cc.Vec3.distance(fingertip,target)*800,positions:review.floating.map(x=>[x.worldPosition.x,x.worldPosition.y,x.worldPosition.z])};
            },i);
            if(contacts.distancePx>2.2)throw Error(`Contact ${card}: ${contacts.distancePx} px`);
            await frame(clip,.56,[0,-25,23][i]);
            const distances=await page.evaluate(p=>review.floating.map((c,i)=>cc.Vec3.distance(c.worldPosition,new cc.Vec3(...p[i]))),contacts.positions);
            if(distances[i]<.14||distances.some((v,j)=>j!==i&&v>.006))throw Error('Wrong card launched '+distances);
            input.push({card,clip,contactPixels:contacts.distancePx,displacementMetres:distances});
        }
        // Render a short game-speed sequence from the same imported clips; turn while thinking.
        const fps=24,count=166,width=720,height=450,frames=[];
        const encoder=process.env.SURVIVOR_FFMPEG?spawn(process.env.SURVIVOR_FFMPEG,['-y','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','pipe:0','-an','-c:v','libvpx','-b:v','2300k','-pix_fmt','yuv420p',path.join(output,'survivor-toon.webm')],{windowsHide:true,stdio:['pipe','ignore','pipe']}):null;
        let encoderError='';if(encoder)encoder.stderr.on('data',d=>encoderError=(encoderError+d).slice(-900));
        const encoded=encoder?once(encoder,'exit'):null;
        for(let i=0;i<count;i++){
            const t=i/fps;
            let clip='Think',time=t,angle=0,full=false;
            if(t<2.65){clip='Stand';full=true;const u=Math.min(1,Math.max(0,(t-.1)/2.43));angle=30-180*u*u*(3-2*u);}
            else if(t<3.25){clip='Fan';time=t-2.65;}
            else if(t<4.40){time=t-3.25;angle=-19*Math.sin(Math.PI*time/1.15)**2;}
            else if(t<5.60){clip='FlickGuard';time=t-4.40;}
            else if(t<5.74){time=t-5.60;}
            else{clip='FlickRepel';time=Math.min(1.2,t-5.74);angle=-12*Math.sin(Math.PI*time/1.2)**2;}
            await frame(clip,time,angle,full);
            const png=await page.screenshot();if(encoder){const jpeg=await sharp(png).jpeg({quality:90}).toBuffer();if(!encoder.stdin.write(jpeg))await once(encoder.stdin,'drain');}
            frames.push(await sharp(png).resize(width,height).removeAlpha().raw().toBuffer());
        }
        if(encoder){encoder.stdin.end();const [exit]=await encoded;if(exit)throw Error(encoderError);}
        const delay=frames.map((_,i)=>(Math.round((i+1)*100/fps)-Math.round(i*100/fps))*10);
        await sharp(Buffer.concat(frames),{raw:{width,height:height*count,pageHeight:height,channels:3}}).gif({loop:0,delay,colours:240,effort:5,dither:.3}).toFile(path.join(output,'survivor-toon.gif'));
        const evidence={...setup,input,realTimeGuardTravelMetres:realThrow,studio:{dragDegrees,pose:'Stand',clay:true,views:[30,-60,-150]},errors,frames:count,fps,aspect:[1080,675]};
        fs.writeFileSync(path.join(output,'runtime-check.json'),JSON.stringify(evidence,null,2)+'\n');
        if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify(input));
    }finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
}
if(process.argv.includes('--serve'))serve(Number(process.env.PORT||7484));else run().catch(e=>{console.error(e.stack);process.exitCode=1;});
