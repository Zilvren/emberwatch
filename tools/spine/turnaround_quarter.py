"""Reproject the approved orthographic paintings into the Spine mounting canvas."""
from functools import lru_cache
from pathlib import Path
import hashlib
import json
import math

import cv2
import numpy as np
from PIL import Image
from turnaround_surfaces import front_materials


ART = Path(__file__).resolve().parents[2]/"art-source/ashen-labyrinth/battle-survivor"
GUIDES = ART/"model/depth-guides"
SOURCE_HASH = "8a41f4aca887b4132bd2156dc8ecaf456aff68e76c96051ba3d698f3f801cdf4"
MAG = 1.62
FLOOR = 1500
CENTER = 492.
ANGLE = 33.
HEIGHT, WIDTH = 1536, 1024


def arm_mask(x,y):
    """The hanging forearms in the front source will be replaced by posed limbs."""
    cuts = np.zeros(x.shape,np.uint8)
    # Coordinates in the 1585 x 992 registration of the original painting.
    outlines = [
        [(192,345),(205,340),(216,337),(230,343),(221,379),(216,399),
         (200,416),(195,440),(192,468),(196,485),(200,506),(196,530),
         (187,547),(147,546),(145,387),(158,385),(170,366)],
        [(381,339),(399,325),(414,319),(426,321),(438,338),(447,374),
         (455,413),(458,505),(452,548),(402,548),(407,504),(407,477),
         (403,456),(398,443),(393,416),(386,395),(386,384),(379,372)],
    ]
    sx=x[0,1]-x[0,0]
    sy=y[1,0]-y[0,0]
    for polygon in outlines:
        xy=np.array(polygon,dtype=float)
        xy[:,0]=(xy[:,0]-x[0,0])/sx
        xy[:,1]=(xy[:,1]-y[0,0])/sy
        cv2.fillPoly(cuts,[np.rint(xy).astype(np.int32)],255)
    return cuts>0


@lru_cache(maxsize=1)
def registered():
    master=ART/"turnaround-golden-master.png"
    guide=json.loads((GUIDES/"guide.json").read_text(encoding="utf-8"))
    if hashlib.sha256(master.read_bytes()).hexdigest()!=SOURCE_HASH:
        raise ValueError("The calibrated UVs belong to the golden-waist master.")
    rgb=np.array(Image.open(master).convert("RGB"))
    return rgb,guide


def source(view, remove_arms):
    rgb,guide=registered()
    x0,y0,w,h=guide["views"]["body-"+view]["cropXYWH"]
    depth=cv2.imread(str(GUIDES/("body-"+view+"-16.png")),cv2.IMREAD_UNCHANGED)
    if depth is None or depth.shape!=(h,w) or depth.dtype!=np.uint16:
        raise ValueError("Invalid registered surface "+view)
    # Work at two original review pixels per unit. Higher resolution colour is
    # sampled from the master after the visibility test, without relighting.
    dw,dh=round(w*1984/rgb.shape[0]),1984
    table=cv2.resize(depth,(dw,dh),interpolation=cv2.INTER_NEAREST)
    yy,xx=np.mgrid[:dh,:dw].astype(np.float32)
    mx=x0+(xx+.5)*w/dw-.5
    my=y0+(yy+.5)*h/dh-.5
    x=(mx+.5)*1585/rgb.shape[1]-.5
    y=(my+.5)*992/rgb.shape[0]-.5
    painted=table!=0
    # The registered depth describes large volumes. Wrinkles, irises and lip
    # lines belong to the pigment and should travel together on those volumes.
    den=cv2.GaussianBlur(painted.astype(np.float32),(0,0),14)
    units=(((table.astype(np.float32)-1)/65534)-.5)*.44*907
    depth=cv2.GaussianBlur(np.where(painted,units,0),(0,0),14)/np.maximum(den,.0001)
    valid=painted.copy()
    # The depth pass omits a few flecks inside the hair and face. The RGB master
    # is continuous there. Only restore enclosed holes smaller than a brush tip.
    count,labels,stats,_=cv2.connectedComponentsWithStats((~valid).astype(np.uint8))
    for i in range(1,count):
        if stats[i,cv2.CC_STAT_AREA]<100: valid[labels==i]=True
    if view=="front" and remove_arms: valid &= ~arm_mask(x,y)
    return valid,depth,x,y,mx,my


def project(view, degrees, remove_arms, supersample=1.35, materials=False):
    valid,z,x,y,mx,my=source(view,remove_arms)
    a=math.radians(degrees)
    if view=="front":
        horizontal=x-308.75
        forward=z
    else:
        horizontal=-z
        forward=x-768.5
    u=(CENTER+MAG*(horizontal*math.cos(a)+forward*math.sin(a)))*supersample
    if view=="front":
        step=MAG*supersample*(x[0,1]-x[0,0])
        regular=np.empty_like(u)
        samples=np.arange(u.shape[1])
        for iy in range(u.shape[0]):
            usable=np.flatnonzero(valid[iy])
            if len(usable):
                depths=np.interp(samples,usable,z[iy,usable])
                # Most of the visible torso and the boots are broad surfaces.
                # Do not give every lace and belt loop its own depth shear.
                middle=np.median(depths[usable])
                relief=np.interp(y[iy,0],[200,400,660,810,921],[.82,.67,.57,.44,.66])
                depths=middle+(depths-middle)*relief
                row=(CENTER+MAG*(horizontal[iy]*math.cos(a)+depths*math.sin(a)))*supersample
                d=np.clip(np.diff(row),step*.76,step*1.16)
                curve=np.r_[0,np.cumsum(d,dtype=np.float64)]
                regular[iy]=curve+np.median(row[usable]-curve[usable])
            else:
                regular[iy]=(CENTER+MAG*horizontal[iy]*math.cos(a))*supersample
        # Both legs use one continuous projection even on rows where the skirt
        # splits into separate islands. The hem must not jump sideways there.
        nonempty=np.flatnonzero(valid.any(axis=1))
        regular[:nonempty[0]]=regular[nonempty[0]]
        regular[nonempty[-1]+1:]=regular[nonempty[-1]]
        u=cv2.GaussianBlur(regular,(1,0),sigmaX=0,sigmaY=6)
    depth=forward*math.cos(a)-horizontal*math.sin(a)
    sw,sh=round(WIDTH*supersample),round(HEIGHT*supersample)
    uv=np.zeros((sh,sw,2),np.float32)
    alpha=np.zeros((sh,sw),np.uint8)
    for dest in range(sh):
        sy=(dest+.5)/supersample
        sheet_y=921+(sy-FLOOR)/MAG
        iy=round((sheet_y-y[0,0])/(y[1,0]-y[0,0]))
        if iy<0 or iy>=valid.shape[0]:continue
        row=np.flatnonzero(valid[iy])
        if not len(row):continue
        groups=np.split(row,np.flatnonzero(np.diff(row)>1)+1)
        for group in sorted(groups,key=len):
            if not len(group):continue
            # The frontmost source sample owns self-occluding folds at this angle.
            us=u[iy,group]
            if view=="front":
                new=np.arange(max(0,round(us[0])),min(sw-1,round(us[-1]))+1)
                uv[dest,new,0]=np.interp(new,us,mx[iy,group])
                uv[dest,new,1]=my[iy,group[0]]
                alpha[dest,new]=255
                continue
            order=np.argsort(depth[iy,group],kind="stable")[::-1]
            pix=np.rint(us[order]).astype(np.int32)
            bins,first=np.unique(pix,return_index=True)
            columns=group[order[first]]
            new=np.arange(max(0,bins.min()),min(sw-1,bins.max())+1)
            if not len(new):continue
            uv[dest,new,0]=np.interp(new,bins,mx[iy,columns])
            uv[dest,new,1]=my[iy,columns[0]]
            alpha[dest,new]=255
    rgb,_=registered()
    color=cv2.remap(rgb,uv[:,:,0],uv[:,:,1],cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
    color[alpha==0]=0
    image=Image.fromarray(np.dstack((color,alpha))).resize((WIDTH,HEIGHT),Image.Resampling.LANCZOS)
    if not materials:return image
    sheet_x=(uv[:,:,0]+.5)*1585/rgb.shape[1]-.5
    sheet_y=(uv[:,:,1]+.5)*992/rgb.shape[0]-.5
    if view=="front":
        tags=cv2.remap(front_materials(),sheet_x*2,sheet_y*2,cv2.INTER_NEAREST)
    else:
        tags=np.where(sheet_y<153,5,np.where(sheet_y<202,4,8)).astype(np.uint8)
    return image,cv2.resize(tags,(WIDTH,HEIGHT),interpolation=cv2.INTER_NEAREST)


def mounted_body(degrees=ANGLE,remove_arms=True):
    front,front_labels=project("front",degrees,remove_arms,materials=True)
    # Use the actual right-view hair and near side of the hood where the front
    # surface turns away. Keep the facial features from a single registered view.
    side,side_labels=project("right",degrees,False,materials=True)
    a=np.asarray(front.getchannel("A"))
    b=np.array(side)
    for y in range(HEIGHT):
        valid=np.flatnonzero(a[y]>127)
        if valid.size==0 or y>535 or degrees==0:
            b[y,:,3]=0
            continue
        edge=valid[0]
        radius=np.interp(y,[0,70,230,278,360,490,535],[0,13,15,11,28,18,0])
        b[y,:max(0,round(edge-radius)),3]=0
        b[y,min(WIDTH,edge+3):,3]=0
    labels=np.where(a>48,front_labels,side_labels)
    combined=np.array(Image.alpha_composite(Image.fromarray(b),front))
    # The full-resolution head sheet is mounted independently. Keep only the
    # visible scarf and coat in this wash of body pigment.
    combined[labels==5]=0
    return Image.fromarray(combined),labels


if __name__=="__main__":
    dest=Path("temp/pose-redo")
    mounted_body()[0].save(dest/"golden-projected.png")
    project("front",0,False).save(dest/"golden-front.png")
