// Opt-in asset authoring for the ashen labyrinth bestiary.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const originals = require('./bestiary-layout.cjs');
const mythic = require('./mythic-bestiary.cjs');
const layouts = { ...originals, ...Object.fromEntries(Object.entries(mythic).map(([id, spec]) => [id, spec.layout])) };
const cutlines = require('./bestiary-cutlines.cjs');
const {backdrop, partition, cutSourcePart, makeSupport} = require('./bestiary-source-art.cjs');
const underpaint = require('./bestiary-underpaint.cjs');
const {round} = require('./rig-authoring.cjs');

const project = path.resolve(__dirname, '../..');
const base = path.join(project, 'art-source/ashen-labyrinth/battle-bestiary');
const version = require(path.join(project, '.pink/settings.json'))['cocos.engine.version'];
const sdk = path.join(process.env.APPDATA, 'cocos-default', 'cocos-' + version);
const {PNG} = require(require.resolve('pngjs', {paths: [sdk]}));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const degrees = radians => radians * 180 / Math.PI;
const radians = angle => angle * Math.PI / 180;
const bounded = (v, l, h) => Math.min(h, Math.max(l, v));
function rotate(x, y, angle) {
  const a=radians(angle), c=Math.cos(a), s=Math.sin(a);
  return [c*x - s*y, s*x + c*y];
}
function local(frame, point) {return rotate(point[0]-frame.x, point[1]-frame.y, -frame.angle);}
function imagePoint(part, uv) {
  const d=rotate((uv[0]-part.pin[0])*part.w, (part.pin[1]-uv[1])*part.h, part.angle || 0);
  return [part.x+d[0], part.y+d[1]];
}

function identifyParts(sheet, columns = 4, rows = 3) {
  const {data,width:w,height:h}=sheet;
  const ids=new Int32Array(w*h),queue=new Int32Array(w*h),cells=Array(columns*rows);
  let index=0;
  for(let i=0;i<ids.length;i++){
    if(ids[i] || data[4*i+3]<48) continue;
    index++;
    let size=1, next=0, left=w,top=h,right=0,bottom=0;
    queue[0]=i;ids[i]=index;
    while(next<size){
      const k=queue[next++],x=k%w,y=(k-x)/w;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++){
        for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){
          const j=yy*w+xx;
          if(!ids[j] && data[j*4+3]>=48) {ids[j]=index;queue[size++]=j;}
        }
      }
    }
    if(size<500) continue;
    const col=Math.floor((left+right+1)*columns/(2*w)),row=Math.floor((top+bottom+1)*rows/(2*h)),cell=row*columns+col;
    if(cells[cell]) throw Error('Two major islands in cell '+cell);
    cells[cell]={id:index,left,top,right,bottom,size};
  }
  if(cells.filter(Boolean).length!==columns*rows) throw Error('Missing separated artwork');
  return {cells,ids};
}

function extractPart(sheet, labels, cell) {
  const pad=4, x0=cell.left-pad,y0=cell.top-pad;
  const image=new PNG({width:cell.right-cell.left+1+2*pad,height:cell.bottom-cell.top+1+2*pad});
  const {width:w,height:h,data:s}=sheet, dst=image.data;
  for(let y=1;y<image.height-1;y++) for(let x=1;x<image.width-1;x++){
    const sx=x0+x,sy=y0+y;
    if(sx<0||sx>=w||sy<0||sy>=h)continue;
    const k=sy*w+sx,si=4*k,raw=s[si+3];if(raw<=5)continue;
    let belongs=labels[k]===cell.id;
    if(!belongs && raw<48){
      for(let yy=Math.max(0,sy-2);yy<=Math.min(h-1,sy+2)&&!belongs;yy++)
        for(let xx=Math.max(0,sx-2);xx<=Math.min(w-1,sx+2);xx++) if(labels[yy*w+xx]===cell.id){belongs=true;break;}
    }
    if(!belongs) continue;
    const di=(y*image.width+x)*4;
    dst[di]=s[si];dst[di+1]=s[si+1];dst[di+2]=s[si+2];
    dst[di+3]=Math.round(bounded((raw-5)/242,0,1)*255);
  }
  return {image,sourceXYWH:[x0,y0,image.width,image.height]};
}

function buildSetup(id) {
  if (mythic[id]) return buildSourceRig({id,dir:path.join(base,id),layout:mythic[id].layout,zones:mythic[id].zones,
    under:{boxes:{},supports:[]},underpainting:null,master:path.join(base,mythic[id].master??'mythic-creatures.png'),sourceSize:[1536,1024]});
  return buildSourceRig({id,dir:path.join(base,id),layout:layouts[id],under:underpaint[id],zones:cutlines[id],
    master:path.join(base,'monster-concepts.png'),sourceSize:[1585,992]});
}

function buildSourceRig({id,dir,layout,under,zones,master,sourceSize,underpainting='source-parts.png',backgroundZones,shadowBands}) {
  const def={...layout,draw:[...under.supports.map(s=>s.name),...layout.draw]};
  const partFolder=path.join(dir,'parts');
  fs.mkdirSync(partFolder,{recursive:true});
  const sheet=underpainting ? PNG.sync.read(fs.readFileSync(path.join(dir,underpainting))) : null;
  const packed=sheet ? identifyParts(sheet) : null;
  const original=fs.readFileSync(master),approved=PNG.sync.read(original);
  if(approved.width!==sourceSize[0]||approved.height!==sourceSize[1])throw Error('The selected master has different registration');
  const cut=partition(approved,zones,sheet ? backdrop(approved,backgroundZones,shadowBands) : null);
  const before=fs.existsSync(path.join(dir,'parts-register.json'))?JSON.parse(fs.readFileSync(path.join(dir,'parts-register.json'))).parts:[];
  const world=p=>[(p[0]-zones.origin[0])*zones.scale,(zones.origin[1]-p[1])*zones.scale];
  const bones=[],frames=new Map(),byName=new Map(),images=new Map(),partList=[];
  function bone(name,parent,point,angle=0,length=0,transform){
    const f=frames.get(parent)||{x:0,y:0,angle:0}, pos=local(f,point);
    const b={name,...(parent?{parent}:{}),x:round(pos[0]),y:round(pos[1]),rotation:round(transform==='onlyTranslation'?angle:angle-f.angle),length:round(length),...(transform?{transform}:{})};
    frames.set(name,{x:point[0],y:point[1],angle,index:bones.length});bones.push(b);return b;
  }
  bone('root',null,[0,0]);bone(def.root,'root',[0,0]);
  for(const part of def.parts) {
    const surface=sheet ? extractPart(sheet,packed.ids,packed.cells[part.cell]).image : null;
    const {image,sourceXYWH,visible,hidden}=cutSourcePart(PNG,cut,zones,part,def.draw,surface,under.boxes[part.name]);
    const bytes=PNG.sync.write(image);
    fs.writeFileSync(path.join(partFolder,part.name+'.png'),bytes);
    const z=zones.parts[part.name],pivot=world(z.pivot),end=world(z.tip);
    const uv=pt=>[(pt[0]-sourceXYWH[0])/image.width,(pt[1]-sourceXYWH[1])/image.height];
    const p={...part,x:pivot[0],y:pivot[1],w:image.width*zones.scale,h:image.height*zones.scale,iw:image.width,ih:image.height,
      pin:uv(z.pivot),tip:uv(z.tip),...(part.flexAt?{bend:uv(part.flexAt)}:{})};
    if(!part.attachBone){
      const dx=end[0]-p.x,dy=end[1]-p.y;
      bone(p.name,p.bindParent||p.parent||def.root,pivot,degrees(Math.atan2(dy,dx)),Math.hypot(dx,dy),part.transform);
    }
    byName.set(p.name,p);images.set(p.name,image);
    if(p.bend){const pt=world(part.flexAt);bone(p.name+'-tip',p.name,pt,degrees(Math.atan2(end[1]-pt[1],end[0]-pt[0])),Math.hypot(end[0]-pt[0],end[1]-pt[1]));}
    partList.push({name:p.name,bone:p.attachBone||p.name,sourceXYWH,png:[image.width,image.height],sha256:hash(bytes),
      pivotUV:p.pin.map(round),setupPivot:pivot.map(round),size:[round(p.w),round(p.h)],angle:0,visiblePixels:visible,hiddenPixels:hidden,reconstructionCell:part.cell});
  }
  for(const supp of under.supports){
    const surface=extractPart(sheet,packed.ids,packed.cells[supp.cell]).image;
    const {image,sourceXYWH,hidden}=makeSupport(PNG,cut,supp,surface);
    const origin=zones.parts[supp.bone].pivot,pivot=world(origin),pin=[(origin[0]-sourceXYWH[0])/image.width,(origin[1]-sourceXYWH[1])/image.height];
    const bytes=PNG.sync.write(image);
    fs.writeFileSync(path.join(partFolder,supp.name+'.png'),bytes);
    byName.set(supp.name,{name:supp.name,attachBone:supp.bone,x:pivot[0],y:pivot[1],w:image.width*zones.scale,h:image.height*zones.scale,iw:image.width,ih:image.height,pin});
    images.set(supp.name,image);
    partList.push({name:supp.name,bone:supp.bone,sourceXYWH,png:[image.width,image.height],sha256:hash(bytes),pivotUV:pin.map(round),setupPivot:pivot.map(round),size:[round(image.width*zones.scale),round(image.height*zones.scale)],angle:0,visiblePixels:0,hiddenPixels:hidden,reconstructionCell:supp.cell,underlay:true});
  }
  for(const item of before){
    const file=path.join(partFolder,item.name+'.png');
    if(/^[a-z-]+$/.test(item.name)&&!byName.has(item.name)&&fs.existsSync(file)&&hash(fs.readFileSync(file))===item.sha256)fs.unlinkSync(file);
  }
  const ik=[];
  for(const [name,upper,lower] of def.ik||[]){
    const upperPos=frames.get(upper),lowerPos=frames.get(lower),foot=imagePoint(byName.get(lower),byName.get(lower).tip);
    bone(name,def.root,foot);
    const cross=(lowerPos.x-upperPos.x)*(foot[1]-lowerPos.y)-(lowerPos.y-upperPos.y)*(foot[0]-lowerPos.x);
    ik.push({name,order:ik.length,bones:[upper,lower],target:name,bendPositive:cross>=0,mix:1});
  }
  const attachments={};
  for(const p of byName.values()){
    const frame=frames.get(p.attachBone||p.name),center=local(frame,imagePoint(p,[.5,.5]));
    const entry=p.bend?makeClothMesh(p,frames):{path:p.name,x:round(center[0]),y:round(center[1]),rotation:round((p.angle||0)-frame.angle),scaleX:round(p.w/p.iw),scaleY:round(p.h/p.ih),width:p.iw,height:p.ih};
    attachments[p.name]={[p.name]:entry};
  }
  const skeleton={
    skeleton:{spine:'3.8.75',images:'./parts/',fps:30},
    bones,slots:def.draw.map(name=>({name,bone:byName.get(name).attachBone||name,attachment:name,...(byName.get(name).tint?{color:byName.get(name).tint}:{})})),
    skins:[{name:'default',attachments}],...(ik.length?{ik}:{}),events:{impact:{}},animations:{}
  };
  if(byName.size!==def.parts.length+under.supports.length||skeleton.slots.length!==byName.size||new Set(def.draw).size!==byName.size)throw Error('Incomplete slot mapping: '+id);
  const audit=verifySetup(cut,partList,images,def.draw);
  json(path.join(dir,'parts-register.json'),{actor:id,source:path.relative(dir,master).split(path.sep).join('/'),sourceSha256:hash(original),jointUnderpaint:underpainting,
    coordinateSystem:'UV from top left, Spine world +Y up',origin:zones.origin,scale:zones.scale,ground:0,parts:partList,drawOrder:def.draw,setupAudit:audit});
  return {id,actor:id,dir,partFolder,parts:partList,def,skeleton,frames,byName,images,cut};
}

function verifySetup(cut,parts,images,draw){
  const canvas=Buffer.alloc(cut.w*cut.h*4);
  for(const name of draw){
    const p=parts.find(s=>s.name===name),im=images.get(name),[l,t]=p.sourceXYWH;
    for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){
      const si=(y*im.width+x)*4,alpha=im.data[si+3]/255;
      if(!alpha)continue;
      const i=((y+t-cut.top)*cut.w+x+l-cut.left)*4,old=canvas[i+3]/255,total=alpha+old*(1-alpha);
      for(let c=0;c<3;c++)canvas[i+c]=Math.round((im.data[si+c]*alpha+canvas[i+c]*old*(1-alpha))/total);
      canvas[i+3]=Math.round(total*255);
    }
  }
  let different=0,visible=0,holes=0;
  for(let k=0;k<cut.w*cut.h;k++){
    if(cut.alpha[k])visible++;if(cut.alpha[k]&&!canvas[4*k+3])holes++;
    if(canvas[k*4+3]!==cut.alpha[k]||(cut.alpha[k]&&[0,1,2].some(c=>canvas[k*4+c]!==cut.matteRGB[k*4+c])))different++;
  }
  if(different||holes)throw Error('Neutral reassembly differs from the approved cutout: '+different+' pixels');
  return {visiblePixels:visible,differentPixels:different,missingPixels:holes};
}

// Boundary order matches the mesh hull. The two longitudinal influences bend a real cloth strip.
function makeClothMesh(part,frames){
  const levels=[0,.22,.45,.70,1], outline=[[0,0],...levels.map((v,i)=>[1,i]),...[4,3,2,1].map(i=>[0,i])];
  const uv=[],vertices=[],triangles=[];
  const a=frames.get(part.name),b=frames.get(part.name+'-tip');
  for(const [u,row] of outline){
    const v=levels[row],world=imagePoint(part,[u,v]);
    uv.push(u,v);
    const t=bounded((v-.25)/.55,0,1), w=t*t*(3-2*t);
    const mix=[[a,1-w],[b,w]].filter(pair=>pair[1]>.000001);
    vertices.push(mix.length);
    for(const [f,weight] of mix){const p=local(f,world);vertices.push(f.index,round(p[0]),round(p[1]),round(weight));}
  }
  const at=(u,row)=>outline.findIndex(k=>k[0]===u&&k[1]===row);
  for(let i=0;i<levels.length-1;i++)triangles.push(at(0,i),at(1,i),at(1,i+1),at(1,i+1),at(0,i+1),at(0,i));
  return {type:'mesh',path:part.name,uvs:uv,triangles,vertices,hull:outline.length,width:part.iw,height:part.ih};
}
function renderSetup(rig) {
  const bounds=[Infinity,Infinity,-Infinity,-Infinity];
  for(const p of rig.byName.values())for(const uv of [[0,0],[1,0],[1,1],[0,1]]){
    const [x,y]=imagePoint(p,uv);bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);
  }
  const scale=1.8,pad=16,left=bounds[0]-pad,top=bounds[3]+pad;
  const out=new PNG({width:Math.ceil((bounds[2]-bounds[0]+2*pad)*scale),height:Math.ceil((bounds[3]-bounds[1]+2*pad)*scale)});
  for(const name of rig.def.draw){
    const p=rig.byName.get(name),src=rig.images.get(name),angle=radians(-(p.angle||0)),c=Math.cos(angle),s=Math.sin(angle);
    const tint=[0,2,4].map(i=>p.tint?parseInt(p.tint.slice(i,i+2),16)/255:1);
    for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){
      const xx=left+(x+.5)/scale-p.x,yy=top-(y+.5)/scale-p.y;
      const u=(c*xx-s*yy)/p.w+p.pin[0],v=p.pin[1]-(s*xx+c*yy)/p.h;
      if(u<0||v<0||u>=1||v>=1)continue;
      const si=(Math.floor(v*src.height)*src.width+Math.floor(u*src.width))*4;
      const alpha=src.data[si+3]/255;if(alpha===0)continue;
      const di=(y*out.width+x)*4,previous=out.data[di+3]/255,total=alpha+previous*(1-alpha);
      for(let k=0;k<3;k++)out.data[di+k]=Math.round((src.data[si+k]*tint[k]*alpha+out.data[di+k]*previous*(1-alpha))/total);
      out.data[di+3]=Math.round(255*total);
    }
  }
  fs.writeFileSync(path.join(rig.dir,'setup.png'),PNG.sync.write(out));
}
if(require.main===module){for(const id of Object.keys(layouts)){const r=buildSetup(id);renderSetup(r);console.log(id,r.parts.length,r.skeleton.bones.length);}}
module.exports={base,project,layouts,buildSetup,buildSourceRig,renderSetup,verifySetup,identifyParts,extractPart,json,hash,PNG};
