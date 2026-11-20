const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const N=require('../tools/native-assets.cjs');
const byUUID=new Map();function files(dir){for(const e of fs.readdirSync(path.join(N.root,dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())files(p);else if(p.endsWith('.prefab'))byUUID.set(N.uuid(p),p);}}files('assets/prefabs');
function descriptors(graph,id,component){
 const node=graph[id],out=(node._components??[]).map(r=>graph[r.__id__]).filter(o=>o.__type__===N.script(component));
 const info=node._prefab?graph[node._prefab.__id__]:null;
 if(info?.asset?.__uuid__){const file=byUUID.get(info.asset.__uuid__);assert.ok(file,'Unresolved native prefab '+info.asset.__uuid__);const linked=N.read(file);out.push(...descriptors(linked,linked[0].data.__id__,component));}
 for(const child of node._children??[])out.push(...descriptors(graph,child.__id__,component));
 return out;
}
test('the actual scene has exactly one native identity per required screen/popup, independent of reversed arrays',()=>{
 const g=N.read('assets/TheEnd.scene'),director=g.find(o=>o.__type__===N.script('GameDirector'));
 assert.equal(director.screens,undefined);assert.equal(director.popups,undefined);
 const screens=director.screenRoots.map(r=>descriptors(g,r.__id__,'GameView')),popups=director.popupRoots.map(r=>descriptors(g,r.__id__,'GameView'));
 assert.ok([...screens,...popups].every(d=>d.length===1));
 assert.deepEqual(screens.flat().map(d=>d.key).sort(),['battle','day2','failure','journal','map','rest','rewards','shelter']);
 assert.deepEqual(popups.flat().map(d=>d.key).sort(),['confirmation','entry','help','inventory','log','map','recipes']);
 const battle=director.screenRoots.find(r=>descriptors(g,r.__id__,'GameView')[0].key==='battle');
 assert.deepEqual(descriptors(g,battle.__id__,'ActorPresentation').map(a=>a.actorId).sort(),['brute','player','wanderer']);
});
test('all three active actors use original08 native parts and one contact event',()=>{
 for(const [role,prefab] of [['survivor','PlayerActor'],['wanderer','WandererActor'],['brute','BruteActor']]){
  const g=N.read('assets/prefabs/actors/'+prefab+'.prefab'),actor=g.find(o=>o.__type__===N.script('ActorPresentation')),skin=g[actor.artwork.__id__];
  assert.equal(actor.paperDoll,null);assert.equal(skin.__type__,N.script('NativeActorSkin'));assert.equal(skin.boneNodes.length,10);
  assert.equal(g.find(o=>o.__type__==='cc.Node'&&o._name==='Visual')._active,true);
  const data=N.read('assets/resources/actors/native08/'+role+'-skin.json'),attack=N.read('assets/animations/native08/Native08_'+role+'_attack.anim');
  assert.ok(!attack.some(o=>o.__type__==='cc.ObjectCurve'));assert.equal(attack[0]._duration,data.attackDuration);assert.deepEqual(attack[0]._events,[{frame:data.contactTime,func:'notifyImpact',params:[]}]);
  assert.ok(attack.filter(o=>o.__type__==='cc.RealCurve').every(c=>c._values.every(v=>v.interpolationMode===2)));
 }
 assert.equal(N.uuid('assets/TheEnd.scene'),'86d36187-47fe-4fe2-8e38-2e48b58dcf9e');
});
