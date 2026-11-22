"""Fit a face to the selected front and profile, then build a skull, ears and solid hair locks."""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from scipy.interpolate import RBFInterpolator

from gltf import Geometry
from model_surface import ART,Atlas,norm,world

FRONT_X=371.;SIDE_X=315.;BACK_X=330.;PORTRAIT_SCALE=.285


def head_position(x,y,z):
    p=np.stack(np.broadcast_arrays(x*PORTRAIT_SCALE,155+(y-518)*PORTRAIT_SCALE,z*PORTRAIT_SCALE),axis=-1)
    return world(p)


def unwrap(points,view,coords):
    x,y,z=points.T
    if view==0:u=FRONT_X+x
    elif view==1:u=SIDE_X+z
    else:u=BACK_X-x
    return np.stack(coords(np.clip(u,0,691)/691,np.clip(y,0,608)/608),axis=1)


def add_surface(geometry,points,faces,tex,weights):
    base=len(geometry.positions)
    for p,uv in zip(head_position(*points.T),tex):geometry.vertex(p,uv,weights)
    geometry.faces.extend((np.asarray(faces)+base).tolist())


def indices(n,m):
    a=np.arange((m-1)*n).reshape(m-1,n)[:,:-1].ravel()
    return np.concatenate([np.stack([a,a+n,a+1],axis=1),np.stack([a+1,a+n,a+n+1],axis=1)])


def sample_sources(atlas):
    sheet=np.asarray(Image.open(ART/'head-turnaround.png').convert('RGB'))[:609]
    source=[sheet[:,k*692:(k+1)*692] for k in range(3)];hair=[];skin=[]
    # Keep features in their own material, so an edge of a picture cannot draw a second eyebrow or hairline.
    from model_surface import extend_color
    for k,im in enumerate(source):
        r,g,b=im.astype(float).transpose(2,0,1);yy,xx=np.mgrid[:im.shape[0],:im.shape[1]]
        hm=(g<96)&(r-b<37)&(r-g<43)&(yy<509)
        if k==0:hm&=~((yy>280)&(xx>248)&(xx<488)&(yy<472))
        if k==1:hm&=~((yy>279)&(xx>405)&(yy<474))
        hm=cv2.erode(hm.astype('uint8'),np.ones((3,3),np.uint8)).astype(bool)
        hair.append(atlas.tile(extend_color(im,hm)))
        if k==2:continue
        ok=(r-g>22)&(r-b>41)&(yy>178)&(yy<590)
        if k==0:
            for outline in [[(264,300),(285,284),(348,297),(357,315),(338,344),(290,347),(271,333)],[(392,312),(401,295),(457,284),(482,303),(469,331),(451,343),(404,344)],[(327,434),(420,434),(420,476),(327,476)]]:
                region=np.zeros_like(r,np.uint8);cv2.fillPoly(region,[np.int32(outline)],1);ok|=region.astype(bool)
        else:
            ear=np.zeros_like(r,np.uint8);cv2.ellipse(ear,(298,355),(27,45),-18,0,360,1,-1);ok|=ear.astype(bool)
        skin.append(atlas.tile(extend_color(im,ok)))
    # The occiput and throat have skin without any facial features printed on them.
    y,x=np.mgrid[0:256,0:256];skin_tone=source[0][352:401,302:340].mean(axis=(0,1))
    tone=skin_tone[None,None,:]+(5.5*np.cos((x/255-.35)*np.pi)+3.5*np.sin(y/255*np.pi))[...,None]*[1,.85,.75]
    return hair,skin,atlas.tile(np.uint8(tone))


def facial_mesh(geo,bone,skin,tone):
    obj=(Path(__file__).parent/'reference/canonical_face_model.obj').read_text().splitlines()
    ref=np.array([list(map(float,l.split()[1:4])) for l in obj if l.startswith('v ')])
    faces=np.array([[int(p.split('/')[0])-1 for p in l.split()[1:4]] for l in obj if l.startswith('f ')])
    # Each landmark has a position in the front drawing and a depth measured across the profile drawing.
    center={10:(371,220,479),9:(371,287,503),168:(371,316,505),6:(371,339,508),195:(371,370,521),
            4:(371,399,534),1:(371,407,532),2:(371,416,502),13:(371,448,513),14:(371,453,511),17:(371,467,504),199:(371,493,499),152:(371,519,475)}
    pairs=[(33,263,94,322,439),(133,362,31,335,480),(159,386,60,319,466),(145,374,60,341,467),
           (70,300,103,303,432),(105,334,69,291,457),(107,336,24,302,490),
           (98,327,24,408,488),(61,291,41,449,476),(127,356,128,311,320),
           (234,454,127,355,307),(93,323,123,389,311),(58,288,111,438,348),
           (172,397,90,469,373),(149,378,47,501,431)]
    for left,right,dx,y,depth in pairs:center[left]=(371-dx,y,depth);center[right]=(371+dx,y,depth)
    ids=list(center);target=np.array(list(center.values()),float);target[:,0]-=FRONT_X;target[:,2]-=SIDE_X
    # Geometry follows both drawings. UV coordinates follow only the registered frontal features.
    points=RBFInterpolator(ref[ids],target,smoothing=.12)(ref)
    tex=unwrap(points,0,skin[0]);w=[(bone,1)]
    # The canonical topology leaves the eye and mouth apertures open. A recessed iris/lip surface
    # closes each small loop and carries the selected neutral expression across it.
    edges={}
    for face in faces:
        for a,b in zip(face,np.roll(face,-1)):
            key=(min(a,b),max(a,b));edges[key]=None if key in edges else (a,b)
    pairs={a:b for edge in edges.values() if edge is not None for a,b in [edge]}
    loops=[]
    while pairs:
        start=next(iter(pairs));loop=[start];end=pairs.pop(start)
        while end!=start and end in pairs:loop.append(end);end=pairs.pop(end)
        loops.append(loop)
    hull=max(loops,key=lambda ring:np.ptp(points[ring,1])*np.ptp(points[ring,0]))
    for ring in loops:
        if ring is hull:continue
        c=points[ring].mean(axis=0);c[2]-=.75;idx=len(points);points=np.vstack([points,c]);tex=np.vstack([tex,unwrap(c[None,:],0,skin[0])]);faces=np.vstack([faces,[(b,a,idx) for a,b in zip(ring,np.roll(ring,-1))]])
    add_surface(geo,points,faces,tex,w)
    # Join the underside of the jaw to the throat. The cheek surface alone leaves a gap below the chin in profile.
    for a,b in zip(hull,np.roll(hull,-1)):
        side=points[[a,b]]
        if np.min(side[:,1])<416:continue
        loops=[]
        for t in np.linspace(0,1,7):
            q=side.copy();q[:,0]*=1-.43*t;q[:,1]+=17*t+5*np.sin(t*np.pi);q[:,2]=side[:,2]*(1-.79*t)-18*t
            loops.extend(q)
        q=np.asarray(loops);hues=np.stack(tone(np.clip(.5+q[:,0]/310,0,1),np.linspace(.30,.88,len(q))),axis=1)
        add_surface(geo,q,indices(2,7)[:,::-1],hues,w)


def volumes(geo,uv,rows,weights,view,plain=False):
    n=65;level=np.linspace(0,len(rows)-1,4*len(rows));a=np.linspace(-np.pi,np.pi,n);A,S=np.meshgrid(a,level)
    y,rx,rf,rb,cz=(np.interp(S,np.arange(len(rows)),col) for col in np.array(rows).T)
    z=cz+np.where(np.cos(A)>0,rf,rb)*np.cos(A);x=rx*np.sin(A);P=np.stack([x,y,z],axis=-1)
    points=P.reshape(-1,3)
    tex=np.stack(uv(((A+np.pi)/(2*np.pi)).ravel(),(S/(len(rows)-1)).ravel()),axis=1) if plain else unwrap(points,view,uv[view])
    add_surface(geo,points,indices(n,len(level)),tex,weights)


def ears(geo,bone,skin):
    for sign in [-1,1]:
        pts=[];tex=[];n=49;levels=[(.035,-8),(.30,-8),(.52,-2),(.70,-3),(.83,5),(.94,8),(1.,1),(.95,-8),(.72,-18),(.1,-22)]
        for radius,elev in levels:
            for a in np.linspace(0,2*np.pi,n):
                y=355+47*radius*np.sin(a);z=-10+31*radius*np.cos(a)-9*radius*np.sin(a)
                x=sign*(139+1.15*elev-6.5*radius*np.cos(a));pts.append([x,y,z]);tex.append(skin[1]((SIDE_X+z)/691,y/608))
        f=indices(n,len(levels));f=f if sign<0 else f[:,::-1]
        add_surface(geo,np.array(pts),f,np.array(tex),[(bone,1)])


def crown(geo,uv,bone):
    n,m=81,31;u,v=np.meshgrid(np.linspace(-np.pi,np.pi,n),np.linspace(0,1,m));front=np.maximum(0,np.cos(u));back=np.maximum(0,-np.cos(u))
    hem=307-66*front**1.4+169*back**1.2+5*np.sin(4*u);y=66+(hem-66)*v
    rx=np.interp(y,[65,100,147,222,293,363,420,455,483],[12,86,139,168,169,155,129,110,80]);rz=np.interp(y,[65,100,147,222,293,363,415,453,483],[14,90,140,166,172,165,145,119,85]);ripple=1+.018*np.sin(9*u+v*2.2)
    p=np.stack([rx*np.sin(u)*ripple-4,y,-7+rz*np.cos(u)*ripple],axis=-1)
    # The cap supplies the continuous mass under the individually sculpted locks.
    for lo,hi,view in [(0,13,2),(13,30,1),(30,51,0),(51,68,1),(68,81,2)]:
        piece=p[:,max(0,lo-1):hi];verts=piece.reshape(-1,3)
        add_surface(geo,verts,indices(piece.shape[1],m),unwrap(verts,view,uv[view]),[(bone,1)])


def lock(geo,coords,ctrl,width,depth,view,bone):
    ctrl=np.asarray(ctrl,float);t=np.linspace(0,1,22);u=np.linspace(0,2*np.pi,13);s=1-t
    path=s[:,None]**3*ctrl[0]+3*(s*s*t)[:,None]*ctrl[1]+3*(s*t*t)[:,None]*ctrl[2]+t[:,None]**3*ctrl[3]
    tangent=norm(np.gradient(path,axis=0));radial=norm((path-[0,279,-12])*[1,.9,.93]);cross=norm(np.cross(tangent,radial));out=norm(np.cross(cross,tangent))
    thick=np.interp(t,[0,.16,.38,.61,.84,.96,1],[.28,.8,1,.89,.47,.16,.015]);w=width*thick;h=depth*thick
    # A gently ridged, lenticular section gives each strand both thickness and an intentional lit plane.
    cs=np.cos(u);sn=np.sin(u);P=path[:,None,:]+cross[:,None,:]*(w[:,None]*cs)[...,None]+out[:,None,:]*(h[:,None]*np.sign(sn)*np.abs(sn)**1.38)[...,None]
    verts=P.reshape(-1,3);add_surface(geo,verts,indices(len(u),len(t))[:,::-1],unwrap(verts,view,coords[view]),[(bone,1)])


def sculpt_hair(geo,coords,bone):
    crown(geo,coords,bone)
    # A lock is guided on one drawing but curves around the skull in its third dimension.
    def front(x,y,raised=0):
        width=np.interp(y,[34,80,145,220,300,400],[88,135,173,190,183,136]);r=np.interp(y,[34,80,145,220,300,400],[48,100,150,175,169,112]);xx=x-371
        return [xx,y, -8+r*np.sqrt(max(.075,1-(xx/width)**2))+raised]
    front_locks=[
        ([(429,150),(430,193),(400,237),(356,316)],27,13), ([(407,147),(383,203),(354,278),(281,296)],35,19),
        ([(400,144),(360,177),(310,261),(222,276)],37,20), ([(391,140),(328,165),(265,237),(171,216)],32,18),
        ([(378,137),(321,123),(233,221),(143,185)],33,21), ([(354,143),(320,116),(236,156),(177,91)],26,18),
        ([(345,126),(310,84),(273,116),(261,47)],21,15), ([(402,137),(413,92),(403,44),(349,34)],16,14),
        ([(424,151),(452,113),(490,102),(521,129)],19,13), ([(431,163),(471,133),(491,192),(561,162)],29,17),
        ([(435,172),(480,165),(514,263),(591,248)],32,18), ([(445,189),(468,218),(484,291),(527,300)],28,15),
        ([(453,207),(491,248),(476,333),(492,365)],19,12), ([(307,218),(259,253),(234,328),(264,369)],23,12),
        ([(290,240),(248,268),(206,327),(169,319)],22,13), ([(258,222),(220,260),(164,278),(116,246)],21,15)]
    for i,(points,width,thick) in enumerate(front_locks):
        lock(geo,coords,[front(x,y,z) for (x,y),z in zip(points,[-13,0,4,3])],width,thick,0,bone)
    # Crown, temple and occipital layers continue all the way around the nape.
    for layer,(count,y0,y1,maxw) in enumerate([(12,105,285,37),(13,183,370,35),(12,255,439,30),(11,327,480,25)]):
        for k in range(count):
            a=2*np.pi*(k+.34*(layer%2))/count;frontness=np.cos(a)
            if frontness>.58 or (layer>=2 and frontness>-.50):continue
            side=np.sin(a);back=max(0,-frontness);curl=.22*np.sin(2*a+.8)+.15*(1 if side>=0 else -1)
            tip=y1+(16*np.sin(k*2.4+layer))-(1-back)*(27 if layer>1 else 13)
            def on(angle,y,push):
                rx=np.interp(y,[75,125,185,265,330,405,495],[88,139,171,183,164,127,78]);rz=np.interp(y,[75,125,185,265,330,405,495],[80,128,157,170,156,125,70]);return [(rx+push)*np.sin(angle),y,-8+(rz+push)*np.cos(angle)]
            ctrl=[on(a-.23,y0,-6),on(a-.13,y0+(tip-y0)*.36,11),on(a+.10,y0+(tip-y0)*.81,13),on(a+curl,tip+(5 if layer==3 else -5),16 if layer<2 else 8)]
            lock(geo,coords,ctrl,maxw*(.9+.09*np.cos(k)),14 if layer<3 else 10,2 if back>.64 else 1,bone)
    side_locks=[([(339,131),(284,107),(223,156),(159,91)],27), ([(357,144),(304,171),(199,231),(110,176)],34),
                ([(345,168),(282,211),(184,280),(85,245)],32), ([(301,216),(239,265),(204,324),(122,297)],25),
                ([(262,250),(220,296),(189,370),(126,354)],26), ([(255,299),(213,349),(198,423),(164,412)],24),
                ([(270,351),(225,385),(232,453),(210,470)],20), ([(401,210),(390,278),(367,331),(403,367)],17)]
    for side in [-1,1]:
        for ctrl,width in side_locks:
            points=[]
            for (x,y),raise_by in zip(ctrl,[-10,3,5,7]):
                z=x-SIDE_X;rz=np.interp(y,[75,135,210,310,390,475],[110,160,177,183,144,96]);rx=np.interp(y,[75,135,210,310,390,475],[102,154,176,174,143,104]);
                points.append([side*(rx*np.sqrt(max(.07,1-((z+8)/rz)**2))+raise_by),y,z])
            lock(geo,coords,points,width,13,1,bone)


def build_portrait(bones):
    atlas=Atlas(2160,1860);hair_uv,skin_uv,skin_tone=sample_sources(atlas);face=Geometry();hair=Geometry();head=bones['Head']
    # The neck and posterior skull have their own cross sections; the jaw ends in front of the throat.
    neck=[(433,53,52,51,-8),(485,64,62,65,-9),(519,66,67,70,-6),(553,70,74,72,-6),(588,89,83,81,-5),(640,120,95,96,-4)]
    volumes(face,skin_tone,neck,[(head,.72),(bones['Chest'],.28)],0,True)
    skull=[(102,9,9,14,-5),(146,78,65,94,-14),(205,111,78,133,-15),(280,129,91,156,-15),(333,128,86,157,-14),(379,121,78,145,-14),(427,108,67,113,-14),(469,79,56,82,-7),(492,55,46,53,0)]
    volumes(face,skin_tone,skull,[(head,1)],0,True);facial_mesh(face,head,skin_uv,skin_tone);ears(face,head,skin_uv);sculpt_hair(hair,hair_uv,head)
    return [('YouthPortrait',face),('SculptedHair',hair)],atlas.canvas
