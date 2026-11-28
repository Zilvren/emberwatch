const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const load=require('../tools/load-ts.cjs').createLoader();
const geometry=load(path.join(root,'assets/game/presentation/actors/SpineRigGeometry.ts'));
const {poseMatrices,point}=require('../tools/spine/rig-authoring.cjs');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const ids=['survivor','wanderer','brute'];

test('labyrinth enemies have no projectile and the idol keeps its original stationary attack', () => {
 const {LABYRINTH_ENEMIES}=load(path.join(root,'assets/game/core/content/LabyrinthEnemies.ts'));
 for(const actor of new Set(Object.values(LABYRINTH_ENEMIES).map(enemy=>enemy.actorId))){
  const prefix='assets/ashen-labyrinth/'+actor+'/'+actor;
  const rig=read(prefix+'.json'),contract=read(prefix+'.contract.json'),attack=rig.animations.attack;
  assert.deepEqual(attack.events,[{time:contract.motions.attack.contact,name:'impact'}],actor);
  assert.ok(!contract.flight,actor);
  if(['veil-idol','charybdis','symplegades'].includes(actor)){
   assert.equal(contract.stationaryAttack,true,actor);
   assert.equal(attack.bones[contract.approachBone],undefined,actor);
  }
  if(actor==='veil-idol'){
   const original=read('art-source/ashen-labyrinth/battle-bestiary/veil-idol/runtime/veil-idol.json');
   assert.deepEqual(attack,original.animations.attack);
   assert.ok(attack.bones['left-sleeve'].rotate.length>1);
   assert.equal(contract.motions.attack.contact,.68);
   assert.equal(contract.motions.attack.duration,1.24);
  }
 }
});
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
const keeperFile = 'assets/ashen-labyrinth/lantern-keeper/lantern-keeper';
test('Lantern Keeper cloth, lining and limbs sample their original pixels on one registered grid', () => {
    const {PNG}=require('../tools/spine/bestiary-assets.cjs');
    const dir='art-source/ashen-labyrinth/lantern-keeper/';
    const spec=read(dir+'standing-registration.json'), rig=read(keeperFile+'.json'), contract=read(keeperFile+'.contract.json');
    const image=file=>PNG.sync.read(fs.readFileSync(path.join(root,file)));
    assert.equal(hash(dir+spec.reference),contract.sourceSha256);
    const reference=image(dir+spec.reference), transform=poseMatrices(rig), regions=new Map();
    for(const page of fs.readFileSync(path.join(root,keeperFile+'.atlas'),'utf8').trim().split(/\r?\n\s*\r?\n/)){
        const filename=page.split(/\r?\n/)[0], texture=image(path.join(path.dirname(keeperFile),filename));
        assert.ok(texture.width<=2048 && texture.height<=2048);
        for(const match of page.matchAll(/^([\w-]+)\s+rotate: false\s+xy: (\d+), (\d+)\s+size: (\d+), (\d+)/gm))
            regions.set(match[1],{texture,rect:match.slice(2).map(Number)});
    }
    const meshes=[];
    for(const slot of rig.slots.filter(s=>s.attachment && s.name!=='card')){
        const m=rig.skins[0].attachments[slot.name][slot.attachment], region=regions.get(m.path);
        const [left,top,w,h]=contract.parts.find(part=>part.name===m.path).sourceRect;
        assert.deepEqual(region.rect.slice(2),[w,h]);
        const weights=decode(rig,m);
        weights.forEach((influences,i)=>{
            let x=0,y=0;
            for(const [bone,bx,by,weight] of influences){
                const xy=point(transform[rig.bones[bone].name],bx,by);
                x+=xy[0]*weight; y+=xy[1]*weight;
            }
            const px=spec.origin[0]+x/spec.unitsPerPixel, py=spec.origin[1]-y/spec.unitsPerPixel;
            assert.ok(Math.abs(px-left-m.uvs[i*2]*w)<.002 && Math.abs(py-top-m.uvs[i*2+1]*h)<.002,slot.name);
        });
        meshes.push({m,region,left,top,w,h});
    }
    function contains(mesh,u,v) {
        for(let k=0;k<mesh.triangles.length;k+=3) {
            const [a,b,c]=mesh.triangles.slice(k,k+3).map(i=>[mesh.uvs[2*i],mesh.uvs[2*i+1]]);
            const side=(p,q)=>(q[0]-p[0])*(v-p[1])-(q[1]-p[1])*(u-p[0]);
            if(side(a,b)>=-1e-9 && side(b,c)>=-1e-9 && side(c,a)>=-1e-9)return true;
        }
        return false;
    }
    for(const [px,py] of [[631,373],[440,477],[200,842],[130,960],[94,1168],[57,1260],
        [375,807],[391,912],[718,461],[598,652],[327,1446]]){
        const black=[0,0,0],white=[255,255,255];
        for(const {m,region,left,top,w,h} of meshes){
            const x=px-left,y=py-top;
            if(x<0 || y<0 || x>=w || y>=h || !contains(m,(x+.5)/w,(y+.5)/h))continue;
            const [ox,oy]=region.rect, rgb=region.texture.data, p=4*((oy+y)*region.texture.width+ox+x), a=rgb[p+3];
            for(const dest of [black,white]) for(let c=0;c<3;c++)dest[c]=Math.round((rgb[p+c]*a+dest[c]*(255-a))/255);
        }
        const i=4*(py*reference.width+px), a=reference.data[i+3];
        assert.ok(a>128);
        for(let c=0;c<3;c++){
            const target=Math.round(reference.data[i+c]*a/255);
            assert.ok(Math.abs(black[c]-target)<=1 && Math.abs(white[c]-(target+255-a))<=1,`Source pixel ${px},${py}`);
        }
    }
});
test('the Lantern Keeper places the shoulder under the cape and the forearm over its lining', () => {
    const rig = read(keeperFile + '.json');
    const z = rig.slots.map(({ name }) => name);
    for (const [behind, front] of [['cloak-back','front-leg'], ['front-leg','rear-leg'], ['rear-leg','coat'], ['cast-upper','coat'],
        ['coat','cloak-lining'], ['cloak-lining','rest-upper'], ['cast-hand','cloak-front'],
        ['rest-upper','cloak-front'], ['cloak-front','rest-arm'], ['card','cast-fingers']])
        assert.ok(z.includes(behind) && z.indexOf(behind) < z.indexOf(front), `${behind} must be behind ${front}`);

    const parts = rig.skins[0].attachments;
    const cloth=parts['cloak-front']['cloak-front'], lining=parts['cloak-lining']['cloak-lining'];
    assert.equal(lining.path,cloth.path);
    assert.deepEqual(lining.uvs,cloth.uvs);
    assert.deepEqual(lining.vertices,cloth.vertices);
    assert.ok(lining.triangles.length && cloth.triangles.length);
    for (const [separated, original] of [['rest-upper','rest-arm'], ['cast-fingers','cast-hand']]) {
        const upper = parts[separated][separated], lower = parts[original][original];
        assert.equal(upper.path, lower.path);
        assert.deepEqual(upper.vertices, lower.vertices);
        assert.deepEqual(upper.uvs, lower.uvs);
        const lowerVertices = new Set(lower.triangles);
        const seam = [...new Set(upper.triangles.filter(i => lowerVertices.has(i)))];
        assert.equal(Math.min(...seam.map(i => upper.uvs[2*i])), 0);
        assert.equal(Math.max(...seam.map(i => upper.uvs[2*i])), 1);
        if (separated === 'rest-upper') {
            const vAt = u => upper.uvs[2*seam.find(i => upper.uvs[2*i] === u)+1];
            assert.ok(vAt(0) > vAt(1), 'The sleeve opening follows the diagonal cape edge');
        }
        const fall=rig.animations.death.slots[separated];
        if (fall?.attachment) assert.ok(fall.attachment.every(key=>key.name));
    }
});
test('the Lantern Keeper catches and crushes the paper in the left hand at the single impact event', () => {
    const rig = read(keeperFile + '.json');
    const contract = read(keeperFile + '.contract.json');
    const prefab = read('assets/prefabs/actors/PlayerActor.prefab');
    const binding = prefab.find(component => component.labyrinthSkeleton);
    assert.equal(binding.labyrinthSkeleton.__uuid__, read(keeperFile + '.json.meta').uuid);

    const card = rig.slots.find(slot => slot.name === 'card');
    assert.equal(card.bone, 'CastOrigin');
    assert.ok(rig.bones.some(b => b.name === 'GripFingers' && b.parent === 'Wrist'));
    const setup = poseMatrices(rig);
    const cardMesh = rig.skins[0].attachments.card.card;
    const cardBottom = Math.min(...decode(rig, cardMesh).map(weights => weights.reduce(
        (y, [bone, x, localY, weight]) => y + point(setup[rig.bones[bone].name], x, localY)[1] * weight, 0
    )));
    const hand = contract.parts.find(part => part.name === 'cast-hand');
    const handTop = Math.max(...contract.neutralVertices.slice(hand.vertexStart, hand.vertexStart + hand.vertexCount).map(p => p[1]));
    assert.ok(cardBottom - handTop > 8, 'The paper should have a visible gap above the fingers');
    const drift = rig.animations.idle.bones[card.bone].translate.map(key => key.y);
    assert.ok(Math.max(...drift) - Math.min(...drift) > 2 && drift[0] === drift.at(-1));
    for (const kind of ['attack', 'prepare']) {
        const clip = rig.animations[kind];
        const time = contract.motions[kind].contact;
        assert.deepEqual(clip.events, [{ time, name: 'impact' }]);
        assert.ok(clip.bones.CastOrigin.translate.find(key => key.time === time).y < -50);
        assert.ok(clip.bones.CastOrigin.scale.find(key => key.time === time).x < .6);
        assert.equal(clip.bones.CastOrigin.scale.at(-1).x, 1);
        for (const joint of ['GripThumb', 'GripFingers']) {
            assert.equal(clip.bones[joint], undefined, 'The left fingers keep their open shape while the paper crumples');
        }
        assert.deepEqual(clip.slots.card.attachment.at(-1), { time, name: null });
        const fragments = rig.slots.filter(slot => slot.name.startsWith('paper-chip-'));
        assert.ok(fragments.length >= 3);
        for (const { name, attachment } of fragments) {
            assert.equal(attachment, undefined);
            assert.deepEqual(clip.slots[name].attachment[0], { time, name });
            assert.ok(clip.bones[name].translate.every(key => Math.hypot(key.x, key.y) < 28));
            assert.equal(clip.slots[name].attachment.at(-1).name, null);
        }
    }
    for (const kind of ['idle','hurt']) {
        const { bones } = rig.animations[kind];
        assert.deepEqual(bones.CastOrigin.scale[0], { time: 0, x: 1, y: 1 });
        for (const name of ['PaperFoldLeft','PaperFoldRight']) assert.equal(bones[name].rotate[0].angle, 0);
    }
});
test('the keeper falls on one articulated skin with the same head, mask, cloak and right hand', () => {
    const doc=read(keeperFile+'.json'), clip=doc.animations.death, skin=doc.skins[0].attachments;
    const atlas=fs.readFileSync(path.join(root,keeperFile+'.atlas'),'utf8');
    assert.ok(!atlas.split(/\r?\n/).some(line=>line.startsWith('landing-')));
    assert.ok(!doc.slots.some(slot=>slot.name==='landing-body'));
    for (const slot of doc.slots) {
        if (slot.name==='card' || slot.name.startsWith('paper-chip-')) continue;
        const track=clip.slots?.[slot.name]?.attachment;
        if (track) assert.equal(track.length,1,slot.name+' should hold one mesh');
        if (track) assert.equal(track[0].time,0);
        const attachment=skin[slot.name][track?.[0].name??slot.attachment];
        assert.equal(attachment.type,'mesh');
        if (slot.name==='head' || slot.name==='cloak-front' || slot.name==='cloak-lining')
            assert.equal(attachment.path,skin[slot.name][slot.attachment].path);
    }
    const influences = name => {
        const key=clip.slots[name].attachment[0].name;
        const attachment=skin[name][key], vertices=decode(doc,attachment);
        return [...new Set(attachment.triangles)].flatMap(i=>vertices[i].map(([index])=>doc.bones[index].name));
    };
    for (const joint of ['RestArm','RestElbow','RightWrist','RightFingers','RightThumb'])
        assert.ok([...influences('rest-arm'),...influences('rest-upper')].includes(joint),joint);
    for (const [name,prefix] of [['front-leg','Front'],['rear-leg','Rear']])
        for (const joint of ['Thigh','Kneecap','Shin','Foot'])
            assert.ok([...influences(name),...(name==='front-leg'?influences('raised-trousers'):[])].includes(prefix+joint),prefix+joint);
    assert.equal(clip.bones.Head.scale,undefined);
    assert.equal(clip.slots?.head,undefined);
    assert.equal(clip.events,undefined);
    assert.equal(clip.slots.card.attachment.at(-1).name,null);
    const order=new Array(doc.slots.length), moved=new Set();
    for (const {slot,offset} of clip.drawOrder.at(-1).offsets) {
        const index=doc.slots.findIndex(s=>s.name===slot);
        order[index+offset]=slot;
        moved.add(slot);
    }
    const rest=doc.slots.map(s=>s.name).filter(name=>!moved.has(name));
    for(let i=0;i<order.length;i++) if(!order[i]) order[i]=rest.shift();
    for(const far of ['cast-upper','cast-hand','cast-fingers'])
        assert.ok(order.indexOf(far)<order.indexOf('coat'),far+' stays behind the torso');
    assert.ok(order.indexOf('rest-arm')>order.indexOf('cloak-front'));
});

test('ground controls remain independent of the hips and hold through the cape settling', () => {
    const doc=read(keeperFile+'.json'), contract=read(keeperFile+'.contract.json'), clip=doc.animations.death;
    function interpolate(track,t,field) {
        if (!track) return 0;
        let i=0;
        while (i+1<track.length && track[i+1].time<=t) i++;
        const a=track[i], b=track[i+1];
        if (!b) return a[field];
        let delta=b[field]-a[field];
        if(field==='angle') delta=((delta+540)%360)-180;
        return a[field]+Math.max(0,(t-a.time)/(b.time-a.time))*delta;
    }
    function sample(t) {
        const pose=Object.fromEntries(Object.entries(clip.bones).map(([name,track])=>[name,{
            rotate:interpolate(track.rotate,t,'angle'),
            x:interpolate(track.translate,t,'x'),y:interpolate(track.translate,t,'y'),
        }]));
        return poseMatrices(doc,pose);
    }
    const {contact,plantedFoot}=contract.landing;
    const rightHand='RightHandTarget', rearAnkle='RearAnkleTarget';
    for(const [name,control] of [['FrontLegIK','FrontAnkleTarget'],['RearLegIK',rearAnkle],['RightArmIK',rightHand]]) {
        const ik=doc.ik.find(constraint=>constraint.name===name);
        assert.equal(ik.target,control);
        assert.equal(ik.bones.length,2);
        const [upper,lower]=ik.bones.map(name=>doc.bones.find(b=>b.name===name));
        assert.ok(upper.length>25&&lower.length>25&&lower.parent===upper.name);
        assert.equal(ik.mix,0);
        assert.equal(clip.ik[name][0].mix,1);
        assert.ok(clip.bones[upper.name]===undefined && clip.bones[lower.name]===undefined);
        let bone=doc.bones.find(b=>b.name===control);
        while(bone?.parent){assert.notEqual(bone.parent,'Hips');bone=doc.bones.find(b=>b.name===bone.parent);}
    }
    assert.equal(clip.bones.RestArm,undefined);
    assert.equal(clip.bones.FrontShin,undefined);
    assert.ok(clip.bones.RightHandTarget.translate.length<=9);
    const end=contract.motions.death.duration;
    assert.equal(contract.motions.death.loop,false);
    const start=sample(0), impact=sample(contact), held=sample(end);
    for(const joint of [plantedFoot,rearAnkle,rightHand,'Head']) {
        const bind=poseMatrices(doc)[joint];
        assert.ok(Math.hypot(start[joint][4]-bind[4],start[joint][5]-bind[5])<.01,joint);
    }
    let last=start[rightHand][5];
    for(let i=1;i<=Math.ceil(end*120);i++) {
        const t=Math.min(i/120,end), m=sample(t);
        assert.ok(Math.hypot(m[plantedFoot][4]-start[plantedFoot][4],m[plantedFoot][5]-start[plantedFoot][5])<.1);
        assert.ok(m[rightHand][5]<=last+.1);
        last=m[rightHand][5];
        if(t>=contact) for(const joint of [rearAnkle,rightHand])
            assert.ok(Math.hypot(m[joint][4]-impact[joint][4],m[joint][5]-impact[joint][5])<.18,joint);
    }
    assert.ok(impact[rightHand][5]<32 && impact[rearAnkle][5]<50);
    assert.ok(impact[rearAnkle][4]<impact[rightHand][4] && impact[rightHand][4]<impact[plantedFoot][4]);
    assert.ok(impact.CloakHem[5]>held.CloakHem[5]+9);
});

test('silhouette contact chooses the visible edge at the requested height',()=>{
 const vertices=[{x:-2,y:0},{x:3,y:0},{x:3,y:4},{x:-2,y:4}],indices=[0,1,2,0,2,3];
 assert.equal(geometry.silhouetteAtHeight(vertices,indices,2,true),-2);
 assert.equal(geometry.silhouetteAtHeight(vertices,indices,2,false),3);
 assert.equal(geometry.silhouetteAtHeight(vertices,indices,5,false),null);
 const p=geometry.skinVertex([[0,2,1,.5],[1,2,1,.5]],[{a:1,b:0,c:0,d:1,worldX:0,worldY:0},{a:0,b:-1,c:1,d:0,worldX:10,worldY:0}]);
 assert.deepEqual(p,{x:5.5,y:1.5});
});
