// Update the existing actor prefabs in place; preserve every existing node/component fileId.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const write=(file,data)=>fs.writeFileSync(path.join(root,file),JSON.stringify(data,null,2)+'\n');
const engine=path.join(process.env.APPDATA,'cocos-default/cocos-4.0.0-beta.1');
const {compressUUID}=require(path.join(engine,'dist/core/base/utils/uuid.js'));
const uuid=file=>read(file+'.meta').uuid;
const asset=(id,type)=>({__uuid__:id,__expectedType__:type});
const vec=(x,y,z=1)=>({__type__:'cc.Vec3',x,y,z});
const manifest=read('assets/resources/actors/sketch08/motion-manifest.json');
const stableType=compressUUID(uuid('assets/game/presentation/actors/StableActorSprite.ts'),false);
const presentationType=compressUUID(uuid('assets/game/presentation/actors/ActorPresentation.ts'),false);
const master=Object.values(read('assets/resources/actors/sketch08/master08-thin.png.meta').subMetas).find(m=>m.importer==='sprite-frame');
for(const [actor,prefab]of Object.entries({survivor:'PlayerActor',wanderer:'WandererActor',brute:'BruteActor'})){
 const file='assets/prefabs/actors/'+prefab+'.prefab',g=read(file);
 const visual=g.find(o=>o.__type__==='cc.Node'&&o._name==='Visual');
 const sprite=visual._components.map(r=>g[r.__id__]).find(o=>o.__type__==='cc.Sprite'||o.__type__===stableType);
 Object.assign(sprite,{__type__:stableType,geometry:asset(uuid('assets/resources/actors/sketch08/'+actor+'-rig.json'),'cc.JsonAsset'),_spriteFrame:asset(master.uuid,'cc.SpriteFrame'),_sizeMode:0,_isTrimmedMode:false});
 const scale=420/manifest.actors[actor].baseHeight;
 visual._lscale=vec(scale,scale);visual._lpos=vec(0,112*scale,0);
 const ui=visual._components.map(r=>g[r.__id__]).find(o=>o.__type__==='cc.UITransform');ui._contentSize={__type__:'cc.Size',width:640,height:256};
 const presentation=g.find(o=>o.__type__===presentationType),clips={};
 for(const action of ['idle','attack','hurt','death'])clips[action]=asset(uuid('assets/animations/sketch08/Sketch08_'+actor+'_'+action+'.anim'),'cc.AnimationClip');
 const prepareFile='assets/animations/sketch08/Sketch08_'+actor+'_prepare.anim';
 const prepare=read('assets/animations/sketch08/Sketch08_'+actor+'_idle.anim');
 prepare[0]._name='Sketch08_'+actor+'_prepare';prepare[0]._duration=.56;prepare[0].wrapMode=1;prepare[0]._events=[{frame:.28,func:'notifyImpact',params:[]}];
 for(const curve of prepare.filter(o=>o.__type__==='cc.RealCurve'||o.__type__==='cc.ObjectCurve'))curve._times=curve._times.map(t=>t/3*.56);
 write(prepareFile,prepare);
 if(!fs.existsSync(path.join(root,prepareFile+'.meta')))write(prepareFile+'.meta',{ver:'2.0.3',importer:'animation-clip',imported:false,uuid:require('node:crypto').randomUUID(),files:[],subMetas:{},userData:{}});
 clips.prepare=asset(uuid(prepareFile),'cc.AnimationClip');
 Object.assign(presentation,clips,{armedIdle:clips.idle,armedAttack:clips.attack,armedHurt:clips.hurt});
 Object.assign(g.find(o=>o.__type__==='cc.Animation'),{playOnLoad:false,_clips:Object.values(clips),_defaultClip:clips.idle});
 write(file,g);
}
console.log('Installed 08 actors into the existing three game prefabs; UUIDs and fileIds retained.');
