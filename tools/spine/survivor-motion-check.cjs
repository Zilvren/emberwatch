// Geometry probes use opaque pixels, including the deformed cloth, rather than atlas rectangles.
const fs=require('node:fs'),path=require('node:path');
const {PNG}=require('./bestiary-assets.cjs');
function contour(image){
  const p=new Map(),w=image.width,h=image.height;
  const opaque=(x,y)=>image.data[4*(y*w+x)+3]>=160;
  const add=(x,y)=>p.set(x+','+y,[(x+.5)/w,(y+.5)/h]);
  for(let y=0;y<h;y+=5){let l=0,r=w-1;while(l<w&&!opaque(l,y))l++;while(r>=l&&!opaque(r,y))r--;if(l<=r){add(l,y);add(r,y);}}
  for(let x=0;x<w;x+=5){let t=0,b=h-1;while(t<h&&!opaque(x,t))t++;while(b>=t&&!opaque(x,b))b--;if(t<=b){add(x,t);add(x,b);}}
  return [...p.values()];
}
function barycentric(uv,tri,u,v){
  for(let i=0;i<tri.length;i+=3){
    const a=tri[i]*2,b=tri[i+1]*2,c=tri[i+2]*2;
    const dx1=uv[b]-uv[a],dy1=uv[b+1]-uv[a+1],dx2=uv[c]-uv[a],dy2=uv[c+1]-uv[a+1];
    const det=dx1*dy2-dx2*dy1;if(Math.abs(det)<1e-9)continue;
    const p=((u-uv[a])*dy2-(v-uv[a+1])*dx2)/det,q=(dx1*(v-uv[a+1])-dy1*(u-uv[a]))/det;
    if(p>=-.0001&&q>=-.0001&&p+q<=1.0001)return [a,b,c,1-p-q,p,q];
  }
  return null;
}
function geometry(folder,skel){
  const shapes={},cache=new Map();
  for(const [slot,variants] of Object.entries(skel.skins[0].attachments)){
    shapes[slot]={};
    for(const [name,a] of Object.entries(variants)){
      const file=a.path||name;if(!cache.has(file))cache.set(file,contour(PNG.sync.read(fs.readFileSync(path.join(folder,'parts',file+'.png')))));
      const pts=cache.get(file);
      if(a.type==='mesh'){shapes[slot][name]={mesh:true,pts:pts.map(([u,v])=>barycentric(a.uvs,a.triangles,u,v)).filter(Boolean)};continue;}
      const rad=(a.rotation||0)*Math.PI/180,cs=Math.cos(rad),sn=Math.sin(rad);
      shapes[slot][name]={pts:pts.map(([u,v])=>{const x=(u-.5)*a.width*(a.scaleX??1),y=(.5-v)*a.height*(a.scaleY??1);return [(a.x||0)+cs*x-sn*y,(a.y||0)+sn*x+cs*y];})};
    }
  }
  return shapes;
}
async function probe(page,folder,{authoring=false}={}){
  const doc=JSON.parse(fs.readFileSync(path.join(folder,authoring?'survivor.authoring.json':'runtime/survivor.json'))),shapes=geometry(folder,doc);
  if(authoring)await page.evaluate(doc=>{
    const c=cc.director.getScene().getComponentsInChildren('SurvivorSpineReview')[0],s=c.skeleton,prev=s.skeletonData;
    const data=new prev.constructor();data._uuid='survivor-dev-'+Date.now();
    data.skeletonJson=doc;data.atlasText=prev.atlasText;data.textures=prev.textures;data.textureNames=prev.textureNames;s.skeletonData=data;
  },doc);
  const duration=JSON.parse(fs.readFileSync(path.join(folder,'export-report.json'))).clips;
  return page.evaluate(({shapes,doc,duration})=>{
    const c=cc.director.getScene().getComponentsInChildren('SurvivorSpineReview')[0],s=c.skeleton;
    c.playIdle();c.setReviewClock?.(true);s.timeScale=1;
    const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),bone=n=>s.findBone(n),pos=n=>[bone(n).worldX,bone(n).worldY];
    function world(b,x,y){return [b.a*x+b.b*y+b.worldX,b.c*x+b.d*y+b.worldY];}
    function inv(b,[x,y]){const det=b.a*b.d-b.b*b.c,dx=x-b.worldX,dy=y-b.worldY;return [(b.d*dx-b.b*dy)/det,(b.a*dy-b.c*dx)/det];}
    s.clearTracks();s.setToSetupPose();s._skeleton.updateWorldTransform();
    const lip=inv(bone('card-case'),[(840-774)*.48,(920-386)*.48]);
    function pose(name,t){
      s.paused=false;s.clearTracks();s.setToSetupPose();const track=s.setAnimation(0,name,false);track.mixDuration=0;s.updateAnimation(0);if(t>0)s.updateAnimation(t);s._skeleton.updateWorldTransform();s.paused=true;
    }
    function card(slot){
      const a=doc.skins[0].attachments[slot].card,b=bone(slot);
      return world(b,a.x||0,a.y||0);
    }
    const release=doc.animations.attack.events.find(e=>e.name==='release').time,dt=1/240;
    pose('attack',release-dt);const earlier=card('held-card');pose('attack',release);const held=card('held-card'),flight=card('flight-card');
    pose('attack',release+dt);const later=card('flight-card');
    const vin=held.map((n,i)=>(n-earlier[i])/dt),vout=later.map((n,i)=>(n-flight[i])/dt);
    const q=doc.animations.attack.slots['held-card'].attachment.filter(e=>e.name==='card');
    const drawTime=q.at(-1).time||0;pose('attack',drawTime);const drawDistance=length(pos('AttackTip'),world(bone('card-case'),...lip));
    const localMeshes=new Map();
    function posedBounds(){
      const levels={};
      for(const slot of s._skeleton.slots){
        const a=slot.getAttachment();if(!a||slot.color.a<.25)continue;
        const sets=shapes[slot.data.name];if(!sets)continue;const shape=sets[a.name]||Object.values(sets)[0];
        let min=Infinity,max=-Infinity;
        if(shape.mesh){
          let vs=localMeshes.get(slot.data.name);if(!vs){vs=new Float32Array(a.worldVerticesLength);localMeshes.set(slot.data.name,vs);}
          a.computeWorldVertices(slot,0,vs.length,vs,0,2);
          for(const [i,j,k,x,y,z]of shape.pts){const yy=vs[i+1]*x+vs[j+1]*y+vs[k+1]*z;min=Math.min(min,yy);max=Math.max(max,yy);}
        }else{const b=slot.bone;
          for(const [x,y]of shape.pts){const yy=b.c*x+b.d*y+b.worldY;min=Math.min(min,yy);max=Math.max(max,yy);}
        }
        levels[slot.data.name]={min,max};
      }return levels;
    }
    const death=[];let low={y:Infinity},last;
    for(let i=0;i<=Math.ceil(duration.death*90);i++){
      const t=Math.min(duration.death,i/90);pose('death',t);const parts=posedBounds();
      for(const [slot,value] of Object.entries(parts))if(value.min<low.y)low={y:value.min,t,slot};
      if(i%5===0||t===duration.death)death.push({t,low:Object.entries(parts).sort((a,b)=>a[1].min-b[1].min).slice(0,4).map(([id,v])=>[id,Number(v.min.toFixed(2))]),head:parts.head?.min,hips:pos('hips'),near:pos('near-boot'),far:pos('far-boot')});
      last=parts;
    }
    pose('attack',.31);s.paused=false;const pre=pos('AttackTip'),head=pos('head');c.playHurt();s.updateAnimation(0);s._skeleton.updateWorldTransform();
    const interrupt={fingerJump:length(pre,pos('AttackTip')),headJump:length(head,pos('head'))};
    pose('idle',0);
    return {leg:[bone('near-thigh').data.length,bone('near-shin').data.length],guardArm:[bone('near-sleeve').data.length,bone('near-bracer').data.length],release:{held,flight,inVelocity:vin,outVelocity:vout,
      continuityDistance:length(held,flight),speedChange:length(vin,vout),inSpeed:Math.hypot(...vin),outSpeed:Math.hypot(...vout)},draw:{time:drawTime,caseDistance:drawDistance},death:{low,last,samples:death},interrupt};
  },{shapes,doc,duration});
}
async function transitions(page){
  return page.evaluate(()=>{
    const c=cc.director.getScene().getComponentsInChildren('SurvivorSpineReview')[0],s=c.skeleton;
    c.setReviewClock(true);
    const tr=()=>s.getCurrent(0),current=()=>tr()?.animation?.name;
    const active=n=>Boolean(s.findSlot(n)?.getAttachment());
    const pos=n=>{const b=s.findBone(n);return [b.worldX,b.worldY];};
    const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const time=(t,dt=1/120)=>{for(let x=0;x<t-1e-8;x+=dt)c.advanceReview(Math.min(dt,t-x));};
    const idle=()=>{c.playIdle();time(.69);};
    idle();c.playPrepare();time(.69);const pre=pos('AttackTip'),preHead=pos('head');c.playAttack();time(.0001);
    const join={finger:dist(pre,pos('AttackTip')),head:dist(preHead,pos('head')),entryTime:tr().trackTime};
    idle();const events=[];s.setEventListener((e,v)=>{if(e.trackIndex===0)events.push(v.data.name);});
    c.playAttack();time(.16);c.playAttack();c.playAttack();const queued=c.status.string;time(2.40);
    const repeat={events:[...events],status:queued,end:current(),held:active('held-card')};
    idle();events.length=0;c.playAttack();time(.31);const finger=pos('AttackTip'),head=pos('head');c.playHurt();time(.0001);
    const early={finger:dist(finger,pos('AttackTip')),head:dist(head,pos('head')),cardCarried:active('held-card')};time(.75);early.events=[...events];early.returned=!active('held-card');
    idle();events.length=0;c.playAttack();time(.415);const flight=pos('flight-card');c.playHurt();time(.0001);
    const late={inFlight:active('flight-card'),offset:dist(flight,pos('flight-card')),overlay:s.getCurrent(1)?.animation?.name};time(.65);
    late.finished=!active('flight-card')&&!s.getCurrent(1);late.events=[...events];
    idle();c.toggleSpeed();c.playAttack();time(.2);const half=tr().trackTime;c.togglePause();time(.2);
    const pauseDelta=tr().trackTime-half;c.togglePause();c.toggleSpeed();idle();
    c.playDeath();time(1.51);const fallen=pos('head');c.playSequence();time(.055);
    const restart={startsInOldPose:dist(fallen,pos('head'))<.25,opacityAtFade:c.actor.getComponent('cc.UIOpacity').opacity};time(.27);restart.end=current();restart.restored=c.actor.getComponent('cc.UIOpacity').opacity===255;
    s.setEventListener(null);idle();return {join,repeat,early,late,half,pauseDelta,restart};
  });
}
module.exports={geometry,probe,transitions};
