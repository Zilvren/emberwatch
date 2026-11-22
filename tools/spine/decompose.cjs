const fs=require('node:fs'),path=require('node:path');
const {layouts,boneFor}=require('./parts-layout.cjs');
const {ROOT}=require('./rig-authoring.cjs');
const read=f=>JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'));
const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function ears(input){
 const p=area(input)>0?input.slice():input.slice().reverse(),v=p.map((_,i)=>i),out=[];
 for(let attempts=0;v.length>3&&attempts<1000;attempts++){
  let found=false;
  for(let k=0;k<v.length;k++){const ids=[v[(k+v.length-1)%v.length],v[k],v[(k+1)%v.length]],t=ids.map(i=>p[i]);
   if(cross(...t)<1e-8)continue;
   if(v.some(i=>!ids.includes(i)&&cross(t[0],t[1],p[i])>=-1e-7&&cross(t[1],t[2],p[i])>=-1e-7&&cross(t[2],t[0],p[i])>=-1e-7))continue;
   out.push(t);v.splice(k,1);found=true;break;
  }if(!found)throw Error('Non-simple part outline');
 }
 if(v.length===3)out.push(v.map(i=>p[i]));return out;
}
function clip(poly,triangle){
 let result=poly;
 for(let edge=0;edge<3;edge++){const a=triangle[edge],b=triangle[(edge+1)%3],input=result;result=[];
  for(let i=0;i<input.length;i++){const p=input[i],q=input[(i+1)%input.length],d=cross(a,b,p),e=cross(a,b,q),inside=d>=-1e-7,next=e>=-1e-7;
   if(inside)result.push(p);if(inside!==next){const t=d/(d-e);result.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
  }if(result.length<3)return [];
 }return result;
}
function half(poly,a,b,inside){
 const out=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],d=cross(a,b,p),e=cross(a,b,q),keep=inside?d>=-1e-7:d<=1e-7,next=inside?e>=-1e-7:e<=1e-7;if(keep)out.push(p);if(keep!==next){const t=d/(d-e);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}return out;
}
function subtract(poly,triangle){
 const out=[];let remaining=poly;for(let i=0;i<3;i++){const a=triangle[i],b=triangle[(i+1)%3],outside=half(remaining,a,b,false);if(outside.length>2)out.push(outside);remaining=half(remaining,a,b,true);if(remaining.length<3)break;}return out;
}
function prepare(actor){
 const g=read('assets/resources/actors/native08/'+actor+'-geometry.json'),skin=read('assets/resources/actors/native08/'+actor+'-skin.json');
 const source=g.vertices.map(v=>[v[2]*1536,v[3]*1024]);
 const head=skin.boneDefinitions.findIndex(b=>b.name==='Head');
 const parts=[];
 for(const [name,outline]of [...Object.entries(layouts[actor]),['Head',null]]){
  const tris=[],masks=outline?ears(outline):null;
  for(let i=0;i<g.indices.length;i+=3){const ids=g.indices.slice(i,i+3),t=ids.map(i=>source[i]);
   if(!outline){if(ids.every(v=>skin.influences[v][0][0]===head))tris.push(t);continue;}
   // Head pixels are exported only to Head, never to arms or torso.
   if(ids.every(v=>skin.influences[v][0][0]===head))continue;
   for(const mask of masks){const p=clip(area(t)>0?t:t.slice().reverse(),mask);let pieces=p.length>=3?[p]:[];
    if(name==='Torso')for(const excluded of ears(layouts[actor].Cloth))pieces=pieces.flatMap(p=>subtract(p,excluded));
    for(const p of pieces)for(let n=1;n<p.length-1;n++)if(Math.abs(cross(p[0],p[n],p[n+1]))>.005)tris.push([p[0],p[n],p[n+1]]);
   }
  }
  if(!tris.length)throw Error(actor+' empty part '+name);
  const vertices=[],indices=[],seen=new Map();
  for(const tri of tris)for(const p of tri){const key=p.map(v=>v.toFixed(4)).join(',');if(!seen.has(key)){seen.set(key,vertices.length);vertices.push(p);}indices.push(seen.get(key));}
  const bbox=[Math.floor(Math.min(...vertices.map(v=>v[0]))),Math.floor(Math.min(...vertices.map(v=>v[1]))),Math.ceil(Math.max(...vertices.map(v=>v[0]))),Math.ceil(Math.max(...vertices.map(v=>v[1])))];
  parts.push({name,bone:boneFor(name),bbox,vertices,indices});
 }
 const slots=parts.map(p=>({name:p.name,bone:'root'})),attachments=Object.fromEntries(parts.map(p=>[p.name,{[p.name]:{type:'mesh',path:'master08-thin',uvs:p.vertices.flatMap(v=>[v[0]/1536,v[1]/1024]),vertices:p.vertices.flatMap(v=>[v[0],-v[1]]),triangles:p.indices,hull:0,width:1536,height:1024}}]));
 const animations=Object.fromEntries(parts.map(p=>[p.name,{slots:Object.fromEntries(parts.map(q=>[q.name,{attachment:[{time:0,name:q.name===p.name?p.name:null}]}]))}]));
 const data={skeleton:{spine:'3.8.75',name:actor,images:path.join(ROOT,'assets/resources/actors/spine08').replaceAll('\\','/')+'/'},bones:[{name:'root'}],slots,skins:[{name:'default',attachments}],animations};
 const dir=path.join(ROOT,'temp/spine08-decomposition',actor);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'source-parts.json'),JSON.stringify(data));
 fs.writeFileSync(path.join(dir,'layout.json'),JSON.stringify({actor,source:'assets/resources/actors/sketch08/master08-thin.png',parts},null,2)+'\n');
 return {actor,parts:parts.map(p=>({name:p.name,bbox:p.bbox,triangles:p.indices.length/3}))};
}
if(require.main===module)for(const actor of process.argv.slice(2).length?process.argv.slice(2):Object.keys(layouts))console.log(JSON.stringify(prepare(actor)));
module.exports={prepare,clip,ears};
