// Register the imported native glTF prefab and build a dedicated character review scene.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {root,read,ref,asset,color,script,ensureMeta,Graph}=require('../native-assets.cjs');
const sceneFile='assets/SurvivorToonReview.scene';
const model='assets/ashen-survivor-toon/survivor.glb';
const component='assets/game/presentation/actors/SurvivorToonReview.ts';
function meta(file,ver,importer,userData={}) {
    const name=path.join(root,file+'.meta');
    if(!fs.existsSync(name))fs.writeFileSync(name,JSON.stringify({ver,importer,imported:false,uuid:crypto.randomUUID(),files:[],subMetas:{},userData},null,2)+'\n');
    return read(file+'.meta');
}
const prefab=Object.values(meta(model,'2.3.14','gltf',{mountAllAnimationsOnPrefab:true,allowMeshDataAccess:true}).subMetas).find(m=>m.importer==='gltf-scene');
meta(component,'4.0.24','typescript');
const effect='assets/ashen-survivor-toon/painted.effect';
const effectId=meta(effect,'1.7.1','effect').uuid;
const sceneId=ensureMeta(sceneFile,'scene');
const scene=new Graph(sceneFile,'SurvivorToonReview');
const stage=scene.graph[scene.graph[0].scene.__id__];stage._id=sceneId;stage._name=scene.graph[0]._name='SurvivorToonReview';
const canvas=scene.graph[scene.root];canvas._children=canvas._children.filter(c=>scene.graph[c.__id__]._name==='Camera');
const uiCamera=scene.graph[scene.graph[canvas._children[0].__id__]._components.map(c=>c.__id__).find(i=>scene.graph[i].__type__==='cc.Camera')];
uiCamera._priority=10;uiCamera._clearFlags=6;uiCamera._visibility=1<<25;
scene.root=scene.node('SurvivorToonReview',scene.root);
scene.shape('ControlStrip',0,-406,1440,88,'2c2634',238);
const controls=[['Lantern','照明','lantern'],['Guard','格挡','guard'],['Repel','回击','repel'],['View','转动机位','turn'],['Framing','看全身','frame'],['Speed','速度 ×1','speed'],['Pose','看站姿','pose'],['Finish','看素模','finish']];
const buttons=controls.map(([n,t,m],i)=>scene.button(n,t,(i-3.5)*174,-406,m,'SurvivorToonReview'));
for(const [i,{node,caption}] of buttons.entries()) {
    const surface=scene.graph[node]._components.map(x=>scene.graph[x.__id__]).find(x=>x.__type__===script('PixelGraphic'));
    surface.fill=color(i<3?'69565d':'463e4b'); scene.graph[caption]._color=color('f2e4d7');
}
const status=scene.label('Action','思考',-611,391,170,44,21,'f0e2d3');
const bg=read('assets/ashen-survivor/light-cut-passage.png.meta');
scene.component(scene.root,script('SurvivorToonReview'),{model:prefab?asset(prefab.uuid,'cc.Prefab'):null,
    paint:asset(effectId,'cc.EffectAsset'),passage:asset(Object.values(bg.subMetas).find(s=>s.importer==='texture').uuid,'cc.Texture2D'),
    status:ref(status.label),frameCaption:ref(buttons[4].caption),speedCaption:ref(buttons[5].caption),poseCaption:ref(buttons[6].caption),finishCaption:ref(buttons[7].caption)});
scene.graph[stage._prefab.__id__].fileId=sceneId;scene.graph[stage._prefab.__id__].nestedPrefabInstanceRoots=[];
scene.save();
const config=read('build-actor-review.json');Object.assign(config,{name:'the-end-survivor-toon',outputName:'survivor-toon',startScene:sceneId,scenes:[{url:'db://'+sceneFile,uuid:sceneId}]});
fs.writeFileSync(path.join(root,'build-survivor-toon.json'),JSON.stringify(config,null,2)+'\n');
console.log(prefab?'Bound imported native model '+prefab.uuid:'Scene ready for first glTF import. Rerun after the importer has created sub-assets.');
