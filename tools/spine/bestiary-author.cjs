const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {base,layouts,buildSetup,renderSetup,json,hash}=require('./bestiary-assets.cjs');
const {clips}=require('./bestiary-motion.cjs');
const {packParts}=require('./pack-parts.cjs');
const ids=Object.keys(layouts);
const clipNames=['idle','prepare','attack','hurt','death'];

function duration(animation){
  let end=0;
  function visit(v){if(!v||typeof v!=='object')return;if(typeof v.time==='number')end=Math.max(end,v.time);for(const kid of Object.values(v))if(typeof kid==='object')visit(kid);}
  visit(animation);return end;
}
function prepare(id){
  const rig=buildSetup(id);renderSetup(rig);
  const {animations,contact}=clips(rig);rig.skeleton.animations=animations;
  json(path.join(rig.dir,id+'.authoring.json'),rig.skeleton);
  console.log('Prepared',id,rig.parts.length+' image slots',rig.skeleton.bones.length+' bones, impact at '+contact+'s');
}
function runSpine(exe,args,cwd,log){
  const p=spawnSync(exe,args,{cwd,encoding:'utf8',windowsHide:true,timeout:100000,maxBuffer:8*1024*1024});
  const full=((p.stdout||'')+'\n'+(p.stderr||'')).replace(/^.*Licensed to:.*$/gmi,'[Spine Professional]');
  fs.writeFileSync(log,full);
  if(p.error||p.status!==0||!full.includes('Complete.'))throw Error('Spine did not complete '+path.basename(log)+': '+(p.error?.message||full.slice(-950)));
}
function publish(id,exe,scratch,replace,folder=path.join(base,id)){
  const partFolder=path.join(folder,'parts'),source=path.join(folder,id+'.authoring.json');
  const approvedProject=path.join(folder,id+'.spine');
  if(fs.existsSync(approvedProject)&&!replace)throw Error('An editable project already exists: '+approvedProject+'. Export hand edits directly, or pass --replace-projects for an intentional rebuild.');
  const authored=JSON.parse(fs.readFileSync(source)),registration=JSON.parse(fs.readFileSync(path.join(folder,'parts-register.json')));
  const work=fs.mkdtempSync(path.join(scratch,id+'-')),out=path.join(work,'runtime');
  fs.mkdirSync(out);
  const candidate=path.join(folder,'.build-'+path.basename(work)+'.spine');
  const settings=path.join(work,'export.json');
  json(settings,{class:'export-json',extension:'.json',format:'JSON',prettyPrint:false,nonessential:true,cleanUp:false,packAtlas:null,packSource:'attachments',packTarget:'single',warnings:true,version:null,output:'',input:'',open:false});
  try {
    runSpine(exe,['-i',source,'-o',candidate,'-r',id],folder,path.join(work,'import.log'));
    runSpine(exe,['-i',candidate,'-o',out,'-e',settings],folder,path.join(work,'export.log'));
    const skeletonPath=path.join(out,id+'.json'),exported=JSON.parse(fs.readFileSync(skeletonPath,'utf8'));
    assert.equal(exported.skeleton.spine,'3.8.75');
    assert.deepEqual(Object.keys(exported.animations).sort(),Object.keys(authored.animations).sort());
    for(const name of clipNames)assert.ok(exported.animations[name],'Missing body animation '+name);
    assert.deepEqual(exported.slots.map(s=>s.name),authored.slots.map(s=>s.name));
    const landmarks=exported.animations.attack.events.filter(e=>e.name==='impact');
    assert.equal(landmarks.length,1);
    for(const expected of authored.animations.attack.events){
      const actual=exported.animations.attack.events.filter(event=>event.name===expected.name);
      assert.equal(actual.length,1,'Expected one '+expected.name+' event');
      assert.ok(Math.abs(actual[0].time-expected.time)<.002,expected.name+' event moved in export');
    }
    const bones=new Set(exported.bones.map(b=>b.name));
    for(const slot of exported.slots){
      assert.ok(bones.has(slot.bone));const available=exported.skins[0].attachments[slot.name];
      if(slot.attachment)assert.ok(available[slot.attachment]);
      else assert.ok(Object.keys(available||{}).length&&Object.values(exported.animations).some(a=>a.slots?.[slot.name]?.attachment?.some(k=>k.name&&available[k.name])));
    }
    const packed=packParts({actor:id,partFolder,parts:registration.parts},out,work,exe);
    const atlas=fs.readFileSync(path.join(out,id+'.atlas'),'utf8');
    for(const asset of registration.parts)assert.ok(atlas.split(/\r?\n/).includes(asset.name),'Missing atlas image '+asset.name);
    for(const file of packed.pages)assert.ok(atlas.includes(file)&&fs.statSync(path.join(out,file)).size>100);
    const exportedMeshNames=Object.entries(exported.skins[0].attachments)
      .filter(([,slots])=>Object.values(slots).some(s=>s.type==='mesh')).map(([name])=>name);
    if(id==='veil-idol')assert.deepEqual(exportedMeshNames.sort(),['pennant-left','pennant-right']);
    if(id==='stone-claw')assert.equal(exported.ik.length,2);
    const runtime=path.join(folder,'runtime');fs.mkdirSync(runtime,{recursive:true});
    for(const file of fs.readdirSync(out))fs.copyFileSync(path.join(out,file),path.join(runtime,file));
    fs.copyFileSync(candidate,approvedProject);
    const result={actor:id,editor:exported.skeleton.spine,bones:exported.bones.length,slots:exported.slots.length,
      images:registration.parts.length,meshes:exportedMeshNames,ik:exported.ik?.length||0,impact:landmarks[0].time,
      clips:Object.fromEntries(clipNames.map(n=>[n,duration(exported.animations[n])])),
      auxiliary:Object.fromEntries(Object.keys(exported.animations).filter(n=>!clipNames.includes(n)).map(n=>[n,duration(exported.animations[n])])),atlasPages:packed.pages,
      projectSha256:hash(fs.readFileSync(approvedProject)),runtimeSha256:hash(fs.readFileSync(skeletonPath))};
    json(path.join(folder,'export-report.json'),result);console.log(JSON.stringify(result));
  }finally{if(fs.existsSync(candidate))fs.unlinkSync(candidate);}
}
if(require.main===module){
  const mode=process.argv[2],index=process.argv.indexOf('--actor'),selected=index<0?ids:[process.argv[index+1]];
  for(const id of selected)if(!Object.hasOwn(layouts,id))throw Error('Unknown creature '+id);
  if(mode==='prepare'){for(const id of selected)prepare(id);}
  else if(mode==='export'){
    const exe=process.env.SPINE_EXE;if(!exe||!fs.existsSync(exe))throw Error('Set SPINE_EXE to Spine.com 3.8.75.');
    const scratch=process.env.BESTIARY_SCRATCH||path.join(os.tmpdir(),'the-end-bestiary');fs.mkdirSync(scratch,{recursive:true});
    for(const id of selected)publish(id,exe,scratch,process.argv.includes('--replace-projects'));
  }else throw Error('Use prepare or export, optionally --actor <id>.');
}
module.exports={duration,publish};
