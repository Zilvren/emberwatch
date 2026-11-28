const masks=require('./bestiary-cutlines.cjs');

function inside(x,y,p){
  let result=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const a=p[j],b=p[i];
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) result=!result;
  }
  return result;
}
function segmentDistance(x,y,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
  const t=len?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/len)):0;
  return [Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy),t];
}
function distanceTo(shape,x,y){
  if(shape.border&&inside(x,y,shape.border))return -1;
  const pts=shape.border||shape.stroke;
  let best=Infinity;
  for(let i=shape.border?0:1;i<pts.length;i++){
    const a=pts[(i+pts.length-1)%pts.length],b=pts[i];
    const [length,t]=segmentDistance(x,y,a,b);
    best=Math.min(best,shape.stroke?length-(a[2]+(b[2]-a[2])*t):length);
  }
  return best;
}
// Fit the neutral studio ground from unoccupied samples. The fit is only used for edge alpha.
function backdrop(sheet,zones=Object.values(masks),shadowBands=[[821,926]]){
  const {width:w,height:h,data}=sheet, samples=[];
  const basis=(x,y)=>{const a=x/w,b=y/h;return [1,a,b,a*a,a*b,b*b];};
  for(let y=7;y<h;y+=13)for(let x=7;x<w;x+=13){
    if(shadowBands.some(([top,bottom])=>y>top&&y<bottom))continue;
    if(zones.some(z=>x>=z.rect[0]-8&&x<=z.rect[2]+8&&y>=z.rect[1]-8&&y<=z.rect[3]+8))continue;
    const k=4*(y*w+x);samples.push({v:basis(x,y),rgb:[data[k],data[k+1],data[k+2]]});
  }
  function solve(points){
    const m=Array.from({length:6},()=>Array(9).fill(0));
    for(const {v,rgb} of points)for(let a=0;a<6;a++){
      for(let b=0;b<6;b++)m[a][b]+=v[a]*v[b];
      for(let c=0;c<3;c++)m[a][6+c]+=v[a]*rgb[c];
    }
    for(let i=0;i<6;i++){
      let pivot=i;for(let j=i+1;j<6;j++)if(Math.abs(m[j][i])>Math.abs(m[pivot][i]))pivot=j;
      [m[i],m[pivot]]=[m[pivot],m[i]];
      const q=m[i][i];for(let j=i;j<9;j++)m[i][j]/=q;
      for(let j=0;j<6;j++)if(j!==i){const factor=m[j][i];for(let k=i;k<9;k++)m[j][k]-=factor*m[i][k];}
    }
    return m.map(row=>row.slice(6));
  }
  function evalAt(coeff,v){const rgb=[0,0,0];for(let j=0;j<6;j++)for(let c=0;c<3;c++)rgb[c]+=coeff[j][c]*v[j];return rgb;}
  let cf=solve(samples);
  const accepted=samples.filter(s=>Math.hypot(...evalAt(cf,s.v).map((v,i)=>v-s.rgb[i]))<16);
  cf=solve(accepted);
  return (x,y)=>evalAt(cf,basis(x,y));
}
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function measureMatte(sheet,actor,background){
  const [left,top,right,bottom]=actor.rect,w=right-left,h=bottom-top,n=w*h;
  const signal=new Float32Array(n),allowed=new Uint8Array(n),solid=new Uint8Array(n),alpha=new Uint8Array(n),matteRGB=Buffer.alloc(n*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const gx=x+left,gy=y+top,k=y*w+x,si=(gy*sheet.width+gx)*4;
    if(!inside(gx+.5,gy+.5,actor.envelope))continue;allowed[k]=1;
    const bg=background(gx,gy),r=sheet.data[si]-bg[0],g=sheet.data[si+1]-bg[1],b=sheet.data[si+2]-bg[2];
    signal[k]=Math.sqrt((r*r+g*g+b*b)/3+.42*((r-b)*(r-b)+(g-b)*(g-b)));
    if(signal[k]>=14.5)solid[k]=1;
  }
  const seen=new Uint8Array(n),queue=new Int32Array(n);
  for(let i=0;i<n;i++){
    if(seen[i])continue;
    const mode=solid[i];let npt=1,read=0;queue[0]=i;seen[i]=1;
    while(read<npt){const k=queue[read++],x=k%w,y=(k-x)/w;
      for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){
        const j=yy*w+xx;if(!seen[j]&&solid[j]===mode){queue[npt++]=j;seen[j]=1;}
      }
    }
    if((mode===1&&npt<16)||(mode===0&&npt<84)){for(let j=0;j<npt;j++)solid[queue[j]]=mode?0:allowed[queue[j]];}
  }
  // A wing band or pale collar can equal the studio grey. Enclosed colour fields
  // are still opaque. Close short edge interruptions before finding the outside,
  // then return the outside to its measured anti-aliased contour.
  function spread(initial,steps){
    let current=initial;
    for(let step=0;step<steps;step++){
      const next=new Uint8Array(current);
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;
        if(!current[i]&&(current[i-1]||current[i+1]||current[i-w]||current[i+w]))next[i]=1;
      }
      current=next;
    }
    return current;
  }
  const fineContour=solid.slice();
  const barrier=spread(solid,3),exterior=new Uint8Array(n);let tail=0,head=0;
  function seed(j){if(j>=0&&j<n&&!barrier[j]&&!exterior[j]){exterior[j]=1;queue[tail++]=j;}}
  for(let x=0;x<w;x++){seed(x);seed((h-1)*w+x);}
  for(let y=0;y<h;y++){seed(y*w);seed(y*w+w-1);}
  for(const [gx,gy] of actor.openSpaces||[])seed((gy-top)*w+gx-left);
  while(head<tail){const i=queue[head++],x=i%w;if(x)seed(i-1);if(x+1<w)seed(i+1);if(i>=w)seed(i-w);if(i<n-w)seed(i+w);}
  const air=spread(exterior,3);
  for(let i=0;i<n;i++)if(allowed[i]&&!air[i])solid[i]=1;
  for(const s of actor.solidFields||[])for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;if(allowed[i]&&!solid[i]&&inside(x+left+.5,y+top+.5,s))solid[i]=1;
  }
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const gx=x+left,gy=y+top,i=y*w+x;
    const opening=actor.fineOpening;
    if(opening&&gx>=opening[0]&&gx<opening[2]&&gy>=opening[1]&&gy<opening[3]&&signal[i]<11&&!fineContour[i])solid[i]=0;
    if(actor.footClips){
      for(const f of actor.footClips){
        if(gx>=f.x[0]&&gx<=f.x[1]&&gy>=f.y&&!inside(gx+.5,gy+.5,f.polygon)){allowed[i]=0;solid[i]=0;break;}
      }
    }
  }
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const k=y*w+x;if(!allowed[k])continue;
    const si=((top+y)*sheet.width+left+x)*4;
    let count=0;
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)count+=solid[k+j*w+i];
    if(!count)continue;
    let a=solid[k]?1:0,edgeGuide=k;
    if(count<9){
      let strongest=k;
      for(let yy=Math.max(0,y-2);yy<=Math.min(h-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(w-1,x+2);xx++){
        const j=yy*w+xx;if(solid[j]&&signal[j]>signal[strongest])strongest=j;
      }
      edgeGuide=strongest;
      a=clamp((signal[k]-3.2)/Math.max(8,signal[strongest]-3.2),0,1);
      if(!solid[k]&&a<.09)continue;
    }
    if(a<.035)continue;
    const aa=Math.round(a*255);alpha[k]=aa;
    const dst=k*4;
    if(aa===255){sheet.data.copy(matteRGB,dst,si,si+3);}
    else{
      const bg=background(x+left,y+top),ex=edgeGuide%w,ey=(edgeGuide-ex)/w,guide=((top+ey)*sheet.width+left+ex)*4;
      for(let c=0;c<3;c++){
        const estimate=(sheet.data[si+c]-(1-a)*bg[c])/a,near=sheet.data[guide+c],band=16+48*a;
        matteRGB[dst+c]=clamp(Math.round(clamp(estimate,near-band,near+band)),0,255);
      }
    }
    matteRGB[dst+3]=aa;
  }
  return {w,h,left,top,alpha,matteRGB};
}

function transparentMatte(sheet,actor){
  const [left,top,right,bottom]=actor.rect,w=right-left,h=bottom-top;
  const matteRGB=Buffer.alloc(w*h*4),alpha=new Uint8Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=y*w+x,source=((y+top)*sheet.width+x+left)*4;
    if(actor.envelope&&!inside(x+left+.5,y+top+.5,actor.envelope))continue;
    const coverage=sheet.data[source+3];
    // Normalize the transparent plate's faint matte noise and nearly opaque interiors.
    alpha[i]=coverage<8?0:coverage>245?255:coverage;
    if(alpha[i]) sheet.data.copy(matteRGB,i*4,source,source+3);
    matteRGB[i*4+3]=alpha[i];
  }
  return {w,h,left,top,alpha,matteRGB};
}
function partition(sheet,actor,background){
  const out=background?measureMatte(sheet,actor,background):transparentMatte(sheet,actor);
  const {w,h,left,top,alpha,matteRGB}=out,n=w*h;
  const owner=new Int16Array(n);owner.fill(-1);
  const regions=Object.entries(actor.parts).map(([name,s])=>{
    const p=s.border||s.stroke,margin=s.stroke?Math.max(...p.map(v=>v[2]))+2:2;
    return {name,s,bounds:[Math.min(...p.map(v=>v[0]))-margin,Math.min(...p.map(v=>v[1]))-margin,Math.max(...p.map(v=>v[0]))+margin,Math.max(...p.map(v=>v[1]))+margin]};
  });
  const index=new Map(regions.map((r,i)=>[r.name,i])),order=actor.priority.map(n=>index.get(n));
  const extents=regions.map(()=>[Infinity,Infinity,-Infinity,-Infinity,0]);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const k=y*w+x;if(!alpha[k])continue;const px=x+left+.5,py=y+top+.5;
    let best=-1;
    for(const i of order){
      const {s,bounds:b}=regions[i];if(px<b[0]||py<b[1]||px>b[2]||py>b[3])continue;
      if(s.border?inside(px,py,s.border):distanceTo(s,px,py)<=0){best=i;break;}
    }
    if(best<0){
      let distance=Infinity;
      for(const i of order){const b=regions[i].bounds;
        const lower=Math.hypot(Math.max(b[0]-px,px-b[2],0),Math.max(b[1]-py,py-b[3],0));if(lower>distance)continue;
        const d=distanceTo(regions[i].s,px,py);if(d<distance){distance=d;best=i;}
      }
    }
    owner[k]=best;const e=extents[best];e[0]=Math.min(e[0],x);e[1]=Math.min(e[1],y);e[2]=Math.max(e[2],x);e[3]=Math.max(e[3],y);e[4]++;
  }
  // Small source slivers isolated by a drawn seam follow the neighbouring surface.
  // In particular, the dark rear notch at the top of the crab is part of its lifting shield.
  if(index.has('shield')){
    const hull=index.get('hull'),shield=index.get('shield'),seen=new Uint8Array(n),queue=new Int32Array(n);
    const arm=index.get('claw-arm'),palm=index.get('palm');
    for(let k=0;k<n;k++)if(owner[k]===arm){
      const x=k%w+left,y=Math.floor(k/w)+top;
      if(x<461&&y<654)owner[k]=palm;
    }
    for(let i=0;i<n;i++){
      if(owner[i]!==hull||seen[i])continue;
      let tail=1,head=0,xsum=0,ysum=0;queue[0]=i;seen[i]=1;
      while(head<tail){const j=queue[head++],x=j%w,y=(j-x)/w;xsum+=x+left;ysum+=y+top;
       for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){const k=yy*w+xx;if(!seen[k]&&owner[k]===hull){seen[k]=1;queue[tail++]=k;}}
      }
      if(tail<550&&xsum/tail<815&&ysum/tail<634)for(let j=0;j<tail;j++)owner[queue[j]]=shield;
    }
  }
  if(index.has('left-cuff')){
    for(const side of ['left','right']){
      const hand=index.get(side+'-hand'),sleeve=index.get(side+'-sleeve'),cuff=index.get(side+'-cuff');
      const skin=new Uint8Array(n);
      for(let i=0;i<n;i++)if([hand,cuff,sleeve].includes(owner[i])){
        const j=i*4,x=i%w+left,y=Math.floor(i/w)+top;
        if(matteRGB[j]>116&&matteRGB[j]-matteRGB[j+2]>26&&inside(x+.5,y+.5,actor.parts[side+'-hand'].border))skin[i]=1;
      }
      for(let i=0;i<n;i++)if(owner[i]===hand||owner[i]===cuff){
        if(skin[i]){owner[i]=hand;continue;}
        if(owner[i]!==hand)continue;
        const x=i%w,y=(i-x)/w;let near=false;
        for(let yy=Math.max(0,y-3);yy<=Math.min(h-1,y+3)&&!near;yy++)for(let xx=Math.max(0,x-3);xx<=Math.min(w-1,x+3);xx++)if(skin[yy*w+xx]){near=true;break;}
        if(!near)owner[i]=sleeve;
      }
    }
  }
  if(actor.refineOwner)for(let i=0;i<n;i++){
    if(owner[i]<0)continue;
    const next=actor.refineOwner(i%w+left,Math.floor(i/w)+top,matteRGB,i*4,regions[owner[i]].name);
    if(next)owner[i]=index.get(next);
  }
  for(const e of extents)e.splice(0,5,Infinity,Infinity,-Infinity,-Infinity,0);
  for(let j=0;j<n;j++)if(owner[j]>=0){const x=j%w,y=(j-x)/w,e=extents[owner[j]];e[0]=Math.min(e[0],x);e[1]=Math.min(e[1],y);e[2]=Math.max(e[2],x);e[3]=Math.max(e[3],y);e[4]++;}
  return {...out,owner,regions,index,extents};
}

function sampleUnderpainting(image,u,v,requireOpaque=false){
  u=clamp(u,0,.999);v=clamp(v,0,.999);
  let i=0;
  for(let n=0;n<12;n++){
    i=(Math.floor(v*image.height)*image.width+Math.floor(u*image.width))*4;
    if(!requireOpaque||image.data[i+3]>225)break;
    u+=.17*(.5-u);v+=.17*(.55-v);
  }
  return image.data.subarray(i,i+4);
}
function cutSourcePart(PNG,cut,actor,definition,drawOrder,reconstruction,underBox){
  const {w,h,left,top,alpha,matteRGB,owner,index,extents}=cut;
  const k=index.get(definition.name),s=actor.parts[definition.name],extent=extents[k];
  if(!Number.isFinite(extent[0])||extent[4]<12)throw Error('No visible selected-source pixels on '+definition.name);
  const reach=s.extra||16, pad=3;
  const x0=Math.max(0,extent[0]-reach-pad),y0=Math.max(0,extent[1]-reach-pad),x1=Math.min(w,extent[2]+reach+pad+1),y1=Math.min(h,extent[3]+reach+pad+1);
  const width=x1-x0,height=y1-y0,image=new PNG({width,height});
  const nearest=new Int32Array(width*height);nearest.fill(-1);
  const distance=new Uint16Array(width*height);distance.fill(65535);
  const queue=new Int32Array(width*height);let tail=0,head=0,hidden=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const j=y*width+x,origin=(y+y0)*w+x+x0;
    if(owner[origin]!==k)continue;
    const si=origin*4,di=j*4;matteRGB.copy(image.data,di,si,si+4);nearest[j]=origin;distance[j]=0;queue[tail++]=j;
  }
  while(head<tail){const u=queue[head++],x=u%width,y=(u-x)/width;if(distance[u]>=reach)continue;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height)continue;
      const j=yy*width+xx;if(distance[j]!==65535)continue;
      distance[j]=distance[u]+1;nearest[j]=nearest[u];queue[tail++]=j;
    }
  }
  const layer=drawOrder.indexOf(definition.name);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const j=y*width+x,d=distance[j],origin=(y+y0)*w+x+x0,other=owner[origin];
    if(!d||d>reach||other<0||alpha[origin]!==255||drawOrder.indexOf(cut.regions[other].name)<=layer)continue;
    const px=x+x0+left,py=y+y0+top;
    if(definition.hiddenInside&&!definition.hiddenInside(px,py))continue;
    const repair=definition.clothRepair;
    if(repair&&px>=repair[0]&&px<repair[2]&&py>=repair[1]&&py<repair[3]&&
        ['near-hand','near-bracer'].includes(cut.regions[other].name)){
      // Continue the neighbouring folds behind the glove. Both anchors come from visible cloth in this row.
      const sample=direction=>{
        let first=-1,count=0;const sum=[0,0,0];
        for(let a=origin+direction,step=1;step<155&&Math.floor(a/w)===Math.floor(origin/w);a+=direction,step++){
          const ai=a*4;if(owner[a]!==k||matteRGB[ai+2]<matteRGB[ai]+2)continue;
          if(first<0){first=step;continue;}
          for(let c=0;c<3;c++)sum[c]+=matteRGB[ai+c];
          if(++count===5)break;
        }
        return count?{distance:first,rgb:sum.map(v=>v/count)}:null;
      };
      const low=sample(-1),high=sample(1);
      if(low||high){
        const t=low&&high?low.distance/(low.distance+high.distance):Number(!low);
        for(let c=0;c<3;c++)image.data[j*4+c]=Math.round((low||high).rgb[c]*(1-t)+(high||low).rgb[c]*t);
        image.data[j*4+3]=255;hidden++;continue;
      }
    }
    const joint=Math.min(Math.hypot(px-s.pivot[0],py-s.pivot[1]),Math.hypot(px-s.tip[0],py-s.tip[1]));
    const limit=(joint<reach*2.7||definition.central)?reach:Math.min(5,reach);
    if(d>limit)continue;
    // Paint only surfaces hidden at setup. The attached, visible drawing above is kept verbatim.
    const near=nearest[j]*4,at=j*4;
    const rect=underBox||[extent[0]+left,extent[1]+top,extent[2]+left+1,extent[3]+top+1];
    const u=(px-rect[0])/(rect[2]-rect[0]),v=(py-rect[1])/(rect[3]-rect[1]);
    if(reconstruction && (u<0||u>1||v<0||v>1)&&d>2)continue;
    const reflected=nearest[j]*2-origin;
    const sample=owner[reflected]===k&&alpha[reflected]===255 ? reflected*4 : near;
    let fill=reconstruction ? sampleUnderpainting(reconstruction,u,v,definition.opaqueUnderpaint) : matteRGB.subarray(sample,sample+4);
    if(definition.noHiddenEye&&fill[0]>127&&fill[0]-fill[2]>36){
      fill=sampleUnderpainting(reconstruction,.50+.2*clamp(u,0,1),.48+.19*clamp(v,0,1),true);
    }
    const eyeEdge=definition.noHiddenEye&&matteRGB[near]>150&&matteRGB[near]-matteRGB[near+2]>44;
    const blend=eyeEdge?1:clamp((d-1)/5,0,1);
    if(fill[3]<35&&d>2)continue;
    for(let c=0;c<3;c++)image.data[at+c]=Math.round(matteRGB[near+c]*(1-blend)+fill[c]*blend);
    const edge=clamp((limit-d+1)/Math.max(3,limit*.22),0,1);
    image.data[at+3]=Math.round((d<=2?255:fill[3])*edge);hidden++;
  }
  return {image,sourceXYWH:[x0+left,y0+top,width,height],visible:extent[4],hidden};
}
function makeSupport(PNG,cut,model,paint){
  const [l,t,r,b]=model.box,margin=3;
  const im=new PNG({width:r-l+margin*2,height:b-t+margin*2});
  let hidden=0;
  for(let y=t;y<b;y++)for(let x=l;x<r;x++){
    if(!inside(x+.5,y+.5,model.shape))continue;
    const cx=x-cut.left,cy=y-cut.top;if(cx<0||cy<0||cx>=cut.w||cy>=cut.h||cut.alpha[cy*cut.w+cx]!==255)continue;
    const u=(x-l+.5)/(r-l),v=(y-t+.5)/(b-t);
    const col=sampleUnderpainting(paint,model.uv[0]+u*(model.uv[2]-model.uv[0]),model.uv[1]+v*(model.uv[3]-model.uv[1]),true);
    const j=((y-t+margin)*im.width+x-l+margin)*4;
    for(let c=0;c<3;c++)im.data[j+c]=Math.round(.91*col[c]);
    im.data[j+3]=255;hidden++;
  }
  return {image:im,sourceXYWH:[l-margin,t-margin,im.width,im.height],hidden};
}
module.exports={backdrop,partition,cutSourcePart,makeSupport,inside};
