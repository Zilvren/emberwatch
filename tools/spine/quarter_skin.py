"""Build editable three-quarter cutout attachments from the existing character paintings."""
from pathlib import Path
import math

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from functools import lru_cache

ROOT = Path(__file__).resolve().parents[2]
CHARACTER = ROOT / "art-source/ashen-labyrinth/battle-survivor"
PROJECT = CHARACTER / "spine-flick-golden"
R3_PARTS = CHARACTER / "spine/parts"
W, H = 1024, 1536
GRID = 24
SCALE = .30
ORIGIN = np.array((505.0, 1503.0))

from turnaround_surfaces import mounted_portrait, face_vertices, JAW_Y
from three_quarter_body import (
    body_assets, scarf_occlusion, registered_support, clean_alpha,
    RIGHT_ELBOW, RIGHT_WRIST, RIGHT_KNUCKLE, LEFT_ELBOW, LEFT_WRIST,
)

def world(p):
    return (np.asarray(p, dtype=float) - ORIGIN) * [SCALE, -SCALE]


def rotation(degrees):
    a = math.radians(degrees)
    return np.array(((math.cos(a), -math.sin(a)), (math.sin(a), math.cos(a))))


def layer(picture, mask):
    img=picture.copy()
    img[:,:,3]=((img[:,:,3].astype(np.uint16)*mask.astype(np.uint16)+127)//255).astype(np.uint8)
    img[img[:,:,3]==0]=0
    return img


class MountedSkin:
    def __init__(self, doc, bind, directory):
        self.doc=doc
        self.bind=bind
        self.dir=directory
        self.ats=doc["skins"][0]["attachments"]
        self.index={b["name"]:i for i,b in enumerate(doc["bones"])}
        self.active={}
        self.stats={}

    def mesh(self,name,slot,rgba,weights):
        """Triangulate on one world-aligned grid. Adjacent pieces share seam vertices."""
        a=rgba[:,:,3]
        ys,xs=np.where(a>0)
        if ys.size==0:
            raise ValueError(f"Empty attachment {name}")
        x0=max(0, (int(xs.min())//GRID)*GRID)
        y0=max(0, (int(ys.min())//GRID)*GRID)
        x1=min(W, (int(xs.max())//GRID+1)*GRID)
        y1=min(H, (int(ys.max())//GRID+1)*GRID)
        patch=Image.fromarray(rgba[y0:y1,x0:x1])
        # Texture sampling is independent of the rig's world coordinate scale.
        w,h=patch.size
        ratio=min(1,992/max(w,h))
        if ratio<1: patch=patch.resize((round(w*ratio),round(h*ratio)),Image.Resampling.LANCZOS)
        patch.save(self.dir/(name+".png"),optimize=True)
        uvs,verts,tris=[],[],[]
        indices={}
        def vertex(x,y):
            key=(x,y)
            if key in indices:return indices[key]
            i=len(indices);indices[key]=i
            uvs.extend((round((x-x0)/w,6),round((y-y0)/h,6)))
            p=world((x,y))
            factors={n:float(a) for n,a in weights(x,y).items() if a>.0002}
            total=sum(factors.values())
            if total<=0:raise ValueError(f"Unbound vertex {name} {key}")
            verts.append(len(factors))
            for bone,amount in factors.items():
                loc=self.bind[bone].local(p)
                verts.extend((self.index[bone],round(loc[0],4),round(loc[1],4),round(amount/total,6)))
            return i
        for y in range(y0,y1,GRID):
            for x in range(x0,x1,GRID):
                x2,y2=min(x1,x+GRID),min(y1,y+GRID)
                if not a[y:y2,x:x2].any():continue
                tl,tr,br,bl=vertex(x,y),vertex(x2,y),vertex(x2,y2),vertex(x,y2)
                tris.extend((tl,bl,tr,tr,bl,br))
        attachment={"type":"mesh","path":name,"uvs":uvs,"triangles":tris,"vertices":verts,
                    "width":patch.width,"height":patch.height}
        self.ats.setdefault(slot,{})[name]=attachment
        self.active[slot]=name
        self.stats[name]={"slot":slot,"sourceBounds":[x0,y0,x1,y1],"texels":patch.size,
                          "vertices":len(indices),"triangles":len(tris)//3}
        return attachment

    def region(self,name,slot,path,width,height,local_xy,rot=0,scale=1):
        self.ats.setdefault(slot,{})[name]={"path":path,"width":width,"height":height,
            "x":round(local_xy[0],5),"y":round(local_xy[1],5),
            "rotation":round(rot,5),"scaleX":round(scale,6),"scaleY":round(scale,6)}
        self.active[slot]=name


def mount_head(skin):
    # A single rest mesh preserves the three-quarter drawing. Extra vertices
    # below the eyes give the cheeks and jaw volume without moving the features.
    image,box=mounted_portrait()
    name,slot="golden-head","q-face-art"
    image.save(skin.dir/(name+".png"),optimize=True)
    x0,y0,x1,y1=box
    xs=sorted(set([x0,x1,395,710,732,760,860,867,890,981,*range(414,978,17)]))
    ys=sorted(set([y0,y1,554,572,594,606,690,715,727,753,779,887,*JAW_Y,*range(602,886,17)]))
    vertices=[];uv=[];tri=[]
    for j,y in enumerate(ys):
        for i,x in enumerate(xs):
            vertices.extend(np.round(skin.bind["head"].local(world(face_vertices(x,y))),5))
            uv.extend((round((x-x0)/(x1-x0),6),round((y-y0)/(y1-y0),6)))
            if i and j:
                br=j*len(xs)+i;bl=br-1;tr=br-len(xs);tl=tr-1
                tri.extend((tl,bl,tr,tr,bl,br))
    skin.ats[slot]={name:{"type":"mesh","path":name,"uvs":uv,
        "triangles":tri,"vertices":vertices,
        "width":image.width,"height":image.height}}
    skin.active[slot]=name


RELEASE_WRIST = np.array([388.,214.])
GLOVE_UNIT = 1.38*SCALE


@lru_cache(maxsize=1)
def release_hand():
    """A dorsal right glove: short radial thumb above the four flexed fingers."""
    original=clean_alpha(np.array(Image.open(PROJECT/"reference/right-wrist-release.png").convert("RGBA")))
    grip=registered_support()
    rgb=original[:,:,:3].astype(np.float32)
    def tone(source,box):
        x,y,x2,y2=box
        return np.median(source[y:y2,x:x2,:3],axis=(0,1))
    # Register the same glove leather and skin once, before packing. Frame
    # playback only changes pose; it never tints the fingers.
    leather=np.clip(tone(grip,(458,225,492,249))-tone(original,(387,300,623,453)),-13,13)
    skin=np.clip(tone(grip,(439,184,442,195))-tone(original,(1210,500,1250,533)),-6,6)
    bare=np.clip((rgb[:,:,0]-rgb[:,:,2]-23)/33,0,1)[:,:,None]
    original[:,:,:3]=np.rint(np.clip(rgb+(1-bare)*leather+bare*skin,0,255)).astype(np.uint8)
    raw=Image.fromarray(original)
    scale=.073
    small=raw.resize((round(raw.width*scale),round(raw.height*scale)),Image.Resampling.LANCZOS)
    hand=Image.new("RGBA",(512,512))
    hand.paste(small,tuple(np.rint(RELEASE_WRIST-scale*np.array((184,386))).astype(int)))
    return hand


def glove_contact(hand,relative_angle):
    # Use the outside edge of the grouped finger pads against the trailing
    # side of the paper. Keep the palm clear of the middle of the back.
    y,x=np.where(np.asarray(hand.getchannel("A"))>134)
    fingers=(x>=RELEASE_WRIST[0]+36)&(y>=RELEASE_WRIST[1]-2)
    local=(np.column_stack((x[fingers]+.5,y[fingers]+.5))-RELEASE_WRIST)*[GLOVE_UNIT,-GLOVE_UNIT]
    span=(local@rotation(relative_angle).T)[:,0]
    return local[span>=span.max()-.24].mean(axis=0)


def add_flicking_hand(skin, support_hand):
    """Both painted aspects of the same glove share its wrist and turn mesh."""
    wrist=RELEASE_WRIST
    unit=GLOVE_UNIT
    open_face=release_hand()
    bounds=open_face.getchannel("A").getbbox()
    palm=open_face.crop(bounds)
    support_hand=Image.fromarray(support_hand)
    support_bounds=support_hand.getchannel("A").getbbox()
    support_hand=support_hand.crop(support_bounds)
    frame=skin.bind["near-hand"]
    def support_local(pixels):
        return (world(pixels)-frame.p) @ frame.inverse.T
    def support_pixel(local):
        return ORIGIN+(frame.p+local@frame.m.T)*[1/SCALE,-1/SCALE]
    def open_local(pixels):return (pixels-wrist)*[unit,-unit]
    def open_pixel(local):return wrist+local*[1/unit,-1/unit]
    faces=[
        ("quarter-cheek-hand","q-near-knuckles-art",support_hand,support_bounds,support_local,support_pixel),
        ("quarter-flick-palm","q-near-fist-art",palm,bounds,open_local,open_pixel),
    ]
    outlines=[]
    for name,slot,surface,box,to_local,to_pixel in faces:
        pad=12
        image=Image.new("RGBA",(surface.width+2*pad,surface.height+2*pad))
        image.paste(surface,(pad,pad))
        image.save(skin.dir/(name+".png"),optimize=True)
        origin=np.array(box[:2],dtype=float)-pad
        y,x=np.where(np.asarray(image.getchannel("A"))>9)
        sample=to_local(np.column_stack((x+.5,y+.5))+origin)
        centre=sample.mean(axis=0)
        directions=np.arange(48)*2*np.pi/48
        ray_angles=np.arctan2(sample[:,1]-centre[1],sample[:,0]-centre[0])
        radii=np.linalg.norm(sample-centre,axis=1)
        rim=[]
        for theta in directions:
            within=abs((ray_angles-theta+np.pi)%(2*np.pi)-np.pi)<np.pi/30
            radius=radii[within].max()+.62
            rim.append(np.array((np.cos(theta),np.sin(theta)))*radius)
        rim=np.array(rim)
        geometry=np.vstack((centre,centre+.52*rim,centre+rim))
        uv=np.clip((to_pixel(geometry)-origin)/[image.width,image.height],0,1)
        triangles=[]
        for i in range(48):
            j=(i+1)%48
            triangles.extend((0,1+i,1+j,1+i,49+i,49+j,1+i,49+j,1+j))
        skin.ats.setdefault(slot,{})[name]={"type":"mesh","path":name,"uvs":uv.round(6).ravel().tolist(),
            "vertices":geometry.round(5).ravel().tolist(),"triangles":triangles,
            "width":image.width,"height":image.height}
        skin.active[slot]=name
        outlines.append(geometry)
    # Both views follow the same outline through the wrist roll. The upper
    # image replaces the lower one without leaving a second hand silhouette.
    skin.palm_delta=(outlines[1]-outlines[0]).ravel()
    # The rounded R3 shoulder and closed elbow bridge the areas that emerge
    # from beneath the cape. Register the near side's weave to its own cloth.
    for slot,name,begin,finish,width in [
        ("q-near-upper-art","golden-inner-sleeve",(116,43),(109,319),.181),
        ("q-left-upper-art","cast-sleeve",(117,44),(111,314),.166),
    ]:
        source=Image.open(R3_PARTS/"cast-sleeve.png").convert("RGBA")
        w,h=source.size
        if name=="golden-inner-sleeve":
            surface=np.array(source); rgb=surface[:,:,:3].astype(float)
            iy,ix=np.mgrid[:h,:w]
            # Only the dyed outer sleeve receives the near-side cloth pigment.
            purple=(surface[:,:,3]>0)&(rgb[:,:,2]>=rgb[:,:,0]-1)&(iy<.8*h)
            raw=np.array(Image.open(PROJECT/"reference/body-think-three-quarter.png").convert("RGB"))
            weave=raw[np.rint(323+iy*.24).astype(int),np.rint(337+ix*.40).astype(int)].astype(float)
            average=cv2.GaussianBlur(weave,(0,0),9)
            shade=(rgb[purple].mean(axis=1)/np.median(rgb[purple].mean(axis=1))).clip(.64,1.38)
            dye=np.median(weave[purple],axis=0)
            corrected=dye*shade[:,None]*np.clip((weave[purple]+4)/(average[purple]+4),.91,1.09)
            surface[purple,:3]=np.rint(rgb[purple]*.22+corrected*.78).clip(0,255).astype(np.uint8)
            Image.fromarray(surface).save(skin.dir/(name+".png"),optimize=True)
        corners=np.array([[0,0],[w,0],[w,h],[0,h]],dtype=float)
        start,end=np.array(begin,float),np.array(finish,float)
        axis=end-start; L=np.linalg.norm(axis);axis/=L
        delta=corners-start
        vertex=np.column_stack((delta@axis*(63.57/L),delta@np.array((axis[1],-axis[0]))*width))
        skin.ats[slot]={name:{"type":"mesh","path":name,"uvs":[0,0,1,0,1,1,0,1],
            "triangles":[0,2,1,0,3,2],"vertices":vertex.round(5).ravel().tolist(),
            "width":w,"height":h}}
        skin.active[slot]=name
        if slot=="q-near-upper-art":
            skin.ats["q-near-under-sleeve"]={name:skin.ats[slot][name].copy()}
            skin.active["q-near-under-sleeve"]=name


def ease(low,high,v):
    t=np.clip((v-low)/(high-low),0,1)
    return t*t*(3-2*t)


def mix(a,b,t):
    result={n:v*(1-t) for n,v in a.items()}
    for n,v in b.items():result[n]=result.get(n,0)+t*v
    return result


def fixed(bone):return lambda x,y:{bone:1.}


def fabric_weights(x,y):
    # Blending to a forward chest surface and both shoulders models the volume of
    # the barrel. The hem and pelvis have their own delayed movement.
    span=ease(340,684,x)
    centre=1-abs(2*span-1)
    chest=mix({"q-right-chest":1-span,"q-left-chest":span},{"chest":1},.62*centre)
    chest=mix(chest,{"chest":1},(1-ease(300,392,y))*.88)
    waist=mix(chest,{"hips":1},ease(470,654,y))
    if y<=626:return waist
    tail=mix({"coat-skirt":1},{"coat-skirt-tip":1},ease(732,1090,y))
    if x<350:tail=mix(tail,{"back-flap-tip":1},(1-ease(268,350,x))*ease(775,1030,y))
    return mix(waist,tail,ease(626,800,y))


def leg_weights(x,y,side):
    thigh,shin,boot=side+"-thigh",side+"-shin",side+"-boot"
    knee=1060 if side=="near" else 1034
    ankle=1350 if side=="near" else 1328
    hip=mix({"hips":1},{thigh:1},ease(755,872,y))
    bent=mix(hip,{shin:1},ease(knee-74,knee+75,y))
    return mix(bent,{boot:1},ease(ankle-78,ankle+46,y))


def projected_arm_weights(x,y,arm):
    elbow=np.asarray(LEFT_ELBOW);wrist=np.asarray(LEFT_WRIST)
    v=wrist-elbow;u=(np.array((x,y))-elbow)@v/(v@v)
    return mix({arm:1},{"q-left-cuff":1},float(np.clip(u,0,1)))


def build_skin(skin, directory):
    base,labels,near,far,support_hand,left_palm=body_assets()
    # The reprojected material IDs come from the same UVs as their colours.
    # Extend the nearest body label through transparent space for edge weights.
    edges=distance_transform_edt(base[:,:,3]<8,return_distances=False,return_indices=True)
    labels=labels[edges[0],edges[1]]
    # These IDs follow the visible seams of the same painted three-quarter pose.
    fields=[
        fabric_weights,lambda x,y:leg_weights(x,y,"far"),lambda x,y:leg_weights(x,y,"near"),
        fabric_weights,lambda x,y:mix(fabric_weights(x,y),{"head":1},.22*(1-ease(245,333,y))),
        fixed("head"),lambda x,y:mix(fabric_weights(x,y),{"ration-bag":1},.5*ease(662,778,y)),
        fixed("card-case"),
        lambda x,y:mix(fabric_weights(x,y),{"near-sleeve":1},.12*ease(330,485,y)),
    ]
    # All cuts sample the same bind field on the same grid. In particular the
    # tunic and trouser share their seam as the planted knees bend. A hard
    # material-specific weight boundary tears open the space behind the hem.
    fields_at_point={}
    probabilities=np.stack([cv2.GaussianBlur((labels==i).astype(np.float32),(0,0),22)
                            for i in range(len(fields))])
    def stitched(x,y):
        peg=(x,y)
        if peg not in fields_at_point:
            blend_weights={}
            for index,p in enumerate(probabilities[:,min(y,H-1),min(x,W-1)]):
                if p<=.0003:continue
                for n,v in fields[index](x,y).items():
                    blend_weights[n]=blend_weights.get(n,0)+p*v
            fields_at_point[peg]=blend_weights
        return fields_at_point[peg]
    # Extend two source pixels behind each adjacent piece. This avoids a soft
    # hairline along an internal cut after filtering and weighted movement.
    def tex(label):
        m=cv2.dilate((labels==label).astype(np.uint8)*255,np.ones((5,5),np.uint8))
        return layer(base,m)
    for label,name,slot in [(1,"far-leg","far-leg"),(2,"near-leg","near-leg"),(0,"tunic","tunic"),
                            (3,"mantle","mantle"),(8,"near-mantle","near-mantle"),
                            (6,"satchel","satchel"),(7,"card-case","case")]:
        skin.mesh("quarter-"+name,"q-"+slot+"-art",tex(label),stitched)
    skin.mesh("quarter-scarf","q-head-art",layer(tex(4),scarf_occlusion()),stitched)
    mount_head(skin)
    # The forearm overlaps the closed elbow of the upper sleeve. The entire
    # glove rolls from its wrist, with all its fingertips remaining together.
    elbow=np.asarray(RIGHT_ELBOW);wrist=np.asarray(RIGHT_WRIST);v=wrist-elbow
    def near_forearm(x,y):
        u=float(np.clip((np.array((x,y))-elbow)@v/(v@v),0,1))
        return mix({"near-bracer":1},{"q-right-cuff":1},u)
    skin.mesh("quarter-right-arm","q-near-arm-art",near,near_forearm)
    add_flicking_hand(skin,support_hand)
    skin.mesh("quarter-left-inner-wrap","q-left-wrap",far,
              lambda x,y:projected_arm_weights(x,y,"cast-bracer"))
    skin.mesh("quarter-left-cup","q-left-cup",left_palm,fixed("cast-palm"))
    Image.fromarray(base).resize((460,690),Image.Resampling.LANCZOS).save(directory/"backplate-check.png")

