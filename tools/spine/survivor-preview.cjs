const fs=require('node:fs');
const path=require('node:path');
const {once}=require('node:events');
const {spawn}=require('node:child_process');
const {servePreview}=require('../serve-preview.cjs');
const {project,json}=require('./bestiary-assets.cjs');
const {dir}=require('./survivor-battle.cjs');
const {probe,transitions}=require('./survivor-motion-check.cjs');
const build=path.join(project,'build/survivor-spine-review');
const evidence=process.env.SURVIVOR_CAPTURE||path.join(project,'output/playwright/ashen-survivor');
const clips=['idle','prepare','attack','hurt','death'];
const names={idle:'待机',prepare:'取牌',attack:'出牌',hurt:'受击',death:'倒下'};
const pkg=process.env.SURVIVOR_NODE_MODULES;
const stream=()=>servePreview({directory:build,port:Number(process.env.PORT||7483),label:'青年求生者 Spine 动作'});
const marks=[['idle',.75],['prepare',.36],['attack',.265],['attack',.36],['attack',.53],['hurt',.095],['death',.74],['death',1.38]];

async function run(){
  if(!pkg)throw Error('Set SURVIVOR_NODE_MODULES to the local Playwright and sharp package directory.');
  const {chromium}=require(path.join(pkg,'playwright')),sharp=require(path.join(pkg,'sharp'));
  const spec=JSON.parse(fs.readFileSync(path.join(dir,'export-report.json')));
  const draft=process.argv.includes('--authoring'),dest=draft?path.join(evidence,'draft'):path.join(dir,'preview');
  fs.mkdirSync(dest,{recursive:true});fs.mkdirSync(evidence,{recursive:true});
  const server=servePreview({directory:build,port:0,label:'Native survivor capture'});await once(server,'listening');
  let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.SURVIVOR_CHROME||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
    const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error'&&errors.length<20)errors.push(m.text());});
    await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
    try{await page.waitForFunction(()=>globalThis.cc?.director?.getScene()?.getComponentsInChildren('SurvivorSpineReview')?.[0]?.skeleton?.findBone('flight-card'),null,{timeout:55000});}
    catch(e){await page.screenshot({path:path.join(evidence,'load-error.png')});throw Error('Native scene did not mount: '+errors.join(' | ')+' '+e.message);}
    const authoring=draft?JSON.parse(fs.readFileSync(path.join(dir,'survivor.authoring.json'))):null;
    const ctx=await page.evaluate(({names,authoring})=>{
      const c=cc.director.getScene().getComponentsInChildren('SurvivorSpineReview')[0],s=c.skeleton;
      if(authoring){const prev=s.skeletonData,a=new prev.constructor();a._uuid='survivor-local-draft-'+Date.now();a.skeletonJson=authoring;a.atlasText=prev.atlasText;a.textures=prev.textures;a.textureNames=prev.textureNames;s.skeletonData=a;c.playIdle();}
      const select={idle:'playIdle',prepare:'playPrepare',attack:'playAttack',hurt:'playHurt',death:'playDeath'};
      function sample(clip,time){
        c.setReviewClock(true);s.paused=false;s.timeScale=1;s.clearTracks();s.setToSetupPose();
        const entry=s.setAnimation(0,clip,clip==='idle');entry.mixDuration=0;s.updateAnimation(0);
        if(time>0)s.updateAnimation(time);s._skeleton.updateWorldTransform();s.paused=true;
        c.groundShadow();c.status.string='青年求生者  ·  '+names[clip];
      }
      window.__survivorCapture={c,s,select,sample,names};
      return {scene:cc.director.getScene().name,engine:cc.ENGINE_VERSION||cc.VERSION||null,skeleton:s.skeletonData.name,textures:s.skeletonData.textureNames,
        bones:s._skeleton.bones.length,slots:s._skeleton.slots.length,premultipliedAlpha:s.premultipliedAlpha,cache:s.cacheMode};
    },{names,authoring});
    // Drive the real native controls before sampling the rig for the film.
    const buttons=await page.evaluate(()=>{
      const c=__survivorCapture.c,root=c.node;
      return ['Idle','Prepare','Attack','Hurt','Death','Sequence','Speed','Pause'].map(name=>{
        const n=root.getChildByName(name),r=n.getComponent('cc.UITransform').getBoundingBoxToWorld();
        const size=cc.view.getVisibleSize();return {name,x:960*(r.x+r.width/2)/size.width,y:600*(1-(r.y+r.height/2)/size.height)};
      });
    });
    const input=[];
    for(const b of buttons){
      await page.mouse.click(b.x,b.y);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
      const state=await page.evaluate(()=>{const {c,s}=__survivorCapture;return {clip:s.getCurrent(0)?.animation?.name,speed:c.speedCaption.string,paused:s.paused,status:c.status.string};});
      input.push({button:b.name,...state});
    }
    const audit=await page.evaluate(({clips,spec})=>{
      const {c,s,select,sample}=__survivorCapture,result={};
      c.toggleSpeed(); // restore normal speed after the explicit half-speed button check
      c.playIdle();c.setReviewClock(true);
      const end=b=>[b.worldX+b.a*b.data.length,b.worldY+b.c*b.data.length];
      const points=()=>s._skeleton.bones.flatMap(b=>[b.worldX,b.worldY,...end(b)]);
      const delta=(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));
      for(const name of clips){
        const times=[],d=spec.clips[name];let complete=0,motion=0,ikError=0,soleDrift=0;
        s.setEventListener((_track,e)=>times.push([e.data.name,e.time]));
        s.setCompleteListener(()=>complete++);
        s.paused=false;s.timeScale=1;s.clearTracks();s.setToSetupPose();
        const entry=s.setAnimation(0,name,name==='idle');entry.mixDuration=0;s.updateAnimation(0);s._skeleton.updateWorldTransform();
        const start=points(),bones=['near-boot','far-boot'].map(n=>s.findBone(n)),feet=bones.map(b=>[b.worldX,b.worldY]);
        const steps=Math.ceil(d*80);
        for(let i=0;i<steps;i++){
          s.updateAnimation(d/steps);s._skeleton.updateWorldTransform();
          const p=points();if(p.some(x=>!Number.isFinite(x)))throw Error('Invalid transform '+name);
          motion=Math.max(motion,delta(start,p));
          for(const [j,id] of ['near','far'].entries()){
            const target=s.findBone(id+'-plant'),tip=end(s.findBone(id+'-shin'));
            ikError=Math.max(ikError,Math.hypot(tip[0]-target.worldX,tip[1]-target.worldY));
            if(name!=='death')soleDrift=Math.max(soleDrift,Math.hypot(bones[j].worldX-feet[j][0],bones[j].worldY-feet[j][1]));
          }
        }
        const last=points();s.updateAnimation(.09);s._skeleton.updateWorldTransform();
        result[name]={duration:d,events:times,completes:complete,travel:motion,loopDelta:delta(start,last),terminalDrift:delta(last,points()),ikError,soleDrift};
      }
      s.setEventListener(null);s.setCompleteListener(null);
      const visible=(slot)=>Boolean(s.findSlot(slot).getAttachment());
      sample('attack',.352);const before=[visible('held-card'),visible('flight-card')];
      sample('attack',.36);const after=[visible('held-card'),visible('flight-card')];
      const h=s.findBone('held-card'),f=s.findBone('flight-card'),a=s.skeletonData.skeletonJson.skins[0].attachments['held-card'].card;
      const handoff=Math.hypot(h.worldX+h.a*(a.x||0)+h.b*(a.y||0)-f.worldX,h.worldY+h.c*(a.x||0)+h.d*(a.y||0)-f.worldY);
      sample('attack',.70);const afterHit=[visible('held-card'),visible('flight-card')];
      sample('attack',1.09);const rearmed=[visible('held-card'),visible('flight-card')];
      const mesh={};for(const n of ['mantle','back-flap','coat-skirt']){
        sample('idle',0);const slot=s.findSlot(n),a=slot.getAttachment(),v=new Float32Array(a.worldVerticesLength),w=new Float32Array(a.worldVerticesLength);
        a.computeWorldVertices(slot,0,v.length,v,0,2);sample('attack',.52);a.computeWorldVertices(slot,0,w.length,w,0,2);
        mesh[n]={vertices:v.length/2,moved:delta([...v],[...w])};
      }
      return {tracks:result,card:{before,after,afterHit,rearmed,handoff},mesh};
    },{clips,spec});
    async function frame(clip,t,file){
      await page.evaluate(([name,time])=>{__survivorCapture.sample(name,time);},[clip,t]);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      return page.screenshot({type:'png',...(file?{path:file}:{})});
    }
    const selected=[];
    for(let i=0;i<marks.length;i++){
      const [n,t]=marks[i],f=path.join(evidence,String(i+1)+'-'+n+'.png');
      await frame(n,t,f);selected.push(f);
    }
    const mechanics=await probe(page,dir,{authoring:draft}),stress=await transitions(page);
    const record={context:ctx,inputs:input,...audit,mechanics,stress,errors};
    json(path.join(evidence,'runtime-check.json'),record);console.log(JSON.stringify({tracks:audit.tracks,card:audit.card,ground:mechanics.death.low,stress,errors}));
    const poses=await Promise.all(selected.map(async(f,i)=>({input:await sharp(f).extract({left:82,top:12,width:722,height:504}).resize(300,200,{fit:'contain',background:'#302935'}).png().toBuffer(),left:(i%4)*300,top:Math.floor(i/4)*225})));
    const captions=['待机','取牌','蓄势','离手','飞行','受击','失衡','落地'];
    const labels=captions.map((caption,i)=>'<text x="'+((i%4)*300+150)+'" y="'+(Math.floor(i/4)*225+218)+'">'+caption+'</text>').join('');
    poses.push({input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="450"><g font-family="Microsoft YaHei,sans-serif" font-size="16" fill="#e8dccc" text-anchor="middle">'+labels+'</g></svg>'),left:0,top:0});
    await sharp({create:{width:1200,height:450,channels:3,background:'#302935'}}).composite(poses).png().toFile(path.join(dest,'motion-poses.png'));
    fs.copyFileSync(selected[0],path.join(dest,'battle-ready.png'));
    if(errors.length||ctx.scene!=='SurvivorSpineReview'||ctx.bones!==spec.bones||ctx.slots!==spec.slots||ctx.textures.length!==spec.atlasPages.length)throw Error('Native scene/asset validation failed.');
    for(const name of clips){const tr=audit.tracks[name];
      if(tr.travel<1||tr.completes<1||tr.ikError>1.35||tr.soleDrift>.15)throw Error('Motion/foot validation failed: '+name);
      if(name==='idle'&&tr.loopDelta>.25||name==='death'&&tr.terminalDrift>.25)throw Error('Loop/terminal hold failed: '+name);
      if(tr.events.map(a=>a[0]).join(',')!==(name==='attack'?'release,impact':''))throw Error('Wrong gameplay events: '+name);
    }
    if(audit.card.handoff>.25||String(audit.card.before)!=='true,false'||String(audit.card.after)!=='false,true'||String(audit.card.afterHit)!=='false,false'||String(audit.card.rearmed)!=='false,false')throw Error('Card hand-off failed.');
    if(!Object.values(audit.mesh).every(m=>m.vertices===10&&m.moved>1))throw Error('Cloth mesh check failed.');
    if(input.slice(0,5).some((v,i)=>v.clip!==clips[i])||input[5].clip!=='idle'||!input[6].speed.includes('0.5')||!input[7].paused)throw Error('Native input validation failed.');
    if(mechanics.release.speedChange>45||mechanics.draw.caseDistance>4||mechanics.death.low.y<-.9)throw Error('Release, draw, or floor contact failed.');
    if(stress.join.finger>.8||stress.join.head>.45||Math.abs(stress.join.entryTime-.22)>.002||String(stress.repeat.events)!=='release,impact,release,impact'||stress.repeat.end!=='idle')throw Error('Continuous card play failed.');
    if(stress.early.finger>1||stress.early.head>.5||!stress.early.cardCarried||!stress.early.returned||stress.early.events.length||!stress.late.inFlight||stress.late.offset>1.5||!stress.late.finished||String(stress.late.events)!=='release')throw Error('Interrupted card play failed.');
    if(Math.abs(stress.half-.1)>.015||stress.pauseDelta>.001||!stress.restart.startsInOldPose||!stress.restart.restored)throw Error('Pause, speed or restart failed.');
    if(!process.argv.includes('--film'))return;
    // Start the actual scene again. The whole film is a single run of its native controller.
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>globalThis.cc?.director?.getScene()?.getComponentsInChildren('SurvivorSpineReview')?.[0]?.skeleton?.findBone('CardMouth'));
    await page.evaluate(()=>{const c=cc.director.getScene().getComponentsInChildren('SurvivorSpineReview')[0];c.setReviewClock(true);c.playSequence();window.__film=c;});
    const fps=24,count=170,sequenceChanges=[];
    const frames=[];const video=process.env.SURVIVOR_FFMPEG?spawn(process.env.SURVIVOR_FFMPEG,['-y','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','pipe:0','-an','-c:v','libvpx','-b:v','1900k','-pix_fmt','yuv420p',path.join(dest,'survivor-motion.webm')],{windowsHide:true,stdio:['pipe','ignore','pipe']}):null;
    let videoError='';if(video){video.stderr.on('data',b=>{videoError=(videoError+b).slice(-960);});video.stdin.on('error',()=>{});}
    const videoExit=video?once(video,'exit'):null;
    for(let i=0;i<count;i++){
      const clip=await page.evaluate(([i,fps])=>{if(i)for(let j=0;j<5;j++)__film.advanceReview(1/(fps*5));return __film.skeleton.getCurrent(0).animation.name;},[i,fps]);
      if(sequenceChanges.at(-1)?.clip!==clip)sequenceChanges.push({clip,frame:i});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const buf=await page.screenshot({type:'png'});
      if(video&&video.exitCode===null&&!video.stdin.destroyed)video.stdin.write(await sharp(buf).jpeg({quality:94}).toBuffer());
      frames.push(await sharp(buf).resize(720,450).removeAlpha().raw().toBuffer());
    }
    const gif=path.join(dest,'survivor-motion.gif');
    const delay=Array.from({length:count},(_,i)=>(Math.round((i+1)*100/fps)-Math.round(i*100/fps))*10);
    await sharp(Buffer.concat(frames),{raw:{width:720,height:450*count,pageHeight:450,channels:3}}).gif({loop:0,delay,colours:192,effort:4,dither:.35}).toFile(gif);
    if(video){if(!video.stdin.destroyed)video.stdin.end();const [code]=await videoExit;if(code!==0)throw Error('WebM encoder: '+videoError);}
    const m=await sharp(gif,{animated:true}).metadata();
    record.preview={captureMode:'continuous native scene',sequenceChanges,captureFrames:count,encodedFrames:m.pages,seconds:m.delay.reduce((sum,v)=>sum+v,0)/1000,fps,width:m.width,height:m.pageHeight};
    if(sequenceChanges.slice(0,7).map(x=>x.clip).join(',')!=='idle,prepare,attack,idle,hurt,idle,death')throw Error('The recorded controller sequence is incomplete.');
    if(record.preview.seconds<count/fps-.08||record.preview.encodedFrames<80)throw Error('Animated capture incomplete.');
    json(path.join(evidence,'runtime-check.json'),record);console.log(JSON.stringify(record.preview));
  }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
}
if(process.argv.includes('--serve'))stream();else run().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
