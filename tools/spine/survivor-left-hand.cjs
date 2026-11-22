const fs = require('node:fs');
const path = require('node:path');
const {PNG,hash} = require('./bestiary-assets.cjs');
const {round} = require('./rig-authoring.cjs');
const {world,stageScale,ground} = require('./survivor-profile.cjs');

// Coordinates are in a shared 768 × 512 artwork cell, x right and y down.
// The thumb pad was marked on the near face of the card; the index approaches from the other side.
const wrist = [164,287], pad = [499,204], indexPivot = [335,146], thumbPivot = [339,238];
const digitLandmarks={
    index:[indexPivot,[432,128],[494,130],[567,136]],
    middle:[[365,180],[438,183],[553,204]],
};
const unit = .0805, cellWidth = 768, cellHeight = 512, textureStep = 2;
const thumbTop = [[281,215],[317,192],[349,183],[378,183],[407,177],[432,172],[458,169],[483,171],[505,174],[525,184],[536,196]];
const thumbBottom = [[281,293],[319,287],[352,274],[381,259],[414,248],[447,245],[481,238],[504,230],[520,216],[536,200]];
const indexBottom = [[309,177],[335,181],[363,177],[387,170],[411,165],[428,162],[448,159],[477,160],[501,161],[532,163],[554,157],[578,146]];
const middleTop = [[347,176],[370,174],[395,169],[421,162],[449,164],[475,168],[505,177],[532,187],[554,194],[566,201]];
const middleBottom = [[347,215],[368,214],[393,211],[416,205],[441,204],[466,207],[491,215],[514,224],[540,225],[555,217],[566,207]];
const rad = degrees => degrees * Math.PI / 180;
function rotate(x,y,angle) { const a=rad(angle); return [x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)]; }
function smooth(a,b,x){const v=Math.max(0,Math.min(1,(x-a)/(b-a)));return v*v*(3-2*v);}
function edge(points,x){
    for(let i=1;i<points.length;i++)if(x<=points[i][0]){
        const a=points[i-1],b=points[i];return a[1]+(b[1]-a[1])*((x-a[0])/(b[0]-a[0]));
    }
    return points.at(-1)[1];
}
function thumb(x,y){
    if(x<281||x>536)return 0;
    return smooth(0,2,y-edge(thumbTop,x))*smooth(0,2,edge(thumbBottom,x)-y)*smooth(298,349,x);
}
function index(x,y){
    if(x<305||x>581)return 0;
    return smooth(-1,1,edge(indexBottom,x)-y)*smooth(307,351,x);
}
function middle(x,y){
    if(x<347||x>566)return 0;
    return smooth(-1,1.5,y-edge(middleTop,x))*smooth(-1,1.5,edge(middleBottom,x)-y)*smooth(348,380,x);
}
function heelAndFoldedDigits(x,y){
    if(x<354)return 1;
    // The open drawing contains two folded digits. The independently bending middle finger supplies the third.
    if(x<=439&&y>=edge([[350,293],[370,282],[393,275],[419,274],[439,274]],x))return 1;
    const cap=edge([[75,342],[105,361],[140,374],[170,366],[192,372],[215,374],[246,381],[275,368],[303,351]],y);
    return 1-smooth(cap-1,cap+1,x);
}
function cuff(x,y){
    if(x>=wrist[0])return 1;
    // A rounded, hidden wrist cap gives the bandage an overlap even when the hand is turned.
    const d=Math.hypot((x-wrist[0])/31,(y-wrist[1])/79);
    return 1-smooth(.96,1.02,d);
}
function plate(image,cell,mask){
    const raw=Buffer.alloc(cellWidth*cellHeight*4);
    let lowX=cellWidth,lowY=cellHeight,highX=0,highY=0;
    for(let y=0;y<cellHeight;y++)for(let x=0;x<cellWidth;x++){
        const i=(y*cellWidth+x)*4,j=(y*image.width+cell*cellWidth+x)*4;
        const a=Math.round(image.data[j+3]*cuff(x,y)*mask(x,y));
        if(a<4)continue;
        raw[i]=image.data[j];raw[i+1]=image.data[j+1];raw[i+2]=image.data[j+2];raw[i+3]=a;
        lowX=Math.min(lowX,x);lowY=Math.min(lowY,y);highX=Math.max(highX,x);highY=Math.max(highY,y);
    }
    const l=Math.floor(lowX/2)*2-4,t=Math.floor(lowY/2)*2-4;
    const w=Math.ceil((highX+5-l)/2),h=Math.ceil((highY+5-t)/2);
    if(w<2||h<2)throw Error('An empty left-hand plate cannot be bound.');
    const png=new PNG({width:w,height:h});
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const sum=[0,0,0];let a=0;
        for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
            const sx=l+x*2+xx,sy=t+y*2+yy;if(sx<0||sx>=cellWidth||sy<0||sy>=cellHeight)continue;
            const j=(sy*cellWidth+sx)*4,al=raw[j+3];a+=al;
            for(let c=0;c<3;c++)sum[c]+=raw[j+c]*al;
        }
        if(!a)continue;const i=(y*w+x)*4;
        for(let c=0;c<3;c++)png.data[i+c]=Math.round(sum[c]/a);
        png.data[i+3]=Math.round(a/4);
    }
    return {png,l,t,w:w*textureStep,h:h*textureStep};
}

function bindLeftHand(rig,bone,slots,limbs,extras,sourceDir,dir){
    const {skeleton,frames}=rig,skin=skeleton.skins[0].attachments;
    const grip=PNG.sync.read(fs.readFileSync(path.join(sourceDir,'left-hand-poses.png')));
    const release=PNG.sync.read(fs.readFileSync(path.join(sourceDir,'left-hand-release.png')));
    if([grip,release].some(p=>p.width!==2*cellWidth||p.height!==cellHeight))throw Error('Left-hand plate registration differs.');
    const origin=[918,259],restDirection=Math.atan2(27,28)*180/Math.PI;
    const refDirection=Math.atan2(wrist[1]-pad[1],pad[0]-wrist[0])*180/Math.PI;
    const orientation=restDirection-refDirection,originWorld=world(origin);
    function projected(p){
        const d=rotate((p[0]-wrist[0])*unit,(wrist[1]-p[1])*unit,orientation);
        return [originWorld[0]+d[0],originWorld[1]+d[1]];
    }
    function measured(p){const [x,y]=projected(p);return [ground[0]+x/stageScale,ground[1]-y/stageScale];}
    const tip=measured(pad);
    bone('cast-palm','cast-bracer',origin,tip);
    bone('cast-index','cast-palm',measured(indexPivot),measured(digitLandmarks.index[1]));
    bone('cast-index-tip','cast-index',measured(digitLandmarks.index[1]),measured(digitLandmarks.index[2]));
    bone('cast-index-nail','cast-index-tip',measured(digitLandmarks.index[2]),measured(digitLandmarks.index[3]));
    bone('cast-middle','cast-palm',measured([365,180]),measured([438,183]));
    bone('cast-middle-tip','cast-middle',measured([438,183]),measured([551,204]));
    bone('cast-thumb','cast-palm',measured(thumbPivot),tip);
    for(const n of ['cast-palm','cast-middle','cast-index','cast-thumb']){
        skin[n]={};slots.push({name:n,bone:n,color:'f2edf0ff'});limbs.push(n);
    }
    const contours=[];
    function image(slot,name,src,cell,mask,source,bend){
        const boundBone=slot;
        const v=plate(src,cell,mask),center=projected([v.l+v.w/2,v.t+v.h/2]),f=frames.get(boundBone);
        const xy=rotate(center[0]-f.x,center[1]-f.y,-f.angle),scale=unit*textureStep;
        skin[slot][name]={path:name,x:round(xy[0]),y:round(xy[1]),rotation:round(orientation-f.angle),
            scaleX:scale,scaleY:scale,width:v.png.width,height:v.png.height};
        if(bend){
            const endFrame=frames.get(slot+'-tip'),cols=[0,.2,.5,.8,1];
            const root=slot==='cast-index'?[307,354]:[346,390];
            const nail=slot==='cast-index'?frames.get('cast-index-nail'):null;
            for(const x of [...root,bend-19,bend,bend+19,...(nail?[477,494,511]:[])])cols.push(Math.max(0,Math.min(1,(x-v.l)/v.w)));
            const xs=[...new Set(cols)].sort((a,b)=>a-b),last=xs.length-1;
            const points=[...xs.map((_,i)=>[i,0]),[last,1],...xs.map((_,i)=>[last-i,2]),[0,1]];
            const hull=points.length;for(let i=1;i<last;i++)points.push([i,1]);
            const uvs=[],vertices=[],triangles=[];
            for(const [ix,iy] of points){
                const u=xs[ix],vv=iy/2,x=v.l+u*v.w,y=v.t+vv*v.h;
                const w=smooth(bend-19,bend+19,x),r=smooth(root[0],root[1],x),worldPoint=projected([x,y]);uvs.push(u,vv);
                const d=nail?smooth(477,511,x):0;
                const weights=[[frames.get('cast-palm'),1-r],[f,r*(1-w)],[endFrame,r*w*(1-d)],...(nail?[[nail,r*w*d]]:[])].filter(([,w])=>w>1e-6);vertices.push(weights.length);
                for(const [fr,mix]of weights){
                    const local=rotate(worldPoint[0]-fr.x,worldPoint[1]-fr.y,-fr.angle);
                    vertices.push(fr.index,round(local[0]),round(local[1]),round(mix));
                }
            }
            const at=(ix,iy)=>points.findIndex(([x,y])=>x===ix&&y===iy);
            for(let x=0;x<last;x++)for(let y=0;y<2;y++){
                const a=at(x,y),b=at(x+1,y),c=at(x+1,y+1),d=at(x,y+1);
                triangles.push(a,b,c,c,d,a);
            }
            skin[slot][name]={path:name,type:'mesh',uvs,triangles,vertices,hull,width:v.png.width,height:v.png.height};
        }
        // Keep the actual opaque contour for the hand's grounded IK target, including extended, bare fingertips.
        function remember(ix,iy){
            const x=v.l+(ix+.5)*textureStep,y=v.t+(iy+.5)*textureStep,wp=projected([x,y]);
            const root=slot==='cast-index'?[307,354]:[346,390];
            const r=bend?smooth(root[0],root[1],x):1,w=bend?smooth(bend-19,bend+19,x):0;
            const d=slot==='cast-index'?smooth(477,511,x):0;
            const refs=bend?[['cast-palm',1-r],[slot,r*(1-w)],[slot+'-tip',r*w*(1-d)],...(slot==='cast-index'?[['cast-index-nail',r*w*d]]:[])]:[[slot,1]];
            contours.push(refs.filter(([,k])=>k>.00001).map(([n,k])=>{
                const a=frames.get(n),pos=rotate(wp[0]-a.x,wp[1]-a.y,-a.angle);return [n,pos[0],pos[1],k];
            }));
        }
        const opaque=(x,y)=>v.png.data[(y*v.png.width+x)*4+3]>=148;
        for(let x=0;x<v.png.width;x+=5){let t=0,b=v.png.height-1;while(t<=b&&!opaque(x,t))t++;while(b>=t&&!opaque(x,b))b--;if(t<=b){remember(x,t);remember(x,b);}}
        for(let y=0;y<v.png.height;y+=5){let l=0,r=v.png.width-1;while(l<=r&&!opaque(l,y))l++;while(r>=l&&!opaque(r,y))r--;if(l<=r){remember(l,y);remember(r,y);}}
        const bytes=PNG.sync.write(v.png);fs.writeFileSync(path.join(dir,'parts',name+'.png'),bytes);
        extras.push({name,bone:boundBone,slot,sha256:hash(bytes),png:[v.png.width,v.png.height],source:'../'+source,sourceCell:cell,
            registeredRect:[v.l,v.t,v.w,v.h],setupPivot:[round(f.x),round(f.y)],size:[round(v.w*unit),round(v.h*unit)],
            wrist,pinch:pad,sourceUnitsToStage:unit,battleOnly:true,alternateAttachment:name!==slot});
    }
    // Leave a little opaque leather at each root so rotating a finger never opens a hole in the palm.
    image('cast-palm','cast-palm',release,0,heelAndFoldedDigits,'left-hand-release.png');
    image('cast-middle','cast-middle',release,0,middle,'left-hand-release.png',438);
    image('cast-index','cast-index',release,0,index,'left-hand-release.png',432);
    image('cast-thumb','cast-thumb',grip,0,thumb,'left-hand-poses.png');
    const cardUV=[(pad[0]-466)/227,(pad[1]-182)/315];
    rig.leftHand={wrist,pinch:pad,unit,cardUV,role:'Left hand drawing from the card case',jointCell:[cellWidth,cellHeight],
        fingerLayers:['cast-middle','cast-palm','cast-index','held-card','cast-thumb'],sources:['../left-hand-poses.png','../left-hand-release.png']};
    const fingers=skeleton.bones.filter(b=>['cast-index','cast-index-tip','cast-index-nail','cast-middle','cast-middle-tip','cast-thumb'].includes(b.name));
    rig.handFloor=(angle,turns)=>{
        const poses={'cast-palm':{x:0,y:0,a:angle}};
        for(const b of fingers){const p=poses[b.parent],xy=rotate(b.x,b.y,p.a),a=p.a+b.rotation+(turns[b.name]||0);poses[b.name]={x:p.x+xy[0],y:p.y+xy[1],a};}
        for(const p of Object.values(poses)){p.s=Math.sin(rad(p.a));p.c=Math.cos(rad(p.a));}
        let low=Infinity;
        for(const group of contours){let y=0;for(const [n,x,v,k] of group){const p=poses[n];y+=(p.y+p.s*x+p.c*v)*k;}low=Math.min(low,y);}
        return low;
    };
    return {tip,wrist,pad,unit,cardUV};
}
module.exports={bindLeftHand,digitLandmarks};
