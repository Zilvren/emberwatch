const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),cli=process.env.PLAYWRIGHT_CLI;
const items=JSON.parse(fs.readFileSync(path.join(root,'temp/spine08-decomposition/clean-repair-data.json')));
const source=path.join(root,'art-source/spine08/reconstruction-sources');fs.mkdirSync(source,{recursive:true});
for(const p of items){p.retainedSource='art-source/spine08/reconstruction-sources/'+p.actor+'-'+p.name+'.png';if(path.resolve(p.sourcePath)!==path.resolve(root,p.retainedSource))fs.copyFileSync(p.sourcePath,path.join(root,p.retainedSource));}
fs.writeFileSync(path.join(root,'temp/spine08-decomposition/clean-repair-data.json'),JSON.stringify(items));
const code=`async(page)=>{
 const root=${JSON.stringify(root.replaceAll('\\','/'))};
 await page.route('**/__repair/data',r=>r.fulfill({path:root+'/temp/spine08-decomposition/clean-repair-data.json',contentType:'application/json'}));
 const items=await page.evaluate(async()=>await(await fetch('/__repair/data')).json());
 const report=[];
 for(const [i,p]of items.entries()){
  const url='/__repair/'+Date.now()+'-'+i+'.png';await page.route('**'+url,r=>r.fulfill({path:root+'/'+p.retainedSource,contentType:'image/png'}));
  await page.evaluate(async({p,url,i})=>{
   if(globalThis.__partNode)__partNode.destroy();
   const image=await new Promise((resolve,reject)=>cc.assetManager.loadRemote(url,{ext:'.png'},(e,a)=>e?reject(e):resolve(a)));
   const texture=new __partBase.texture.constructor();texture.image=image;
   const sd=new __partBase.Data();sd._uuid='clean-part-'+i+'-'+Date.now();sd.skeletonJson={skeleton:{spine:'3.8.75'},bones:[{name:'root'}],slots:[{name:'part',bone:'root',attachment:'part'}],skins:[{name:'default',attachments:{part:{part:p.mesh}}}],animations:{part:{}}};
   sd.atlasText='\\nimage.png\\nsize: '+p.width+','+p.height+'\\nformat: RGBA8888\\nfilter: Linear,Linear\\nrepeat: none\\nimage\\n  rotate: false\\n  xy: 0, 0\\n  size: '+p.width+', '+p.height+'\\n  orig: '+p.width+', '+p.height+'\\n  offset: 0, 0\\n  index: -1\\n';sd.textures=[texture];sd.textureNames=['image.png'];
   const node=new cc.Node('CleanPartExport');node.layer=33554432;node.parent=cc.director.getScene().getChildByName('Canvas');
   const [l,t,r,b]=p.alphaBounds,scale=Math.min(1,790/(b-t),950/(r-l));node.setScale(scale,scale,1);node.setPosition(-(l+r)/2*scale,(t+b)/2*scale,0);
   const skeleton=node.addComponent(__partBase.Skeleton);skeleton.premultipliedAlpha=false;skeleton.skeletonData=sd;globalThis.__partNode=node;globalThis.__partSkeleton=skeleton;
  },{p,url,i});
  await page.waitForFunction(()=>!!__partSkeleton.findBone('root'));await page.waitForTimeout(80);
  const [l,t,r,b]=p.alphaBounds,scale=Math.min(1,790/(b-t),950/(r-l)),w=Math.ceil((r-l)*scale)+4,h=Math.ceil((b-t)*scale)+4;
  const png=await page.evaluate(({w,h})=>__capturePartPNG(w,h),{w,h});
  report.push({actor:p.actor,name:p.name,width:w,height:h,alphaBounds:[2,2,w-2,h-2],png});
 }
 return {passed:true,parts:report};
}`;
const r=spawnSync(process.execPath,[cli,'-s=the-end-spine08','run-code',code],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
fs.writeFileSync(path.join(root,'temp/spine08-decomposition/clean-repairs.log'),r.stdout+'\n'+r.stderr);
if(r.status!==0||/^### Error/m.test(r.stdout))throw Error(r.stdout+'\n'+r.stderr);
const report=JSON.parse(r.stdout.match(/### Result\r?\n([^\r\n]+)/)[1]);
for(const p of report.parts){
 const file=path.join(root,'art-source/spine08/parts',p.actor,p.name+'.png'),temporary=file+'.native-export.tmp';fs.writeFileSync(temporary,Buffer.from(p.png,'base64'));
 for(let attempt=0;;attempt++){try{fs.renameSync(temporary,file);break;}catch(e){if(attempt>=5)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,150);}}
 delete p.png;
}
const {roles}=require('./rig-authoring.cjs');
for(const actor of ['survivor','wanderer','brute']){
 const file=path.join(root,'art-source/spine08/parts',actor,'parts.json'),manifest=JSON.parse(fs.readFileSync(file));
 for(const p of manifest.parts){const item=items.find(i=>i.actor===actor&&i.name===p.name);if(!item)continue;
  const result=report.parts.find(i=>i.actor===actor&&i.name===p.name);Object.assign(p,result,{mode:item.mode,source:'image_gen occlusion reconstruction; native alpha-contour export',retainedSource:item.retainedSource});
  const [left,top,right,bottom]=item.alphaBounds;p.outline=item.contour.map(([x,y])=>[(x-left)/(right-left),(y-top)/(bottom-top)]);
  if(item.mode==='reconstructed-limb'){
   const c=roles[actor],side=p.name.startsWith('Front')?'Front':'Rear',points=p.name.includes('Shin')?c.legs[side]:(side==='Front'?c.front:c.rear),k=p.name.includes('Shin')||p.name.includes('Forearm')?1:0;
   const g=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/actors/native08',actor+'-geometry.json'))),a=g.vertices[0],b=g.vertices.find(v=>Math.abs(v[0]-a[0])>20),scale=(b[0]-a[0])/(Math.round(b[2]*1536)-Math.round(a[2]*1536));
   p.targetWidth=(p.name.includes('Shin')?(actor==='brute'?52:25):(actor==='brute'?82:actor==='survivor'?20:19))*scale;p.targetLength=Math.hypot(points[k+1][0]-points[k][0],points[k+1][1]-points[k][1])*scale*1.12;
  }
 }
 manifest.parts.forEach(p=>{if(p.name==='Pouch')p.bone='Pouch';});fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
}
const provenanceFile=path.join(source,'provenance.json'),existing=fs.existsSync(provenanceFile)?JSON.parse(fs.readFileSync(provenanceFile)):[],merged=new Map(existing.map(p=>[p.actor+'/'+p.name,p]));for(const {mesh,contour,...p}of items)merged.set(p.actor+'/'+p.name,p);fs.writeFileSync(provenanceFile,JSON.stringify([...merged.values()],null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,repaired:report.parts.length}));
