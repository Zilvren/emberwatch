const fs=require('node:fs'),path=require('node:path');
const r=n=>Math.round(n*1e6)/1e6;
function inverse(frame,x,y){const a=frame.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=x-frame.pos[0],dy=y-frame.pos[1];return [r(c*dx+s*dy),r(-s*dx+c*dy)];}
function withParts(rig,root){
 const folder=path.join(root,'art-source/spine08/parts',rig.actor),manifest=JSON.parse(fs.readFileSync(path.join(folder,'parts.json')));
 rig.bones=rig.bones.filter(b=>!['Corpse','CorpseHead'].includes(b.name));rig.skeleton.bones=rig.bones;
 const {scale,ox,oy}=rig.sourceTransform,convert=([x,y])=>[r(x*scale+ox),r(-y*scale+oy)];
 const index=new Map(rig.bones.map((b,i)=>[b.name,i])),slots=[],attachments={},vertices=[],indices=[],influences=[];
 const triangulate=poly=>{const lookup=new Map(poly.map((p,i)=>[p.join(','),i]));return require('./decompose.cjs').ears(poly).flatMap(t=>t.map(p=>lookup.get(p.join(','))));};
 const order=new Map(manifest.parts.map((p,i)=>[p.name,i]));
 manifest.parts.sort((a,b)=>{
  const rank=p=>p.name==='TorsoFill'?order.get('Torso')-1.5:p.name==='RearShoulderPlate'?order.get('Torso')+.5:p.name==='FrontUpperArm'?order.get('Torso')-.5:p.name==='Weapon'?order.get('FrontHand')-.5:order.get(p.name);
  return rank(a)-rank(b);
 });
 for(const p of manifest.parts){
  if(!fs.existsSync(path.join(folder,p.name+'.png')))throw Error('Missing independent part '+rig.actor+'/'+p.name);
  const frame=rig.frames[p.bone],boneIndex=index.get(p.bone);if(!frame)throw Error('Missing part bone '+p.bone);
  let region,worldVertices,triangles;
  if(p.mode==='reconstructed-limb'){
   p.targetLength=rig.bones[boneIndex].length*1.12;
   const [l,t,right,bottom]=p.alphaBounds,sx=p.targetWidth/(right-l),sy=p.targetLength/(bottom-t),length=rig.bones[boneIndex].length;
   const cx=(p.width/2-(l+right)/2)*sx,cy=((t+bottom)/2-p.height/2)*sy;
   region={path:p.name,x:r(length/2-cy),y:r(cx),rotation:90,width:p.width,height:p.height,scaleX:r(sx),scaleY:r(sy)};
   const a=frame.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),local=[[length/2-p.targetLength/2,-p.targetWidth/2],[length/2+p.targetLength/2,-p.targetWidth/2],[length/2+p.targetLength/2,p.targetWidth/2],[length/2-p.targetLength/2,p.targetWidth/2]];
   const shape=p.outline?.map(([u,v])=>[length/2+(v-.5)*p.targetLength,(u-.5)*p.targetWidth])??local;
   worldVertices=shape.map(([x,y])=>[r(frame.pos[0]+c*x-s*y),r(frame.pos[1]+s*x+c*y)]);triangles=triangulate(shape);
  }else if(p.mode==='reconstructed-region'){
   const [l,t,right,bottom]=p.alphaBounds,sx=(p.bbox[2]-p.bbox[0])*scale/(right-l),sy=(p.bbox[3]-p.bbox[1])*scale/(bottom-t);
   const target=convert([(p.bbox[0]+p.bbox[2])/2,(p.bbox[1]+p.bbox[3])/2]),center=[target[0]+(p.width/2-(l+right)/2)*sx,target[1]+((t+bottom)/2-p.height/2)*sy],local=inverse(frame,...center);
   region={path:p.name,x:local[0],y:local[1],rotation:r(-frame.angle),width:p.width,height:p.height,scaleX:r(sx),scaleY:r(sy)};
   const shape=p.outline?.map(([u,v])=>[p.bbox[0]+u*(p.bbox[2]-p.bbox[0]),p.bbox[1]+v*(p.bbox[3]-p.bbox[1])])??[[p.bbox[0],p.bbox[1]],[p.bbox[2],p.bbox[1]],[p.bbox[2],p.bbox[3]],[p.bbox[0],p.bbox[3]]];
   if(p.paintMasks){worldVertices=p.paintMasks.flatMap(([l,t,r,b])=>[[l,t],[r,t],[r,b],[l,b]].map(convert));triangles=p.paintMasks.flatMap((_,i)=>[0,1,2,0,2,3].map(n=>n+i*4));}
   else{worldVertices=shape.map(convert);triangles=triangulate(shape);}
  }else{
   const center=convert(p.center??[(p.bbox[0]+p.bbox[2])/2,(p.bbox[1]+p.bbox[3])/2]),local=inverse(frame,...center);
   region={path:p.name,x:local[0],y:local[1],rotation:r(-frame.angle),width:p.width,height:p.height,scaleX:r(scale),scaleY:r(scale)};
   worldVertices=p.vertices.map(convert);triangles=p.indices;
  }
  slots.push({name:p.name,bone:p.bone,attachment:p.name});attachments[p.name]={[p.name]:region};
  const offset=vertices.length;
  p.vertexStart=offset;p.vertexCount=worldVertices.length;
  for(const v of worldVertices){vertices.push([v[0],v[1],0,0]);influences.push([[boneIndex,...inverse(frame,...v),1]]);}
  indices.push(...triangles.map(i=>i+offset));
 }
 rig.skeleton.skeleton.images=folder.replaceAll('\\','/')+'/';rig.skeleton.slots=slots;rig.skeleton.skins=[{name:'default',attachments}];
 rig.geometry={...rig.geometry,vertices,indices};rig.influences=influences;rig.parts=manifest.parts;rig.partFolder=folder;
 return rig;
}
module.exports={withParts};
