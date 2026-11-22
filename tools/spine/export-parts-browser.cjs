// Asset export through the actual Cocos Spine runtime, avoiding editor mesh-import UV loss.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const cli=process.env.PLAYWRIGHT_CLI;
const names=process.env.PARTS_EXPORT_NAMES?.split(',')??null;
const reuse=process.env.SPINE_REUSE_PREVIEW==='1';
if(!cli)throw Error('Set PLAYWRIGHT_CLI');
const code=`async (page) => {
 const root=${JSON.stringify(root.replaceAll('\\','/'))};
 await page.setViewportSize({width:1440,height:900});
 if(!${JSON.stringify(reuse)})await page.goto(${JSON.stringify((process.env.PLAYWRIGHT_BASE_URL??'http://127.0.0.1:7467/')+'?save=off&preview=encounter')});
 await page.waitForFunction(()=>globalThis.__survivalGame&&cc.director.getScene().getComponentsInChildren('SpineActorRig').some(a=>a.ready));
 for(const actor of ['survivor','wanderer','brute']){
  await page.route('**/__parts/'+actor+'/data',r=>r.fulfill({path:root+'/temp/spine08-decomposition/'+actor+'/source-parts.json',contentType:'application/json'}));
  await page.route('**/__parts/'+actor+'/layout',r=>r.fulfill({path:root+'/temp/spine08-decomposition/'+actor+'/layout.json',contentType:'application/json'}));
 }
 await page.route('**/__parts/source.png',r=>r.fulfill({path:root+'/assets/resources/actors/sketch08/master08-thin.png',contentType:'image/png'}));
 await page.evaluate(async()=>{
  const scene=cc.director.getScene(),rig=scene.getComponentsInChildren('SpineActorRig').find(a=>a.ready),base=rig.skeleton.skeletonData;
  const image=await new Promise((resolve,reject)=>cc.assetManager.loadRemote('/__parts/source.png',{ext:'.png'},(e,a)=>e?reject(e):resolve(a))),texture=new base.textures[0].constructor();texture.image=image;
  const atlas='\\nmaster08-thin.png\\nsize: 1536,1024\\nformat: RGBA8888\\nfilter: Linear,Linear\\nrepeat: none\\nmaster08-thin\\n  rotate: false\\n  xy: 0, 0\\n  size: 1536, 1024\\n  orig: 1536, 1024\\n  offset: 0, 0\\n  index: -1\\n';
  globalThis.__partBase={Skeleton:rig.skeleton.constructor,Data:base.constructor,texture,atlas};
  scene.getChildByName('Canvas').getChildByName('GameRoot').active=false;
  for(const camera of scene.getComponentsInChildren(cc.Camera)){const c=camera.clearColor;c.a=0;camera.clearColor=c;}
  const rt=new cc.RenderTexture();rt.reset({width:1440,height:900});scene.getComponentsInChildren(cc.Camera)[0].targetTexture=rt;globalThis.__partRT=rt;
  globalThis.__capturePartPNG=(w,h)=>{
   const raw=__partRT.readPixels(Math.round(720-w/2),Math.round(450-h/2),w,h),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const context=canvas.getContext('2d'),pixels=context.createImageData(w,h);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const from=((h-1-y)*w+x)*4,to=(y*w+x)*4,a=raw[from+3];for(let c=0;c<3;c++)pixels.data[to+c]=a?Math.min(255,Math.round(raw[from+c]*255/a)):0;pixels.data[to+3]=a;}
   context.putImageData(pixels,0,0);return canvas.toDataURL('image/png').split(',')[1];
  };
  document.documentElement.style.background='transparent';document.body.style.background='transparent';
 });
 const output=[];
 for(const actor of ['survivor','wanderer','brute']){
  const layout=await page.evaluate(async actor=>{
   const data=await (await fetch('/__parts/'+actor+'/data')).json(),layout=await (await fetch('/__parts/'+actor+'/layout')).json();
   if(globalThis.__partNode)__partNode.destroy();
   const node=new cc.Node('PartsAssetExport');node.layer=33554432;node.parent=cc.director.getScene().getChildByName('Canvas');
   const asset=new __partBase.Data();asset._uuid='parts-export-'+actor+'-'+Date.now();asset.skeletonJson=data;asset.atlasText=__partBase.atlas;asset.textures=[__partBase.texture];asset.textureNames=['master08-thin.png'];
   const skeleton=node.addComponent(__partBase.Skeleton);skeleton.premultipliedAlpha=false;skeleton.skeletonData=asset;
   globalThis.__partNode=node;globalThis.__partSkeleton=skeleton;return layout;
  },actor);
  await page.waitForFunction(()=>!!__partSkeleton.findBone('root'));
  for(const p of layout.parts.filter(p=>!${JSON.stringify(names)}||${JSON.stringify(names)}.includes(p.name))){
   const [l,t,r,b]=p.bbox,w=r-l+4,h=b-t+4,cx=(l+r)/2,cy=(t+b)/2;
   await page.evaluate(({name,cx,cy})=>{__partNode.setPosition(-cx,cy,0);__partSkeleton.paused=false;__partSkeleton.setToSetupPose();__partSkeleton.setAnimation(0,name,false);__partSkeleton.updateAnimation(0);__partSkeleton.paused=true;}, {name:p.name,cx,cy});
   await page.waitForTimeout(45);
   const png=await page.evaluate(({w,h})=>__capturePartPNG(w,h),{w,h});
   output.push({actor,name:p.name,width:w,height:h,center:[cx,cy],png});
  }
 }
 return {passed:true,parts:output};
}`;
const r=spawnSync(process.execPath,[cli,'-s=the-end-spine08','run-code',code],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
fs.writeFileSync(path.join(root,'temp/spine08-decomposition/browser-export.log'),r.stdout+'\n'+r.stderr);
if(r.status!==0||/^### Error/m.test(r.stdout))throw Error(r.stdout+'\n'+r.stderr);
const m=r.stdout.match(/### Result\r?\n([^\r\n]+)/);if(!m)throw Error('Missing export result');const report=JSON.parse(m[1]);
for(const p of report.parts){fs.writeFileSync(path.join(root,'art-source/spine08/parts',p.actor,p.name+'.png'),Buffer.from(p.png,'base64'));delete p.png;}
for(const actor of ['survivor','wanderer','brute']){
 const file=path.join(root,'art-source/spine08/parts',actor,'parts.json'),d=JSON.parse(fs.readFileSync(path.join(root,'temp/spine08-decomposition',actor,'layout.json')));
 const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):d;
 d.parts=d.parts.map(p=>{const next=report.parts.find(x=>x.actor===actor&&x.name===p.name);return next?{...p,...next,path:'art-source/spine08/parts/'+actor+'/'+p.name+'.png',source:'approved08 native Cocos texture extraction'}:previous.parts.find(q=>q.name===p.name)??p;});
 for(const p of previous.parts)if(!d.parts.some(q=>q.name===p.name))d.parts.push(p);
 fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');
}
fs.writeFileSync(path.join(root,'temp/spine08-decomposition/browser-export-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,independentPNGs:report.parts.length}));
