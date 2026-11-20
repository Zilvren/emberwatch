const {test}=require('node:test'),assert=require('node:assert/strict');
const N=require('../tools/native-assets.cjs');
const {roles,skinPoints}=require('../tools/author-native-actor-motion.cjs');
const area=(a,b,c)=>Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
const totalArea=(g,first=0)=>{let sum=0;for(let i=first;i<g.indices.length;i+=3)sum+=area(...g.indices.slice(i,i+3).map(v=>g.vertices[v]));return sum;};
for(const actor of Object.keys(roles)){
 test(actor+': part boundaries preserve original source coverage, proportions and neutral geometry',()=>{
  const old=N.read('assets/resources/actors/sketch08/'+actor+'-rig.json'),g=N.read('assets/resources/actors/native08/'+actor+'-geometry.json'),skin=N.read('assets/resources/actors/native08/'+actor+'-skin.json');
  assert.equal(g.sourceSha256,old.sourceSha256);assert.equal(g.sourcePixelsChanged,false);assert.equal(skin.sourceSha256,old.sourceSha256);
  assert.ok(g.vertices.length<=4000,'Must fit the pinned Cocos UI vertex buffer');
  assert.equal(g.originalTriangleCount,old.indices.length/3);assert.ok(Math.abs(totalArea(g,g.overlapTriangles*3)-totalArea(old))<.0001);
  const neutral=skinPoints(skin,{});assert.equal(neutral.length,g.vertices.length);assert.ok(neutral.every((p,i)=>Math.hypot(p[0]-g.vertices[i][0],p[1]-g.vertices[i][1])<.000001));
  const rendered=old.indices.map(index=>old.vertices[index]);
  for(const axis of [0,1]){assert.ok(Math.abs(Math.min(...g.vertices.map(v=>v[axis]))-Math.min(...rendered.map(v=>v[axis])))<.000001);assert.ok(Math.abs(Math.max(...g.vertices.map(v=>v[axis]))-Math.max(...rendered.map(v=>v[axis])))<.000001);}
  assert.ok(g.vertices.every(v=>v[2]>=0&&v[2]<=1&&v[3]>=0&&v[3]<=1));
 });
 test(actor+': every painted part remains rigid under the contact pose instead of stretching across joints',()=>{
  const g=N.read('assets/resources/actors/native08/'+actor+'-geometry.json'),skin=N.read('assets/resources/actors/native08/'+actor+'-skin.json'),pose=skinPoints(skin,roles[actor].peak);
  for(let i=0;i<g.indices.length;i+=3){const tri=g.indices.slice(i,i+3);assert.equal(new Set(tri.map(v=>skin.influences[v][0][0])).size,1);assert.ok(Math.abs(area(...tri.map(v=>g.vertices[v]))-area(...tri.map(v=>pose[v])))<.00001);}
 });
}
