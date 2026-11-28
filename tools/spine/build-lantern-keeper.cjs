// Explicit art authoring step for the Ashen Labyrinth protagonist.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { PNG } = require('./bestiary-assets.cjs');
const { root } = require('../native-assets.cjs');
const { motions, cardTimings, paperFragments } = require('./lantern-keeper-motion.cjs');
const landing = require('./lantern-keeper-landing.cjs');

const source = path.join(root, 'art-source/ashen-labyrinth/lantern-keeper');
const target = path.join(root, 'assets/ashen-labyrinth/lantern-keeper');
const spec = JSON.parse(fs.readFileSync(path.join(source, 'standing-registration.json'), 'utf8'));
const cuts = path.join(root, 'temp/keeper-reference-parts');
execFileSync(process.env.PYTHON || 'python', ['-B',path.join(__dirname,'lantern-keeper-reference.py'),source,cuts], {stdio:'inherit'});
const registered = JSON.parse(fs.readFileSync(path.join(cuts,'parts.json'), 'utf8'));
const unit = spec.unitsPerPixel;
const toWorld = ([x,y]) => [(x-spec.origin[0])*unit, (spec.origin[1]-y)*unit];
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const round = x => Math.round(x * 1e7) / 1e7;
const clamp = x => Math.min(1, Math.max(0, x));

const bones = [], world = new Map();
function bone(name, parent, x, y, rotation = 0, transform) {
    const base = world.get(parent) ?? { x: 0, y: 0 };
    world.set(name, { x, y, index: bones.length });
    bones.push({ name, ...(parent ? { parent } : {}), x: x - base.x, y: y - base.y,
        ...(rotation ? { rotation } : {}), ...(transform ? { transform } : {}) });
}
bone('root', null, 0, 0);
bone('PoseRoot', 'root', 0, 0);
bone('Hips', 'PoseRoot', 4, 193);
bone('Chest', 'Hips', 0, 247);
bone('Head', 'Chest', ...toWorld([580,278]));
bone('CloakFront', 'Chest', ...toWorld([631,373]));
bone('CloakFold', 'CloakFront', ...toWorld([388,600]));
bone('CoatHem', 'Hips', -6, 178);
bone('CloakBack', 'Chest', -14, 327);
bone('CloakBackMid', 'Hips', -47, 200);
bone('CloakHem', 'CoatHem', -80, 111);
bone('RestArm', 'Chest', ...toWorld(spec.nearArm.shoulder));
bone('RestElbow', 'RestArm', ...toWorld(spec.nearArm.elbow));
bone('CastArm', 'Chest', ...toWorld([687,450]));
bone('CastElbow', 'CastArm', ...toWorld([775,575]));
bone('Wrist', 'CastElbow', ...toWorld([876,454]));
bone('GripThumb', 'Wrist', ...toWorld([891,410]));
bone('GripFingers', 'Wrist', ...toWorld([938,394]));
// Follow the palm's position, but keep "above" vertical when the wrist turns.
const [gripX,gripY] = toWorld([919,390]);
bone('OpenPalm', 'Wrist', gripX+6, gripY+16, 0, 'onlyTranslation');
const hoverCard = { x: gripX+9, y: gripY+64, width: 26, height: 37 };
bone('CastOrigin', 'OpenPalm', hoverCard.x, hoverCard.y, -9);
bone('PaperFoldLeft', 'CastOrigin', hoverCard.x - 10, hoverCard.y);
bone('PaperFoldRight', 'CastOrigin', hoverCard.x + 10, hoverCard.y);
for (const { name, position: [x,y] } of paperFragments)
    bone(name, 'OpenPalm', gripX+x, gripY+y);
bone('Aim', 'Chest', 5, 274);
bone('AttackTip', 'Wrist', 126, 347);
bone('Approach', 'root', 0, 0);
bone('FrontFoot', 'PoseRoot', 45, 10);
bone('RearFoot', 'PoseRoot', -63, 10);

// Bounds are in Spine world coordinates, measured from the ground. Lower leg weights
// terminate at planted foot bones so shifting weight bends the knees without foot slide.
const parts = Object.entries(registered.parts).map(([id, {bounds,joint}]) => ({id,bounds,joint}));
parts.push({ id:'card', joint:'CastOrigin', bounds:[hoverCard.x-hoverCard.width/2, hoverCard.y-hoverCard.height/2,
    hoverCard.width, hoverCard.height] });
const [leftSleeve, rightSleeve] = spec.sleeveEdge;
const [armX,armY,armWidth,armHeight] = registered.parts['rest-arm'].sourceRect;
const sleeveY = x => leftSleeve[1] + (x-leftSleeve[0]) * (rightSleeve[1]-leftSleeve[1]) / (rightSleeve[0]-leftSleeve[0]);
const restSleeveEdge = [armX,armX+armWidth].map(x => clamp((sleeveY(x)-armY)/armHeight));
function blend(a, b, t) {
    t = clamp(t);
    const eased = t * t * (3 - 2 * t);
    if (eased < .0001) return [[a,1]];
    if (eased > .9999) return [[b,1]];
    return [[a,1-eased],[b,eased]];
}
function weights(id, main, u, v, x, y) {
    const px = spec.origin[0]+x/unit, py = spec.origin[1]-y/unit;
    switch (id) {
        case 'head': return blend('Head','Chest',(py-223)/63);
        case 'coat': return py < 785 ? blend('Chest','Hips',(py-515)/270) : blend('Hips','CoatHem',(py-785)/260);
        case 'cloak-back': return py < 785 ? blend('CloakBack','CloakBackMid',(py-515)/270) : blend('CloakBackMid','CloakHem',(py-785)/260);
        case 'cloak-front':
            if (py < 515) return blend('CloakFront','CloakFold',(py-365)/150);
            if (py < 785) return blend('CloakFold','CloakBackMid',(py-515)/270);
            return blend('CloakBackMid','CloakHem',(py-785)/260);
        case 'cast-hand': {
            const curl = clamp((416-py)/88);
            const alongForearm = ((px-775)*101-(py-575)*121)/(101**2+121**2);
            const arm = blend('CastElbow','Wrist',(alongForearm-.16)/.74);
            const fingers = blend('GripThumb','GripFingers',(px-892)/43);
            return [...arm.map(([bone,w]) => [bone,w*(1-curl)]), ...fingers.map(([bone,w]) => [bone,w*curl])]
                .filter(([,weight]) => weight > .0001);
        }
        case 'card': return u < .5 ? blend('PaperFoldLeft','CastOrigin',2*u) : blend('CastOrigin','PaperFoldRight',2*u-1);
        case 'rest-arm': return blend('RestArm','RestElbow',(py-643)/95);
        case 'rear-leg':
        case 'front-leg': return blend('Hips',main,(py-1150)/230);
        default: return [[main,1]];
    }
}
function influence(part,u,v) {
    const {id,bounds:[left,bottom,w,h],joint:main} = part;
    const x=left+u*w, y=bottom+(1-v)*h;
    const weighted = weights(id,main,u,v,x,y);
    const total = weighted.reduce((sum,entry)=>sum+entry[1],0);
    return weighted.map(([name,weight]) => {
        const joint = world.get(name);
        return [joint.index,round(x-joint.x),round(y-joint.y),round(weight/total)];
    });
}
function makeMesh(name,image,cols,rows,vertexData, mapRow = (_u,v) => v, mapColumn = (u,_v) => u) {
    const grid=[], indexes=new Map(), triangles=[], uvs=[], vertices=[];
    function vertex(x,y) {
        const column=x/cols;
        const v=Math.round(image.height*mapRow(column,y/rows))/image.height;
        const u=Math.round(image.width*mapColumn(column,v))/image.width;
        indexes.set(y*(cols+1)+x, grid.length);
        grid.push([u,v]);
        uvs.push(u,v);
        vertices.push(...vertexData(u,v));
    }
    // Spine stores the exterior vertices before the interior lattice.
    for(let x=0;x<=cols;x++) vertex(x,0);
    for(let y=1;y<=rows;y++) vertex(cols,y);
    for(let x=cols-1;x>=0;x--) vertex(x,rows);
    for(let y=rows-1;y>0;y--) vertex(0,y);
    const hull=grid.length;
    for(let y=1;y<rows;y++) for(let x=1;x<cols;x++) vertex(x,y);
    const at=(x,y)=>indexes.get(y*(cols+1)+x);
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++)
        triangles.push(at(x,y),at(x+1,y),at(x+1,y+1),at(x+1,y+1),at(x,y+1),at(x,y));
    return { type:'mesh',path:name,uvs,vertices,triangles,hull,width:image.width,height:image.height };
}

const paper = PNG.sync.read(fs.readFileSync(path.join(root,'assets/ashen-labyrinth/paper-back.png')));
const images = new Map(parts.map(({id}) => [id, id === 'card' ? paper : PNG.sync.read(fs.readFileSync(path.join(cuts,id+'.png')))]));
const influences=[], triangles=[], neutralVertices=[], registers=[];
function contactOutline(part,image) {
    const start = influences.length;
    const {id,bounds:[left,bottom,w,h]} = part;
    // Sample the alpha silhouette used by melee contact queries.
    for(let row=0;row<20;row++) {
        const y=Math.round((row+.5)/20*(image.height-1));
        let low=image.width,high=-1;
        for(let x=0;x<image.width;x++) if(image.data[(y*image.width+x)*4+3]>96) {
            low=Math.min(x,low);high=Math.max(x,high);
        }
        if(high<low) continue;
        const previous=influences.length;
        for(const x of [low,high]) {
            const u=x/(image.width-1),v=y/(image.height-1);
            influences.push(influence(part,u,v));
            neutralVertices.push([round(left+u*w),round(bottom+(1-v)*h)]);
        }
        if(previous>start) triangles.push(previous-2,previous-1,previous,previous,previous-1,previous+1);
    }
    registers.push({name:id,bone:part.joint,image:id,sourceRect:registered.parts[id].sourceRect,
        vertexStart:start,vertexCount:influences.length-start});
}
const meshColumns = 4, meshRows = 9;
const handColumns = 12, handRows = 18;
const restArmSplitRow = 4;
function restSleeveRow(u,v) {
    const split = restArmSplitRow / meshRows;
    const seam = restSleeveEdge[0] + (restSleeveEdge[1] - restSleeveEdge[0]) * u;
    return v < split ? v * seam / split : seam + (v - split) * (1 - seam) / (1 - split);
}
const [,handTop,,handHeight] = registered.parts['cast-hand'].sourceRect;
function fingerRow(_u,v) {
    const seam = (401-handTop)/handHeight;
    return v <= 1/3 ? 3*v*seam : seam + (v-1/3)*1.5*(1-seam);
}
// Both faces of the near cloak share the very same lattice. Its central
// strip passes behind the sleeve along the actual painted fold.
const [capeX,capeY,capeW,capeH]=registered.parts['cloak-front'].sourceRect;
const capeColumns=20, foldColumn=8, lapelColumn=16;
const capeRows=[...new Set([capeY,capeY+capeH,385,515,...spec.outerFold.map(p=>p[1]),
    ...Array.from({length:Math.floor(capeH/64)},(_,i)=>capeY+64*(i+1))])].sort((a,b)=>a-b);
function foldX(y) {
    const points=spec.outerFold, next=points.findIndex(p=>p[1]>=y);
    if (next<0) return points.at(-1)[0];
    if (!next) return points[0][0];
    const [x0,y0]=points[next-1], [x1,y1]=points[next];
    return x0+(x1-x0)*(y-y0)/(y1-y0);
}
function capeRow(_u,v) { return (capeRows[Math.round(v*(capeRows.length-1))]-capeY)/capeH; }
function capeColumn(u,v) {
    const col=Math.round(u*capeColumns), at=Math.max(capeX+foldColumn,Math.min(636,foldX(capeY+v*capeH)));
    const lapel=645;
    if (col<=foldColumn) return (at-capeX)*col/foldColumn/capeW;
    if (col<=lapelColumn) return (at-capeX+(lapel-at)*(col-foldColumn)/(lapelColumn-foldColumn))/capeW;
    return (lapel-capeX+(capeX+capeW-lapel)*(col-lapelColumn)/(capeColumns-lapelColumn))/capeW;
}
const attachments={};
for(const part of parts) {
    const {id,joint}=part, image=images.get(id);
    const [columns,rows] = id === 'cast-hand' ? [handColumns,handRows] : id === 'cloak-front' ? [capeColumns,capeRows.length-1] : [meshColumns,meshRows];
    attachments[id] = { [id]:makeMesh(id,image,columns,rows,(u,v)=>{
        const weights=influence(part,u,v);
        return [weights.length,...weights.flat()];
    }, id === 'rest-arm' ? restSleeveRow : id === 'cast-hand' ? fingerRow : id === 'cloak-front' ? capeRow : undefined,
       id === 'cloak-front' ? capeColumn : undefined) };
    if(id!=='card') contactOutline(part,image);
    else registers.push({name:id,bone:joint,image:id,vertexStart:influences.length,vertexCount:0});
}

// The shoulder cape covers the upper sleeve. The sleeve below the crease and
// the glove hang in front of its lining, using the same weights and texture.
const splitTriangle = restArmSplitRow * meshColumns * 6;
const arm = attachments['rest-arm']['rest-arm'];
attachments['rest-upper'] = { 'rest-upper': { ...arm, triangles: arm.triangles.slice(0, splitTriangle) } };
arm.triangles = arm.triangles.slice(splitTriangle);

// The fixed fingers appear in front of the paper as it folds into the palm.
// The two slots share the same wrist-space geometry.
const hand = attachments['cast-hand']['cast-hand'];
const fingerTriangles = 6 * handColumns * 6;
attachments['cast-fingers'] = { 'cast-fingers': { ...hand, triangles: hand.triangles.slice(0, fingerTriangles) } };
hand.triangles = hand.triangles.slice(fingerTriangles);

const cape=attachments['cloak-front']['cloak-front'], outer=[], lining=[];
for (let row=0;row<capeRows.length-1;row++) for (let col=0;col<capeColumns;col++) {
    const y=(capeRows[row]+capeRows[row+1])/2, index=6*(row*capeColumns+col);
    const layer=y>=385 && col>=foldColumn && (y>=515 || col<lapelColumn) ? lining : outer;
    layer.push(...cape.triangles.slice(index,index+6));
}
attachments['cloak-lining']={'cloak-lining':{...cape,triangles:lining}};
cape.triangles=outer;

const slotBones = new Map(parts.map(({id,joint}) => [id,joint]));
slotBones.set('rest-upper', slotBones.get('rest-arm'));
slotBones.set('cast-fingers', slotBones.get('cast-hand'));
slotBones.set('cloak-lining',slotBones.get('cloak-front'));
const slots = [
    'cloak-back', 'front-leg', 'rear-leg', 'cast-upper', 'coat', 'cloak-lining', 'cast-hand',
    'rest-upper', 'cloak-front', 'rest-arm', 'head', 'neck-wrap', 'card', 'cast-fingers',
].map(name => ({ name, bone: slotBones.get(name), attachment: name }));
for (const { name, size: [w,h] } of paperFragments) {
    slots.push({ name, bone: name });
    attachments[name] = { [name]: {
        type: 'mesh', path: 'card', uvs: [.24,.24,.68,.28,.53,.8],
        vertices: [-w/2,h/2,w/2,h/4,-w/4,-h/2], triangles: [0,1,2], hull: 3,
        width: paper.width, height: paper.height,
    } };
}

const clips = motions();
const landingSource=fs.readFileSync(path.join(source,'landing-poses.png'));
const farArmCover=PNG.sync.read(fs.readFileSync(path.join(source,'landing-far-arm-cover.png')));
const approach=PNG.sync.read(fs.readFileSync(path.join(source,'landing-right-arm-approach.png')));
const fall=landing.addLanding({paint:PNG.sync.read(landingSource),cover:farArmCover,approach,
    parts,slots,attachments,images,spec});
clips.death=fall.clip;
const doc = {
    skeleton:{spine:'3.8.75',images:'./',fps:30}, bones, slots,
    skins:[{name:'default',attachments}],events:{impact:{}},animations:clips,
};
const contract = {
    schemaVersion:1,actor:'ashen-lantern-keeper',sourceSha256:registered.sourceSha256,baseline:0,boneNames:bones.map(b=>b.name),
    landingSourceSha256:crypto.createHash('sha256').update(landingSource).digest('hex'),
    landing:fall.registration,
    influences,triangles,neutralVertices,parts:registers,
    contactBone:'AttackTip',contactTip:[126,347],approachBone:'Approach',
    motions:{
        idle:{duration:2.5,loop:true}, attack:{...cardTimings.attack,loop:false},
        prepare:{...cardTimings.prepare,loop:false}, hurt:{duration:.38,loop:false}, death:{duration:landing.duration,loop:false},
    },
};
function packPage(filename, entries) {
    const limit=2048, margin=4, packed=[];
    let free=[[0,0,limit,limit]], height=0;
    entries.sort((a,b)=>b[1].height-a[1].height || b[1].width-a[1].width);
    for (const [name,image] of entries) {
        const w=image.width+2*margin, h=image.height+2*margin;
        const fit=free.filter(([l,t,r,b])=>w<=r-l && h<=b-t).sort((a,b)=>a[1]-b[1] || a[0]-b[0])[0];
        if (!fit) throw Error(filename+' cannot fit '+name+' at original resolution');
        const [x,y]=fit, right=x+w, bottom=y+h;
        packed.push({name,image,x:x+margin,y:y+margin});
        height=Math.max(height,bottom);
        const remaining=[];
        for (const [l,t,r,b] of free) {
            if (right<=l || bottom<=t || x>=r || y>=b) { remaining.push([l,t,r,b]); continue; }
            if (l<x) remaining.push([l,t,x,b]);
            if (right<r) remaining.push([right,t,r,b]);
            if (t<y) remaining.push([l,t,r,y]);
            if (bottom<b) remaining.push([l,bottom,r,b]);
        }
        free=remaining.filter((rect,i)=>!remaining.some(([l,t,r,b],j)=>j!==i &&
            l<=rect[0] && t<=rect[1] && r>=rect[2] && b>=rect[3] &&
            (l<rect[0] || t<rect[1] || r>rect[2] || b>rect[3] || j<i)));
    }
    height=filename==='lantern-keeper-standing.png' ? limit : Math.ceil(height/16)*16;
    const atlas = new PNG({width:limit,height});
    const lines=[filename,`size: ${limit},${height}`,'format: RGBA8888','filter: Linear,Linear','repeat: none'];
    for(const {name,image,x,y} of packed) {
        PNG.bitblt(image,atlas,0,0,image.width,image.height,x,y);
        lines.push(name,'  rotate: false',`  xy: ${x}, ${y}`,`  size: ${image.width}, ${image.height}`,
            `  orig: ${image.width}, ${image.height}`,'  offset: 0, 0','  index: -1');
    }
    return { filename, atlas, text: lines.join('\n') };
}
const pages=[
    packPage('lantern-keeper.png',[...images].filter(([id])=>id.startsWith('landing-'))),
    packPage('lantern-keeper-standing.png',[...images].filter(([id])=>!id.startsWith('landing-'))),
];
fs.mkdirSync(target,{recursive:true});
write(path.join(target,'lantern-keeper.json'),doc);
write(path.join(target,'lantern-keeper.contract.json'),contract);
for(const page of pages) fs.writeFileSync(path.join(target,page.filename),PNG.sync.write(page.atlas));
fs.writeFileSync(path.join(target,'lantern-keeper.atlas'),'\n'+pages.map(page=>page.text).join('\n\n')+'\n');
function meta(file, template, settings={}) {
    const dest=path.join(target,file)+'.meta';
    if(fs.existsSync(dest)) return JSON.parse(fs.readFileSync(dest)).uuid;
    const data=JSON.parse(fs.readFileSync(path.join(root,template)));
    const uuid=crypto.randomUUID();
    write(dest,{ver:data.ver,importer:data.importer,imported:false,uuid,files:[],subMetas:{},userData:settings});
    return uuid;
}
const template='assets/ashen-labyrinth/survivor/survivor-flick';
meta('', 'assets/ashen-labyrinth/survivor.meta');
const atlasId=meta('lantern-keeper.atlas',template+'.atlas.meta');
for(const page of pages) meta(page.filename,template+'-parts.png.meta',{type:'texture',hasAlpha:true,fixAlphaTransparencyArtifacts:false});
meta('lantern-keeper.json',template+'.json.meta',{atlasUuid:atlasId});
meta('lantern-keeper.contract.json',template+'.contract.json.meta');
console.log(`Lantern Keeper: ${slots.length} slots, ${bones.length} bones; ${pages.map(p=>p.atlas.width+'×'+p.atlas.height).join(', ')}`);
