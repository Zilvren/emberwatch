const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));
const round = n => Math.round(n*1e6)/1e6;
const radians = n => n*Math.PI/180;
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const length=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const roles = {
 survivor:{prefab:'PlayerActor',facing:1,hip:[266,398],chest:[270,292],neck:[277,236],
  front:[[308,277],[339,386],[353,439],[470,536]],rear:[[207,281],[178,369],[166,430]],
  legs:{Front:[[294,418],[304,532],[309,570]],Rear:[[238,418],[215,533],[181,574]]},
  footCut:562,legStart:426,legRange:[170,350],duration:.84,contact:.40,death:1.12,
  strike:{Chest:-7,Head:7,FrontUpperArm:78,FrontForearm:-20,FrontHand:-8,RearUpperArm:-25,RearForearm:38},
  ready:{Chest:4,Head:-4,FrontUpperArm:-15,FrontForearm:20,FrontHand:-5,RearUpperArm:-10,RearForearm:16},
  material:[190,338,200,357],armRadius:4.4,deathDrop:65,
  pack:p=>p[0]<215&&p[1]>180&&p[1]<347,
  weapon:p=>p[0]>342+Math.max(0,p[1]-444)*.72&&p[1]>433&&p[1]<557},
 wanderer:{prefab:'WandererActor',facing:-1,hip:[721,389],chest:[716,260],neck:[670,206],
  front:[[665,238],[625,398],[592,512],[589,550]],rear:[[785,281],[808,425],[825,507]],
  legs:{Front:[[686,365],[659,528],[642,570]],Rear:[[751,365],[776,536],[796,592]]},
  footCut:568,legStart:427,legRange:[600,815],duration:.94,contact:.45,death:1.18,
  strike:{Chest:8,Head:-4,FrontUpperArm:-75,FrontForearm:-12,FrontHand:-5,RearUpperArm:12,RearForearm:-9},
  ready:{Chest:-5,Head:3,FrontUpperArm:17,FrontForearm:8,FrontHand:4,RearUpperArm:12,RearForearm:8},material:[620,420,626,438],armRadius:3.5,deathDrop:48},
 brute:{prefab:'BruteActor',facing:-1,hip:[1209,419],chest:[1221,276],neck:[1159,225],
  front:[[1038,282],[969,421],[971,503],[954,547]],rear:[[1328,245],[1385,422],[1372,507]],
  legs:{Front:[[1137,476],[1102,556],[1080,580]],Rear:[[1274,476],[1309,553],[1335,587]]},
  footCut:579,legStart:510,legRange:[968,1420],duration:1.10,contact:.54,death:1.28,
  strike:{Chest:8,Head:-5,FrontUpperArm:-60,FrontForearm:-20,FrontHand:3,RearUpperArm:13,RearForearm:-8},
  ready:{Chest:-6,Head:4,FrontUpperArm:17,FrontForearm:26,FrontHand:-8,RearUpperArm:8,RearForearm:10},material:[984,353,994,377],armRadius:8.8,deathDrop:30}
};
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function point(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];}
function inversePoint(frame,x,y){const a=radians(frame.angle),c=Math.cos(a),s=Math.sin(a),dx=x-frame.pos[0],dy=y-frame.pos[1];return [round(c*dx+s*dy),round(-s*dx+c*dy)];}
function chainWeights(p,points,names,width=14){
 let total=0,best={d:Infinity,s:0};const joints=[];
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(l*l))),d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(d<best.d)best={d,s:total+t*l};total+=l;joints.push(total);}
 for(let i=0;i<names.length-1;i++){if(Math.abs(best.s-joints[i])<width){const t=smooth((best.s-joints[i]+width)/(2*width));return [[names[i],1-t],[names[i+1],t]];}}
 let index=joints.findIndex(v=>best.s<=v);if(index<0)index=names.length-1;return [[names[index],1]];
}
function poseMatrices(rig,pose={}){
 const matrices={};
 for(const b of rig.bones){const key=pose[b.name]??{},r=radians((b.rotation??0)+(key.rotate??0)),c=Math.cos(r),s=Math.sin(r),local=[c,s,-s,c,(b.x??0)+(key.x??0),(b.y??0)+(key.y??0)],parent=b.parent?matrices[b.parent]:[1,0,0,1,0,0];
  const world=multiply(parent,local);if(b.transform==='onlyTranslation'){world[0]=c;world[1]=s;world[2]=-s;world[3]=c;}matrices[b.name]=world;}
 return matrices;
}
function makeRig(actor){
 const config=roles[actor];if(!config)throw Error('Unknown actor '+actor);
 const geometry=read('assets/resources/actors/native08/'+actor+'-geometry.json');
 const old=read('assets/resources/actors/native08/'+actor+'-skin.json');
 const v=geometry.vertices[0],other=geometry.vertices.find(p=>Math.abs(p[0]-v[0])>20);
 const scale=(other[0]-v[0])/(Math.round(other[2]*1536)-Math.round(v[2]*1536)),ox=v[0]-Math.round(v[2]*1536)*scale,oy=v[1]+Math.round(v[3]*1024)*scale;
 const convert=p=>[round(p[0]*scale+ox),round(-p[1]*scale+oy)];
 const frames={},bones=[],ik=[];
 function add(name,parent,source,aim,transform){
  const pos=source?convert(source):[0,0],angle=aim?Math.atan2(-(aim[1]-source[1]),aim[0]-source[0])*180/Math.PI:0,parentFrame=parent?frames[parent]:{pos:[0,0],angle:0};
  const local=inversePoint(parentFrame,...pos),rotation=transform==='onlyTranslation'?angle:angle-parentFrame.angle;
  const bone={name,...(parent?{parent}:{}),x:local[0],y:local[1],rotation:round(rotation),length:aim?round(length(source,aim)*scale):0,...(transform?{transform}:{})};
  frames[name]={pos,angle};bones.push(bone);return bone;
 }
 add('PoseRoot',null,null);add('Approach','PoseRoot',null);
 add('Hips','PoseRoot',config.hip);add('Torso','Hips',config.hip,config.chest);add('Chest','Torso',config.chest,config.neck);add('Neck','Chest',config.neck);
 const oldHead=old.boneDefinitions.find(b=>b.name==='Head').bind;
 const headPixel=[(oldHead[0]-ox)/scale,(oy-oldHead[1])/scale];
 add('Head','Neck',headPixel);
 add('Breath','Chest',config.chest);
 add('Cloth','Chest',[config.chest[0],mix(config.chest[1],config.hip[1],.60)]);
 add('Pack','Chest',[config.hip[0]-config.facing*80,config.chest[1]]);
 if(actor==='survivor')add('Pouch','Hips',[240,387]);
 if(actor==='brute')add('RearShoulderPlate','Chest',[1325,173]);
 for(const side of ['Rear','Front']){
  const p=side==='Front'?config.front:config.rear;
  add(side+'UpperArm','Chest',p[0],p[1]);add(side+'Forearm',side+'UpperArm',p[1],p[2]);
  add(side+'Hand',side+'Forearm',p[2],side==='Front'?p[3]:undefined);
  if(side==='Front'){add('Weapon','FrontHand',p[2],p[3]);add('AttackTip','Weapon',p[3]);}
 }
 for(const side of ['Rear','Front']){
  const p=config.legs[side];
  add(side+'FootTarget','PoseRoot',p[2]);
  add(side+'Thigh','Hips',p[0],p[1]);add(side+'Shin',side+'Thigh',p[1],p[2]);add(side+'Foot',side+'Shin',p[2],undefined,'onlyTranslation');
  const a=convert(p[0]),b=convert(p[1]),c=convert(p[2]),cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
  ik.push({name:side+'LegIK',order:ik.length,bones:[side+'Thigh',side+'Shin'],target:side+'FootTarget',mix:1,bendPositive:cross>=0,stretch:false,compress:false});
 }
 add('Corpse','PoseRoot',null,undefined,'onlyTranslation');
 add('CorpseHead','Corpse',null,undefined,'onlyTranslation');
 const index=new Map(bones.map((b,i)=>[b.name,i]));
 const weightsAt=(vertex,i)=>{
  const p=[vertex[2]*1536,vertex[3]*1024],oldName=old.boneDefinitions[old.influences[i][0][0]].name;
  if(oldName==='Head')return [['Head',1]];
  if(oldName.startsWith('Front')){if(config.weapon?.(p))return [['Weapon',1]];return chainWeights(p,config.front,['FrontUpperArm','FrontForearm','FrontHand'],12);}
  if(oldName.startsWith('Rear'))return chainWeights(p,config.rear,['RearUpperArm','RearForearm','RearHand'],12);
  if(p[1]>config.legStart&&p[0]>config.legRange[0]&&p[0]<config.legRange[1]){
   const front=config.legs.Front,rear=config.legs.Rear,fx=mix(front[0][0],front[2][0],smooth((p[1]-front[0][1])/(front[2][1]-front[0][1]))),rx=mix(rear[0][0],rear[2][0],smooth((p[1]-rear[0][1])/(rear[2][1]-rear[0][1]))),side=Math.abs(p[0]-fx)<Math.abs(p[0]-rx)?'Front':'Rear';
   if(p[1]>config.footCut)return [[side+'Foot',1]];
   const w=chainWeights(p,config.legs[side],[side+'Thigh',side+'Shin',side+'Foot'],15),hip=smooth((p[1]-config.legStart)/27);
   return [...w.map(([n,x])=>[n,x*hip]),['Hips',1-hip]];
  }
  if(config.pack?.(p))return [['Pack',1]];
  const chest=smooth((config.hip[1]-p[1])/(config.hip[1]-config.chest[1]));
  const cloth=p[1]>config.chest[1]+20&&p[1]<config.hip[1]+5?.22:0;
  const breath=chest*.14;
  return [['Hips',(1-chest)*(1-cloth)],['Chest',chest*(1-cloth)-breath],['Breath',breath],['Cloth',cloth]];
 };
 const weighted=[],influences=[];
 geometry.vertices.forEach((v,i)=>{
  const merged=new Map();
  for(const [name,w] of weightsAt(v,i)){if(w>1e-7)merged.set(name,(merged.get(name)??0)+w);}
  const sum=[...merged.values()].reduce((a,b)=>a+b,0),entry=[];
  weighted.push(merged.size);
  for(const [name,w0] of merged){const w=round(w0/sum),local=inversePoint(frames[name],v[0],v[1]);weighted.push(index.get(name),...local,w);entry.push([index.get(name),...local,w]);}
  influences.push(entry);
 });
 const skeleton={skeleton:{spine:'3.8.75',name:actor,images:path.join(ROOT,'assets/resources/actors/spine08').replaceAll('\\','/')+'/'},bones,ik,slots:[{name:'Artwork',bone:'PoseRoot',attachment:'master08-thin'}],skins:[{name:'default',attachments:{Artwork:{'master08-thin':{type:'mesh',path:'master08-thin',uvs:geometry.vertices.flatMap(v=>[v[2],v[3]]),triangles:geometry.indices,vertices:weighted,hull:0,width:1536,height:1024}}}}],events:{impact:{}},animations:{}};
 // Reconstruct occluded upper-arm surfaces from the existing character material.
 // These meshes sit behind the unchanged artwork and are only enabled during actions.
 for(const side of ['Rear','Front']){
  const boneIndex=index.get(side+'UpperArm'),l=bones[boneIndex].length,r=config.armRadius;
  const uvs=[],vertices=[],triangles=[];
  function fan(radius,outline){
   const points=[[l/2,0]];
   for(let i=0;i<=8;i++){const a=-Math.PI/2+i*Math.PI/8;points.push([l+Math.cos(a)*radius,Math.sin(a)*radius]);}
   for(let i=0;i<=8;i++){const a=Math.PI/2+i*Math.PI/8;points.push([Math.cos(a)*radius,Math.sin(a)*radius]);}
   const start=uvs.length/2;
   for(const [x,y]of points){
    vertices.push(1,boneIndex,round(x),round(y),1);
    if(outline)uvs.push((214.5)/1536,(315.5)/1024);
    else {const [a,b,c,d]=config.material;uvs.push((mix(a,c,(y/r+1)/2)+.5)/1536,(mix(b,d,Math.max(0,Math.min(1,x/l)))+.5)/1024);}
   }
   for(let i=1;i<points.length;i++)triangles.push(start,start+i,start+(i===points.length-1?1:i+1));
  }
  fan(r,true);fan(r-.55,false);
  const name=side+'Sleeve';
  skeleton.slots.unshift({name,bone:side+'UpperArm'});
  skeleton.skins[0].attachments[name]={[name]:{type:'mesh',path:'master08-thin',uvs,triangles,vertices,hull:0,width:1536,height:1024}};
 }
 const body=read('tools/spine/corpse-regions.json')[actor];
 const bodyWidth={survivor:190,wanderer:186,brute:190}[actor];
 const neckPixels={survivor:[1720,350],wanderer:[245,465],brute:[280,428]}[actor];
 const [left,top,right,bottom]=body.bbox,bodyScale=bodyWidth/(right-left),bodyHeight=(bottom-top)*bodyScale;
 const neckX=(neckPixels[0]-body.size[0]/2)*bodyScale,neckY=(body.size[1]/2-neckPixels[1])*bodyScale;
 const neckHeight=(bottom-neckPixels[1])*bodyScale;
 const bodyOffsetX=((left+right)/2-body.size[0]/2)*bodyScale;
 const bodyBottomOffset=(body.size[1]/2-bottom)*bodyScale;
 const oldHeadIndex=old.boneDefinitions.findIndex(b=>b.name==='Head'),headTriangles=[];
 for(let i=0;i<geometry.indices.length;i+=3){const tri=geometry.indices.slice(i,i+3);if(tri.every(v=>old.influences[v][0][0]===oldHeadIndex))headTriangles.push(...tri);}
 const headIndices=[...new Set(headTriangles)],headMap=new Map(headIndices.map((v,i)=>[v,i]));
 const headLocal=headIndices.map(i=>[geometry.vertices[i][0]-oldHead[0],geometry.vertices[i][1]-oldHead[1]]);
 let headAngle=config.facing===1?-90:90,best=Infinity;
 for(let angle=config.facing===1?-120:35;angle<=(config.facing===1?-40:120);angle++){
  const a=radians(angle),minY=Math.min(...headLocal.map(([x,y])=>Math.sin(a)*x+Math.cos(a)*y));
  const score=Math.abs(neckHeight+minY-1.2)+.01*Math.abs(angle-(config.facing===1?-90:90));
  if(score<best){best=score;headAngle=angle;}
 }
 skeleton.slots.push({name:'Corpse',bone:'Corpse'},{name:'CorpseHead',bone:'CorpseHead'});
 skeleton.skins[0].attachments.Corpse={corpse:{path:actor+'-corpse',width:body.size[0],height:body.size[1],scaleX:bodyScale,scaleY:bodyScale}};
 skeleton.skins[0].attachments.CorpseHead={head:{type:'mesh',path:'master08-thin',uvs:headIndices.flatMap(i=>geometry.vertices[i].slice(2,4)),triangles:headTriangles.map(i=>headMap.get(i)),vertices:headLocal.flatMap(([x,y])=>[1,index.get('CorpseHead'),round(x),round(y),1]),hull:0,width:1536,height:1024}};
 const corpse={bodyWidth,bodyHeight,neckX,neckY,headAngle,bodyMeta:body,bodyOffsetX,bodyBottomOffset};
 const result={actor,config,geometry,bones,frames,influences,skeleton,corpse,sourceTransform:{scale,ox,oy},sourceSha256:geometry.sourceSha256};
 const manifest=path.join(ROOT,'art-source/spine08/parts',actor,'parts.json');
 return fs.existsSync(manifest)?require('./part-rig.cjs').withParts(result,ROOT):result;
}
function pose(rotation={},translations={}){
 const result={};for(const [name,rotate] of Object.entries(rotation))result[name]={rotate};
 for(const [name,value] of Object.entries(translations))result[name]={...result[name],x:value[0],y:value[1]};
 return result;
}
function scaled(values,t){return Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v*t]));}
function controlsFor(poses,times,duration){
 const names=[...new Set(poses.flatMap(p=>Object.keys(p)))];
 return names.map(boneName=>{
  const data=poses.map(p=>p[boneName]??{}),control={boneName};
  if(data.some(p=>p.rotate!==undefined))control.rotate=data.map((p,i)=>({time:round(times[i]*duration),angle:round(p.rotate??0),...(i<times.length-1?{curve:[.25,0,.65,1]}:{})}));
  if(data.some(p=>p.x!==undefined||p.y!==undefined))control.translate=data.map((p,i)=>({time:round(times[i]*duration),x:round(p.x??0),y:round(p.y??0),...(i<times.length-1?{curve:[.25,0,.65,1]}:{})}));
  return control;
 });
}
function motionsFor(rig){
 const c=rig.config,f=c.facing;
 const times=[0,.14,.28,.38,c.contact/c.duration,(c.contact+.055)/c.duration,.72,.88,1];
 const values=[0,-.20,-.48,.42,1,1,.42,.08,0],travel=[0,0,.05,.55,1,1,.62,.12,0];
 const attackPoses=values.map((v,i)=>pose(scaled(c.strike,v),{
  Hips:[f*(v>=0?2.5*v:-3*v),-4*Math.abs(v)],Approach:[travel[i],0],
  FrontFootTarget:[f*(v>0?4*v:0),i===3?7:0],RearFootTarget:[f*(v>0?-2*v:0),i===6?4:0],
 }));
 const idleTimes=[0,.25,.5,.75,1],idlePoses=[0,1,0,-.65,0].map(v=>pose({Cloth:v*.35,FrontHand:v*.16,RearHand:-v*.13},{Breath:[0,v*.65],Approach:[0,0]}));
 const prepareTimes=[0,.25,.48,.65,1],preparePoses=[0,.65,1,.72,0].map(v=>pose(scaled(c.ready,v),{Hips:[-f*1.3*v,-1.5*v],Approach:[0,0]}));
 const hurtTimes=[0,.20,.42,.7,1],hurtPoses=[0,1,.65,.15,0].map(v=>pose({Chest:f*11*v,Head:-f*6*v,FrontUpperArm:-f*9*v,FrontForearm:f*7*v,RearUpperArm:f*8*v},{Hips:[-f*4*v,-2*v],Approach:[0,0]}));
 const deathTimes=Array.from({length:25},(_,i)=>i/24);
 const used=[...new Set(rig.geometry.indices)];
 const deathPoses=deathTimes.map(t=>{
  const v=smooth(t),fall=-f*100*v;
  const p=pose({PoseRoot:fall,Head:-f*12*v,FrontUpperArm:-f*12*v,FrontForearm:f*4*v,
   FrontHand:(rig.actor==='survivor'?-32:0)*v,RearUpperArm:f*10*v,RearForearm:-f*6*v,
   FrontFoot:fall,RearFoot:fall},{PoseRoot:[f*15*v,0],Approach:[0,0]});
  if(rig.parts){
   Object.assign(p,{FrontThigh:{rotate:-f*18*v},FrontShin:{rotate:f*34*v},RearThigh:{rotate:f*9*v},RearShin:{rotate:-f*16*v},FrontForearm:{rotate:f*22*v},RearForearm:{rotate:-f*18*v},FrontFoot:{rotate:fall+f*16*v},RearFoot:{rotate:fall-f*7*v}});
  }
  const matrices=poseMatrices(rig,p);
  const minY=Math.min(...used.map(index=>rig.influences[index].reduce((s,[i,x,y,w])=>s+point(matrices[rig.bones[i].name],x,y)[1]*w,0)));
  p.PoseRoot.y=round(-112-minY);
  if(!rig.parts){const landed=rig.corpse,drop=14*(1-smooth((t-.58)/.42));
   const local=inversePoint({pos:[p.PoseRoot.x,p.PoseRoot.y],angle:fall},f*35-landed.bodyOffsetX,-112-landed.bodyBottomOffset+drop);
   p.Corpse={x:local[0],y:local[1],rotate:0};p.CorpseHead={x:landed.neckX,y:landed.neckY,rotate:landed.headAngle};
  }
  return p;
 });
 const contract={idle:{duration:3,loop:true},attack:{duration:c.duration,contact:c.contact,loop:false},prepare:{duration:.66,loop:false},hurt:{duration:.38,loop:false},death:{duration:c.death,loop:false}};
 const matricesAtImpact=poseMatrices(rig,attackPoses[4]);
 const contactTip=point(matricesAtImpact.AttackTip,0,0).map(round);
 return {motions:[
  {name:'idle',controls:controlsFor(idlePoses,idleTimes,3)},
  {name:'attack',controls:controlsFor(attackPoses,times,c.duration)},
  {name:'prepare',controls:controlsFor(preparePoses,prepareTimes,.66)},
  {name:'hurt',controls:controlsFor(hurtPoses,hurtTimes,.38)},
  {name:'death',controls:controlsFor(deathPoses,deathTimes,c.death).map(control=>{for(const track of [control.rotate,control.translate])for(const key of track??[])delete key.curve;return control;})}
 ],contract,contactTip,attackPoses};
}
function contractFor(rig,motions){
 return {schemaVersion:1,actor:rig.actor,sourceSha256:rig.sourceSha256,sourcePixelsChanged:false,baseline:-112,boneNames:rig.bones.map(b=>b.name),influences:rig.influences,triangles:rig.geometry.indices,neutralVertices:rig.geometry.vertices.map(v=>[v[0],v[1]]),parts:rig.parts?.map(p=>({name:p.name,bone:p.bone,vertexStart:p.vertexStart,vertexCount:p.vertexCount,image:'art-source/spine08/parts/'+rig.actor+'/'+p.name+'.png'})),motions:motions.contract,contactTip:motions.contactTip,contactBone:'AttackTip',approachBone:'Approach'};
}
function atlas(actor){
 let text='\nmaster08-thin.png\nsize: 1536,1024\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nmaster08-thin\n  rotate: false\n  xy: 0, 0\n  size: 1536, 1024\n  orig: 1536, 1024\n  offset: 0, 0\n  index: -1\n';
 if(actor){const r=read('tools/spine/corpse-regions.json')[actor],[l,t,x,y]=r.bbox,w=x-l,h=y-t;text+='\n'+actor+'-corpse.png\nsize: '+r.size.join(',')+'\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n'+actor+'-corpse\n  rotate: false\n  xy: '+l+', '+t+'\n  size: '+w+', '+h+'\n  orig: '+r.size.join(', ')+'\n  offset: '+l+', '+(r.size[1]-y)+'\n  index: -1\n';}
 return text;
}
// The local MCP accepts Bezier tuples; Spine 3.8 serializes their four values as separate fields.
function normalize38Curves(value){
 if(!value||typeof value!=='object')return 0;
 let count=0;
 if(Array.isArray(value.curve)){const [a,b,c,d]=value.curve;value.curve=a;value.c2=b;value.c3=c;value.c4=d;count++;}
 for(const child of Object.values(value))count+=normalize38Curves(child);
 return count;
}
module.exports={ROOT,roles,makeRig,motionsFor,contractFor,poseMatrices,atlas,point,round,normalize38Curves};
