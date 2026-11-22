// Rebuild reconstruction metadata from retained workspace sources, not session temp files.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),{ears,clip}=require('./decompose.cjs');
const provenance=JSON.parse(fs.readFileSync(path.join(root,'art-source/spine08/reconstruction-sources/provenance.json')));
const items=provenance.map(p=>({...p,sourcePath:path.resolve(root,p.retainedSource)}));
const temp=path.join(root,'temp/spine08-decomposition');fs.mkdirSync(temp,{recursive:true});fs.writeFileSync(path.join(temp,'repair-inputs.json'),JSON.stringify(items,null,2)+'\n');
const inspect=spawnSync('python',[path.join(__dirname,'inspect-part-alpha.py')],{cwd:root,encoding:'utf8'});if(inspect.status!==0)throw Error(inspect.stderr);
const data=JSON.parse(fs.readFileSync(path.join(temp,'repair-inspection.json')));
for(const p of data){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'art-source/spine08/parts',p.actor,'parts.json'))),part=manifest.parts.find(s=>s.name===p.name);
 let triangles=ears(p.contour);
 if(part.paintMasks){const [l,t,r,b]=p.alphaBounds;const convert=(x,y)=>[l+(x-part.bbox[0])/(part.bbox[2]-part.bbox[0])*(r-l),t+(y-part.bbox[1])/(part.bbox[3]-part.bbox[1])*(b-t)];
  const masks=part.paintMasks.flatMap(([x,y,xx,yy])=>{const a=convert(x,y),c=convert(xx,yy),box=[a,[c[0],a[1]],c,[a[0],c[1]]];return [[box[0],box[1],box[2]],[box[0],box[2],box[3]]];});
  const clipped=[];for(const tri of triangles)for(const mask of masks){const poly=clip(tri,mask);for(let i=1;i<poly.length-1;i++)clipped.push([poly[0],poly[i],poly[i+1]]);}triangles=clipped;
 }
 const vertices=[],indices=[],seen=new Map();for(const tri of triangles)for(const v of tri){const key=v.join(',');if(!seen.has(key)){seen.set(key,vertices.length);vertices.push(v);}indices.push(seen.get(key));}
 p.mesh={type:'mesh',path:'image',width:p.width,height:p.height,vertices:vertices.flatMap(v=>[v[0],-v[1]]),uvs:vertices.flatMap(v=>[v[0]/p.width,v[1]/p.height]),triangles:indices,hull:0};
}
fs.writeFileSync(path.join(temp,'clean-repair-data.json'),JSON.stringify(data));console.log(JSON.stringify({prepared:data.length,retainedWorkspaceSources:true}));
