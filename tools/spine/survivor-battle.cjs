// Explicit authoring command for the golden-waist survivor. A normal game build never regenerates art.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {project, PNG, json, hash, buildSourceRig, renderSetup, identifyParts, extractPart} = require('./bestiary-assets.cjs');
const {publish} = require('./bestiary-author.cjs');
const {crop, stageScale, point, box, world, zones, layout, under} = require('./survivor-profile.cjs');
const {round} = require('./rig-authoring.cjs');
const {survivorClips} = require('./survivor-battle-motion.cjs');
const {rebuildCloth,weightJoint} = require('./survivor-surfaces.cjs');
const {bindLeftHand} = require('./survivor-left-hand.cjs');

const id = 'survivor';
const sourceDir = path.join(project,'art-source/ashen-labyrinth/battle-survivor');
const dir = path.join(sourceDir,'spine');
const profile = path.join(dir,'profile-source.png');
const original = path.join(sourceDir,'turnaround-golden-master.png');
const originalHash = '8a41f4aca887b4132bd2156dc8ecaf456aff68e76c96051ba3d698f3f801cdf4';
const kit = path.join(sourceDir,'joint-underpaint.png');
const deg = n=>n*180/Math.PI;
const rad = n=>n*Math.PI/180;
function rotate(x,y,a){const c=Math.cos(rad(a)),s=Math.sin(rad(a));return [x*c-y*s,x*s+y*c];}
function relative(frame,x,y){return rotate(x-frame.x,y-frame.y,-frame.angle);}

function cropSelectedProfile() {
  const bytes=fs.readFileSync(original);
  if(hash(bytes)!==originalHash)throw Error('The optical registration belongs to turnaround-golden-master.png. Re-register a different drawing before cutting.');
  const src=PNG.sync.read(bytes);
  const dst=new PNG({width:crop.width*crop.density,height:crop.height*crop.density});
  for(let y=0;y<dst.height;y++){
    const v=(crop.top+(y+.5)/crop.density)*src.height/992-.5,iy=Math.floor(v),fy=v-iy;
    for(let x=0;x<dst.width;x++){
      const u=(crop.left+(x+.5)/crop.density)*src.width/1585-.5,ix=Math.floor(u),fx=u-ix;
      const k=(y*dst.width+x)*4,j=(iy*src.width+ix)*4,next=j+src.width*4;
      for(let c=0;c<3;c++)dst.data[k+c]=Math.round((src.data[j+c]*(1-fx)+src.data[j+4+c]*fx)*(1-fy)+(src.data[next+c]*(1-fx)+src.data[next+4+c]*fx)*fy);
      dst.data[k+3]=255;
    }
  }
  fs.writeFileSync(profile,PNG.sync.write(dst));
}

// The approved side view hides one arm and one leg. Their complete surfaces are only enabled in battle poses.
// The common pin and tip convention also makes hand-painted replacements editable in Spine.
function addBattleParts(rig){
  const s=rig.skeleton,frames=rig.frames,attachments=s.skins[0].attachments;
  const art=PNG.sync.read(fs.readFileSync(kit)),{cells,ids}=identifyParts(art);
  const battleSlots=[],limbs=[],extras=[];
  function bone(name,parent,pivot,tip,transform){
    const p=world(pivot),t=world(tip),f=frames.get(parent),[x,y]=relative(f,...p);
    const a=deg(Math.atan2(t[1]-p[1],t[0]-p[0]));
    const b={name,parent,x:round(x),y:round(y),rotation:round(transform==='onlyTranslation'?a:a-f.angle),
      length:round(Math.hypot(t[0]-p[0],t[1]-p[1])),...(transform?{transform}:{})};
    frames.set(name,{x:p[0],y:p[1],angle:a,index:s.bones.length});s.bones.push(b);
    return frames.get(name);
  }
  function attach(name,parent,pivot,tip,cell,pin,end,across,tint,transform,artSpan=[pivot,tip]){
    const f=bone(name,parent,pivot,tip,transform),start=world(artSpan[0]),t=world(artSpan[1]);
    const {image}=extractPart(art,ids,cells[cell]);
    if(name==='cast-sleeve'){
      // Keep the original shoulder. A closed, painted elbow replaces the hollow opening at the joint.
      const elbow=PNG.sync.read(fs.readFileSync(path.join(sourceDir,'left-elbow.png')));
      if(elbow.width!==image.width||elbow.height!==image.height)throw Error('Left elbow registration changed.');
      for(let y=Math.floor(.66*image.height);y<image.height;y++){
        const u=Math.min(1,Math.max(0,(y/image.height-.66)/.14)),mix=u*u*(3-2*u);
        for(let x=0;x<image.width;x++){
          const k=4*(y*image.width+x),a=(1-mix)*image.data[k+3],b=mix*elbow.data[k+3],alpha=a+b;
          for(let c=0;c<3;c++)image.data[k+c]=alpha?Math.round((a*image.data[k+c]+b*elbow.data[k+c])/alpha):0;
          image.data[k+3]=Math.round(alpha);
        }
      }
    }
    const dx=(end[0]-pin[0])*image.width*across,dy=(pin[1]-end[1])*image.height;
    const unit=Math.hypot(t[0]-start[0],t[1]-start[1])/Math.hypot(dx,dy);
    const angle=deg(Math.atan2(t[1]-start[1],t[0]-start[0]))-deg(Math.atan2(dy,dx)),w=image.width*across*unit,h=image.height*unit;
    const offset=rotate((.5-pin[0])*w,(pin[1]-.5)*h,angle);
    const [x,y]=relative(f,start[0]+offset[0],start[1]+offset[1]);
    attachments[name]={[name]:{path:name,x:round(x),y:round(y),rotation:round(angle-f.angle),scaleX:round(across*unit),scaleY:round(unit),width:image.width,height:image.height}};
    battleSlots.push({name,bone:name,...(tint?{color:tint}:{})});
    const png=PNG.sync.write(image);fs.writeFileSync(path.join(dir,'parts',name+'.png'),png);
    extras.push({name,bone:name,sha256:hash(png),png:[image.width,image.height],source:'../joint-underpaint.png',...(name==='cast-sleeve'?{elbowBacking:'../left-elbow.png'}:{}),reconstructionCell:cell,pivotUV:pin,setupPivot:[f.x,f.y].map(round),size:[w,h].map(round),battleOnly:true});
    limbs.push(name);
  }
  attach('far-thigh','hips',[785,463],[784,651],8,[.52,.09],[.51,.92],.64,'b8b0c1ff',undefined,[[785,463],[782,724]]);
  attach('far-shin','far-thigh',[784,651],[766,842],9,[.50,.09],[.45,.94],.96,'bdb4c2ff',undefined,[[782,724],[766,842]]);
  attach('far-boot','far-shin',[766,842],[861,909],10,[.23,.27],[.91,.77],1,'bab4c1ff','onlyTranslation');
  const farFoot=frames.get('far-boot');
  bone('far-plant','PoseRoot',[766,842],[766,842]);
  const hip=frames.get('far-thigh'),knee=frames.get('far-shin');
  const bend=(knee.x-hip.x)*(farFoot.y-knee.y)-(knee.y-hip.y)*(farFoot.x-knee.x);
  s.ik.push({name:'far-plant',order:s.ik.length,bones:['far-thigh','far-shin'],target:'far-plant',bendPositive:bend>=0,mix:1});
  attach('cast-sleeve','chest',[799,215],[829,344],2,[.58,.13],[.55,.923],.83,'cdc7d0ff');
  attach('cast-bracer','cast-sleeve',[829,344],[918,259],5,[.18,.83],[.885,.105],.78,'e2dae0ff');
  const hand=bindLeftHand(rig,bone,battleSlots,limbs,extras,sourceDir,dir);
  const cardArt=extractPart(art,ids,cells[7]).image,cardData=PNG.sync.write(cardArt);
  fs.writeFileSync(path.join(dir,'parts','card.png'),cardData);
  // Held and airborne drawings share a single image and can be adjusted separately in the editor.
  bone('held-card','cast-palm',hand.tip,[hand.tip[0]+18,hand.tip[1]]);
  bone('flight-card','root',[774,920],[794,920]);
  const card={path:'card',rotation:-9,scaleX:round(50*stageScale/cardArt.width),scaleY:round(71*stageScale/cardArt.height),width:cardArt.width,height:cardArt.height};
  attachments['held-card']={card:{...card,x:round((.5-hand.cardUV[0])*50*stageScale),y:round((hand.cardUV[1]-.5)*71*stageScale),rotation:0}};
  attachments['flight-card']={card:{...card,rotation:0}};
  battleSlots.push({name:'held-card',bone:'held-card'},{name:'flight-card',bone:'flight-card'});
  extras.push({name:'card',bone:'held-card',sha256:hash(cardData),png:[cardArt.width,cardArt.height],source:'../joint-underpaint.png',reconstructionCell:7,additionalSlot:'flight-card',battleOnly:true});
  bone('Aim','chest',[794,286],[805,286]);
  bone('AttackTip','cast-palm',hand.tip,[hand.tip[0]+8,hand.tip[1]]);
  bone('ThumbPad','cast-thumb',hand.tip,[hand.tip[0]+4,hand.tip[1]]);
  bone('CardMouth','card-case',[840,386],[846,386]);
  bone('Approach','root',[774,920],[784,920]);

  const originalSlots=s.slots,at=n=>battleSlots.find(slot=>slot.name===n);
  const palmDepth=originalSlots.findIndex(slot=>slot.name==='near-sleeve'),pouch=originalSlots.findIndex(slot=>slot.name==='card-case');
  s.slots=[...['far-thigh','far-shin','far-boot'].map(at),
    ...originalSlots.slice(0,pouch),at('cast-sleeve'),at('cast-bracer'),at('cast-middle'),at('cast-palm'),at('cast-index'),at('held-card'),...originalSlots.slice(pouch,palmDepth),at('cast-thumb'),
    ...originalSlots.slice(palmDepth),at('flight-card')];
  s.events={release:{},impact:{}};
  rig.battleSlots=limbs;
  rig.parts.push(...extras);
  return extras;
}

function prepare(){
  fs.mkdirSync(dir,{recursive:true});cropSelectedProfile();
  const rig=buildSourceRig({id,dir,layout,zones,under,master:profile,sourceSize:[crop.width*crop.density,crop.height*crop.density],
    underpainting:'../joint-underpaint.png',backgroundZones:[{rect:box([674,2,876,931])}],shadowBands:[[point([0,899])[1],point([0,940])[1]]]});
  const setupAudit=rebuildCloth(rig,path.join(sourceDir,'coat-underpaint.png'));
  renderSetup(rig);
  addBattleParts(rig);
  const skin=rig.skeleton.skins[0].attachments,fullLeg=skin['far-thigh']['far-thigh'];
  skin['near-thigh']['near-full']={...fullLeg,scaleX:round(fullLeg.scaleX*1.04)};
  weightJoint(rig,'near-thigh','near-thigh','near-shin',605,699,'near-full');
  for(const name of ['near-thigh','near-trouser-lining'])weightJoint(rig,name,'near-thigh','near-shin',606,698);
  weightJoint(rig,'far-thigh','far-thigh','far-shin',606,698);
  for(const name of ['near-sleeve','near-underarm'])weightJoint(rig,name,'near-sleeve','near-bracer',318,377);
  // Lining and visible cloth bend together when the survivor lands.
  weightJoint(rig,'inner-skirt','coat-skirt','coat-skirt-tip',466,610);
  for(const [slot,bone] of [['hips-lining','hips'],['ration-bag','ration-bag'],['hood','hood'],['tunic-lining','tunic-lining']])
    weightJoint(rig,slot,bone,bone,470,615);
  const clips=survivorClips(rig);rig.skeleton.animations=clips.animations;
  json(path.join(dir,id+'.authoring.json'),rig.skeleton);
  const reg=JSON.parse(fs.readFileSync(path.join(dir,'parts-register.json')));
  reg.parts=rig.parts;reg.setupAudit=setupAudit;reg.leftHand=rig.leftHand;reg.cleanCoat='../coat-underpaint.png';reg.selectedTurnaround='../turnaround-golden-master.png';reg.selectedSha256=originalHash;
  reg.crop=crop;reg.setupDrawOrder=reg.drawOrder;reg.drawOrder=rig.skeleton.slots.map(slot=>slot.name);
  json(path.join(dir,'parts-register.json'),reg);
  console.log(JSON.stringify({actor:id,components:reg.parts.length,bones:rig.skeleton.bones.length,slots:rig.skeleton.slots.length,setup:reg.setupAudit,release:clips.release,impact:clips.impact}));
}
if(require.main===module){
  if(process.argv[2]==='prepare')prepare();
  else if(process.argv[2]==='export'){
    const exe=process.env.SPINE_EXE;if(!exe||!fs.existsSync(exe))throw Error('Set SPINE_EXE to Spine.com 3.8.75.');
    const scratch=process.env.SURVIVOR_SPINE_SCRATCH||path.join(os.tmpdir(),'the-end-survivor-spine');fs.mkdirSync(scratch,{recursive:true});
    publish(id,exe,scratch,process.argv.includes('--replace-project'),dir);
  }else throw Error('Use prepare or export.');
}
module.exports={prepare,dir,id,sourceDir,originalHash};
