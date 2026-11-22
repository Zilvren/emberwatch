"""Peg whole painted poses to the turnaround, export PNGs, and pack Cocos sprite frames."""
import io
import json
import plistlib
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt


ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "art-source/ashen-labyrinth/battle-survivor/frames"
NATIVE = ROOT / "assets/ashen-survivor-frames"
WIDTH, HEIGHT = 512, 944
DESIGN_EYE = (224,99)
DESIGN_CASE = (241,378)
# One registration for the full connected drawing in each panel. The eye and
# the top of the card at the belt act as pegs, independent of hand extension.
# Rows contain the cel name, painted pupil, case peg, and fingertip when used.
SHEETS = {
    "anticipation": [
        ("inhale",(355,126),(390,526),None),
        ("lift",(901,127),(933,526),None),
        ("coil",(355,785),(388,1202),None),
        ("reach-middle",(902,785),(935,1204),None),
    ],
    "impact": [
        ("touch-low",(285,136),(316,553),(436,391)),
        ("touch-middle",(851,136),(879,553),(1131,289)),
        ("touch-high",(286,787),(319,1202),(626,862)),
        ("sweep-middle",(857,787),(884,1201),None),
    ],
    "settle": [
        ("recoil",(350,141),(353,575),None),
        ("return",(923,143),(946,575),None),
    ],
    "breakdown": [
        ("reach-low",(323,119),(354,507),None),
        ("reach-high",(866,119),(898,507),None),
        ("sweep-low",(323,727),(355,1117),None),
        ("sweep-high",(866,728),(898,1117),None),
    ],
}


def load_rgba(p):
    return np.array(Image.open(p).convert("RGBA"))


def premultiply(raw):
    out = raw.astype(np.float32)/255
    out[:, :, :3] *= out[:, :, 3:4]
    return out


def as_image(sample):
    alpha = np.clip(sample[:, :, 3:4],0,1)
    rgb = np.clip(sample[:, :, :3]/np.maximum(alpha,1/255),0,1)
    rgb[alpha[:, :, 0]<1/255] = 0
    return Image.fromarray(np.rint(np.concatenate((rgb,alpha),axis=2)*255).astype(np.uint8))


def alpha_edges(raw):
    """Drop tiny islands and borrow edge RGB from the contiguous painted shape."""
    alpha = raw[:, :, 3].copy()
    n, labels, stats, _ = cv2.connectedComponentsWithStats((alpha>72).astype(np.uint8))
    if n<2:
        raise ValueError("Empty pose on source sheet")
    subject = labels==np.argmax(stats[1:,cv2.CC_STAT_AREA])+1
    rim = cv2.dilate(subject.astype(np.uint8),np.ones((5,5),np.uint8))>0
    raw[:, :, 3] = np.where(rim & (alpha>=8),alpha,0)
    solid = subject & (alpha>230)
    edge = (raw[:, :, 3]>0) & (alpha<220)
    iy,ix = distance_transform_edt(~solid,return_distances=False,return_indices=True)
    raw[edge,:3] = raw[iy[edge],ix[edge],:3]
    return premultiply(raw)


def pose_transform(eye,case,origin=(0,0)):
    # Preserve the painted profile's orientation. A very small horizontal
    # shear pins the belt when the torso angle differs between two drawings.
    x,y = eye
    tx,ty = DESIGN_EYE
    a,b = case
    u,v = DESIGN_CASE
    scale = (v-ty)/(b-y)
    lean = (u-tx-scale*(a-x))/(b-y)
    sx,sy = origin
    return np.float32([[scale,lean,tx+scale*(sx-x)+lean*(sy-y)],
                       [0,scale,ty+scale*(sy-y)]])


def put_pose(drawing,eye,case,origin=(0,0)):
    transform = pose_transform(eye,case,origin)
    return cv2.warpAffine(alpha_edges(drawing),transform,(WIDTH,HEIGHT),flags=cv2.INTER_LINEAR)


def ease(low,high,target):
    t = np.clip((target-low)/(high-low),0,1)
    return t*t*(3-2*t)


def register_cels():
    source = load_rgba(ART/"source/profile.png")
    original = premultiply(source)
    master = put_pose(load_rgba(ART/"source/model-cel.png"),(397,172),(434,680))
    yy,xx = np.mgrid[:HEIGHT,:WIDTH].astype(np.float32)
    # Keep the original resting lower silhouette. Blend at the flat plane of
    # the hanging cloth, below both the satchel and the original lowered hand.
    feet_weight = ease(555,605,yy)[:,:,None]
    master = master*(1-feet_weight)+original*feet_weight
    # Keep the painted turnaround face on the peg. The seam curves down along
    # the neck and stays above the new knuckles.
    join = 148+13*(1-ease(212,226,xx))
    face_weight = ((1-ease(join,join+7,yy))*(1-ease(270,279,xx)))[:,:,None]
    head_hold = (yy<=152)&(xx<=270)
    def finished(pose):
        result = np.array(as_image(pose*(1-face_weight)+original*face_weight))
        result[head_hold] = source[head_hold]
        result[yy>=605] = source[yy>=605]
        return Image.fromarray(result)

    hold = master*(1-face_weight)+original*face_weight
    cels = {"think":finished(master)}
    tips = {}
    for name,panels in SHEETS.items():
        sheet=load_rgba(ART/"source"/("cel-"+name+".png"))
        height,width=sheet.shape[:2]
        for i,(key,eye,case,tip) in enumerate(panels):
            r,c = divmod(i,2)
            x,y = int(width*c/2),int(height*r/2)
            # The longest reach on the second row can cross the halfway peg.
            # Crop from a row using the gutter immediately to the right of it.
            split = int(width/2)
            if name=="impact" and r==1:
                split = 650
            if name=="breakdown":
                split = 630
            x, xmax = (0,split) if c==0 else (split,width)
            ymax = height if r else height//2
            body = put_pose(sheet[y:ymax,x:xmax].copy(),eye,case,(x,y))
            # Active drawings include both arms. Join to a hold below the
            # folded hand along the original raised waist and the case.
            waist = 397-.04*(xx-170)
            lower_weight = ease(waist-15,waist+8,yy)[:,:,None]
            upper = body*(1-lower_weight)+hold*lower_weight
            cels[key]=finished(upper)
            if tip:
                pt = pose_transform(eye,case)@(*tip,1)
                tips[key]=[round(float(n),2) for n in pt]
    return cels,tips


def frame_entry(x,y,w,h,source,offset):
    sx,sy = source
    ox,oy = offset
    return dict(frame=f"{{{{{x},{y}}},{{{w},{h}}}}}",offset=f"{{{ox},{oy}}}",
                rotated=False,sourceSize=f"{{{sx},{sy}}}")


def extrude(atlas,image,x,y):
    # Duplicate two gutter pixels so bilinear filtering never picks up a neighbour.
    padded = np.pad(np.asarray(image),((2,2),(2,2),(0,0)),mode="edge")
    atlas.paste(Image.fromarray(padded),(x-2,y-2))


def write_atlas(name,atlas,frames):
    # The editor can watch the project during export. Publish complete files
    # from an unwatched directory on the same volume.
    staging=ROOT/"temp/survivor-frames"
    staging.mkdir(parents=True,exist_ok=True)
    def publish(filename,data):
        target=NATIVE/filename
        if target.exists() and target.read_bytes()==data:
            return
        with tempfile.NamedTemporaryFile(dir=staging,delete=False) as stream:
            stream.write(data)
            temporary=Path(stream.name)
        temporary.replace(target)

    encoded=io.BytesIO()
    atlas.save(encoded,format="PNG",optimize=True)
    publish(name+".png",encoded.getvalue())
    meta = dict(format=2,realTextureFileName=name+".png",textureFileName=name+".png",
                size="{%d,%d}"%atlas.size)
    publish(name+".plist",plistlib.dumps(dict(frames=frames,metadata=meta),sort_keys=False))


def pack_poses(cels):
    # Fixed vertical shelves and horizontal trim preserve the full-cel registration.
    # Each SpriteFrame still reports the same 512×944 untrimmed rectangle.
    pages = [[]]
    x,y = 2,2
    for name,cel in cels.items():
        left,_,right,_ = cel.getbbox()
        left,right = max(0,left-2),min(WIDTH,right+2)
        cropped = cel.crop((left,0,right,HEIGHT))
        if x+cropped.width+2>1920:
            x,y = 2,y+HEIGHT+4
        if y+HEIGHT+2>2048:
            pages.append([])
            x,y = 2,2
        pages[-1].append((name,cropped,left,x,y))
        x += cropped.width+4
    files = []
    for i,page in enumerate(pages):
        file="survivor-cels" if not i else "survivor-cels-"+str(i+1)
        width=max(x+im.width+2 for _,im,_,x,_ in page)
        height=page[-1][-1]+HEIGHT+2
        atlas=Image.new("RGBA",(width,height))
        frames={}
        for name,cel,left,x,y in page:
            extrude(atlas,cel,x,y)
            offset = (left+cel.width/2-WIDTH/2,0)
            frames[name]=frame_entry(x,y,*cel.size,(WIDTH,HEIGHT),offset)
        write_atlas(file,atlas,frames)
        files.append(file)
    return files


def card_faces():
    # Reuse the paper and three symbols from the keeper's table.
    source=load_rgba(ART.parents[1]/"concepts/threshold/scene-with-selected-detail.png")[:,:,:3]
    corners=[[(790,513),(887,516),(852,595),(744,588)],
             [(946,515),(1047,520),(1033,602),(920,598)],
             [(1091,522),(1188,527),(1195,605),(1076,601)]]
    images={}
    for name,quad in zip(("lantern","guard","repel"),corners):
        dest=np.float32([(0,0),(95,0),(95,135),(0,135)])
        ink=cv2.warpPerspective(source,cv2.getPerspectiveTransform(np.float32(quad),dest),(96,136))
        alpha=np.full((136,96),255,np.uint8)
        for k in range(3):
            alpha[k,:3-k]=alpha[-1-k,:3-k]=0
            alpha[k,93+k:]=alpha[-1-k,93+k:]=0
        images[name]=Image.fromarray(np.dstack((ink,alpha)))
    return images


def main():
    images,tips=register_cels()
    cels=ART/"cels"
    cels.mkdir(exist_ok=True)
    NATIVE.mkdir(exist_ok=True)
    for name,image in images.items():
        image.save(cels/(name+".png"),optimize=True)
    atlases=pack_poses(images)
    props=Image.new("RGBA",(300,140))
    regions={}
    for i,(name,image) in enumerate(card_faces().items()):
        x,y=2+i*100,2
        extrude(props,image,x,y)
        regions[name]=frame_entry(x,y,*image.size,image.size,(0,0))
    write_atlas("survivor-props",props,regions)
    record=dict(canvas=[WIDTH,HEIGHT],baseline=919,fingers=tips,exposures=list(images),atlases=atlases)
    (ART/"registration.json").write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":
    main()
