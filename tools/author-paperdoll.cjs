/** Explicit native authoring step. Ordinary builds never run this tool. */
const N = require('./native-assets.cjs'),fs = require('node:fs'),path = require('node:path');
const base = 'assets/resources/actors/paperdoll08';
const bones = [
    ['Hips','Bones',0,186,0], ['Chest','Hips',0,114,0], ['Head','Chest',11,25,0], ['Cloak','Chest',-1,25,0], ['Pack','Chest',-45,5,0],
    ['RearUpperArm','Chest',-39,2,-7],['RearForearm','RearUpperArm',0,-61,3],['RearHand','RearForearm',0,-62,0],
    ['FrontUpperArm','Chest',39,-1,10],['FrontForearm','FrontUpperArm',0,-61,14],['FrontHand','FrontForearm',0,-62,0],['Weapon','FrontHand',5,-18,-78],
    ['RearThigh','Hips',-26,-12,0],['RearShin','RearThigh',0,-80,0],['RearFoot','RearShin',0,-68,0],
    ['FrontThigh','Hips',26,-12,0],['FrontShin','FrontThigh',0,-80,0],['FrontFoot','FrontShin',0,-68,0],
    ['RearTarget','Bones',-55,32,0],['FrontTarget','Bones',51,32,0],
];
// Order is a visual stack, independent of transform parentage. Anchors cover joints with overlapping caps.
const slots = [
    ['backpack','Pack',78,142,.58,.90],['rear-upper-arm','RearUpperArm',37,81,.50,.91],['rear-forearm','RearForearm',23,69,.5,.93],['rear-hand','RearHand',29,38,.5,.84],
    ['rear-thigh','RearThigh',52,92,.5,.93],['rear-shin','RearShin',24,72,.5,.94],['rear-boot','RearFoot',69,43,.36,.75],
    ['front-thigh','FrontThigh',56,92,.5,.93],['front-shin','FrontShin',25,72,.5,.94],['front-boot','FrontFoot',72,43,.36,.75],
    ['torso','Chest',87,135,.5,.86],['hips','Hips',100,80,.5,.64],['head','Head',109,103,.59,.10],['poncho','Cloak',149,142,.5,1],
    ['front-upper-arm','FrontUpperArm',39,81,.5,.91],['front-forearm','FrontForearm',24,69,.5,.93],['weapon','Weapon',105,25,.19,.5],['front-hand','FrontHand',27,38,.5,.84],
];
const definition={version:1,reference:'approved08',height:420,feetBaseline:0,bones:bones.map(([id,parent])=>({id,parent})),slots:slots.map(([id,bone])=>({id,bone})),legs:[
    {upper:'RearThigh',lower:'RearShin',foot:'RearFoot',target:'RearTarget',upperLength:80,lowerLength:68,bend:1},
    {upper:'FrontThigh',lower:'FrontShin',foot:'FrontFoot',target:'FrontTarget',upperLength:80,lowerLength:68,bend:-1},
]};
fs.writeFileSync(path.join(N.root,base,'rig.json'),JSON.stringify(definition,null,2)+'\n');
function makeClips() {
    const idlePath='PaperDoll/Bones/';const paths={Bones:idlePath.slice(0,-1)};
    for(const [name,parent] of bones) paths[name]=(paths[parent]??idlePath+parent)+'/'+name;
    const baseChannels={};for(const [name,,x,y,angle] of bones){if(name.endsWith('Target')||name.includes('Thigh')||name.includes('Shin')||name.includes('Foot'))continue;baseChannels[name+'.angle']={path:paths[name],prop:'angle',value:angle};}
    baseChannels['Hips.x']={path:paths.Hips,prop:'position',axis:'x',value:0};baseChannels['Hips.y']={path:paths.Hips,prop:'position',axis:'y',value:186};baseChannels['Cloak.scaleX']={path:paths.Cloak,prop:'scale',axis:'x',value:1};
    function clip(kind,duration,poses,times) {
        const graph=[{__type__:'cc.AnimationClip',_name:'PaperDoll08_'+kind,_objFlags:0,__editorExtras__:{},_native:'',sample:60,speed:1,wrapMode:kind==='idle'?2:1,enableTrsBlending:false,_duration:duration,_hash:0,_tracks:[],_exoticAnimation:null,_events:kind==='attack'?[{frame:.28,func:'notifyImpact',params:[]}]:[],_embeddedPlayers:[],_additiveSettings:null,_auxiliaryCurveEntries:[]}];
        const add=o=>(graph.push(o),N.ref(graph.length-1));
        const curveFor = (values) => add({__type__:'cc.RealCurve',_times:times,_values:values.map(value=>({__type__:'cc.RealKeyframeValue',interpolationMode:0,tangentWeightMode:0,value,rightTangent:0,rightTangentWeight:0,leftTangent:0,leftTangentWeight:0,easingMethod:2})),_preExtrapolation:1,_postExtrapolation:1});
        const vectors = new Map();
        for (const [key,c] of Object.entries(baseChannels)) if (c.axis) {
            const id = c.path + ':' + c.prop;
            if (!vectors.has(id)) vectors.set(id, {path:c.path,prop:c.prop,axes:{}});
            vectors.get(id).axes[c.axis] = {key,value:c.value};
        }
        for (const v of vectors.values()) {
            const hierarchy=add({__type__:'cc.animation.HierarchyPath',path:v.path}), trackPath=add({__type__:'cc.animation.TrackPath',_paths:[hierarchy,v.prop]});
            const channels=['x','y','z','w'].map(axis=>{
                const c=v.axes[axis], defaultValue=v.prop==='scale'?1:0;
                return add({__type__:'cc.animation.Channel',_curve:curveFor(times.map((t,i)=>c?poses[i]?.[c.key]??c.value:defaultValue))});
            });
            graph[0]._tracks.push(add({__type__:'cc.animation.VectorTrack',_binding:{__type__:'cc.animation.TrackBinding',path:trackPath},_channels:channels,_nComponents:3}));
        }
        for(const [key,c] of Object.entries(baseChannels)) {
            if(c.axis) continue;
            const curve=add({__type__:'cc.RealCurve',_times:times,_values:times.map((t,i)=>({__type__:'cc.RealKeyframeValue',interpolationMode:0,tangentWeightMode:0,value:poses[i]?.[key]??c.value,rightTangent:0,rightTangentWeight:0,leftTangent:0,leftTangentWeight:0,easingMethod:2})),_preExtrapolation:1,_postExtrapolation:1});
            const hierarchy=add({__type__:'cc.animation.HierarchyPath',path:c.path}),paths=[hierarchy,c.prop];if(c.axis)paths.push(c.axis);
            const trackPath=add({__type__:'cc.animation.TrackPath',_paths:paths}),channel=add({__type__:'cc.animation.Channel',_curve:curve});
            graph[0]._tracks.push(add({__type__:'cc.animation.RealTrack',_binding:{__type__:'cc.animation.TrackBinding',path:trackPath},_channel:channel}));
        }
        const file='assets/animations/paperdoll08/PaperDoll08_'+kind+'.anim';N.ensureMeta(file,'animation-clip');N.write(file,graph);
    }
    fs.mkdirSync(path.join(N.root,'assets/animations/paperdoll08'),{recursive:true});
    clip('idle',3,[{}, {'Cloak.scaleX':1.006,'RearUpperArm.angle':-6.5,'FrontForearm.angle':14.6},{}],[0,1.5,3]);
    clip('attack',.56,[{}, {'Hips.y':174,'Chest.angle':9,'FrontUpperArm.angle':-34,'FrontForearm.angle':60,'Weapon.angle':-78}, {'Hips.y':168,'Hips.x':6,'Chest.angle':-14,'FrontUpperArm.angle':104,'FrontForearm.angle':-5,'Weapon.angle':-85}, {'Hips.y':173,'Hips.x':8,'Chest.angle':-10,'FrontUpperArm.angle':110,'FrontForearm.angle':-10,'Weapon.angle':-85}, {'Hips.y':180,'Chest.angle':-3,'FrontUpperArm.angle':34,'FrontForearm.angle':25}, {}],[0,.15,.28,.34,.46,.56]);
    clip('hurt',.31,[{}, {'Chest.angle':12,'Hips.y':177,'Head.angle':-4,'FrontUpperArm.angle':-20},{}],[0,.12,.31]);
    clip('prepare',.56,[{}, {'Chest.angle':-3,'FrontForearm.angle':36,'Cloak.scaleX':1.006},{}],[0,.28,.56]);
    clip('death',.91,[{}, {'Hips.y':130,'Chest.angle':20,'Head.angle':8,'FrontUpperArm.angle':-20}, {'Hips.y':47,'Hips.x':-14,'Hips.angle':-72,'Chest.angle':0,'Head.angle':8,'FrontUpperArm.angle':-38}],[0,.34,.91]);
}
if(process.argv.includes('--prepare')) {makeClips();console.log('Prepared rig definition and five native transform AnimationClips.');process.exit(0);}
const frameIds={};for(const sheet of ['survivor-body','survivor-limbs'])for(const frame of Object.values(N.read(base+'/'+sheet+'.plist.meta').subMetas))frameIds[frame.name]=frame.uuid;
const file='assets/prefabs/actors/PlayerActor.prefab',graph=N.read(file),root=graph[0].data.__id__;
if(graph.some(o=>o.__type__==='cc.Node'&&o._name==='PaperDoll'))throw Error('PaperDoll already authored; edit existing native resource deliberately.');
const g=new N.Graph(file,'PlayerActor');g.graph=graph;g.root=root;
const rigRoot=g.node('PaperDoll',root,0,0,250,420),boneRoot=g.node('Bones',rigRoot,0,0,0,0),slotRoot=g.node('Slots',rigRoot,0,0,250,420),ids={Bones:boneRoot};
for(const [name,parent,x,y,angle]of bones){const id=g.node(name,ids[parent],x,y,0,0);ids[name]=id;graph[id]._euler=N.vec(0,0,angle);const half=angle*Math.PI/360;graph[id]._lrot={__type__:'cc.Quat',x:0,y:0,z:Math.sin(half),w:Math.cos(half)};}
const slotIds=[];
for(const [id,bone,width,height,ax,ay] of slots) {
    const node=g.node(id,slotRoot,0,0,width,height);slotIds.push(node);
    const transform=graph[graph[node]._components[0].__id__];transform._anchorPoint={__type__:'cc.Vec2',x:ax,y:ay};
    if(!frameIds[id])throw Error('Missing imported part: '+id);
    g.component(node,'cc.Sprite',{...N.cleanComponent(N.spriteTemplate),_spriteFrame:N.asset(frameIds[id],'cc.SpriteFrame'),_sizeMode:0,_isTrimmedMode:false,_color:N.color('ffffff'),_type:0});
}
const rig=g.component(root,N.script('PaperDollRig'),{definition:N.asset(N.uuid(base+'/rig.json'),'cc.JsonAsset'),bones:bones.map(([name])=>N.ref(ids[name])),slots:slotIds.map(N.ref)});
const actor=graph.find(o=>o.__type__===N.script('ActorPresentation'));actor.paperDoll=N.ref(rig);actor.actorId='player';
for(const kind of ['idle','attack','hurt','prepare','death'])actor[kind]=N.asset(N.uuid('assets/animations/paperdoll08/PaperDoll08_'+kind+'.anim'),'cc.AnimationClip');
for(const [property,kind] of [['armedIdle','idle'],['armedAttack','attack'],['armedHurt','hurt']])actor[property]=actor[kind];
graph.find(o=>o.__type__==='cc.Node'&&o._name==='Visual')._active=false;
const anim=graph.find(o=>o.__type__==='cc.Animation');anim._clips=['idle','attack','hurt','prepare','death'].map(k=>actor[k]);anim._defaultClip=actor.idle;anim._playOnLoad=false;
g.save();console.log('Connected survivor native bones, 18 slots, planted feet and five clips to existing PlayerActor prefab.');
