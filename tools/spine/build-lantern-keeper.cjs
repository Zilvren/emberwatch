// Explicit art authoring step for the Ashen Labyrinth protagonist.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PNG, identifyParts, extractPart } = require('./bestiary-assets.cjs');
const { inside } = require('./bestiary-source-art.cjs');
const { root } = require('../native-assets.cjs');
const { motions } = require('./lantern-keeper-motion.cjs');
const landing = require('./lantern-keeper-landing.cjs');

const source = path.join(root, 'art-source/ashen-labyrinth/lantern-keeper');
const target = path.join(root, 'assets/ashen-labyrinth/lantern-keeper');
const original = fs.readFileSync(path.join(source, 'parts.png'));
const sheet = PNG.sync.read(original);
const hash = crypto.createHash('sha256').update(original).digest('hex');
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const round = x => Math.round(x * 10000) / 10000;
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
bone('Head', 'Chest', 7, 342);
bone('CloakFront', 'Chest', 15, 322);
bone('CloakFold', 'CloakFront', -54, 242);
bone('CoatHem', 'Hips', -6, 178);
bone('CloakBack', 'Chest', -14, 327);
bone('CloakBackMid', 'CloakBack', -47, 200);
// The long hem follows the ground as the upper clasp drops during a kneel.
bone('CloakHem', 'PoseRoot', -80, 111);
bone('RestArm', 'Chest', -28, 322);
bone('RestElbow', 'RestArm', -48, 230);
bone('CastArm', 'Chest', 27, 318);
bone('CastElbow', 'CastArm', 68, 257);
bone('Wrist', 'CastElbow', 97, 304);
// Follow the palm's position, but keep "above" vertical when the wrist turns.
bone('OpenPalm', 'Wrist', 116, 340, 0, 'onlyTranslation');
const hoverCard = { x: 116, y: 389, width: 26, height: 37 };
bone('CastOrigin', 'OpenPalm', hoverCard.x, hoverCard.y, -9);
bone('Aim', 'Chest', 5, 274);
bone('AttackTip', 'Wrist', 126, 347);
bone('Approach', 'root', 0, 0);
bone('FrontFoot', 'PoseRoot', 45, 10);
bone('RearFoot', 'PoseRoot', -63, 10);

// Bounds are in Spine world coordinates, measured from the ground. Lower leg weights
// terminate at planted foot bones so shifting weight bends the knees without foot slide.
const parts = [
    ['cloak-back', 8, [-153,46,183,289], 'CloakBack'],
    ['rear-leg',   6, [-76,0,77,204], 'RearFoot'],
    ['front-leg',  7, [8,2,91,202], 'FrontFoot'],
    ['cast-upper', 4, [13,244,68,84], 'CastArm'],
    ['coat',       1, [-83,77,150,276], 'Chest'],
    ['rest-arm',   3, [-68,151,51,174], 'RestArm'],
    ['cloak-front',2, [-117,118,194,240], 'CloakFront'],
    ['head',       0, [-39,327,93,106], 'Head'],
    ['neck-wrap',  1, [-25,326,64,29], 'Chest'],
    ['card', null, [hoverCard.x - hoverCard.width / 2, hoverCard.y - hoverCard.height / 2,
        hoverCard.width, hoverCard.height], 'CastOrigin'],
    ['cast-hand',  5, [55,248,81,107], 'CastElbow'],
];
function blend(a, b, t) {
    t = clamp(t);
    const eased = t * t * (3 - 2 * t);
    if (eased < .0001) return [[a,1]];
    if (eased > .9999) return [[b,1]];
    return [[a,1-eased],[b,eased]];
}
function weights(id, main, u, v) {
    switch (id) {
        case 'coat': return v < .53 ? blend('Chest','Hips',(v-.3)/.23) : blend('Hips','CoatHem',(v-.53)/.24);
        case 'cloak-back': return v < .56 ? blend('CloakBack','CloakBackMid',(v-.18)/.38) : blend('CloakBackMid','CloakHem',(v-.56)/.31);
        case 'cloak-front': return blend('CloakFront','CloakFold',(.30*(1-u)+.70*v-.28)/.63);
        case 'cast-hand': return blend('Wrist','CastElbow',(.49*u+.51*(1-v)-.55)/-.28);
        case 'rest-arm': return blend('RestArm','RestElbow',(v-.42)/.18);
        case 'rear-leg':
        case 'front-leg': return blend('Hips',main,(v-.13)/.48);
        default: return [[main,1]];
    }
}
function influence(part,u,v) {
    const [id,,[left,bottom,w,h],main] = part;
    return weights(id,main,u,v).map(([name,weight]) => {
        const joint = world.get(name);
        return [joint.index,round(left+u*w-joint.x),round(bottom+(1-v)*h-joint.y),round(weight)];
    });
}
function makeMesh(name,image,cols,rows,vertexData,textureAt) {
    const grid=[], indexes=new Map(), triangles=[], uvs=[], vertices=[];
    function vertex(x,y) {
        const [u,v]=textureAt ? textureAt(x/cols,y/rows) : [x/cols,y/rows];
        indexes.set(y*(cols+1)+x, grid.length);
        grid.push([u,v]);
        uvs.push(round(u),round(v));
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

const { cells, ids } = identifyParts(sheet, 3, 3);
const painted = cells.map(cell => extractPart(sheet, ids, cell).image);
// Lift the front lip of the painted linen wrap above the moving neck.
// Coordinates follow the seam on the isolated tunic, in its original pixels.
const scarfEdge = [[104,5],[111,7],[119,14],[132,21],[147,29],[163,34],[172,35],[177,31],
    [181,23],[183,20],[188,27],[192,35],[194,45],[191,54],[185,62],[178,67],[167,69],
    [154,67],[139,63],[121,57],[104,51],[88,45],[79,40],[82,35],[89,29],[96,15]];
const wrap = new PNG({ width: 120, height: 70 });
PNG.bitblt(painted[1], wrap, 76, 2, wrap.width, wrap.height, 0, 0);
for (let y = 0; y < wrap.height; y++) for (let x = 0; x < wrap.width; x++) {
    let samples = 0;
    for (const dy of [.25, .75]) for (const dx of [.25, .75])
        if (inside(76 + x + dx, 2 + y + dy, scarfEdge)) samples++;
    const alpha = (y * wrap.width + x) * 4 + 3;
    wrap.data[alpha] = Math.round(wrap.data[alpha] * samples / 4);
}
const paper = PNG.sync.read(fs.readFileSync(path.join(root,'assets/ashen-labyrinth/paper-back.png')));
const images = new Map(parts.map(([id, cell]) => [id, cell === null ? paper : painted[cell]]));
images.set('neck-wrap', wrap);
const influences=[], triangles=[], neutralVertices=[], registers=[];
function contactOutline(part,image) {
    const start = influences.length;
    const [id,,[left,bottom,w,h]] = part;
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
    registers.push({name:id,bone:part[3],image:id,vertexStart:start,vertexCount:influences.length-start});
}
const attachments={}, slots=[];
for(const part of parts) {
    const [id,,,joint]=part, image=images.get(id);
    slots.push({name:id,bone:joint,attachment:id});
    attachments[id] = { [id]:makeMesh(id,image,4,9,(u,v)=>{
        const weights=influence(part,u,v);
        return [weights.length,...weights.flat()];
    }) };
    if(id!=='card') contactOutline(part,image);
    else registers.push({name:id,bone:joint,image:id,vertexStart:influences.length,vertexCount:0});
}
const clips = motions();
const landingSource=fs.readFileSync(path.join(source,'landing-poses.png'));
const farArmCover=PNG.sync.read(fs.readFileSync(path.join(source,'landing-far-arm-cover.png')));
clips.death=landing.addLanding({paint:PNG.sync.read(landingSource),cover:farArmCover,
    bone,world,makeMesh,slots,attachments,images});
const doc = {
    skeleton:{spine:'3.8.75',images:'./',fps:30}, bones, slots,
    skins:[{name:'default',attachments}],events:{release:{},impact:{}},animations:clips,
};
const contract = {
    schemaVersion:1,actor:'ashen-lantern-keeper',sourceSha256:hash,baseline:0,boneNames:bones.map(b=>b.name),
    landingSourceSha256:crypto.createHash('sha256').update(landingSource).digest('hex'),
    influences,triangles,neutralVertices,parts:registers,releaseBone:'CastOrigin',
    releaseSize:[hoverCard.width, hoverCard.height],
    contactBone:'AttackTip',contactTip:[126,347],approachBone:'Approach',
    motions:{
        idle:{duration:2.5,loop:true}, attack:{duration:.66,loop:false,contact:.47},
        prepare:{duration:.58,loop:false,contact:.16}, hurt:{duration:.38,loop:false}, death:{duration:landing.duration,loop:false},
    },
};
const atlasWidth=1536, gutter=4, packed=[];
let x=gutter,y=gutter,rowHeight=0;
for(const [name,image] of [...images].sort((a,b)=>b[1].height-a[1].height)) {
    if(x+image.width+gutter>atlasWidth) { x=gutter;y+=rowHeight+gutter*2;rowHeight=0; }
    packed.push({name,image,x,y});
    rowHeight=Math.max(rowHeight,image.height);x+=image.width+gutter*2;
}
const atlasHeight=Math.ceil((y+rowHeight+gutter)/16)*16;
const atlas = new PNG({width:atlasWidth,height:atlasHeight});
const lines=['','lantern-keeper.png',`size: ${atlasWidth},${atlasHeight}`,'format: RGBA8888','filter: Linear,Linear','repeat: none'];
for(const {name,image,x,y} of packed) {
    PNG.bitblt(image,atlas,0,0,image.width,image.height,x,y);
    lines.push(name,'  rotate: false',`  xy: ${x}, ${y}`,`  size: ${image.width}, ${image.height}`,
        `  orig: ${image.width}, ${image.height}`,'  offset: 0, 0','  index: -1');
}
fs.mkdirSync(target,{recursive:true});
write(path.join(target,'lantern-keeper.json'),doc);
write(path.join(target,'lantern-keeper.contract.json'),contract);
fs.writeFileSync(path.join(target,'lantern-keeper.png'),PNG.sync.write(atlas));
fs.writeFileSync(path.join(target,'lantern-keeper.atlas'),lines.join('\n')+'\n');
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
meta('lantern-keeper.png',template+'-parts.png.meta',{type:'texture',hasAlpha:true,fixAlphaTransparencyArtifacts:false});
meta('lantern-keeper.json',template+'.json.meta',{atlasUuid:atlasId});
meta('lantern-keeper.contract.json',template+'.contract.json.meta');
console.log(`Lantern Keeper: ${slots.length} slots, ${bones.length} bones, ${atlasWidth}×${atlasHeight} atlas`);
