const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const load=require('../tools/load-ts.cjs').createLoader();
const geometry=load(path.join(root,'assets/game/presentation/actors/SpineRigGeometry.ts'));
const {poseMatrices,point}=require('../tools/spine/rig-authoring.cjs');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const ids=['survivor','wanderer','brute'];
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
function mesh(d){return d.skins.find(s=>s.name==='default').attachments.Artwork['master08-thin'];}
function decode(data,attachment=mesh(data)){
 const m=attachment,v=m.vertices,result=[];let cursor=0;
 for(let i=0;i<m.uvs.length/2;i++){const count=v[cursor++],weights=[];for(let j=0;j<count;j++)weights.push([v[cursor++],v[cursor++],v[cursor++],v[cursor++]]);result.push(weights);}
 assert.equal(cursor,v.length);return result;
}
function poseAtEnd(animation){
 const result={};for(const [name,t]of Object.entries(animation.bones??{})){result[name]={};if(t.rotate)result[name].rotate=t.rotate.at(-1).angle??0;if(t.translate){result[name].x=t.translate.at(-1).x??0;result[name].y=t.translate.at(-1).y??0;}}return result;
}
test('all active actors reference SDK-imported Spine data and keep legacy renderers disabled',()=>{
 const scripts=require('../tools/native-assets.cjs');
 for(const [id,prefab]of [['survivor','PlayerActor'],['wanderer','WandererActor'],['brute','BruteActor']]){
  const d=read('assets/prefabs/actors/'+prefab+'.prefab');
  const actor=d.find(o=>o.__type__===scripts.script('ActorPresentation'));
  assert.ok(actor.spineRig,'Missing active Spine rig: '+id);
  const rig=d[actor.spineRig.__id__];assert.equal(rig.__type__,scripts.script('SpineActorRig'));
  const skeleton=d[rig.skeleton.__id__];assert.equal(skeleton.__type__,'sp.Skeleton');assert.equal(skeleton._cacheMode,0);
  const meta=read('assets/resources/actors/spine08/'+id+'.json.meta');
  assert.equal(meta.importer,'spine-data');assert.equal(meta.imported,true);assert.equal(skeleton._skeletonData.__uuid__,meta.uuid);
  assert.ok(d.filter(o=>o.__type__===scripts.script('NativeActorSkin')).every(o=>o._enabled===false));
  assert.ok(d.filter(o=>o.__type__==='cc.Node'&&o._name==='NativeBones').every(o=>o._active===false));
 }
});
test('Spine character data includes articulated limbs, foot IK and every required action',()=>{
 for(const id of ids){
  const d=read('assets/resources/actors/spine08/'+id+'.json'),c=read('assets/resources/actors/spine08/'+id+'.contract.json');
  assert.match(d.skeleton.spine,/^3\.8\./);assert.ok(d.bones.length>=26);
  for(const n of ['Hips','Torso','Chest','Head','FrontUpperArm','FrontForearm','FrontHand','RearUpperArm','RearForearm','RearHand','FrontThigh','FrontShin','FrontFoot','RearThigh','RearShin','RearFoot','AttackTip','Approach'])assert.ok(d.bones.some(b=>b.name===n),id+' '+n);
  assert.equal(d.ik.length,2);for(const ik of d.ik){assert.equal(ik.bones.length,2);assert.match(ik.target,/FootTarget$/);}
  for(const n of ['idle','attack','prepare','hurt','death'])assert.ok(d.animations[n]);
  for(const n of ['FrontUpperArm','RearUpperArm','FrontForearm','RearForearm','FrontHand','RearHand','FrontThigh','RearThigh','FrontShin','RearShin','FrontFoot','RearFoot','Torso','Pelvis','Head']){assert.ok(d.slots.some(s=>s.name===n),id+' independent '+n);assert.ok(d.animations.attack.slots[n].attachment.some(k=>k.name===n));}
  const impacts=d.animations.attack.events.filter(e=>e.name==='impact');assert.equal(impacts.length,1);assert.ok(Math.abs(impacts[0].time-c.motions.attack.contact)<1e-6);
  let bezier=0;function walk(v){if(!v||typeof v!=='object')return;if(v.curve!==undefined){assert.equal(Array.isArray(v.curve),false);if(typeof v.curve==='number')bezier++;}for(const n of Object.values(v))walk(n);}walk(d.animations);assert.ok(bezier>30);
 }
});
test('every body part has its own PNG, atlas region and correctly registered bone attachment',()=>{
 for(const id of ids){
  const d=read('assets/resources/actors/spine08/'+id+'.json'),c=read('assets/resources/actors/spine08/'+id+'.contract.json'),manifest=read('art-source/spine08/parts/'+id+'/parts.json'),atlas=fs.readFileSync(path.join(root,'assets/resources/actors/spine08/'+id+'.atlas'),'utf8');
  assert.equal(c.parts.length,id==='survivor'?19:id==='brute'?18:16);assert.equal(d.slots.some(s=>s.name==='Artwork'),false);
  for(const p of c.parts){const slot=d.slots.find(s=>s.name===p.name),image=fs.readFileSync(path.join(root,p.image)),region=d.skins[0].attachments[p.name][p.name],source=manifest.parts.find(s=>s.name===p.name);
   assert.equal(image.subarray(1,4).toString(),'PNG');assert.equal(image.readUInt32BE(16),source.width);assert.equal(image.readUInt32BE(20),source.height);
   assert.equal(slot.bone,p.bone,id+' '+p.name+' wrong bone');assert.equal(region.path??p.name,p.name);assert.ok(atlas.split(/\r?\n/).includes(p.name));
   assert.ok(Number.isInteger(p.vertexStart)&&p.vertexCount>0,id+' missing diagnostic region '+p.name);
   assert.equal(region.type,undefined,'Part must use its own image rather than the old combined mesh');
   for(let i=p.vertexStart;i<p.vertexStart+p.vertexCount;i++){assert.equal(c.influences[i].length,1);assert.equal(c.boneNames[c.influences[i][0][0]],p.bone);}
  }
 }
});
test('isolated arm and shin rotations cannot move the backpack, torso or opposite limb',()=>{
 for(const id of ids){const d=read('assets/resources/actors/spine08/'+id+'.json'),c=read('assets/resources/actors/spine08/'+id+'.contract.json');
  const vertex=(part,pose)=>{const m=poseMatrices({bones:d.bones},pose),p=c.parts.find(p=>p.name===part),w=c.influences[p.vertexStart];return w.reduce((p,[i,x,y,k])=>{const v=point(m[c.boneNames[i]],x,y);return[p[0]+v[0]*k,p[1]+v[1]*k];},[0,0]);};
  for(const [bone,stays,moves]of [['RearUpperArm',['Torso','Head','FrontHand',...(id==='survivor'?['Pack']:[])],'RearHand'],['FrontForearm',['Torso','RearHand'],'FrontHand'],['FrontShin',['RearFoot','Pelvis'],'FrontFoot']]){
   const pose={[bone]:{rotate:65}};for(const name of stays){const a=vertex(name,{}),b=vertex(name,pose);assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6,id+' '+bone+' drags '+name);}
   // Foot rotation is independent by design, but its ankle still follows the shin.
   const a=vertex(moves,{}),b=vertex(moves,pose);assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])>1,id+' '+bone+' does not move '+moves);
  }
 }
});
test('idle preserves head, pelvis and planted feet without global squash',()=>{
 for(const id of ids){
  const a=read('assets/resources/actors/spine08/'+id+'.json').animations.idle;
  for(const n of ['PoseRoot','Hips','Chest','Neck','Head','FrontFoot','RearFoot','FrontFootTarget','RearFootTarget'])assert.equal(a.bones?.[n],undefined,id+' idle drifts '+n);
  for(const t of Object.values(a.bones))assert.equal(t.scale,undefined);
 }
});
test('death keeps every independent part editable and lands the articulated body on the floor',()=>{
 for(const id of ids){
  const d=read('assets/resources/actors/spine08/'+id+'.json'),a=d.animations.death,matrices=poseMatrices({bones:d.bones},poseAtEnd(a));
  for(const track of Object.values(a.ik))assert.equal(track.at(-1).mix??1,0);
  const c=read('assets/resources/actors/spine08/'+id+'.contract.json');
  for(const p of c.parts){assert.equal(a.slots[p.name].attachment.at(-1).name,p.name);assert.equal(a.slots[p.name].color.at(-1).color??'ffffffff','ffffffff');}
  assert.ok(d.slots.every(s=>!['Corpse','CorpseHead','Artwork'].includes(s.name)));
  for(const bone of ['FrontThigh','FrontShin','RearThigh','RearShin','FrontForearm','RearForearm'])assert.ok(a.bones[bone]?.rotate?.length>2,id+' death does not articulate '+bone);
  const y=Math.min(...c.influences.map(w=>w.reduce((s,[i,x,y,k])=>s+point(matrices[c.boneNames[i]],x,y)[1]*k,0)));
  assert.ok(Math.abs(y+112)<.35,id+' articulated death floor '+y);
 }
});
test('original 08 art and the shared Spine texture are byte-identical',()=>{
 const expected='42c8f2393d8b08eb7f69f4900e12b9e04d9e768587b96aff3637964900243e1f';
 assert.equal(hash('assets/resources/actors/sketch08/master08-thin.png'),expected);
 assert.equal(hash('assets/resources/actors/spine08/master08-thin.png'),expected);
});
test('silhouette contact chooses the visible edge at the requested height',()=>{
 const vertices=[{x:-2,y:0},{x:3,y:0},{x:3,y:4},{x:-2,y:4}],indices=[0,1,2,0,2,3];
 assert.equal(geometry.silhouetteAtHeight(vertices,indices,2,true),-2);
 assert.equal(geometry.silhouetteAtHeight(vertices,indices,2,false),3);
 assert.equal(geometry.silhouetteAtHeight(vertices,indices,5,false),null);
 const p=geometry.skinVertex([[0,2,1,.5],[1,2,1,.5]],[{a:1,b:0,c:0,d:1,worldX:0,worldY:0},{a:0,b:-1,c:1,d:0,worldX:10,worldY:0}]);
 assert.deepEqual(p,{x:5.5,y:1.5});
});
