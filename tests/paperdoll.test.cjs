const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=require('../tools/load-ts.cjs').createLoader(),{solveTwoBone}=load(path.resolve(__dirname,'../assets/game/presentation/actors/TwoBoneIK.ts'));
test('paper-doll foot IK reaches planted targets throughout the attack hip movement',()=>{
 for(const [hipX,hipY]of [[0,186],[0,174],[6,168],[8,173],[0,180]])for(const [x,bend]of [[-55,1],[51,-1]]){
  const localX=x-hipX-(bend===1?-26:26),localY=32-(hipY-12),a=solveTwoBone(localX,localY,80,68,bend),r=Math.PI/180;
  const endX=Math.sin(a.upper*r)*80+Math.sin((a.upper+a.lower)*r)*68,endY=-Math.cos(a.upper*r)*80-Math.cos((a.upper+a.lower)*r)*68;
  assert.ok(Math.hypot(endX-localX,endY-localY)<.001);
 }
});
test('paper-doll IK clamps unreachable and coincident targets without NaN',()=>{
 for(const [x,y] of [[0,0],[0,-999],[1,1],[-999,2]]){const a=solveTwoBone(x,y,80,68,1);assert.ok(Number.isFinite(a.upper)&&Number.isFinite(a.lower));}
 assert.throws(()=>solveTwoBone(0,0,0,1,1),/positive/);
});
