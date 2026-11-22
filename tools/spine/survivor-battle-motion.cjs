// Bone angles in degrees, translations in Spine stage units. Curves describe anatomical landmarks;
// the wrist keys are solved against the moving shoulder and actual card-case mouth.
const {round}=require('./rig-authoring.cjs');
const {digitLandmarks}=require('./survivor-left-hand.cjs');
const timings={idle:2.56,prepare:.67,attack:1.10,hurt:.47,death:1.38,loaded:.22,release:.36,impact:.58,flightEnd:.606};
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const ease=(a,b,t)=>{const v=clamp((t-a)/(b-a),0,1);return v*v*(3-2*v);};
const rad=v=>v*Math.PI/180,deg=v=>v*180/Math.PI;
const at=(p,i)=>p[i*2+1],time=(p,i)=>p[i*2];
const vector=(length,angle)=>[length*Math.cos(rad(angle)),length*Math.sin(rad(angle))];
function rotate(x,y,angle){const r=rad(angle);return [x*Math.cos(r)-y*Math.sin(r),x*Math.sin(r)+y*Math.cos(r)];}
function nearestTurn(a,around){return around+(((a-around+180)%360+360)%360-180);}
function slope(p,i){
  if(i===0||i===p.length/2-1)return 0;
  const dt0=time(p,i)-time(p,i-1),dt1=time(p,i+1)-time(p,i);
  const a=(at(p,i)-at(p,i-1))/dt0,b=(at(p,i+1)-at(p,i))/dt1;
  return a*b<=0?0:(3*(dt0+dt1))/((2*dt1+dt0)/a+(dt1+2*dt0)/b);
}
function curve(p,t){
  if(t<=p[0])return p[1];if(t>=p[p.length-2])return p.at(-1);
  let i=0;while(time(p,i+1)<t)i++;
  const dt=time(p,i+1)-time(p,i),v=(t-time(p,i))/dt,w=v*v;
  return (2*v*w-3*w+1)*at(p,i)+(v*w-2*w+v)*dt*slope(p,i)+(-2*v*w+3*w)*at(p,i+1)+(v*w-w)*dt*slope(p,i+1);
}
const rest={hx:-3,hy:-6,hip:-1.5,chest:-1.7,head:2.5,nearX:15,nearY:0,farX:-25,farY:3.7,guard:-5,elbow:25,freeHand:-8,
  px:0,py:0,wrist:-70,paper:3,hood:0,scarf:0,hair:0,mantle:0,mantleEnd:0,skirt:0,skirtEnd:0,tail:0,tailEnd:0,bag:0};
function add(v,curves,t){for(const [key,points] of Object.entries(curves))v[key]+=curve(points,t);return v;}
const draw={
 hx:[0,0,.47,-2.6,.88,-4,1,-4],hy:[0,0,.62,-4.6,1,-4],hip:[0,0,.6,2.7,1,2.1],
 chest:[0,0,.20,0,.82,5.4,1,5],head:[0,0,.36,-3.2,.88,-4.6,1,-4],
 px:[0,0,.16,.4,.36,10,.5,27,.70,50,.90,62,1,64],py:[0,0,.15,1.6,.45,22,.78,49,1,55],
 wrist:[0,0,.19,-1,.50,34,.80,84,1,105],paper:[0,0,.24,2,.69,13,1,10],
 guard:[0,0,.24,0,.80,5.3,1,4.5],elbow:[0,0,.42,1,.88,7,1,6.4],
 mantle:[0,0,.48,-.6,1,-1.5],mantleEnd:[0,0,.35,.3,1,-1.2],
 tail:[0,0,.48,-.6,1,-1.2],tailEnd:[0,0,.68,-.3,1,-1.4],bag:[0,0,.57,.65,1,1.1]
};
const strike={
 hx:[.22,-4,.26,-2,.334,8,.398,13,.51,10,.72,3,1.04,0],hy:[.22,-4,.27,-6,.36,-4.5,.47,-2,.72,-.8,1.04,0],
 hip:[.22,2.1,.275,.2,.355,-4.2,.407,-4.7,.61,-1.7,.91,.4,1.07,0],
 chest:[.22,5,.249,5.4,.307,-.4,.372,-9.7,.426,-11,.54,-6.2,.81,1,1.06,0],
 head:[.22,-4,.267,-4.2,.338,1.4,.395,5.4,.50,3,.71,-.6,1.04,0],
 px:[.22,64,.25,58,.282,55,.318,63,.36,87,.398,102,.445,107,.53,99,.69,72,.83,35,.97,3.2,1.06,0],
 py:[.22,55,.256,56,.296,55,.336,52,.36,50.9,.40,49,.45,45,.58,31,.76,11,.96,1.0,1.06,0],
 wrist:[.22,105,.273,120,.306,110,.341,96,.376,72,.42,62,.52,59,.70,39,.93,5,1.06,0],
 paper:[.22,10,.28,15,.315,12,.34,4,.36,-6,.39,-21,.43,-26,.60,-16,.99,0],
 guard:[.22,4.5,.275,6,.35,-5,.45,-14,.64,-5,.83,2,1.04,0],
 elbow:[.22,6.4,.30,8.5,.37,13,.48,17,.65,9,.87,1,1.05,0],freeHand:[.22,0,.31,-2,.40,3,.54,4,.78,-1,1.02,0],
 hair:[.22,0,.30,0,.365,2.8,.425,-2.5,.52,-1.5,.67,.7,.83,0],
 mantle:[.22,-1.5,.295,-2.5,.38,2.1,.46,3.3,.59,.5,.79,-1.1,1.04,0],
 mantleEnd:[.22,-1.2,.32,-2.3,.405,-.4,.50,4.7,.65,1.6,.83,-1.6,1.07,0],
 skirt:[.22,0,.30,-1.8,.405,2.6,.50,3.5,.70,-.3,.87,-1.0,1.07,0],
 skirtEnd:[.22,0,.33,-1.1,.405,-2.6,.54,4.3,.71,1.4,.9,-1.4,1.10,0],
 tail:[.22,-1.2,.30,-2.4,.41,3.6,.52,5.2,.7,.4,.89,-1.6,1.07,0],
 tailEnd:[.22,-1.4,.34,-1.7,.42,-2.6,.545,6,.68,4.2,.89,-1.7,1.1,0],
 bag:[.22,1.1,.32,2.1,.425,-3,.53,-3.6,.71,.7,.91,.7,1.08,0],scarf:[.22,0,.33,0,.43,1.5,.60,-.8,.80,0]
};
const recoil={
 hx:[0,0,.033,-.6,.108,-8.5,.18,-7.1,.31,-2,.47,0],hy:[0,0,.043,-.4,.145,-7,.245,-5,.40,-.4,.47,0],
 hip:[0,0,.07,2,.14,3,.28,.4,.47,0],chest:[0,0,.038,5.9,.087,11,.15,7.9,.27,1.6,.38,-.7,.47,0],
 head:[0,0,.036,-1.5,.086,6.4,.125,7.1,.23,1.4,.345,-1.4,.47,0],
 guard:[0,0,.047,1,.10,12,.155,15,.25,7,.38,1,.47,0],elbow:[0,0,.06,1,.128,22,.18,24,.33,7,.47,0],
 freeHand:[0,0,.09,-5,.18,-9,.32,-3,.47,0],px:[0,0,.06,2,.14,8,.24,6,.47,0],py:[0,0,.06,4,.135,22,.21,19,.35,6,.47,0],
 wrist:[0,0,.09,-8,.17,-13,.34,-3,.47,0],hair:[0,0,.056,-2,.14,2.9,.24,1,.37,-.6,.47,0],
 mantle:[0,0,.07,-1.5,.14,-3.1,.26,1.3,.47,0],mantleEnd:[0,0,.09,0,.17,-4.2,.29,1.5,.47,0],
 tail:[0,0,.10,-1.9,.19,-4,.30,.9,.47,0],tailEnd:[0,0,.13,0,.22,-5,.35,1.8,.47,0],bag:[0,0,.09,-2.1,.18,-3,.33,1.2,.47,0]
};
const fall={
 hx:[0,0,.095,-2.5,.23,-10,.43,-25,.66,-57,.835,-83,.99,-88,1.38,-89],
 hy:[0,0,.11,-2.5,.24,-15,.44,-58,.69,-130,.83,-170,.91,-178,1.05,-173.3,1.22,-176,1.38,-176],
 hip:[0,0,.12,2.2,.29,9,.53,30,.78,56,.94,75,1.06,73.2,1.28,74.5,1.38,74.5],
 chest:[0,0,.065,7,.17,7.8,.31,2,.48,-4,.68,2,.85,11,1.015,25.5,1.13,25.1,1.29,26.7,1.38,26.7],
 head:[0,0,.09,7,.20,2,.39,-11,.62,-14,.84,-12,1.015,-5,1.12,1.8,1.23,-1.4,1.38,-1.4],
 nearX:[0,0,.36,0,.47,3,.60,20,.75,43,.806,46,1.38,46],
 nearY:[0,0,.36,0,.49,8,.59,12.8,.69,8.2,.803,0,1.38,0],
 farX:[0,0,.84,0,.91,2,1.0,14,1.10,25,1.18,27,1.38,27],
 farY:[0,0,.84,0,.925,6,1.005,8.6,1.10,3.8,1.18,0,1.38,0],
 guard:[0,0,.12,7,.28,18,.46,13,.68,0,.86,1,.98,4,1.09,1,1.38,0],
 elbow:[0,0,.15,17,.33,27,.55,15,.77,-8,.98,-22,1.15,-20,1.38,-20],
 freeHand:[0,0,.19,-9,.46,-6,.72,0,.99,9,1.38,6],
 px:[0,0,.18,0,.32,8,.49,-5,.72,-17,1.38,-18],py:[0,0,.18,.4,.34,30,.53,31,.78,12,1.38,8],
 wrist:[0,0,.18,10,.44,16,.62,-6,.72,1,.805,33,.90,64,1.05,70,1.38,68],
 hood:[0,0,.25,0,.58,-1,1.05,4,1.23,2,1.38,2],
 scarf:[0,0,.23,-1,.55,-2,.90,1.6,1.11,4,1.38,2],
 hair:[0,0,.13,-3,.32,-1,.68,-3,.98,4.6,1.12,-1.6,1.30,0],
 mantle:[0,0,.26,-1,.68,-3,.90,2,1.12,7,1.38,4],mantleEnd:[0,0,.32,-1,.73,-5,.95,1,1.13,9,1.38,5],
 skirt:[0,0,.36,-2,.61,1,.80,11,.95,22,1.15,17,1.38,18],
 skirtEnd:[0,0,.49,-3,.73,3,.88,27,1.06,29,1.24,21,1.38,22],
 tail:[0,0,.36,-2,.57,-3,.78,14,.95,27,1.17,22,1.38,23],
 tailEnd:[0,0,.48,-3,.66,1,.85,31,1.04,35,1.24,26,1.38,27],bag:[0,0,.21,-3,.52,-7,.79,4,.94,15,1.13,9,1.38,10]
};
const bodyKeys={hips:'hip',chest:'chest',head:'head','hair-lock':'hair',hood:'hood',scarf:'scarf',mantle:'mantle','mantle-tip':'mantleEnd',
 'coat-skirt':'skirt','coat-skirt-tip':'skirtEnd','back-flap':'tail','back-flap-tip':'tailEnd','ration-bag':'bag',
 'near-sleeve':'guard','near-bracer':'elbow','near-hand':'freeHand'};
function body(name,t){
  if(name==='prepare'||(name==='attack'&&t<=timings.loaded))return add({...rest},draw,Math.min(1,t/(name==='prepare'?.56:timings.loaded)));
  if(name==='attack')return add({...rest},strike,t);
  if(name==='hurt')return add({...rest},recoil,t);
  if(name==='death')return add({...rest},fall,t);
  const v={...rest},b=(amp,phase)=>amp*(Math.sin(2*Math.PI*(t/timings.idle+phase))-Math.sin(2*Math.PI*phase));
  v.hy+=b(.82,0);v.hx+=b(.38,.13);v.chest+=b(.57,.025);v.head+=b(-.48,.03);
  v.guard+=b(.8,-.025);v.elbow+=b(-.9,-.08);v.px+=b(.32,-.04);v.py+=b(.8,-.015);
  v.mantle+=b(.55,-.07);v.mantleEnd+=b(1.15,-.18);v.tail+=b(.7,-.12);v.tailEnd+=b(1.45,-.25);
  v.skirt+=b(.36,-.08);v.skirtEnd+=b(.8,-.20);v.bag+=b(.40,-.14);v.hair+=b(.50,-.17);return v;
}
// Close the finger from its drawn open shape to an actual pad on the card. Its proximal segment
// aims the fingertip while the two smaller joints share flexion. The same mesh opens after release.
function fingerAngles(points,target){
  const segments=points.slice(1).map((p,i)=>[p[0]-points[i][0],points[i][1]-p[1]]);
  const shares=segments.length===3?[0,.64,.36]:[0,1];
  const goal=[target[0]-points[0][0],points[0][1]-target[1]],wanted=Math.hypot(...goal);
  function endpoint(bend){
    let turn=0,x=0,y=0;
    for(let i=0;i<segments.length;i++){
      turn-=bend*shares[i];
      const delta=rotate(segments[i][0],segments[i][1],turn);x+=delta[0];y+=delta[1];
    }
    return [x,y];
  }
  let low=0,high=148;
  for(let i=0;i<13;i++){const mid=(low+high)/2;if(Math.hypot(...endpoint(mid))>wanted)low=mid;else high=mid;}
  const bend=(low+high)/2,reach=endpoint(bend);
  return [deg(Math.atan2(goal[1],goal[0])-Math.atan2(reach[1],reach[0])),...shares.slice(1).map(s=>-bend*s)];
}
const fingerTargets={rest:{index:[527,168],middle:[430,268],thumb:-10},grip:{index:[515,190],middle:[395,277],thumb:0},
  flick:{index:[567,136],middle:[553,202],thumb:-13.5}};
function blendPoint(a,b,t){return a.map((x,i)=>x+(b[i]-x)*t);}
function digitPose(index,middle,thumb){
  const [i,ip,id]=fingerAngles(digitLandmarks.index,index),[m,mp]=fingerAngles(digitLandmarks.middle,middle);
  return {'cast-index':i,'cast-index-tip':ip,'cast-index-nail':id,'cast-middle':m,'cast-middle-tip':mp,'cast-thumb':thumb};
}
const heldDigits=digitPose(fingerTargets.grip.index,fingerTargets.grip.middle,0);
function fingers(name,t){
  const {rest:r,grip:g,flick:f}=fingerTargets;
  let index=r.index,middle=r.middle,thumb=r.thumb;
  if(name==='prepare'||name==='attack'&&t<=timings.release){
    const u=t/(name==='prepare'?.56:timings.loaded),close=ease(.005,.125,u);
    index=blendPoint(r.index,g.index,close);middle=blendPoint(r.middle,g.middle,close);thumb=r.thumb*(1-close);
  }else if(name==='attack'){
    const recover=ease(.62,1.03,t);
    index=blendPoint(blendPoint(g.index,f.index,ease(.362,.438,t)),r.index,recover);
    middle=blendPoint(blendPoint(g.middle,f.middle,ease(.381,.479,t)),r.middle,recover);
    thumb=f.thumb*ease(.36,.417,t)+(r.thumb-f.thumb)*recover-3.5*ease(.36,.387,t)*(1-ease(.387,.47,t));
  }else if(name==='death'){
    const open=ease(.30,.74,t);
    index=blendPoint(r.index,f.index,open);middle=blendPoint(r.middle,f.middle,open);thumb+=open*(f.thumb-r.thumb);
  }else if(name==='hurt'){
    const flinch=.25*ease(.04,.13,t)*(1-ease(.17,.43,t));
    index=blendPoint(r.index,g.index,flinch);middle=blendPoint(r.middle,g.middle,flinch);thumb*=1-flinch;
  }
  return digitPose(index,middle,thumb);
}
function solver(rig,name,t){
  const v=body(name,t),rot={},move={hips:[v.hx,v.hy],'near-plant':[v.nearX,v.nearY],'far-plant':[v.farX,v.farY]};
  for(const [n,k]of Object.entries(bodyKeys))rot[n]=v[k];
  Object.assign(rot,fingers(name,t));
  const restBones=rig.skeleton.bones,frames=new Map();
  let mouth,pinch,forearm,handAngle;
  for(const b of restBones){
    const parent=frames.get(b.parent)||{x:0,y:0,a:0},tr=move[b.name]||[0,0];
    const [lx,ly]=rotate(b.x+tr[0],b.y+tr[1],parent.a),x=parent.x+lx,y=parent.y+ly;
    if(b.name==='cast-sleeve'){
      const pouch=frames.get('card-case'),base=rig.frames.get('card-case'),from=rig.frames.get('CardMouth');
      const local=rotate(from.x-base.x,from.y-base.y,-base.angle),offset=rotate(...local,pouch.a);
      mouth=[pouch.x+offset[0],pouch.y+offset[1]];
      const tip=[mouth[0]+v.px,mouth[1]+v.py];
      const handLength=rig.frames.get('cast-palm'),fing=rig.frames.get('AttackTip');
      const palmLength=Math.hypot(fing.x-handLength.x,fing.y-handLength.y);
      const l1=b.length,l2=restBones.find(n=>n.name==='cast-bracer').length;
      handAngle=v.wrist;
      for(let pass=0;pass<9;pass++){
        const hand=vector(palmLength,handAngle);
        let wx=tip[0]-hand[0],wy=tip[1]-hand[1];
        const groundWeight=name==='death'?ease(.33,.85,t):0;
        if(groundWeight){
          wx+=(-90-wx)*groundWeight;
          wy+=(1.1-rig.handFloor(handAngle,rot)-wy)*groundWeight;
        }
        const dx=wx-x,dy=wy-y;
        const straight=name==='death'?ease(.61,.715,t)*(1-ease(.75,.84,t)):0;
        const radius=clamp(Math.hypot(dx,dy),Math.abs(l1-l2)+.1,l1+l2-.35*(1-straight));
        const elbow=(name==='death'&&t>=.73?-1:1)*Math.acos(clamp((radius*radius-l1*l1-l2*l2)/(2*l1*l2),-1,1));
        const upper=deg(Math.atan2(dy,dx)-Math.atan2(l2*Math.sin(elbow),l1+l2*Math.cos(elbow)));
        forearm=deg(elbow);rot[b.name]=nearestTurn(upper-parent.a-b.rotation,0);
        const wristBase=upper+forearm;
        const limit=name==='death'?48:36;
        const limited=wristBase+clamp(nearestTurn(v.wrist,wristBase)-wristBase,-limit,limit);
        const adjustment=nearestTurn(limited,handAngle)-handAngle;
        if(Math.abs(adjustment)<.025||pass===8){handAngle+=adjustment;break;}
        handAngle+=adjustment*.82;
      }
    }
    if(b.name==='cast-bracer')rot[b.name]=nearestTurn(forearm-b.rotation,0);
    if(b.name==='cast-palm')rot[b.name]=nearestTurn(handAngle-parent.a-b.rotation,0);
    if(b.name==='held-card')rot[b.name]=nearestTurn(v.paper-parent.a-b.rotation,0);
    const a=parent.a+b.rotation+(rot[b.name]||0);frames.set(b.name,{x,y,a});
    if(b.name==='held-card'){const card=rig.skeleton.skins[0].attachments['held-card'].card,off=rotate(card.x||0,card.y||0,a);pinch={x:x+off[0],y:y+off[1],a};}
  }
  return {rot,move,mouth,card:pinch,frames};
}

// Author a soft contact corrective in Spine's native weighted-deform format. Corrections act
// only where a garment reaches the floor; joints, rigid facial features and the planted feet retain their poses.
function floorDraping(rig,death){
  const skin=rig.skeleton.skins[0].attachments,bones=rig.skeleton.bones;
  const names=['back-flap','coat-skirt','mantle','inner-skirt','hips-lining','ration-bag','hood','tunic-lining'];
  const times=sampleTimes(timings.death,[.36,.61,.73,.83,.91,1.015,1.17,1.29]);
  const poses=times.map(t=>solver(rig,'death',t).frames),slots={};
  for(const name of names){
    const mesh=skin[name][name],groups=[];let j=0;
    while(j<mesh.vertices.length){const count=mesh.vertices[j++],group=[];
      for(let i=0;i<count;i++){group.push(mesh.vertices.slice(j,j+4));j+=4;}groups.push(group);
    }
    let any=false;const keys=[];
    for(let n=0;n<times.length;n++){
      const frames=poses[n],offsets=[];
      for(const group of groups){
        let y=0;for(const [index,x,ly,weight] of group){const f=frames.get(bones[index].name);y+=(f.y+rotate(x,ly,f.a)[1])*weight;}
        const d=y>24?0:Math.max(0,.9+4*Math.log1p(Math.exp((y-.9)/4))-y);
        // The hem spreads a little along the ground as it loses vertical space.
        for(const [index] of group){const f=frames.get(bones[index].name);offsets.push(...rotate(.20*d,d,-f.a).map(round));}
      }
      const first=offsets.findIndex(x=>Math.abs(x)>.008);if(first<0){keys.push({time:times[n]});continue;}
      let end=offsets.length;while(end>first&&Math.abs(offsets[end-1])<.008)end--;
      keys.push({time:times[n],offset:first,vertices:offsets.slice(first,end)});any=true;
    }
    if(any){while(keys.length>1&&!keys[0].vertices&&!keys[1].vertices)keys.shift();slots[name]={[name]:keys};}
  }
  death.deform={default:slots};
}
function sampleTimes(end,critical){
  const times=new Set([0,end,...critical.filter(t=>t>0&&t<end)]);
  for(let i=1;i<end*48;i++)times.add(round(i/48));return [...times].sort((a,b)=>a-b);
}
// Leave redundant samples out of the editable file; keep release boundaries and extremes exact.
function keys(times,values,tolerance,force,kind){
  const wanted=new Set([0,times.length-1]);for(let i=0;i<times.length;i++)if(force.includes(times[i]))wanted.add(i);
  const v=values.map(x=>Array.isArray(x)?x:[x]);
  function reduce(a,b){
    if(b<=a+1)return;
    let max=0,split=0;
    for(let i=a+1;i<b;i++){
      const f=(times[i]-times[a])/(times[b]-times[a]);
      const error=Math.max(...v[i].map((n,j)=>Math.abs(n-(v[a][j]+f*(v[b][j]-v[a][j])))));
      if(error>max){max=error;split=i;}
    }
    if(max>tolerance){wanted.add(split);reduce(a,split);reduce(split,b);}
  }
  const anchors=[...wanted].sort((a,b)=>a-b);for(let i=1;i<anchors.length;i++)reduce(anchors[i-1],anchors[i]);
  return [...wanted].sort((a,b)=>a-b).map(i=>kind==='rotate'?{time:times[i],angle:round(v[i][0])}:{time:times[i],x:round(v[i][0]),y:round(v[i][1])});
}
function attachment(time,name){return {time,name};}
function survivorClips(rig){
  const {release,impact,flightEnd,loaded:loadedAt}=timings;
  const animations={};
  for(const n of ['idle','prepare','attack','hurt','death']){
    const anchors=n==='attack'?[.032,loadedAt,round(release-1/240),release,round(release+1/240),impact]:n==='prepare'?[.08,.56]:n==='death'?[.615,.806,1.06]:[];
    const ts=sampleTimes(timings[n],anchors),states=ts.map(t=>solver(rig,n,t)),bones={};
    for(const id of Object.keys(states[0].rot)){
      let last=states[0].rot[id];const vals=states.map(s=>last=nearestTurn(s.rot[id],last));
      bones[id]={rotate:keys(ts,vals,.075,anchors,'rotate')};
    }
    for(const id of Object.keys(states[0].move))(bones[id]??={}).translate=keys(ts,states.map(s=>s.move[id]),.045,anchors,'translate');
    const slots=Object.fromEntries(rig.battleSlots.map(s=>[s,{attachment:[attachment(0,s)]}]));
    slots['near-thigh']={attachment:[attachment(0,'near-full')]};
    slots['near-trouser-lining']={attachment:[attachment(0,null)]};
    slots['held-card']={attachment:[attachment(0,null)]};
    slots['flight-card']={attachment:[attachment(0,null)]};
    if(n==='prepare'||n==='attack'){
      const drawAt=n==='prepare'?.08:.032;
      slots['held-card'].attachment.push(attachment(drawAt,'card'));
      if(n==='attack'){
        slots['held-card'].attachment.push(attachment(release,null));
      }
    }
    animations[n]={bones,slots};
  }
  const p=solver(rig,'attack',release).card,eps=1/240,q=solver(rig,'attack',release-eps).card;
  const velocity=[(p.x-q.x)/eps,(p.y-q.y)/eps,nearestTurn(p.a-q.a,0)/eps];
  const flightLength=flightEnd-release,ts=sampleTimes(flightLength,[round(1/240),round(impact-release)]);
  const positions=ts.map(t=>{const e=-Math.expm1(-.72*t)/.72;return [p.x+velocity[0]*e,p.y+velocity[1]*e-64*t*t];});
  const angles=ts.map(t=>p.a+velocity[2]*(-Math.expm1(-1.1*t)/1.1));
  const k={translate:keys(ts,positions,.035,[round(1/240)],'translate'),rotate:keys(ts,angles,.07,[round(1/240)],'rotate')};
  animations['card-flight']={bones:{'flight-card':k},slots:{'flight-card':{attachment:[attachment(0,'card'),attachment(flightLength,null)]}}};
  animations['carry-card']={bones:Object.fromEntries(Object.entries(heldDigits).map(([n,angle])=>[n,{rotate:[{time:0,angle},{time:1,angle}]}])),
    slots:{'held-card':{attachment:[attachment(0,'card'),attachment(1,'card')]}}};
  const shifted=Object.fromEntries(Object.entries(k).map(([kind,array])=>[kind,array.map(v=>({...v,time:round(v.time+release)}))]));
  animations.attack.bones['flight-card']=shifted;
  animations.attack.slots['flight-card'].attachment.push(attachment(release,'card'),attachment(flightEnd,null));
  animations.attack.events=[{time:release,name:'release'},{time:impact,name:'impact'}];
  // The loose card in a fall starts at the case mouth, not at a hand that may already be empty.
  const letGo=.615,land=1.055,falling=solver(rig,'death',letGo),startX=falling.mouth[0]+5,startY=falling.mouth[1]+2;
  const restingHeight=3.9,dt=land-letGo,g=2*(startY+16*dt-restingHeight)/(dt*dt);
  const dropTimes=sampleTimes(timings.death,[letGo,land,1.12,1.20]).filter(t=>t>=letGo);
  const dropXY=dropTimes.map(t=>{const f=t-letGo;if(t<=land)return [startX+112*f,startY+16*f-.5*g*f*f];const u=Math.min(1,(t-land)/.14);return [startX+112*dt+8*(1-(1-u)**2),restingHeight+3.5*Math.sin(u*Math.PI)];});
  const dropAngle=dropTimes.map(t=>curve([letGo,14,.79,-35,.97,-118,land,-169,1.14,-186,1.23,-177,1.38,-177],t));
  animations.death.bones['flight-card']={translate:keys(dropTimes,dropXY,.04,[land],'translate'),rotate:keys(dropTimes,dropAngle,.12,[land],'rotate'),
    scale:[{time:letGo,x:.77,y:.65},{time:.77,x:1,y:1},{time:.99,x:1,y:.33},{time:land,x:1,y:.10},{time:1.12,x:1,y:.17},{time:1.20,x:1,y:.10}]};
  animations.death.slots['flight-card'].attachment.push(attachment(letGo,'card'));
  floorDraping(rig,animations.death);
  return {animations,release,impact};
}
module.exports={survivorClips,timings,body,bodyKeys,curve,keys,sampleTimes,rotate,nearestTurn};
