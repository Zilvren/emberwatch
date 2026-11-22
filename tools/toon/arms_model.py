"""Continuous anatomically weighted hands and sewn, articulated sleeves in a neutral bind pose."""
import numpy as np
import cv2
from scipy.ndimage import distance_transform_edt
from model_surface import Atlas,CostumePaint,grid,norm,smooth
from survivor_pose import DIGITS,HAND_SOURCE,mixrot
from gltf import Geometry


def build_arms(rest,bones):
    atlas=Atlas(1024,1024);geo=Geometry();paint=CostumePaint()
    def swatch(rect,w,h,light=1.):
        u,v=grid((w,h));return atlas.tile(np.uint8(np.clip(paint.swatch(rect,u,v)*light,0,255)))
    u,v=grid((310,143));purple=atlas.tile(np.uint8(.67*paint.fabric('wool',u,v,1.7)+.33*paint.swatch((202,245,42,46),u,v)))
    u,v=grid((180,36));lining=atlas.tile(np.uint8(paint.fabric('wool',u,v)*.81))
    u,v=grid((352,236));img=paint.fabric('linen',u,v,1.7)*[.86,.84,.94]
    band=(v*4.7+.82*u+.10*np.sin(u*2*np.pi))%1
    edge=1+.065*np.exp(-((band-.79)/.14)**2)-.22*np.exp(-((band-.97)/.065)**2)-.09*(1-band)
    linen=atlas.tile(np.uint8(np.clip(img*edge[...,None],0,255)));cuff=swatch((171,469,15,16),173,42,.96)
    hand_uv,hand_region=hand_paint(atlas,paint)

    def shell(side,ts,uv,style):
        sh=rest[side+'Upper'];el=rest[side+'Fore'];wr=rest[side+'Hand'];base=len(geo.positions);steps=39
        for k,t in enumerate(ts):
            upper=t<=1;ratio=t if upper else t-1
            for j,u in enumerate(np.linspace(0,1,steps)):
                a=(u-.5)*2*np.pi
                tau=t
                if style=='mantle':tau+=.048*np.sin(a+.7)*smooth(t/.73)
                if style=='edge':tau+=.048*np.sin(a+.7)
                frot=mixrot(sh.r,el.r,smooth((tau-.86)/.28));center=sh.p+(el.p-sh.p)*tau if tau<=1 else el.p+(wr.p-el.p)*(tau-1)
                if style in ('mantle','edge'):
                    radius=np.interp(t,[-.08,.05,.24,.48,.75],[25,41,46,48,49]);rho=radius*(1+.046*np.sin(4*a+1.3*t)+.023*np.sin(7*a-t));rx,rz=rho,rho*.92
                    weights=[(bones[side+'Upper'],1.)]
                    if style=='edge':rx-=.6;rz-=.6
                elif style=='cuff':
                    rx=20.5-1.3*ratio;rz=17.1;weights=[(bones[side+'Fore'],1)]
                else:
                    radius=np.interp(t,[.39,.56,.73,.83,.93,1,1.15,1.28,1.59,1.89,2.06],[24,31,35,32,29,28,32,32,25,19.1,17.4]);
                    wrap=((t-1)*3.5+u*.82)%1.;gathered=(1.25*np.sin(19.5*t+2*a)+.8*np.sin(35*t-3*a))*smooth((1.48-t)/.24)+1.25*np.exp(-((wrap-.80)/.13)**2)
                    rx=radius+gathered+.75*np.cos(3*a+2*t);rz=.86*radius+gathered
                    if t<1:blend=float(smooth((t-.80)/.20));weights=[(bones[side+'Upper'],1-blend),(bones[side+'Bend'],blend)]
                    else:blend=float(smooth((t-1)/.20));weights=[(bones[side+'Bend'],1-blend),(bones[side+'Fore'],blend)]
                pos=center+frot.apply([rx*np.cos(a),0,rz*np.sin(a)])
                geo.vertex(pos,uv(u,k/(len(ts)-1)),[(idx,w) for idx,w in weights if w>1.e-8])
        for row in range(len(ts)-1):
            for col in range(steps-1):
                a=base+row*steps+col;b=a+steps;geo.faces.extend([(a,b,a+1),(a+1,b,b+1)])
    for side in ('R','L'):
        shell(side,np.linspace(-.065,.72,20),purple,'mantle');shell(side,np.linspace(.707,.736,3),lining,'edge')
        shell(side,np.linspace(.38,2.055,65),linen,'linen'); shell(side,np.linspace(1.945,2.017,5),cuff,'cuff')
        hand=rest[side+'Hand'];source=HAND_SOURCE['positions'];mirror=np.array([1 if side=='R' else -1,1,1]);positions=hand.r.apply(source*mirror)+hand.p
        keys=HAND_SOURCE['names'];faces=HAND_SOURCE['triangles'].astype(int);uu=(source[:,0]+43)/92;vv=(source[:,1]+21)/141
        for chart,tile in enumerate(hand_uv):
            visible=faces[hand_region==chart];ids,inverse=np.unique(visible,return_inverse=True);base=len(geo.positions)
            tx,ty=tile(uu[ids],vv[ids]);
            for pt,x,y,raw in zip(positions[ids],tx,ty,HAND_SOURCE['weights'][ids]):
                take=np.argsort(-raw)[:4];take=take[raw[take]>1.e-6];blend=raw[take]/raw[take].sum()
                geo.vertex(pt,[x,y],[(bones[side+str(keys[i])],float(w)) for i,w in zip(take,blend)])
            f=inverse.reshape(-1,3)+base;geo.faces.extend((f if side=='R' else f[:,::-1]).tolist())
    return [('ArticulatedHands',geo)],atlas.canvas


def hand_paint(atlas,paint):
    src=HAND_SOURCE['positions'];geometry=src[HAND_SOURCE['triangles']];normals=np.cross(geometry[:,1]-geometry[:,0],geometry[:,2]-geometry[:,0]);side=(normals[:,2]>0).astype(int)
    u,v=grid((275,403));x=u*92-43;y=v*141-21;uvs=[]
    projected=np.rint((geometry[:,:,:2]+[43,21])*[274/92,402/141]).astype('int32');dz=geometry[:,:,2].mean(axis=1)
    for chart in range(2):
        z=np.full(x.shape,-1000,np.float32)
        for k in np.argsort(dz*(1 if chart else -1)):cv2.fillConvexPoly(z,projected[k],float(dz[k]))
        yy,xx=distance_transform_edt(z==-1000,return_indices=True,return_distances=False);z=z[yy,xx];points=np.stack([x,y,z],axis=-1)
        nearest=np.full(x.shape,np.inf);cut=np.full(x.shape,-80.)
        for j,chain in enumerate(HAND_SOURCE['joints']):
            first=chain[1]-chain[0];threshold=np.linalg.norm(first)*(.87 if j==4 else .47)
            for i,(a,b) in enumerate(zip(chain,chain[1:])):
                d=b-a;t=np.clip(np.sum((points-a)*d,axis=-1)/(d@d),0,1);dist=np.linalg.norm(points-a-t[...,None]*d,axis=-1);use=dist<nearest
                along=np.sum((points-chain[0])*norm(first),axis=-1) if i==0 else np.linalg.norm(first)+np.maximum(0,np.sum((points-chain[1])*norm(chain[-1]-chain[1]),axis=-1))
                cut[use]=along[use]-threshold;nearest[use]=dist[use]
        leather=paint.fabric('leather',u,v)*[.59,.64,.83]
        stitch=np.exp(-((x+14-4*np.sin(y/26))/.7)**2)*smooth((y-7)/7)*smooth((52-y)/9)
        leather+=(stitch*(.65+.35*np.cos(y*1.65)))[...,None]*[14,11,10]
        warm=np.broadcast_to(np.array([173.,125.,101.]),points.shape).copy();warm+=(5*np.sin(.048*y)+.13*z)[...,None]*[.78,.69,.52]
        if chart==0:
            for chain in HAND_SOURCE['joints']:
                a,b=chain[-2,:2],chain[-1,:2];axis=norm(b-a);lat=np.array([-axis[1],axis[0]]);rel=points[:,:,:2]-(.38*a+.62*b)
                oval=(rel@axis/(.32*np.linalg.norm(b-a)))**2+(rel@lat/2.9)**2;warm+=((1-smooth((oval-.60)/.44))*6)[...,None]*[1.,1.2,1.35]
        t=smooth((cut+.36)/.72)[...,None];image=leather*(1-t)+warm*t+np.exp(-((cut+1.3)/.6)**2)[...,None]*[10,8,8]
        uvs.append(atlas.tile(np.uint8(np.clip(image,0,255))))
    return uvs,side
