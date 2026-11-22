// Angles are offsets from setup, in degrees. Translations here are authored in stage X/Y.
const round=v=>Number(v.toFixed(5));
const scale=(weights,x,y)=>weights.map(t=>[round(x*t),round(y*t)]);
const amp=(weights,amount)=>weights.map(t=>round(t*amount));
function tracksFor(rig) {
  const known=new Map(rig.skeleton.bones.map(b=>[b.name,b]));
  function movement(times,rot={},move={},stretch={},linear=false) {
    const result={bones:{}};
    function write(name,type,values) {
      if(!known.has(name)||values.length!==times.length)throw Error('Invalid timeline '+rig.id+' / '+name+' / '+type);
      const parent=rig.frames.get(known.get(name).parent);
      const ang=-(parent?.angle||0)*Math.PI/180,cos=Math.cos(ang),sin=Math.sin(ang);
      const keys=values.map((v,i)=>{
        const k={time:times[i]};
        if(type==='rotate') k.angle=round(v);
        else if(type==='translate') {k.x=round(cos*v[0]-sin*v[1]);k.y=round(sin*v[0]+cos*v[1]);}
        else {k.x=round(v[0]);k.y=round(v[1]);}
        if(!linear&&i+1<times.length)Object.assign(k,{curve:.33,c2:0,c3:.67,c4:1});
        return k;
      });
      (result.bones[name]??={})[type]=keys;
    }
    for(const [n,v] of Object.entries(rot))write(n,'rotate',v);
    for(const [n,v] of Object.entries(move))write(n,'translate',v);
    for(const [n,v] of Object.entries(stretch))write(n,'scale',v);
    return result;
  }
  // Sample a periodic signal with phase lag. Its first and final poses match exactly.
  function idle(duration,cycles,rot,translations,scales={}) {
    const intervals=32, times=Array.from({length:intervals+1},(_,i)=>round(duration*i/intervals));
    function w([amount,phase=0,freq=1]){
      return times.map((_,i)=>i===0||i===intervals?0:amount*(Math.sin(2*Math.PI*(cycles*freq*i/intervals+phase))-Math.sin(2*Math.PI*phase)));
    }
    const r=Object.fromEntries(Object.entries(rot).map(([n,v])=>[n,w(v)]));
    function pair([a,b],base){
      const xs=w(a),ys=w(b);
      return xs.map((x,i)=>[base+x,base+ys[i]]);
    }
    const t=Object.fromEntries(Object.entries(translations).map(([n,v])=>[n,pair(v,0)]));
    const s=Object.fromEntries(Object.entries(scales).map(([n,v])=>[n,pair(v,1)]));
    return movement(times,r,t,s,true);
  }
  function gesture(duration,times,pulse,rot,translations={}) {
    return movement(times.map(t=>round(t*duration)),Object.fromEntries(Object.entries(rot).map(([n,v])=>[n,amp(pulse,v)])),Object.fromEntries(Object.entries(translations).map(([n,[x,y]])=>[n,scale(pulse,x,y)])));
  }
  return {movement,idle,gesture};
}
function clips(rig){
  const {movement,idle,gesture}=tracksFor(rig);
  const readyT=[0,.28,.62,.79,1],ready=[0,.58,1,.94,0],hitT=[0,.14,.37,.69,1],hit=[0,1,.58,-.12,0];
  const animations={};let contact;
  if(rig.id==='ash-moth'){
    animations.idle=idle(1.8,2,{
      'fore-left':[8,-.04],'fore-right':[-9,-.04],'hind-left':[5,-.15],'hind-right':[-6,-.15],
      abdomen:[4,-.17,.5],head:[-1.7,.03,.5],'feeler-left':[4,-.25,.5],'feeler-right':[3,-.33,.5],
      'leg-left':[3.5,-.18,.5],'leg-right':[-2,.23,.5],'leg-left-shin':[4,-.27,.5],'leg-right-shin':[-3.5,.14,.5],
      'far-left-leg':[2,-.14,.5],'far-right-leg':[-2,.15,.5]
    },{flight:[[2.4,.06,.5],[5.2,0,1]]},{'fore-left':[[.09,.24],[.025,.25]],'fore-right':[[.115,.24],[.02,.25]]});
    animations.prepare=gesture(.68,readyT,ready,{'fore-left':-26,'fore-right':28,'hind-left':-14,'hind-right':17,head:-9,abdomen:17,'feeler-right':13,'leg-left':20,'leg-right':-15},{flight:[13,11]});
    const t=[0,.12,.26,.37,.43,.55,.72,.86];
    animations.attack=movement(t,{
      'fore-left':[0,-14,-31,18,16,-9,5,0],'fore-right':[0,16,34,-20,-17,11,-5,0],
      'hind-left':[0,-5,-19,4,16,-2,2,0],'hind-right':[0,6,21,-5,-17,3,-3,0],
      thorax:[0,-4,-10,12,13,3,-3,0],abdomen:[0,2,14,19,-13,-7,4,0],head:[0,-4,-6,4,2,1,-2,0],
      'feeler-left':[0,-4,7,15,12,-6,-3,0],'feeler-right':[0,3,12,19,14,-7,-2,0],
      'leg-left':[0,13,24,-12,-17,3,1,0],'leg-right':[0,-8,-17,11,13,-4,1,0],
      'leg-left-shin':[0,-6,-16,9,21,8,-3,0],'leg-right-shin':[0,5,12,-7,-15,2,1,0]
    },{flight:[[0,0],[7,5],[18,17],[-65,-15],[-83,-22],[-56,-17],[-10,2],[0,0]]},{
      'fore-left':[[1,1],[.83,1],[.52,.92],[1.01,1],[1.05,1],[.86,.98],[1.01,1],[1,1]],
      'fore-right':[[1,1],[.80,1],[.52,.92],[1.02,1],[1.06,1],[.86,.98],[1.01,1],[1,1]]
    });
    contact=.43;
    animations.hurt=gesture(.39,hitT,hit,{thorax:-14,head:11,abdomen:-18,'fore-left':24,'fore-right':-18,'hind-right':14,'feeler-left':-15},{flight:[22,9]});
    animations.death=movement([0,.18,.38,.69,.83,1.12],{
      thorax:[0,-10,18,48,42,44],head:[0,7,3,-12,-10,-10],abdomen:[0,-10,16,-27,-22,-25],
      'fore-left':[0,18,-16,-45,-39,-42],'fore-right':[0,-15,18,54,46,49],
      'hind-left':[0,8,-7,-25,-31,-29],'hind-right':[0,-8,12,37,31,33],
      'leg-left':[0,-4,19,28,24,25],'leg-right':[0,5,-16,-29,-25,-26],
      'leg-left-shin':[0,5,-8,-22,-19,-20],'leg-right-shin':[0,-4,8,19,15,16]
    },{flight:[[0,0],[8,12],[4,-4],[-14,-57],[-16,-51],[-16,-55]]});
    animations.death.slots={abdomen:{color:[{time:0,color:'ffffffff'},{time:.66,color:'b3a5adff'},{time:1.12,color:'807985ff'}]}};
  }else if(rig.id==='stone-claw'){
    animations.idle=idle(2.5,1,{shield:[1.8,.02],'claw-arm':[2.4,-.08],palm:[-2,.06],finger:[3.5,-.16],'far-claw':[-2.4,.12]}, {shield:[[0],[1.2,.08]]});
    animations.prepare=gesture(.74,readyT,ready,{'claw-arm':-32,palm:-14,finger:-23,shield:5,hull:-2,'far-claw':10},{hull:[3,-2]});
    const t=[0,.17,.34,.48,.55,.62,.82,1.05];
    animations.attack=movement(t,{
      hull:[0,-1,-2,.7,1,.8,-.5,0],shield:[0,3,7,-4,-6,-1,2,0],
      'claw-arm':[0,-14,-29,-8,8,9,-4,0],palm:[0,-7,-13,-4,7,5,-3,0],
      finger:[0,-11,-24,-21,26,25,6,0],'far-claw':[0,4,13,-5,-11,-5,3,0]
    },{hull:[[0,0],[2,-1],[4,-3],[-3,-3],[-5,-5],[-4,-3],[-1,-1],[0,0]]});
    contact=.55;
    animations.hurt=gesture(.41,hitT,hit,{hull:-5,shield:12,'claw-arm':-10,palm:14,finger:-11,'far-claw':9},{hull:[8,-4]});
    const t2=[0,.16,.35,.66,.90,1.18],p=[0,-.12,.24,.80,1,.96];
    animations.death=movement(t2,{
      hull:amp(p,-5),shield:amp(p,5),'claw-arm':amp(p,13),palm:amp(p,-4),finger:amp(p,-16),'far-claw':amp(p,-26),
      'near-fore-thigh':amp(p,-28),'near-fore-shin':amp(p,-22),'near-hind-thigh':amp(p,27),'near-hind-shin':amp(p,23),
      'far-fore-leg':amp(p,-32),'far-hind-leg':amp(p,32)
    },{hull:scale(p,6,-34),'far-fore-leg':scale(p,4,-33),'far-hind-leg':scale(p,5,-33)});
    animations.death.ik=Object.fromEntries(rig.skeleton.ik.map(k=>[k.name,[{time:0,mix:1,bendPositive:k.bendPositive},{time:.18,mix:1,bendPositive:k.bendPositive},{time:.42,mix:0,bendPositive:k.bendPositive},{time:1.18,mix:0,bendPositive:k.bendPositive}]]));
  }else{
    animations.idle=idle(3.2,1,{robe:[.65,.03],mask:[-2,-.10],neck:[1.3,.05],'left-sleeve':[1.7,.02],'right-sleeve':[-1.4,.13],'left-hand':[2.5,-.11],'right-hand':[-1.4,-.09],'pennant-left':[3.1,.03],'pennant-left-tip':[4.5,-.18],'pennant-right':[-2.8,.23],'pennant-right-tip':[-4.0,.03]}, {mask:[[0],[1.2,-.10]]});
    animations.prepare=gesture(.86,readyT,ready,{robe:-5,mask:-14,collar:-2,'left-sleeve':24,'left-hand':23,'right-sleeve':-9,'pennant-left':-8,'pennant-left-tip':-10,'pennant-right':7},{mask:[0,4]});
    const t=[0,.19,.40,.55,.68,.78,1.00,1.24];
    animations.attack=movement(t,{
      robe:[0,-3,-6,1,8,7,2,0],mask:[0,-9,-16,-4,10,8,-2,0],collar:[0,-1,-3,1,5,4,-1,0],
      'left-sleeve':[0,12,26,0,-51,-46,-12,0],'left-hand':[0,10,22,8,-19,-15,3,0],
      'right-sleeve':[0,-2,-4,1,5,3,1,0],'right-hand':[0,-2,-3,0,4,3,1,0],
      'pennant-left':[0,-2,-5,-6,6,10,2,0],'pennant-left-tip':[0,-1,-3,-6,-2,9,4,0],
      'pennant-right':[0,1,4,5,-5,-8,-1,0],'pennant-right-tip':[0,1,2,5,2,-7,-3,0]
    });
    contact=.68;
    animations.hurt=gesture(.45,hitT,hit,{robe:-8,neck:9,mask:-12,'left-sleeve':11,'right-hand':8,'pennant-left':-8,'pennant-left-tip':-16,'pennant-right-tip':10});
    const t2=[0,.20,.45,.72,.98,1.36],p=[0,-.1,.28,.79,1,1];
    animations.death=movement(t2,{robe:amp(p,8),collar:amp(p,5),neck:amp(p,10),mask:amp(p,18),'left-sleeve':amp(p,13),'left-hand':amp(p,8),'right-sleeve':amp(p,-11),'right-hand':amp(p,-10),'pennant-left':[0,-3,7,12,10,10],'pennant-left-tip':[0,4,-2,10,15,12],'pennant-right':[0,1,-4,-9,-6,-6],'pennant-right-tip':[0,-2,3,-6,-11,-8]},{mask:scale(p,-2,-10),neck:scale(p,0,-4),collar:scale(p,0,-3)});
    animations.death.slots={mask:{color:[{time:0,color:'ffffffff'},{time:.72,color:'c6bac6ff'},{time:1.36,color:'746e7fff'}]}};
  }
  animations.attack.events=[{time:contact,name:'impact'}];
  return {animations,contact};
}
module.exports={clips,tracksFor};
