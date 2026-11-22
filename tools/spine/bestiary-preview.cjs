// Noninteractive art review: put the exported Spine data into an existing, local Pink/Cocos build.
// The battle and its save state are not rewritten. Asset URLs below are served only on loopback.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const {base,project,layouts,json}=require('./bestiary-assets.cjs');
const packages=process.env.BESTIARY_NODE_MODULES;
if(!packages)throw Error('Set BESTIARY_NODE_MODULES to the local Playwright/sharp package directory.');
const {chromium}=require(path.join(packages,'playwright'));
const sharp=require(path.join(packages,'sharp'));
const qa=process.env.BESTIARY_CAPTURE||path.join(project,'output/playwright/ashen-bestiary');
const build=process.env.BESTIARY_BUILD||path.join(project,'build/web-spine08-parts-reviewed');
const clips=['idle','prepare','attack','hurt','death'];
const names=Object.keys(layouts);
const report=Object.fromEntries(names.map(id=>[id,JSON.parse(fs.readFileSync(path.join(base,id,'export-report.json')))]));
const contentTypes={'.html':'text/html','.js':'application/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css','.png':'image/png','.atlas':'text/plain','.ttf':'font/ttf','.svg':'image/svg+xml'};
const assets=new Map();
for(const id of names)for(const file of [id+'.json',id+'.atlas',...report[id].atlasPages])assets.set('/__bestiary/'+id+'/'+file,path.join(base,id,'runtime',file));
for(const b of ['light-cut-passage','sunken-lamp-court'])assets.set('/__bestiary/'+b+'.png',path.join(base,'backgrounds',b+'.png'));
function listen(){
  return http.createServer((req,res)=>{
    try{
      const key=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
      let file=assets.get(key);
      if(!file){
        file=path.resolve(build,'.'+(key==='/'?'/index.html':key));
        const rel=path.relative(build,file);
        if(rel.startsWith('..')||path.isAbsolute(rel)){res.writeHead(403);res.end();return;}
      }
      if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':contentTypes[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      fs.createReadStream(file).pipe(res);
    }catch{res.writeHead(400);res.end();}
  });
}

async function mount(page){
  await page.waitForFunction(()=>globalThis.cc?.director?.getScene()?.getComponentsInChildren('SpineActorRig').some(a=>a.ready),null,{timeout:60000});
  return page.evaluate(async ({ids,report})=>{
    const cc=await globalThis.System.import('cc');
    const scene=cc.director.getScene(),canvas=scene.getChildByName('Canvas');
    const old=scene.getComponentsInChildren('SpineActorRig').find(a=>a.ready).skeleton;
    const Data=old.skeletonData.constructor,Skeleton=old.constructor,Texture=old.skeletonData.textures[0].constructor;
    canvas.getChildByName('GameRoot').active=false;
    const root=new cc.Node('AshenBestiaryReview');root.layer=canvas.layer;root.parent=canvas;
    const unit=canvas.getComponent('cc.UITransform'),W=unit.width,H=unit.height;
    function node(name,parent=root){const n=new cc.Node(name);n.layer=canvas.layer;n.parent=parent;return n;}
    async function texture(url){
      const image=await new Promise((ok,no)=>cc.assetManager.loadRemote(url,{ext:'.png'},(err,data)=>err?no(err):ok(data)));
      const tex=new Texture();tex.image=image;return tex;
    }
    const grounds=[];
    for(const id of ['light-cut-passage','sunken-lamp-court']){
      const n=node(id);n.addComponent('cc.UITransform');
      const t=await texture('/__bestiary/'+id+'.png'),sf=new cc.SpriteFrame();sf.texture=t;
      const sprite=n.addComponent('cc.Sprite');sprite.sizeMode=cc.Sprite.SizeMode?.CUSTOM??0;sprite.spriteFrame=sf;
      n.getComponent('cc.UITransform').setContentSize(W,H);grounds.push(n);
    }
    const actors=[],factor=W/1440;
    for(const [i,id] of ids.entries()){
      const url='/__bestiary/'+id+'/',textures=[];
      for(const pg of report[id].atlasPages)textures.push(await texture(url+pg));
      const data=new Data();data._uuid='ashen-bestiary-'+id+'-'+report[id].runtimeSha256.slice(0,12);
      data.skeletonJson=await (await fetch(url+id+'.json')).json();
      data.atlasText=await (await fetch(url+id+'.atlas')).text();data.textures=textures;data.textureNames=report[id].atlasPages;
      const shadow=node(id+'-shadow');const shade=shadow.addComponent('cc.Graphics');
      const width=[92,119,80][i]*factor;
      for(const [r,al] of [[1,13],[.72,14],[.44,17]]){shade.fillColor=new cc.Color(34,28,44,al);shade.ellipse(0,0,width*r,6*factor*r);shade.fill();}
      const n=node(id);n.addComponent('cc.UITransform').setContentSize(450*factor,390*factor);
      const s=n.addComponent(Skeleton);
      if(s.setAnimationCacheMode)s.setAnimationCacheMode(Skeleton.AnimationCacheMode?.REALTIME??0);
      s.premultipliedAlpha=false;s.skeletonData=data;n.setScale(factor*1.04,factor*1.04,1);
      const x=[-.288,-.015,.333][i]*W;
      actors.push({id,s,n,shadow,x});
    }
    const strip=node('ReviewCaptions');const fill=strip.addComponent('cc.Graphics');
    fill.fillColor=new cc.Color(31,27,36,168);fill.rect(-W/2,-H/2,W,61*factor);fill.fill();
    const labels=actors.map(({id,x})=>{
      const n=node(id+'-caption');n.addComponent('cc.UITransform');
      const l=n.addComponent('cc.Label');l.fontFamily='Microsoft YaHei';l.fontSize=24*factor;l.lineHeight=31*factor;l.color=new cc.Color(234,222,205,255);
      n.setPosition(x,-H/2+31*factor);return l;
    });
    const titles=['灰灯蛾','叩石螯','垂幡守像'],verbs={idle:'待机',prepare:'预备',attack:'攻击',hurt:'受击',death:'死亡'};
    function backdrop(mode){grounds.forEach((n,i)=>n.active=i===mode);const y=H*(mode===0?-.245:-.12);actors.forEach(o=>{o.n.setPosition(o.x,y,0);o.shadow.setPosition(o.x,y,0);});}
    function pose(s,clip,time,loop=false){
      s.paused=false;s.clearTracks();s.setToSetupPose();s.setAnimation(0,clip,loop);
      s.updateAnimation(0);if(time>0)s.updateAnimation(time);s._skeleton.updateWorldTransform();s.paused=true;
    }
    function draw(states,mode){
      backdrop(mode);actors.forEach(({s},i)=>{const [clip,t]=states[i];pose(s,clip,t,clip==='idle');labels[i].string=titles[i]+'  ·  '+verbs[clip];});
    }
    globalThis.__ashenPreview={actors,labels,grounds,draw,pose};
    draw(actors.map(()=>['idle',0]),0);return {width:W,height:H,engine:cc.ENGINE_VERSION||null};
  },{ids:names,report});
}
async function audit(page){
  return page.evaluate(({names,clips,report})=>{
    const {actors,pose}=__ashenPreview,result={};
    function endpoint(b){return [b.worldX+b.a*b.data.length,b.worldY+b.c*b.data.length];}
    function points(s){
      const v=[];for(const b of s._skeleton.bones){v.push(b.worldX,b.worldY,...endpoint(b));}
      return v;
    }
    function distance(a,b){let m=0;for(let i=0;i<a.length;i++)m=Math.max(m,Math.abs(a[i]-b[i]));return m;}
    for(const {id,s} of actors){
      const r={bones:s._skeleton.bones.length,slots:s._skeleton.slots.length,tracks:{},missing:[],meshVertexCount:0,meshFlex:0};
      for(const slot of s._skeleton.slots){const a=slot.getAttachment();if(!a)r.missing.push(slot.data.name);}
      for(const clip of clips){
        const duration=report[id].clips[clip];let hits=0,completes=0,shift=0,plinthDrift=0,footError=0;
        s.setEventListener((entry,e)=>{if(e?.data?.name==='impact')hits++;});
        s.setCompleteListener(()=>completes++);
        s.paused=false;s.clearTracks();s.setToSetupPose();s.setAnimation(0,clip,clip==='idle');s.updateAnimation(0);s._skeleton.updateWorldTransform();
        const start=points(s),base=s.findBone('plinth'),initial=base?[base.worldX,base.worldY]:null;
        const steps=Math.ceil(duration*40);
        for(let i=0;i<steps;i++){
          s.updateAnimation(duration/steps);s._skeleton.updateWorldTransform();
          const at=points(s);if(at.some(x=>!Number.isFinite(x)))throw Error('Nonfinite transform '+id+'/'+clip);
          shift=Math.max(shift,distance(start,at));
          if(base)plinthDrift=Math.max(plinthDrift,Math.hypot(base.worldX-initial[0],base.worldY-initial[1]));
          if(id==='stone-claw'&&clip!=='death'){
            for(const [shin,target]of [['near-fore-shin','fore-plant'],['near-hind-shin','hind-plant']]){
              const foot=endpoint(s.findBone(shin)),plant=s.findBone(target);footError=Math.max(footError,Math.hypot(foot[0]-plant.worldX,foot[1]-plant.worldY));
            }
          }
        }
        const end=points(s),loopError=distance(start,end);s.updateAnimation(.06);s._skeleton.updateWorldTransform();s.paused=true;
        r.tracks[clip]={duration,hits,completes,travel:+shift.toFixed(3),endDelta:+loopError.toFixed(3),
          terminalDrift:clip==='death'?+distance(end,points(s)).toFixed(4):null,footError:+footError.toFixed(3),plinthDrift:+plinthDrift.toFixed(4)};
      }
      s.setEventListener(null);s.setCompleteListener(null);
      if(id==='veil-idol'){
        pose(s,'attack',0);const slot=s.findSlot('pennant-left'),a=slot.getAttachment();
        if(a.computeWorldVertices&&a.worldVerticesLength){const xs=new Float32Array(a.worldVerticesLength),ys=new Float32Array(a.worldVerticesLength);
          a.computeWorldVertices(slot,0,a.worldVerticesLength,xs,0,2);pose(s,'attack',.78);a.computeWorldVertices(slot,0,a.worldVerticesLength,ys,0,2);
          r.meshVertexCount=a.worldVerticesLength/2;r.meshFlex=+distance(xs,ys).toFixed(3);
        }
      }
      result[id]=r;
    }
    return result;
  },{names,clips,report});
}
async function frame(page,states,bg,file){
  await page.evaluate(({states,bg})=>{__ashenPreview.draw(states,bg);},{states,bg});
  await page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
  return page.screenshot({type:'png',...(file?{path:file}:{})});
}
function sequence(t){
  const state=names.map(id=>['idle',t%report[id].clips.idle]);let bg=0;
  const sequence=[['ash-moth',.92],['stone-claw',2.38],['veil-idol',4.05]];
  for(const [id,begin]of sequence){
    const i=names.indexOf(id),q=report[id].clips,prep=q.prepare*.72;
    if(t>=begin-prep&&t<begin)state[i]=['prepare',(t-(begin-prep))/.72];
    if(t>=begin&&t<begin+q.attack)state[i]=['attack',t-begin];
  }
  if(t>=5.5){
    bg=1;
    for(let i=0;i<names.length;i++){const id=names[i],q=report[id].clips,dt=t-5.5-i*.07;
      if(dt>=.42&&dt<.42+q.hurt)state[i]=['hurt',dt-.42];
      if(dt>=1.08)state[i]=['death',Math.min(q.death,dt-1.08)];
    }
  }
  return {state,bg};
}
async function run(){
  fs.mkdirSync(qa,{recursive:true});const review=path.join(base,'preview');fs.mkdirSync(review,{recursive:true});
  const server=listen();server.listen(0,'127.0.0.1');await once(server,'listening');
  let browser;const errors=[];
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.BESTIARY_CHROME||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
    const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error'&&errors.length<20)errors.push(m.text());});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=17&save=off&preview=encounter',{waitUntil:'domcontentloaded'});
    let context;
    try{context=await mount(page);}catch(e){await page.screenshot({path:path.join(qa,'mount-error.png')});console.error('Mount errors',errors);throw e;}
    await page.waitForFunction(()=>__ashenPreview.actors.every(a=>!!a.s.findBone('root')));
    const evidence=await audit(page);
    for(const stage of [['idle',0],['attack',0],['death',1]]){
      const states=names.map(id=>[stage[0],stage[0]==='attack'?report[id].impact:stage[0]==='death'?report[id].clips.death:0]);
      await frame(page,states,stage[1],path.join(qa,stage[0]+'.png'));
    }
    const record={renderer:'Pink / Cocos sp.Skeleton realtime',context,build:path.basename(build),evidence,errors};
    json(path.join(qa,'runtime-check.json'),record);
    console.log(JSON.stringify(record));
    if(errors.length)throw Error('Browser reported a runtime error.');
    for(const id of names){
      const result=evidence[id];
      if(result.missing.length||result.slots!==report[id].slots||result.bones!==report[id].bones)throw Error('Runtime binding mismatch: '+id);
      for(const clip of clips){
        const s=result.tracks[clip];
        if(s.travel<.5||s.completes<1||s.hits!==(clip==='attack'?1:0))throw Error('Runtime clip check failed: '+id+'/'+clip);
        if(clip==='idle'&&s.endDelta>.2)throw Error('Discontinuous idle: '+id);
        if(clip==='death'&&s.terminalDrift>.2)throw Error('Unstable terminal pose: '+id);
        if(s.footError>1||s.plinthDrift>.01)throw Error('Unstable ground registration: '+id+'/'+clip);
      }
      if(id==='veil-idol'&&(result.meshVertexCount!==10||result.meshFlex<1))throw Error('Pennant mesh did not move.');
    }
    if(process.argv.includes('--film')){
      const frames=[],fps=15,total=8.35,count=Math.ceil(total*fps);
      for(let i=0;i<count;i++){const {state,bg}=sequence(i/fps);const png=await frame(page,state,bg);
        frames.push(await sharp(png).resize(720,450).removeAlpha().raw().toBuffer());
      }
      const gif=path.join(review,'battle-motion.gif');
      await sharp(Buffer.concat(frames),{raw:{width:720,height:450*count,pageHeight:450,channels:3}})
        .gif({loop:0,delay:Array.from({length:count},(_,i)=>Math.round((i+1)*1000/fps/10)*10-Math.round(i*1000/fps/10)*10),colours:160,effort:3,dither:.42}).toFile(gif);
      const meta=await sharp(gif,{animated:true}).metadata(),encodedMs=meta.delay.reduce((a,b)=>a+b,0);
      if(meta.width!==720||meta.pageHeight!==450||meta.pages<fps*4||Math.abs(encodedMs-count*1000/fps)>100)throw Error('Incomplete animated preview.');
      record.preview={capturedFrames:count,encodedFrames:meta.pages,seconds:encodedMs/1000,width:720,height:450,format:'GIF',fps};
      json(path.join(qa,'runtime-check.json'),record);
      console.log('Recorded '+count+' native frames.');
    }
    fs.copyFileSync(path.join(qa,'idle.png'),path.join(review,'battle-setup.png'));
  }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
