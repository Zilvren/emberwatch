// Author five editable Cocos clips and the independent frame-animation review scene.
const fs = require('node:fs');
const path = require('node:path');
const { root, read, Graph, ref, vec, asset, color, ensureMeta, uuid, cleanComponent, spriteTemplate } = require('../native-assets.cjs');
const sdk = path.join(process.env.APPDATA, 'cocos-default', 'cocos-' + read('.pink/settings.json')['cocos.engine.version']);
const { compressUUID } = require(path.join(sdk, 'dist/core/base/utils/uuid.js'));
const dir = 'assets/ashen-survivor-frames';
const record = read('art-source/ashen-labyrinth/battle-survivor/frames/registration.json');
const ids = ['Lantern', 'Guard', 'Repel'];
const levels = ['low', 'middle', 'high'];
const fps = 25;
const json = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n');
const script = name => compressUUID(uuid(dir + '/' + name + '.ts'), false);
const basics = cleanComponent(spriteTemplate);
delete basics.geometry;

function frames(file) {
    const items = Object.values(read(file + '.meta').subMetas).filter(x => x.importer === 'sprite-frame');
    return Object.fromEntries(items.map(x => [x.name || x.displayName, asset(x.uuid, 'cc.SpriteFrame')]));
}
const cels = Object.assign({},...record.atlases.map(name=>frames(dir+'/'+name+'.plist')));
const props = frames(dir+'/survivor-props.plist');
for (const key of record.exposures) if (!cels[key]) throw Error('Pink has not imported the cel '+key);

const obj = read('assets/animations/PlayerArmedAttack.anim').slice(0, 7);
const movement = read('assets/animations/PlayerArmedAttack.anim').slice(7, 18);
const number = read('assets/animations/CardDraw.anim');
const settings = read('assets/animations/PlayerArmedAttack.anim').at(-1);
const copy = value => JSON.parse(JSON.stringify(value));

// Templates are the project's installed SDK serialization. Rebase only their
// internal object references, so the newly authored tracks remain editable.
function append(graph, source, oldStart) {
    const start = graph.length;
    const block = copy(source);
    function rebase(value) {
        if (!value || typeof value !== 'object') return;
        if ('__id__' in value) { value.__id__ += start-oldStart; return; }
        Object.values(value).forEach(rebase);
    }
    block.forEach(rebase);
    graph.push(...block);
    graph[0]._tracks.push(ref(start));
    return block;
}
function keys(curve, times, values) {
    const seed = number.find(x => x.__type__ === 'cc.RealCurve')._values[0];
    curve._times = times.map(t => t/fps);
    curve._values = values.map(value => ({ ...seed, value }));
}
function vector(graph, node, property, times, values) {
    const b = append(graph, movement, 7);
    b[1]._paths[1] = property;
    b[2].path = node;
    for (let i=0; i<2; i++) keys(b[4+i*2], times, values.map(p => p[i]));
    for (const i of [8,10]) { b[i]._times = []; b[i]._values = []; }
}
function opacity(graph, node, times, values) {
    const b = append(graph, number.slice(1,7), 1);
    b[2].path = node;
    keys(b[5], times, values);
}
function angle(graph, node, times, values) {
    const b = append(graph, movement, 7);
    b[1]._paths[1] = 'eulerAngles';
    b[2].path = node;
    for (const i of [4,6,10]) { b[i]._times=[]; b[i]._values=[]; }
    keys(b[8], times, values);
}
function body(graph, exposure) {
    const b = append(graph,obj.slice(1,7),1);
    b[2].path = 'Body';
    b[5]._times = exposure.map(([t]) => t/fps);
    b[5]._values = exposure.map(([,key]) => cels[key]);
}
const tips = levels.map(level => record.fingers['touch-'+level]);
const cardSize = [43, 60.92];
const angles = [13, 0, -12];
// Contact is two pixels inside the left edge. The high card is touched near
// its lower-left corner, leaving space for the middle card to fly underneath.
const touch = tips.map(([x,y],i) => {
    const radius = angles[i]*Math.PI/180, half = cardSize[0]/2-2;
    const lowEdge = [0,-9,24][i];
    return [
        x-256+half*Math.cos(radius)-lowEdge*Math.sin(radius),
        472-y+half*Math.sin(radius)+lowEdge*Math.cos(radius),
    ];
});
const rest = touch.map(([x,y]) => [x,y-13]);
const lerp = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
const shift = (p,dx,dy) => [p[0]+dx,p[1]+dy];
const think = [[0,'think'],[31,'inhale'],[58,'think']];
const fanPose = [[0,'think']];
const flickPoses = Object.fromEntries(levels.map(level=>[level,[
    [0,'think'],[2,'lift'],[5,'coil'],[8,'reach-'+level],[11,'touch-'+level],
    [12,'sweep-'+level],[16,'recoil'],[21,'return'],[25,'think'],
]]));
function makeClip(name, chosen=-1) {
    const fan = name === 'Fan', idle = name === 'Think';
    const duration = fan ? 16 : idle ? 85 : 30;
    const g = [copy(obj[0])];
    Object.assign(g[0], {_name:name,sample:fps,wrapMode:idle?2:1,_duration:duration/fps,_events:[],_tracks:[]});
    body(g,idle ? think : fan ? fanPose : flickPoses[levels[chosen]]);
    for (let i=0; i<ids.length; i++) {
        const face = ids[i]+'/Face';
        const p = rest[i], a = angles[i];
        if (fan) {
            const origin = [17,176];
            const t = [0,2,5,10,14,16];
            vector(g,face,'position',t,[origin,origin,lerp(origin,p,.32),lerp(origin,p,1.04),p,p]);
            angle(g,face,t,[0,0,a*.32,a*1.12,a,a]);
            vector(g,face,'scale',t,[[.12,.74],[.24,.8],[.72,.91],[1.03,1.01],[1,1],[1,1]]);
            opacity(g,face,[0,2,5,16],[0,80,255,255]);
        } else if (idle) {
            const t = [0,18,40,63,85], s = [0,1,0,-1,0].map(v => v*(1.15+i*.34));
            vector(g,face,'position',t,s.map(d=>shift(p,0,d)));
            angle(g,face,t,s.map(d=>a+d*.35));
            vector(g,face,'scale',[0],[[1,1]]); opacity(g,face,[0],[255]);
        } else if (i === chosen) {
            const t = [0,5,8,11,12,14,17,21,25,30], contact=touch[i];
            const lane=[-.48,-.24,.20][i];
            const launch=dx=>shift(contact,dx,dx*lane);
            vector(g,face,'position',t,[p,shift(p,0,3),shift(p,0,7),contact,
                launch(23),launch(100),launch(248),launch(439),launch(615),launch(615)]);
            angle(g,face,t,[a,a+2,a+3,a,a-6,a-24,a-48,a-71,a-89,a-89]);
            vector(g,face,'scale',t,[[1,1],[1,1],[1,1],[1,1],[.86,1],[.19,.96],
                [-.66,.9],[-.24,.77],[.23,.59],[.23,.59]]);
            opacity(g,face,[0,17,22,25,30],[255,255,145,0,0]);
        } else {
            vector(g,face,'position',[0],[p]); angle(g,face,[0],[a]);
            vector(g,face,'scale',[0],[[1,1]]); opacity(g,face,[0],[255]);
        }
    }
    if (chosen>=0) g[0]._events.push({frame:11/fps,func:'onCardRelease',params:[]});
    g[0]._additiveSettings=ref(g.length); g.push(copy(settings));
    const file=dir+'/'+name+'.anim'; json(file,g);
    return asset(ensureMeta(file,'animation-clip'),'cc.AnimationClip');
}
function sprite(graph, node, frame, tint='ffffff') {
    return graph.component(node,'cc.Sprite',{...basics,_spriteFrame:frame,_sizeMode:0,_color:color(tint)});
}
const clips = ['Fan','Think',...ids.map(s=>'Flick'+s)].map((n,i)=>makeClip(n,i-2));
const prefabFile = dir+'/AshenSurvivorFrames.prefab';
const prefab = new Graph(prefabFile,'AshenSurvivorFrames');
const actor = prefab.node('AshenSurvivorFrames',null,0,0,512,944);
for (const [i,n] of ids.entries()) {
    const slot = prefab.node(n,actor,0,0,1,1);
    const face = prefab.node('Face',slot,rest[i][0],rest[i][1],...cardSize);
    sprite(prefab,face,props[n.toLowerCase()]);
    prefab.component(face,'cc.UIOpacity',{_opacity:255});
}
sprite(prefab,prefab.node('Body',actor,0,0,512,944),cels.think);
prefab.component(actor,'cc.Animation',{playOnLoad:false,_playOnLoad:false,_clips:clips,_defaultClip:clips[1]});
prefab.component(actor,script('SurvivorFramePlayer'));
prefab.save(); ensureMeta(prefabFile,'prefab');

const sceneFile='assets/SurvivorFrameReview.scene';
const sceneId=ensureMeta(sceneFile,'scene'), scene=new Graph(sceneFile,'SurvivorFrameReview');
const sceneObject=scene.graph[scene.graph[0].scene.__id__];
sceneObject._id=sceneId; sceneObject._name=scene.graph[0]._name='SurvivorFrameReview';
const canvas=scene.graph[scene.root];
canvas._children=canvas._children.filter(item=>scene.graph[item.__id__]._name==='Camera');
scene.root=scene.node('Review',scene.root);
const review=scene.root;
const bg=Object.values(read('assets/ashen-survivor/light-cut-passage.png.meta').subMetas).find(m=>m.importer==='sprite-frame');
sprite(scene,scene.node('Passage',review,0,0,1440,900),asset(bg.uuid,'cc.SpriteFrame'),'ded5df');
scene.shape('Ground',-81,-345,130,13,'39313d',84,true);
scene.root=scene.node('Figure',review,-39,20);
scene.graph[scene.root]._lscale=vec(.82,.82,1);
scene.linked(prefabFile,'Survivor',0,0);
scene.root=scene.node('Controls',review,0,-416,1440,68);
scene.shape('Strip',0,0,1440,68,'302a37',247);
const labels = [['Lantern','1  照明'],['Guard','2  格挡'],['Repel','3  回击'],['Deal','重新展牌'],['Speed','速度 ×1'],['Pause','暂停'],['Framing','看手势']];
const controls=scene.root;
labels.forEach(([n,t],i)=>{
    scene.root=controls;
    scene.root=scene.shape(n,(i-3)*169,0,151,42,i<3?'5f505c':'463e4c');
    scene.label('Caption',t,0,0,146,38,18,'f5eadf');
});
scene.component(review,script('SurvivorFrameReview'));
const prefabInfo=scene.graph[sceneObject._prefab.__id__];
prefabInfo.fileId=sceneId; prefabInfo.nestedPrefabInstanceRoots=scene.links;
scene.save();
const config=read('build-actor-review.json');
Object.assign(config,{name:'the-end-survivor-frames',outputName:'survivor-frames',startScene:sceneId,
    scenes:[{url:'db://'+sceneFile,uuid:sceneId}]});
json('build-survivor-frames.json',config);
json('art-source/ashen-labyrinth/battle-survivor/frames/preview/timing.json',{
    fps,thinkSeconds:85/fps,fanSeconds:16/fps,attackSeconds:30/fps,releaseAt:11/fps,
    poses: {think,fan:fanPose,flicks:flickPoses},
    cards: rest.map(([x,y],i)=>({width:cardSize[0],height:cardSize[1],angle:angles[i],
        rest:[x+256,472-y],contact:[touch[i][0]+256,472-touch[i][1]]})),
});
