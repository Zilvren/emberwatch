// The same Cocos scene, with a closer camera. Snapshot measurements and continuous playback are separate passes.
const fs=require('node:fs'),path=require('node:path');
const {once}=require('node:events');
const {servePreview}=require('../serve-preview.cjs');
const {project,json}=require('./bestiary-assets.cjs');
const {dir}=require('./survivor-battle.cjs');
const modules=process.env.SURVIVOR_NODE_MODULES;
const evidence=process.env.SURVIVOR_HAND_QA||path.join(project,'output/playwright/ashen-survivor-hand');
const angles=[['放松','idle',.35],['夹牌','prepare',.49],['离手前','attack',.355],['松指','attack',.465],['收手','attack',.80],['撑地','death',.87],['停姿','death',1.38]];
const rect={x:292,y:203,width:376,height:194};
async function capture(){
  const baseline=process.argv.includes('--before'),out=path.join(evidence,baseline?'before':'after');
  fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(dir,'preview'),{recursive:true});
  const {chromium}=require(path.join(modules,'playwright')),sharp=require(path.join(modules,'sharp'));
  const server=servePreview({directory:path.join(project,'build/survivor-spine-review'),port:0,label:'Native hand review'});await once(server,'listening');
  let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.SURVIVOR_CHROME||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
    const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>globalThis.cc?.director?.getScene()?.getComponentsInChildren('SurvivorSpineReview')?.[0]?.skeleton?.findBone('AttackTip'));
    const draft=process.argv.includes('--authoring')?JSON.parse(fs.readFileSync(path.join(dir,'survivor.authoring.json'))):null;
    const bound=await page.evaluate(draft=>{
      const c=cc.director.getScene().getComponentsInChildren('SurvivorSpineReview')[0],s=c.skeleton;
      if(draft){const original=s.skeletonData,a=new original.constructor();a._uuid='left-hand-draft-'+Date.now();a.skeletonJson=draft;a.atlasText=original.atlasText;a.textures=original.textures;a.textureNames=original.textureNames;s.skeletonData=a;}
      c.playIdle();c.setReviewClock(true);
      const mount=c.actor.parent,scale=5.2;
      mount.setScale(scale,scale,1);
      function pose(name,t){s.paused=false;s.clearTracks();s.setToSetupPose();const tr=s.setAnimation(0,name,false);tr.mixDuration=0;s.updateAnimation(0);s.updateAnimation(t);s._skeleton.updateWorldTransform();s.paused=true;}
      function center(){const a=s.findBone('cast-palm'),b=s.findBone('AttackTip');mount.setPosition(-(a.worldX+(b.worldX-a.worldX)*.24)*scale,-(a.worldY+(b.worldY-a.worldY)*.35)*scale,0);}
      function position(name){const b=s.findBone(name);return [b.worldX,b.worldY];}
      window.__handReview={c,s,mount,scale,pose,center,position};
      return {left:s.findBone('cast-palm').data.length,right:s.findBone('near-hand').data.length,slots:s._skeleton.slots.map(z=>z.data.name)};
    },draft);
    const wait=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    async function picture(to){await wait();return page.screenshot({clip:rect,type:'png',...(to?{path:to}:{})});}
    const records=[];
    for(const [name,clip,t] of angles){
      const data=await page.evaluate(([n,t])=>{const a=__handReview;a.pose(n,t);a.center();const s=a.s;
        const fore=s.findBone('cast-bracer'),w=s.findBone('cast-palm'),angle=(Math.atan2(w.c,w.a)-Math.atan2(fore.c,fore.a))*180/Math.PI;
        const sub=n=>s.findSlot(n)?.getAttachment()?.name||null;
        return {angle:((angle+540)%360)-180,wrist:a.position('cast-palm'),tip:a.position('AttackTip'),hand:sub('cast-palm'),index:sub('cast-index'),thumb:sub('cast-thumb'),held:sub('held-card'),
          indexBend:s.findBone('cast-index-tip')?.rotation,middleBend:s.findBone('cast-middle-tip')?.rotation,thumbAngle:s.findBone('cast-thumb')?.rotation};
      },[clip,t]);
      await picture(path.join(out,clip+'-'+t+'.png'));
      await page.evaluate(()=>{const a=__handReview;a.saved=a.s._skeleton.slots.map(slot=>[slot,slot.getAttachment()]);});
      async function layer(set){
        await page.evaluate(set=>{for(const [slot,art] of __handReview.saved)slot.setAttachment(set.includes(slot.data.name)?art:null);},set);
        return sharp(await picture()).removeAlpha().raw().toBuffer();
      }
      const bg=await layer([]),cuff=await layer(['cast-bracer']),palm=await layer(['cast-palm']);
      const intersects=(a,b,background=bg)=>{let count=0;for(let i=0;i<background.length;i+=3){
        const visible=v=>Math.max(Math.abs(v[i]-background[i]),Math.abs(v[i+1]-background[i+1]),Math.abs(v[i+2]-background[i+2]))>15;
        if(visible(a)&&visible(b))count++;}return count;};
      data.wristOverlapPixels=intersects(cuff,palm);
      if(!baseline&&data.held){const paper=await layer(['held-card']),thumb=await layer(['cast-thumb']),index=await layer(['cast-index']);
        data.thumbOnCardPixels=intersects(paper,thumb);data.indexBehindCardPixels=intersects(paper,index);}
      if(!baseline){
        await page.evaluate(()=>{const a=__handReview,b=a.s.findBone('cast-bracer');a.mount.setPosition(-b.worldX*a.scale,-b.worldY*a.scale,0);});
        const stage=await layer([]),sleeve=await layer(['cast-sleeve']),fore=await layer(['cast-bracer']),both=await layer(['cast-sleeve','cast-bracer']);
        data.elbowOverlapPixels=intersects(sleeve,fore,stage);
        let covered=0;
        for(let yy=94;yy<=100;yy++)for(let xx=185;xx<=191;xx++){
          const i=(yy*rect.width+xx)*3;
          if(Math.max(...[0,1,2].map(n=>Math.abs(fore[i+n]-stage[i+n])))>15&&Math.max(...[0,1,2].map(n=>Math.abs(fore[i+n]-both[i+n])))<3)covered++;
        }
        data.elbowCovered=covered;
      }
      await page.evaluate(()=>{for(const [s,a] of __handReview.saved)s.setAttachment(a);});
      records.push({name,clip,t,...data});
    }
    const checks={bound,records,errors};
    if(!baseline){
      const order=n=>bound.slots.indexOf(n),span=bound.left/bound.right;
      if(span<.84||span>1.05||order('cast-index')>=order('held-card')||order('held-card')>=order('cast-thumb'))throw Error('The grip or its depth order differs from the fitted left hand.');
      if(records.some(r=>r.wristOverlapPixels<80||r.elbowOverlapPixels<80||r.elbowCovered<40||Math.abs(r.angle)>48.3||!r.index||!r.thumb))throw Error('A sleeve or hand part detached, or a wrist limit was exceeded.');
      if(records.filter(r=>r.held).some(r=>r.thumbOnCardPixels<28||r.indexBehindCardPixels<4))throw Error('The physical finger coverage failed on the rendered card.');
      const grip=records[2],flick=records[3];
      if(flick.middleBend-grip.middleBend<55||flick.indexBend-grip.indexBend<18)throw Error('Fingers remained curled after release.');
      checks.interrupt=await page.evaluate(()=>{
        const {c,s}=__handReview,advance=t=>{for(let j=0;j<t-1e-8;j+=1/120)c.advanceReview(Math.min(1/120,t-j));};
        const held=()=>Boolean(s.findSlot('held-card').getAttachment());
        c.playIdle();advance(.72);c.playAttack();advance(.28);
        const thumb=s.findBone('cast-thumb').rotation,idx=s.findBone('cast-index-tip').rotation;
        c.playHurt();advance(.045);const keep=held(),angleChange=Math.max(Math.abs(thumb-s.findBone('cast-thumb').rotation),Math.abs(idx-s.findBone('cast-index-tip').rotation));
        advance(.77);const stowed=!held();c.playAttack();advance(.41);c.playHurt();advance(.025);
        const airborne=Boolean(s.findSlot('flight-card').getAttachment()),empty=!held();advance(.72);
        return {keptPinch:keep,fingerAngleChange:angleChange,stowed,airborne,empty,finished:!s.findSlot('flight-card').getAttachment()};
      });
      const v=checks.interrupt;
      if(!v.keptPinch||!v.stowed||!v.airborne||!v.empty||!v.finished||v.fingerAngleChange>1)throw Error('The grip failed under interruption: '+JSON.stringify(v));
    }
    json(path.join(out,'hand-check.json'),checks);
    console.log(JSON.stringify({size:[bound.left,bound.right],checks:records.map(r=>[r.clip,r.t,Math.round(r.angle),r.wristOverlapPixels,r.thumbOnCardPixels,r.indexBehindCardPixels]),errors}));
    if(baseline||!process.argv.includes('--film'))return;
    const labels=['夹牌','松指','撑地'],samples=angles.filter(k=>labels.includes(k[0]));
    const board=[];const texts=[];
    for(let i=0;i<samples.length;i++){const [n,clip,t]=samples[i];
      for(const [j,version]of ['before','after'].entries()){
        const f=path.join(evidence,version,clip+'-'+t+'.png');board.push({input:await sharp(f).resize(306,158).png().toBuffer(),left:81+i*311,top:41+j*167});
      }
      texts.push('<text x="'+(234+i*311)+'" y="26">'+n+'</text>');
    }
    const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1016" height="378"><g font-family="Microsoft YaHei,sans-serif" font-size="18" text-anchor="middle" fill="#f1e2d0">'+texts.join('')+'<text x="41" y="123">上一版</text><text x="41" y="289">这版</text></g></svg>');
    board.push({input:svg,left:0,top:0});await sharp({create:{width:1016,height:378,channels:3,background:'#302933'}}).composite(board).png().toFile(path.join(dir,'preview/left-hand-comparison.png'));
    // Keep a fixed camera during the stroke so the wrist path is visible rather than recentred on every frame.
    await page.evaluate(()=>{const a=__handReview,c=a.c;c.playIdle();for(let i=0;i<92;i++)c.advanceReview(1/120);a.mount.setScale(3.2,3.2,1);a.mount.setPosition(-224,-911,0);});
    const fps=24,frames=[],count=96;
    for(let i=0;i<count;i++){
      await page.evaluate(i=>{const c=__handReview.c;if(i===7)c.playPrepare();if(i===39)c.playAttack();
        for(let j=0;j<3;j++)c.advanceReview(1/(48*3));},i);
      await wait();
      const pic=await page.screenshot({clip:{x:152,y:125,width:632,height:358},type:'png'});
      frames.push(await sharp(pic).removeAlpha().raw().toBuffer());
    }
    const dest=path.join(dir,'preview/left-hand-motion-r3.gif'),delay=Array.from({length:count},(_,i)=>(Math.round((i+1)*100/fps)-Math.round(i*100/fps))*10);
    await sharp(Buffer.concat(frames),{raw:{width:632,height:358*count,pageHeight:358,channels:3}}).gif({loop:0,delay,colours:192,effort:3,dither:.25}).toFile(dest);
    const encoded=await sharp(dest,{animated:true}).metadata();checks.film={captured:count,encoded:encoded.pages,seconds:encoded.delay.reduce((a,b)=>a+b,0)/1000,speed:.5,width:632,height:358};
    if(errors.length||checks.film.seconds!==4||encoded.pages<48)throw Error('Left-hand recording was incomplete.');
    json(path.join(out,'hand-check.json'),checks);
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
capture().catch(e=>{console.error(e);process.exit(1);});
