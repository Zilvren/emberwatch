/** One-off schema migration preserving all existing scene/prefab UUIDs and local file IDs. */
const N=require('./native-assets.cjs'),fs=require('node:fs'),path=require('node:path');
const runtime=require('./runtime-scripts.cjs');
runtime.scripts.GameView='assets/game/presentation/ui/GameView.ts';runtime.scripts.PaperDollRig='assets/game/presentation/actors/PaperDollRig.ts';
const runtimeFile=path.join(N.root,'tools/runtime-scripts.cjs');let source=fs.readFileSync(runtimeFile,'utf8');
if(!source.includes('"GameView":'))source=source.replace('const scripts={','const scripts={"GameView":"assets/game/presentation/ui/GameView.ts","PaperDollRig":"assets/game/presentation/actors/PaperDollRig.ts",');
fs.writeFileSync(runtimeFile,source);
const prefabs=new Map();function collect(dir){for(const e of fs.readdirSync(path.join(N.root,dir),{withFileTypes:true})){const file=dir+'/'+e.name;if(e.isDirectory())collect(file);else if(file.endsWith('.prefab'))prefabs.set(N.uuid(file),file);}}collect('assets/prefabs');
const file='assets/TheEnd.scene',scene=N.read(file),director=scene.find(o=>o.__type__===N.script('GameDirector'));
if(director.screenRoots)throw Error('Named view schema already migrated. Inspect/edit current bindings explicitly.');
const main=new N.Graph(file,'TheEnd');main.graph=scene;
function tag(nodeRef,key){const node=scene[nodeRef.__id__], info=node._prefab?scene[node._prefab.__id__]:null;
 if(info?.asset?.__uuid__){const file=prefabs.get(info.asset.__uuid__);if(!file)throw Error('Unknown prefab UUID');const g=new N.Graph(file,key);g.graph=N.read(file);g.root=g.graph[0].data.__id__;if(g.graph.some(o=>o.__type__===N.script('GameView')))throw Error('Duplicate tag '+file);g.component(g.root,N.script('GameView'),{key});g.save();}
 else main.component(nodeRef.__id__,N.script('GameView'),{key});
}
const phases=['journal','map','battle','rewards','rest','shelter','day2','failure'],popups=['inventory','help','log','confirmation','map','entry'];
director.screens.forEach((ref,i)=>tag(ref,phases[i]));director.popups.forEach((ref,i)=>tag(ref,popups[i]));
// Deliberately change serialized ordering: routing must follow keys, never numeric positions.
director.screenRoots=[...director.screens].reverse();director.popupRoots=[...director.popups].reverse();delete director.screens;delete director.popups;main.save();
for(const [file,id]of [['PlayerActor','player'],['WandererActor','wanderer'],['BruteActor','brute']]){const path='assets/prefabs/actors/'+file+'.prefab',g=N.read(path);g.find(o=>o.__type__===N.script('ActorPresentation')).actorId=id;N.write(path,g);}
console.log('Tagged 8 screens and 6 popups; migrated arrays in reverse order; bound native actor identities.');
