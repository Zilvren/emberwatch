import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {ROOT,roles,makeRig,motionsFor,contractFor,atlas,normalize38Curves}=require('./rig-authoring.cjs');
const value=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const mcpRoot=value('--mcp')??process.env.SPINE_MCP_ROOT;
const spine=value('--spine')??process.env.SPINE_EXE;
if(!mcpRoot||!spine)throw Error('Provide --mcp <local spine-MCP directory> and --spine <Spine.com>.');
const mcpRequire=createRequire(path.join(path.resolve(mcpRoot),'package.json'));
const {Client}=mcpRequire('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport,getDefaultEnvironment}=mcpRequire('@modelcontextprotocol/sdk/client/stdio.js');
const actors=value('--actor')?[value('--actor')]:Object.keys(roles);
const sourceOnly=process.argv.includes('--source-only');
const working=path.join(ROOT,'temp/spine08-authoring');
const runtime=path.join(ROOT,'assets/resources/actors/spine08');
const source=path.join(ROOT,'art-source/spine08');
await fs.mkdir(working,{recursive:true});await fs.mkdir(runtime,{recursive:true});await fs.mkdir(source,{recursive:true});
await fs.copyFile(path.join(ROOT,'assets/resources/actors/sketch08/master08-thin.png'),path.join(runtime,'master08-thin.png'));
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(path.resolve(mcpRoot),'build/index.js')],cwd:ROOT,env:{...getDefaultEnvironment(),SPINE_EXE:spine},stderr:'pipe'});
const client=new Client({name:'the-end-spine-authoring',version:'1.0.0'},{capabilities:{}});
const report={date:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),mcpRoot,spine,actors:[]};
const call=async(name,args)=>{
 const start=Date.now(),result=await client.callTool({name,arguments:args},undefined,{timeout:60000});
 if(result.isError)throw Error(name+': '+JSON.stringify(result.content));
 const data=JSON.parse(result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'));
 if(data.success===false)throw Error(name+': '+(data.error??data.stderr));
 return {tool:name,elapsedMs:Date.now()-start,exitCode:data.exitCode??null};
};
try{
 await client.connect(transport);const tools=await client.listTools();assert.ok(tools.tools.some(t=>t.name==='spine_control_bones'));
 for(const actor of actors){
  const rig=makeRig(actor),motion=motionsFor(rig),steps=[];
  if(!rig.parts)throw Error('Independent body-part images are missing. Refusing to overwrite an original project with the rejected combined-artwork rig.');
  let current=path.join(working,actor+'-base.json');
  await fs.writeFile(current,JSON.stringify(rig.skeleton)+'\n');
  for(const item of motion.motions){
   const next=path.join(working,actor+'-'+item.name+'.json');
   steps.push(await call('spine_control_bones',{sourceJsonPath:current,outputJsonPath:next,animationName:item.name,boneControls:item.controls,overwrite:true}));
   current=next;
  }
  const document=JSON.parse(await fs.readFile(current,'utf8'));
  document.animations.attack.events=[{time:motion.contract.attack.contact,name:'impact'}];
  for(const [kind,animation]of Object.entries(document.animations)){
   animation.slots=rig.parts?Object.fromEntries(rig.parts.map(p=>[p.name,{attachment:[{time:0,name:p.name}],color:[{time:0,color:'ffffffff'}]}])):Object.fromEntries(['RearSleeve','FrontSleeve'].map(name=>[name,{attachment:kind==='idle'?[{time:0,name:null}]:kind==='death'?[{time:0,name}]:[{time:0,name},{time:motion.contract[kind].duration,name:null}]}]));
   if(!rig.parts)animation.slots.Artwork={color:[{time:0,color:'ffffffff'}]};
   if(!rig.parts)for(const name of ['Corpse','CorpseHead'])animation.slots[name]={attachment:[{time:0,name:null}]};
   if(kind==='death'&&!rig.parts){
    const duration=motion.contract.death.duration,start=duration*.66,end=duration*.80;
    const fadeOut=[{time:0,color:'ffffffff'},{time:start,color:'ffffffff'},{time:end,color:'ffffff00'},{time:duration,color:'ffffff00'}];
    if(rig.parts)for(const p of rig.parts)animation.slots[p.name].color=fadeOut;
    else{animation.slots.Artwork.color=fadeOut;for(const name of ['RearSleeve','FrontSleeve'])animation.slots[name].color=fadeOut;}
    for(const [name,attachment]of [['Corpse','corpse'],['CorpseHead','head']])animation.slots[name]={attachment:[{time:0,name:null},{time:start,name:attachment}],color:[{time:0,color:'ffffff00'},{time:start,color:'ffffff00'},{time:end,color:'ffffffff'},{time:duration,color:'ffffffff'}]};
   }
  }
  document.animations.death.ik=Object.fromEntries(rig.skeleton.ik.map(c=>[c.name,[{time:0,mix:1,bendPositive:c.bendPositive},{time:motion.contract.death.duration*.25,mix:1,bendPositive:c.bendPositive},{time:motion.contract.death.duration*.45,mix:0,bendPositive:c.bendPositive},{time:motion.contract.death.duration,mix:0,bendPositive:c.bendPositive}]]));
  const normalizedCurves=normalize38Curves(document.animations);
  const input=path.join(source,actor+(rig.parts?'-parts':'')+'.authoring.json');
  await fs.writeFile(input,JSON.stringify(document,null,2)+'\n');
  // -r imports into an existing project rather than replacing it. Always build a
  // fresh candidate, then publish only that verified single-skeleton result.
  const candidate=await fs.mkdtemp(path.join(working,actor+'-'));
  // Save in the final source directory so Spine's relative image path remains
  // valid after the verified candidate is renamed to the editable project.
  const project=path.join(source,'.'+actor+'-candidate-'+Date.now()+'.spine');
  steps.push(await call('spine_import_json',{inputPath:input,outputProjectPath:project,skeletonName:actor}));
  const settings=path.join(working,'export-settings.json');
  await fs.writeFile(settings,JSON.stringify({class:'export-json',extension:'.json',format:'JSON',prettyPrint:false,nonessential:true,cleanUp:false,packAtlas:null,packSource:'attachments',packTarget:'single',warnings:true,version:null,output:'',input:'',open:false},null,2)+'\n');
  const candidateRuntime=path.join(candidate,'runtime');
  await fs.mkdir(candidateRuntime);
  steps.push(await call('spine_export',{projectPath:project,outputPath:candidateRuntime,exportSettingsPath:settings,clean:false}));
  assert.deepEqual((await fs.readdir(candidateRuntime)).filter(f=>f.endsWith('.json')),[actor+'.json']);
  const exported=JSON.parse(await fs.readFile(path.join(candidateRuntime,actor+'.json'),'utf8'));
  if(sourceOnly){const active=JSON.parse(await fs.readFile(path.join(runtime,actor+'.json'),'utf8'));for(const key of ['bones','slots','skins','animations','ik','events'])assert.deepEqual(exported[key],active[key],'Source-only refresh changed active '+actor+' '+key);}
  for(const name of ['idle','attack','prepare','hurt','death'])assert.ok(exported.animations[name],actor+' '+name);
  assert.equal(exported.animations.attack.events.filter(e=>e.name==='impact').length,1);
  for(const name of rig.parts?rig.parts.map(p=>p.name):['FrontSleeve','RearSleeve']){
   assert.ok(exported.slots.some(slot=>slot.name===name));
   assert.ok(exported.animations.attack.slots[name].attachment.some(key=>key.name===name));
  }
  await fs.copyFile(project,path.join(source,actor+(rig.parts?'-parts':'')+'.spine'));
  await fs.unlink(project);
  if(!sourceOnly)await fs.copyFile(path.join(candidateRuntime,actor+'.json'),path.join(runtime,actor+'.json'));
  const packed=rig.parts&&!sourceOnly?require('./pack-parts.cjs').packParts(rig,runtime,working,spine):null;
  if(!sourceOnly){if(!rig.parts)await fs.writeFile(path.join(runtime,actor+'.atlas'),atlas(actor));await fs.writeFile(path.join(runtime,actor+'.contract.json'),JSON.stringify(contractFor(rig,motion))+'\n');}
  const entry={actor,bones:exported.bones.length,version:exported.skeleton.spine,animations:Object.keys(exported.animations),parts:rig.parts?.map(p=>({name:p.name,bone:p.bone})),packed,sourceOnly,editorImages:exported.skeleton.images,contactTip:motion.contactTip,normalizedCurves,steps};
  report.actors.push(entry);console.log(JSON.stringify(entry));
  await fs.writeFile(path.join(working,'mcp-report.json'),JSON.stringify(report,null,2)+'\n');
 }
}finally{await client.close();}
