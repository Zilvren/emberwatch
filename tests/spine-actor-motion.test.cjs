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
  for(const n of ['FrontSleeve','RearSleeve']){assert.ok(d.slots.some(s=>s.name===n));assert.ok(d.animations.attack.slots[n].attachment.some(k=>k.name===n));}
  const impacts=d.animations.attack.events.filter(e=>e.name==='impact');assert.equal(impacts.length,1);assert.ok(Math.abs(impacts[0].time-c.motions.attack.contact)<1e-6);
  let bezier=0;function walk(v){if(!v||typeof v!=='object')return;if(v.curve!==undefined){assert.equal(Array.isArray(v.curve),false);if(typeof v.curve==='number')bezier++;}for(const n of Object.values(v))walk(n);}walk(d.animations);assert.ok(bezier>30);
 }
});
test('weighted meshes preserve approved neutral UV geometry after the actual Spine roundtrip',()=>{
 for(const id of ids){
  const d=read('assets/resources/actors/spine08/'+id+'.json'),m=mesh(d),source=read('assets/resources/actors/native08/'+id+'-geometry.json');
  const a=source.vertices[0],bx=source.vertices.reduce((v,n)=>Math.abs(n[2]-a[2])>Math.abs(v[2]-a[2])?n:v),by=source.vertices.reduce((v,n)=>Math.abs(n[3]-a[3])>Math.abs(v[3]-a[3])?n:v);
  const sx=(bx[0]-a[0])/(bx[2]-a[2]),sy=(by[1]-a[1])/(by[3]-a[3]),ox=a[0]-a[2]*sx,oy=a[1]-a[3]*sy;
  const matrices=poseMatrices({bones:d.bones}),weights=decode(d);
  for(const index of new Set(m.triangles)){
   const w=weights[index];assert.ok(w.length>0);assert.ok(Math.abs(w.reduce((s,x)=>s+x[3],0)-1)<.0001);
   const p=w.reduce((p,[i,x,y,k])=>{const v=point(matrices[d.bones[i].name],x,y);return[p[0]+v[0]*k,p[1]+v[1]*k];},[0,0]);
   const expected=[m.uvs[index*2]*sx+ox,m.uvs[index*2+1]*sy+oy];
   assert.ok(Math.hypot(p[0]-expected[0],p[1]-expected[1])<.13,id+' neutral vertex '+index);
  }
  assert.ok(weights.filter(w=>w.length>1).length>100,id+' has no local blending');
 }
});
test('idle preserves head, pelvis and planted feet without global squash',()=>{
 for(const id of ids){
  const a=read('assets/resources/actors/spine08/'+id+'.json').animations.idle;
  for(const n of ['PoseRoot','Hips','Chest','Neck','Head','FrontFoot','RearFoot','FrontFootTarget','RearFootTarget'])assert.equal(a.bones?.[n],undefined,id+' idle drifts '+n);
  for(const t of Object.values(a.bones))assert.equal(t.scale,undefined);
 }
});
test('death lands its body attachment and original head mesh on the original floor',()=>{
 for(const id of ids){
  const d=read('assets/resources/actors/spine08/'+id+'.json'),m=mesh(d),a=d.animations.death,matrices=poseMatrices({bones:d.bones},poseAtEnd(a)),weights=decode(d);
  for(const track of Object.values(a.ik))assert.equal(track.at(-1).mix??1,0);
  assert.equal(a.slots.Artwork.color.at(-1).color,'ffffff00');
  assert.equal(a.slots.Corpse.attachment.at(-1).name,'corpse');
  assert.equal(a.slots.CorpseHead.attachment.at(-1).name,'head');
  const meta=read('tools/spine/corpse-regions.json')[id],body=d.skins[0].attachments.Corpse.corpse,scale=body.width*(body.scaleY??1)/meta.size[0];
  const bodyY=matrices.Corpse[5]+(meta.size[1]/2-meta.bbox[3])*scale;
  assert.ok(Math.abs(bodyY+112)<.15,id+' corpse body ground '+bodyY);
  const head=d.skins[0].attachments.CorpseHead.head,headWeights=decode(d,head);
  assert.equal(head.path,'master08-thin');
  const y=Math.min(...headWeights.map(w=>w.reduce((s,[i,x,y,k])=>s+point(matrices[d.bones[i].name],x,y)[1]*k,0)));
  assert.ok(y>=-113&&y<-107,id+' corpse head ground '+y);
  assert.equal(hash('assets/resources/actors/spine08/'+id+'-corpse.png'),meta.sha256);
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
