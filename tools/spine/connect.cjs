const fs=require('node:fs');
const N=require('../native-assets.cjs');
const {roles}=require('./rig-authoring.cjs');
function connect(actor){
 const file='assets/prefabs/actors/'+roles[actor].prefab+'.prefab';
 const graph=N.read(file),root=graph[0].data.__id__;
 const visual=graph.findIndex(o=>o.__type__==='cc.Node'&&o._name==='Visual');
 const presentation=graph.find(o=>o.__type__===N.script('ActorPresentation'));
 if(visual<0||!presentation)throw Error('Missing actor bindings: '+actor);
 let node=graph.findIndex(o=>o.__type__==='cc.Node'&&o._name==='Spine08');
 function add(value){graph.push(value);return graph.length-1;}
 function component(node,type,fields){
  const index=add({__type__:type,_name:'',_objFlags:0,__editorExtras__:{},node:N.ref(node),_enabled:true,__prefab:null,...fields,_id:N.identifier(file+':spine08:'+type)});
  graph[index].__prefab=N.ref(add({__type__:'cc.CompPrefabInfo',fileId:N.identifier(file+':spine08:component:'+type)}));
  graph[node]._components.push(N.ref(index));return index;
 }
 if(node<0){
  node=add({__type__:'cc.Node',_name:'Spine08',_objFlags:0,__editorExtras__:{},_parent:N.ref(visual),_children:[],_active:true,_components:[],_prefab:null,_lpos:N.vec(),_lrot:{__type__:'cc.Quat',x:0,y:0,z:0,w:1},_lscale:N.vec(1,1,1),_mobility:0,_layer:33554432,_euler:N.vec(),_id:N.identifier(file+':Spine08')});
  graph[node]._prefab=N.ref(add({__type__:'cc.PrefabInfo',root:N.ref(root),asset:N.ref(0),fileId:N.identifier(file+':Spine08:prefab')}));
  graph[visual]._children.push(N.ref(node));
  component(node,'cc.UITransform',{_contentSize:{__type__:'cc.Size',width:640,height:256},_anchorPoint:{__type__:'cc.Vec2',x:.5,y:.5}});
 }
 let skeleton=graph[node]._components.map(r=>r.__id__).find(i=>graph[i].__type__==='sp.Skeleton');
 if(skeleton===undefined)skeleton=component(node,'sp.Skeleton',{});
 Object.assign(graph[skeleton],{_enabled:true,_customMaterial:null,_color:N.color('ffffff'),_skeletonData:N.asset(N.uuid('assets/resources/actors/spine08/'+actor+'.json'),'sp.SkeletonData'),defaultSkin:'default',defaultAnimation:'',loop:true,_premultipliedAlpha:false,_timeScale:1,_preCacheMode:-1,_cacheMode:0,_sockets:[],_useTint:false,_debugMesh:false,_debugBones:false,_debugSlots:false,_enableBatch:false});
 let rig=graph[node]._components.map(r=>r.__id__).find(i=>graph[i].__type__===N.script('SpineActorRig'));
 if(rig===undefined)rig=component(node,N.script('SpineActorRig'),{});
 Object.assign(graph[rig],{skeleton:N.ref(skeleton),contract:N.asset(N.uuid('assets/resources/actors/spine08/'+actor+'.contract.json'),'cc.JsonAsset')});
 presentation.spineRig=N.ref(rig);
 for(const object of graph){
  if(object.__type__==='cc.Node'&&['NativeBones','PaperDoll'].includes(object._name))object._active=false;
  if(object.__type__===N.script('NativeActorSkin')||object.__type__===N.script('StableActorSprite'))object._enabled=false;
 }
 N.write(file,graph);
 return {actor,file,skeletonUuid:N.uuid('assets/resources/actors/spine08/'+actor+'.json')};
}
const arg=process.argv.indexOf('--actor'),actors=arg<0?Object.keys(roles):[process.argv[arg+1]];
for(const actor of actors)console.log(JSON.stringify(connect(actor)));
