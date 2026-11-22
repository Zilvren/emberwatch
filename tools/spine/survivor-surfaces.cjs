const fs=require('node:fs'),path=require('node:path');
const {PNG,hash,verifySetup}=require('./bestiary-assets.cjs');
const {inside}=require('./bestiary-source-art.cjs');
const {zones,point,stageScale,ground}=require('./survivor-profile.cjs');
const {round}=require('./rig-authoring.cjs');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// The clean illustration supplies ONLY the surfaces covered by another source part in the neutral pose.
// Match its colour to the actual panel along the boundary of each occlusion, then let its folds continue inside.
function rebuildCloth(rig,plateFile){
  const plate=PNG.sync.read(fs.readFileSync(plateFile)),[left,top]=point([680,154]),cut=rig.cut;
  const paint=(x,y)=>((y-top)*plate.width+x-left)*4;
  const names=['inner-tunic','inner-skirt','coat-skirt','back-flap'];
  for(const name of names){
    const rec=rig.parts.find(p=>p.name===name),im=rig.images.get(name),[ox,oy]=rec.sourceXYWH,idx=cut.index.get(name);
    const panel=zones.parts[name]?.border, layer=rig.def.draw.indexOf(name),cells=new Map();
    function correction(x,y){
      const gx=Math.round(x/5)*5,gy=Math.round(y/5)*5,key=gx+','+gy;
      if(cells.has(key))return cells.get(key);
      let weight=0;const diff=[0,0,0];
      if(idx!==undefined)for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[1,1],[-1,1]]){
        for(let radius=4;radius<=100;radius+=4){
          const xx=gx+radius*dx,yy=gy+radius*dy,xx0=xx-cut.left,yy0=yy-cut.top;
          if(xx0<0||xx0>=cut.w||yy0<0||yy0>=cut.h||xx<left||xx>=left+plate.width||yy<top||yy>=top+plate.height)break;
          const j=yy0*cut.w+xx0;
          if(cut.owner[j]!==idx||cut.alpha[j]!==255||cut.matteRGB[j*4+2]<cut.matteRGB[j*4]+1)continue;
          const k=paint(xx,yy),w=1/(radius*radius+12);
          for(let c=0;c<3;c++)diff[c]+=clamp(cut.matteRGB[j*4+c]-plate.data[k+c],-32,32)*w;
          weight+=w;break;
        }
      }
      const value=diff.map(n=>weight?n/weight:0);cells.set(key,value);return value;
    }
    let filled=0;
    for(let iy=0;iy<im.height;iy++)for(let ix=0;ix<im.width;ix++){
      const x=ix+ox,y=iy+oy,xx=x-cut.left,yy=y-cut.top;
      if(xx<0||yy<0||xx>=cut.w||yy>=cut.h||x<left||x>=left+plate.width||y<top||y>=top+plate.height)continue;
      const j=yy*cut.w+xx,k=(iy*im.width+ix)*4;
      if(cut.alpha[j]!==255)continue;
      if(panel){
        if(cut.owner[j]===idx||cut.owner[j]<0||rig.def.draw.indexOf(cut.regions[cut.owner[j]].name)<=layer||!inside(x+.5,y+.5,panel))continue;
      }else if(!im.data[k+3])continue;
      const ci=paint(x,y),diff=name==='coat-skirt'?[0,0,0]:correction(x,y);
      for(let c=0;c<3;c++)im.data[k+c]=clamp(Math.round(plate.data[ci+c]+diff[c]),0,255);
      im.data[k+3]=255;filled++;
    }
    const bytes=PNG.sync.write(im);fs.writeFileSync(path.join(rig.partFolder,name+'.png'),bytes);
    rec.sha256=hash(bytes);rec.backingPixels=filled;
  }
  return verifySetup(cut,rig.parts,rig.images,rig.def.draw);
}

function rotate(x,y,deg){const r=deg*Math.PI/180;return [Math.cos(r)*x-Math.sin(r)*y,Math.sin(r)*x+Math.cos(r)*y];}
// Bind a continuous trouser or sleeve texture across its anatomical joint. Painted cuffs keep their own height.
function weightJoint(rig,slot,upper,lower,fromY,toY,attachment=slot){
  const skin=rig.skeleton.skins[0].attachments,region=skin[slot][attachment],slotBone=rig.skeleton.slots.find(s=>s.name===slot).bone;
  const owner=rig.frames.get(slotBone),a=rig.frames.get(upper),b=rig.frames.get(lower);
  const dx=region.width*region.scaleX,dy=region.height*region.scaleY;
  const center=rotate(region.x||0,region.y||0,owner.angle).map((n,i)=>n+(i?owner.y:owner.x));
  const orient=owner.angle+(region.rotation||0),top=center[1]+Math.cos(orient*Math.PI/180)*dy/2;
  const rows=[0,.12,.32,.55,.77,1];
  for(const y of [fromY,(fromY+toY)/2,toY])rows.push(clamp((top-(ground[1]-y)*stageScale)/Math.max(1,Math.cos(orient*Math.PI/180)*dy),0,1));
  const levels=[...new Set(rows.map(v=>Math.round(v*1000)/1000))].sort((p,q)=>p-q),last=levels.length-1;
  const points=[[0,0],[.5,0],[1,0],...levels.slice(1).map((v,i)=>[1,i+1]),[.5,last],[0,last],...levels.slice(1,-1).map((v,i)=>[0,i+1]).reverse()];
  const hull=points.length;for(let i=1;i<last;i++)points.push([.5,i]);
  const uvs=[],vertices=[],triangles=[];
  for(const [u,row]of points){
    const v=levels[row];uvs.push(u,v);
    const offset=rotate((u-.5)*dx,(.5-v)*dy,orient),x=center[0]+offset[0],y=center[1]+offset[1];
    const t=upper===lower?0:clamp((ground[1]-y/stageScale-fromY)/(toY-fromY),0,1),w=t*t*(3-2*t);
    const influences=[[a,1-w],[b,w]].filter(([,v])=>v>1e-5);
    vertices.push(influences.length);
    for(const [f,weight]of influences){const p=rotate(x-f.x,y-f.y,-f.angle);vertices.push(f.index,round(p[0]),round(p[1]),round(weight));}
  }
  const at=(u,row)=>points.findIndex(p=>p[0]===u&&p[1]===row);
  for(let row=0;row<last;row++)for(const u of [0,.5]){
    const l=at(u,row),r=at(u+.5,row),ll=at(u,row+1),rr=at(u+.5,row+1);
    triangles.push(l,r,rr,rr,ll,l);
  }
  skin[slot][attachment]={type:'mesh',path:region.path,uvs,triangles,vertices,hull,width:region.width,height:region.height};
}
module.exports={rebuildCloth,weightJoint};
