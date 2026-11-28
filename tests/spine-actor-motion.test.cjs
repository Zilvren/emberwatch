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
        assert.deepEqual(rig.animations.death.slots[separated].attachment, [{ time: 0, name: null }]);
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
test('the painted fall source keeps corrections on the named arms and preserves the supporting fist', () => {
    const { PNG } = require('../tools/spine/bestiary-assets.cjs');
    const { applyFarArmCover, applyRightArmApproach } = require('../tools/spine/lantern-keeper-landing.cjs');
    const source = 'art-source/ashen-labyrinth/lantern-keeper/';
    const png = file => PNG.sync.read(fs.readFileSync(path.join(root,file)));
    const approved = fs.readFileSync(path.join(root,source,'landing-poses.png'));
    const contract = read(keeperFile+'.contract.json');
    assert.equal(crypto.createHash('sha256').update(approved).digest('hex'),contract.landingSourceSha256);
    const sheet = PNG.sync.read(approved), base = Buffer.from(sheet.data);
    const pixelDiff = (a,b,k) => a[k]!==b[k] || a[k+1]!==b[k+1] || a[k+2]!==b[k+2] || a[k+3]!==b[k+3];
    applyFarArmCover(sheet,png(source+'landing-far-arm-cover.png'));
    const coverRegions=[[167,769],[640,773],[1146,771]], coverCount=[0,0,0];
    const freeGloves = [[216,877,262,954],[705,893,757,964],[1203,881,1253,956]];
    const supportingFists = [[303,920,355,996],[763,920,817,996],[1267,920,1333,996]];
    for(let k=0;k<sheet.data.length;k+=4){
        if(!pixelDiff(base,sheet.data,k))continue;
        const i=k/4,x=i%sheet.width,y=Math.floor(i/sheet.width);
        const at=coverRegions.findIndex(([l,t])=>x>=l&&x<l+144&&y>=t&&y<t+210);
        assert.ok(at>=0);
        const inside=([l,t,r,b])=>x>=l&&x<r&&y>=t&&y<b;
        assert.ok(!inside(supportingFists[at]),'The grounded fist changed');
        if(base[k+3]!==sheet.data[k+3])assert.ok(inside(freeGloves[at]));
        coverCount[at]++;
    }
    assert.ok(coverCount.every(n=>n>0));
    const beforeApproach=Buffer.from(sheet.data);
    applyRightArmApproach(sheet,png(source+'landing-right-arm-approach.png'));
    const edits=[[601,154],[1127,207]], counts=[0,0];
    for(let k=0;k<sheet.data.length;k+=4){
        if(!pixelDiff(beforeApproach,sheet.data,k))continue;
        const i=k/4,x=i%sheet.width,y=Math.floor(i/sheet.width);
        const at=edits.findIndex(([l,t])=>x>=l&&x<l+348&&y>=t&&y<t+270);
        assert.ok(at>=0,'The approach correction escaped the two arm regions');
        counts[at]++;
    }
    assert.ok(counts.every(n=>n>0));
});

test('the fall plays registered painted frames and holds the same three ground contacts', () => {
    const {PNG}=require('../tools/spine/bestiary-assets.cjs');
    const data=read(keeperFile+'.json'), contract=read(keeperFile+'.contract.json');
    const {frames,contact}=contract.landing, clip=data.animations.death;
    const exposure=clip.slots['landing-body'].attachment;
    const regions=data.skins[0].attachments['landing-body'];
    const atlas=fs.readFileSync(path.join(root,keeperFile+'.atlas'),'utf8');
    const texture=PNG.sync.read(fs.readFileSync(path.join(root,keeperFile+'.png')));
    const packed=new Map(Array.from(atlas.matchAll(/^([\w-]+)\s+rotate: false\s+xy: (\d+), (\d+)\s+size: (\d+), (\d+)/gm),
        ([,name,...rect])=>[name,rect.map(Number)]));
    assert.ok(texture.width<=2048 && texture.height<=2048);
    assert.equal(clip.bones,undefined);
    assert.deepEqual(exposure.slice(0,-1),frames.map(({name,time})=>({time,name})));
    assert.deepEqual(exposure.at(-1),{time:contract.motions.death.duration,name:'settle'});
    assert.equal(frames[0].time,0);
    assert.ok(frames.length>=16 && new Set(frames.map(f=>f.name)).size===frames.length);
    assert.deepEqual(clip.slots.card.attachment.at(-1),{time:.07,name:null});
    const held=frames.filter(f=>f.time>=contact), settled=frames.at(-1);
    assert.equal(held[0].name,'contact');
    assert.deepEqual(settled.fist,[-42.4,4.4]);
    assert.deepEqual(settled.toe,[96,2]);
    function groundY(frame,center) {
        const part=regions[frame.name];
        const [ox,oy,w,h]=packed.get(part.path);
        let low=Infinity;
        for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
            const worldX=part.x+((x+.5)/w-.5)*part.width;
            if(Math.abs(worldX-center)>5 || texture.data[4*((oy+y)*texture.width+ox+x)+3]<150) continue;
            low=Math.min(low,part.y+(.5-(y+.5)/h)*part.height);
        }
        return low;
    }
    function rgbaAt(frame,x,y) {
        const [ox,oy,w,h]=packed.get(regions[frame.name].path);
        const col=Math.floor((.5+(x-frame.x)/frame.width)*w);
        const row=Math.floor((.5-(y-frame.y)/frame.height)*h);
        const start=4*((oy+row)*texture.width+ox+col);
        return texture.data.subarray(start,start+4);
    }
    function lampShape(frame, sampleReference) {
        const [ox,oy,w,h]=packed.get(regions[frame.name].path);
        let energy=0, moment=0;
        for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
            const dx=frame.x+((x+.5)/w-.5)*frame.width-frame.lamp[0];
            const dy=frame.y+(.5-(y+.5)/h)*frame.height-frame.lamp[1];
            const dist2=dx*dx+dy*dy;
            if(dist2>9.5**2) continue;
            const offset=4*((oy+y)*texture.width+ox+x);
            const [r,g,b,a]=sampleReference
                ? sampleReference(dx+frame.lamp[0],dy+frame.lamp[1],frame.width/w,frame.height/h)
                : texture.data.subarray(offset,offset+4);
            const amber=Math.min(1,Math.max(0,(r-b-42)/80));
            const light=amber*Math.min(1,Math.max(0,(g-95)/112))*a/255;
            energy+=light;moment+=dist2*light;
        }
        return {energy,radius:Math.sqrt(moment/energy)};
    }
    const idleLamp=lampShape(frames[0]);
    // This lamp is painted on the supplied master. Compare at the sampling
    // density of the landing exposure, including its fractional registration.
    const art='art-source/ashen-labyrinth/lantern-keeper/';
    const spec=read(art+'standing-registration.json');
    const reference=PNG.sync.read(fs.readFileSync(path.join(root,art,spec.reference)));
    const sourceLamp=lampShape(frames[0],(x,y,dx,dy)=>{
        const sum=[0,0,0,0], samples=6;
        for(let j=0;j<samples;j++) for(let i=0;i<samples;i++){
            const sx=Math.floor(spec.origin[0]+(x+((i+.5)/samples-.5)*dx)/spec.unitsPerPixel);
            const sy=Math.floor(spec.origin[1]-(y+((j+.5)/samples-.5)*dy)/spec.unitsPerPixel);
            const index=4*(sy*reference.width+sx), a=reference.data[index+3];
            for(let c=0;c<3;c++) sum[c]+=reference.data[index+c]*a;
            sum[3]+=a;
        }
        return [...sum.slice(0,3).map(c=>c/Math.max(1,sum[3])),sum[3]/(samples*samples)];
    });
    assert.ok(sourceLamp.energy>0 && Math.abs(idleLamp.energy/sourceLamp.energy-1)<.05);
    assert.ok(Math.abs(idleLamp.radius-sourceLamp.radius)<.35);
    // Compare painted pixels as well as the registration markers. A moving
    // mesh or an incorrectly trimmed region can otherwise pass a marker test.
    for(const [i,f] of frames.entries()) {
        assert.equal(regions[f.name].type,'region');
        assert.ok(packed.has(regions[f.name].path));
        if(i) assert.ok(f.time>frames[i-1].time && f.time-frames[i-1].time<=.071);
        if(f.time>.07 && f.time<=contact) assert.ok(f.fist[1]<frames[i-1].fist[1]);
        if(f.time<=.07) assert.ok(Math.abs(f.fist[1]-frames[0].fist[1])<9);
        const lamp=lampShape(f);
        assert.ok(Math.abs(lamp.energy/idleLamp.energy-1)<.05,f.name+' changed the painted lamp intensity');
        assert.ok(Math.abs(lamp.radius-idleLamp.radius)<.35,f.name+' changed the lamp halo');
    }
    assert.ok(frames.find(f=>f.name==='drop').fist[1]<80);
    for(const f of held) {
        for(let y=4;y<=12;y+=2) for(let x=-4;x<=4;x+=2) {
            const pixel=rgbaAt(f,f.fist[0]+x,f.fist[1]+y);
            assert.equal(pixel[3],255);
            assert.deepEqual(pixel,rgbaAt(settled,settled.fist[0]+x,settled.fist[1]+y),'Changing planted glove in '+f.name);
        }
        for(const key of ['fist','rearKnee','toe']) {
            assert.deepEqual(f[key],settled[key]);
            const end=groundY(settled,settled[key][0]-2);
            const at=groundY(f,f[key][0]-2);
            assert.ok(Math.abs(at-end)<2 && Math.abs(at)<9,f.name+' '+key+' floor '+at);
        }
    }
});

test('silhouette contact chooses the visible edge at the requested height',()=>{
 const vertices=[{x:-2,y:0},{x:3,y:0},{x:3,y:4},{x:-2,y:4}],indices=[0,1,2,0,2,3];
 assert.equal(geometry.silhouetteAtHeight(vertices,indices,2,true),-2);
 assert.equal(geometry.silhouetteAtHeight(vertices,indices,2,false),3);
 assert.equal(geometry.silhouetteAtHeight(vertices,indices,5,false),null);
 const p=geometry.skinVertex([[0,2,1,.5],[1,2,1,.5]],[{a:1,b:0,c:0,d:1,worldX:0,worldY:0},{a:0,b:-1,c:1,d:0,worldX:10,worldY:0}]);
 assert.deepEqual(p,{x:5.5,y:1.5});
});
