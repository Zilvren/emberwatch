"""Bake the three-quarter acting into transparent, full-character cels."""
import argparse
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import PchipInterpolator, RBFInterpolator

from pack import ART, ROOT, WIDTH, HEIGHT, NATIVE, as_image, alpha_edges, load_rgba, pack_poses


ARTWORK = ART / "source" / "three-quarter"
DRAFT = ROOT / "temp" / "survivor-frames" / "quarter"
FPS = 25
FLOOR = 919
RELEASE = 11
PHASES = np.array([0,2,5,8,11,13,17,21,25,30],dtype=float)
XX,YY = np.meshgrid(np.arange(WIDTH,dtype=np.float32),np.arange(HEIGHT,dtype=np.float32))
ROOT_POSE = np.float32([[.58,0,-90],[0,.58,38]])
PANEL_POSE = np.float32([[.80,0,23],[0,.80,39]])


@dataclass
class Drawing:
    pixels: np.ndarray
    pegs: np.ndarray
    dim: tuple


def points(text):
    return np.float32(tuple(tuple(map(float,p.split(","))) for p in text.split()))


# These traces follow the visible cloth, wrist and fingers on the source sheets.
# The five pegs follow the sleeve root, elbow, cuff, knuckles and fingertip.
MASTER_ARM = (
    "376,451 385,427 405,411 425,399 448,387 465,367 481,340 488,319 493,302 "
    "493,282 502,257 512,245 529,240 545,235 559,236 569,243 574,258 575,274 "
    "570,289 560,301 542,314 534,335 529,352 520,380 511,406 506,425 495,451 "
    "484,466 463,494 449,510 433,512 413,506 393,488 380,477",
    "408,427 427,473 512,322 538,263 552,238",
)
LEFT_ARM = (
    "367,490 381,482 399,487 418,495 440,501 469,494 499,494 522,492 559,487 "
    "594,477 623,466 651,454 666,447 679,451 693,467 701,490 696,512 685,534 "
    "669,546 628,551 591,555 541,553 502,553 464,551 442,552 414,548 392,538 378,523 366,507"
)
POSES = {
    "lift": ("acting",0,
        "116,300 132,280 151,270 170,257 186,241 201,215 212,195 225,178 246,168 262,165 277,171 287,180 286,194 277,207 255,217 242,230 226,255 208,273 189,306 172,334 156,347 143,350 127,342 117,323",
        "136,296 150,329 216,216 247,193 270,174"),
    "coil": ("acting",1,
        "83,321 96,304 117,291 144,279 171,262 194,244 204,229 209,216 217,208 232,204 244,207 253,214 253,231 246,246 235,260 216,275 188,294 167,315 146,336 121,352 102,361 90,352 85,340",
        "111,318 112,339 207,252 229,229 244,213"),
    "gather": ("passing",1,
        "122,294 135,273 157,263 178,255 202,249 222,239 240,230 254,214 268,205 277,186 292,177 317,177 331,176 341,183 341,201 332,221 321,231 301,240 275,254 240,277 211,293 187,309 161,330 143,332 131,319",
        "147,283 167,307 266,222 303,203 330,183"),
    "drive": ("passing",2,
        "164,266 186,256 205,253 233,251 269,247 299,245 325,239 343,229 355,218 361,210 380,209 400,211 410,211 414,221 418,228 414,245 403,258 393,266 363,274 338,281 307,291 271,296 237,305 204,316 185,313 170,301 163,288",
        "184,280 235,288 343,252 381,234 409,218"),
    "touch-low": ("passing",3,
        "122,310 137,297 157,290 182,284 207,283 231,279 252,271 266,267 285,261 302,261 316,263 325,265 339,274 353,279 370,285 377,289 378,294 372,296 357,293 344,286 337,293 330,306 318,315 307,320 292,314 279,310 251,317 219,328 188,339 173,350 146,358 133,353 128,337 121,326",
        "145,320 153,337 270,293 312,286 375,291"),
    "touch-middle": ("acting",3,
        "175,226 198,212 229,207 265,206 294,201 324,196 354,189 380,182 393,176 419,173 438,173 455,174 478,174 491,177 495,182 491,187 475,190 451,188 443,198 437,207 427,217 418,228 408,226 399,221 379,226 348,232 320,239 290,249 263,258 233,266 207,272 180,273 173,262 172,246",
        "190,246 270,237 386,202 432,192 491,181"),
    "touch-high": ("passing",4,
        "185,237 204,221 225,215 259,209 293,202 326,197 351,194 370,188 391,180 405,173 425,168 442,166 452,164 470,158 480,154 485,157 484,162 478,168 465,173 451,178 449,182 460,184 462,191 455,202 449,211 438,214 426,214 408,210 391,213 362,221 327,231 291,244 256,256 222,270 197,277 175,277 172,268 178,252",
        "197,247 269,231 387,196 439,185 482,158"),
    "sweep": ("acting",4,
        "142,239 160,227 185,221 216,215 246,210 272,206 307,202 343,199 368,195 383,195 399,200 417,206 432,216 455,230 473,245 490,249 495,255 493,259 485,261 470,254 458,246 469,265 473,274 469,278 463,278 450,262 457,274 453,282 447,284 441,281 430,257 433,274 430,280 424,281 419,271 411,249 399,242 385,231 373,226 343,230 310,237 279,249 252,261 219,270 188,284 162,293 144,285 139,272",
        "157,258 228,249 388,214 432,235 487,255"),
    "back": ("passing",5,
        "114,302 125,282 148,274 172,265 199,252 222,243 237,239 256,232 271,233 288,235 309,242 324,253 334,269 332,284 327,294 321,297 312,293 303,283 306,294 299,299 292,296 281,280 270,273 254,273 237,281 214,297 187,313 168,333 146,349 128,352 117,344 111,328",
        "135,308 152,327 241,258 282,253 326,284"),
    "return": ("acting",5,
        "104,304 123,282 143,270 163,256 184,244 203,229 219,216 238,206 253,195 270,193 282,193 294,204 297,210 291,215 302,223 300,231 292,235 302,245 296,251 286,250 275,242 263,239 248,244 228,250 210,266 193,283 177,309 160,328 142,343 126,356 110,352 99,340 98,321",
        "127,312 128,333 222,243 258,220 284,209"),
}


def transform(array,matrix):
    return cv2.warpAffine(array,matrix,(WIDTH,HEIGHT),flags=cv2.INTER_LINEAR)


def into_space(p,matrix):
    return p@matrix[:,:2].T+matrix[:,2]


def matte(shape,outline,soft=.7):
    stamp=np.zeros(shape,np.uint8)
    cv2.fillPoly(stamp,[np.rint(outline*16).astype(np.int32)],255,cv2.LINE_AA,shift=4)
    return (cv2.GaussianBlur(stamp,(0,0),soft)/255).astype(np.float32)


def over(base,top):
    return top+base*(1-top[:,:,3:])


def match_underpaint(master,reveal):
    # Compare both versions where the source only underwent a value change.
    # Keep the master's palette when bringing in the newly exposed folds.
    a=reveal.copy()
    for i in range(3):
        x=a[425:680,221:257,i].ravel()
        y=master[425:680,221:257,i].ravel()
        v=(x>.06)&(y>.06)
        gain=np.median(y[v])/np.median(x[v])
        a[:,:,i]*=np.clip(gain,.84,1.04)
    return a


def shape_match(arm,reference,wrist,elbow):
    """Match loose sleeve drawings to the same linen swatch and fingerless glove."""
    sample=(elbow+wrist)/2
    ys,xs=int(sample[1]),int(sample[0])
    dst=arm.copy()
    sample=arm[ys-8:ys+9,xs-8:xs+9]
    good=sample[:,:,3]>.93
    if good.sum()>20:
        mid=np.median(sample[:,:,:3][good],axis=0)
        gain=np.clip(reference/np.maximum(mid,.05),.85,1.15)
        dst[:,:,:3]*=gain
    return dst


def envelope(pegs):
    # The points on either side of the cuff/knuckle prevent the artwork
    # rolling over itself as the palm turns through the contact.
    line=np.gradient(pegs,axis=0)
    n=np.stack((-line[:,1],line[:,0]),axis=1)
    n/=np.maximum(np.linalg.norm(n,axis=1,keepdims=True),2)
    w=np.array([27,24,15,17,7],dtype=np.float32)[:,None]
    return np.concatenate((pegs,pegs+n*w,pegs-n*w))


def to_drawing(source,outline,peg_text,matrix):
    silhouette=matte(source.shape[:2],points(outline))
    bitmap=transform(source*silhouette[:,:,None],matrix)
    peaks=into_space(points(peg_text),matrix)
    return Drawing(bitmap,peaks,bitmap.shape[:2])


def sources(directory):
    master_source=alpha_edges(load_rgba(directory/"master.png"))
    master=transform(master_source,ROOT_POSE)
    reveal=match_underpaint(master,transform(alpha_edges(load_rgba(directory/"underpaint.png")),ROOT_POSE))
    near=to_drawing(master_source,*MASTER_ARM,ROOT_POSE)
    left_matte=matte((HEIGHT,WIDTH),into_space(points(LEFT_ARM),ROOT_POSE))
    left=master*left_matte[:,:,None]
    cover=np.maximum(near.pixels[:,:,3],left_matte)
    cover=cv2.GaussianBlur(cv2.dilate(cover,np.ones((9,9),np.uint8)),(0,0),1.5)
    plate=master*(1-cover[:,:,None])+reveal*cover[:,:,None]
    x,y=np.rint((near.pegs[1]+near.pegs[2])/2).astype(int)
    tex=near.pixels[y-8:y+9,x-8:x+9]
    linen=np.median(tex[:,:,:3][tex[:,:,3]>.93],axis=0)
    keys={"think":near}
    sheets={name:load_rgba(directory/(name+".png")) for name in ("acting","passing")}
    # Each sheet has six separate alpha islands. Remove any leftover backdrop
    # before tracing the arm inside its complete source pose.
    for name,sheet in sheets.items():
        if sheet.shape[:2]!=(1024,1536):
            raise ValueError(f"{name} must be the registered 1536×1024 pose sheet")
    for name,(sheet,panel,outline,pegs) in POSES.items():
        x,y=(panel%3)*512,(panel//3)*512
        ink=alpha_edges(sheets[sheet][y:y+512,x:x+512].copy())
        data=to_drawing(ink,outline,pegs,PANEL_POSE)
        # Keep the proximal sleeve tucked on the same seam at the edge of the cape.
        dx,dy=near.pegs[0]-data.pegs[0]
        correction=1-np.clip((XX-data.pegs[0,0])/105,0,1)
        data.pixels=cv2.remap(data.pixels,XX-dx*correction,YY-dy*correction,cv2.INTER_LINEAR)
        data.pegs+=(1-np.clip((data.pegs[:,0]-data.pegs[0,0])/105,0,1))[:,None]*np.array([dx,dy])
        data.pixels=shape_match(data.pixels,linen,data.pegs[2],data.pegs[1])
        keys[name]=data
    return master,plate,left,keys


def smooth(t):
    t=np.clip(t,0,1)
    return t*t*(3-2*t)


ARM_REGION=(101,132,455,373)
ARM_POINTS=np.stack(np.meshgrid(np.arange(101,456,4),np.arange(132,374,4)),axis=-1).astype(np.float32)


def warp_arm(drawing,dest):
    a,b,c,d=ARM_REGION
    map_points=RBFInterpolator(envelope(dest),envelope(drawing.pegs),smoothing=2.0)
    source=map_points(ARM_POINTS.reshape(-1,2)).reshape(ARM_POINTS.shape).astype(np.float32)
    source=cv2.resize(source,(c-a,d-b),interpolation=cv2.INTER_LINEAR)
    return cv2.remap(drawing.pixels,source,None,cv2.INTER_LINEAR)


def arm_at(keys,pegs,frame):
    i=min(np.searchsorted(PHASES,frame,side="right")-1,len(keys)-2)
    span=PHASES[i+1]-PHASES[i]
    blend=float(smooth((frame-PHASES[i])/span))
    if blend<.00001:
        a,b,c,d=ARM_REGION
        return keys[i].pixels[b:d,a:c].copy()
    a=warp_arm(keys[i],pegs)
    b=warp_arm(keys[i+1],pegs)
    return a*(1-blend)+b*blend


def body_map(frame,mode):
    if mode=="idle":
        angle=2*np.pi*frame/85
        breathing=(1-np.cos(angle))/2
        shoulder=3.5*np.sin(angle)
        rise=-5.5*breathing
        root=1.8*np.sin(angle-.32)+.56
        knee=2.5*breathing
        heel=0.
        lag=2.2*np.sin(angle-.4)+.86
        nod=2.6*np.sin(angle-.3)+.77
    else:
        shoulder,rise,root,knee,heel,lag,nod=mode(frame)
    torso=smooth((730-YY)/475)
    upper=smooth((494-YY)/235)
    legs=np.exp(-((YY-689)/121)**2)
    gait=smooth((YY-750)/123)*(1-smooth((XX-112)/53))
    fabric=np.exp(-((XX-99)/58)**2-((YY-622)/122)**2)
    face=smooth((213-YY)/81)
    dx=root*torso+shoulder*upper+knee*legs+lag*fabric+nod*face
    dy=rise*upper+(.43*knee)*legs+(.28*lag)*fabric-heel*gait+(.029*nod)*(XX-205)*face
    return dx.astype(np.float32),dy.astype(np.float32)


def move(p,fx,fy):
    # Invert the compact destination-to-source motion field for a card cue.
    q=np.array(p,dtype=np.float64)
    for _ in range(5):
        values=[cv2.getRectSubPix(d,(1,1),tuple(map(float,q)))[0,0] for d in (fx,fy)]
        q=p+np.asarray(values)
    return np.round(q,2).tolist()


def tone(image):
    # Match the turnaround's diffuse purple and brown across the shared art.
    a=image.copy()
    a[:,:,:3]*=[.94,.93,.96]
    return a


def exposures(directory):
    master,plate,left,keys=sources(directory)
    motions={}
    shots={}
    cues={}
    cels={}
    for j in range(85):
        dx,dy=body_map(j,"idle")
        frame=cv2.remap(master,XX-dx,YY-dy,cv2.INTER_LINEAR)
        key=f"think-{j:02}"
        cels[key]=as_image(tone(frame))
    motions["think"]=list(cels)
    motions["fan"]=motions["think"][:16]
    timing=[
        [0,0,0,0,0,0,0],[-3,2,-1,3,0,-2,-1],[-17,14,-7,10,1,-6,-6],
        [-3,10,-3,8,1,-11,-3],[17,-4,5,11,8,-10,3],[28,-3,12,12,13,-3,6],
        [16,6,8,7,5,14,3],[6,3,4,3,0,13,1],[-2,1,1,1,0,5,-1],[0,0,0,0,0,0,0],
    ]
    for level,aim in [("low",-.8),("middle",0),("high",.8)]:
        pattern=["think","lift","coil","gather" if level=="low" else "drive",
                 "touch-"+level,"sweep" if level!="low" else "touch-low","back","return","think","think"]
        drawings=[keys[k] for k in pattern]
        pegs=PchipInterpolator(PHASES,np.stack([p.pegs for p in drawings]))
        envelope_table=np.float32(timing)
        envelope_table[4:7,0]+=aim*np.array([5,6,2])
        envelope_table[4:7,1]-=aim*np.array([6,6,3])
        weight=PchipInterpolator(PHASES,envelope_table)
        names=[]
        for j in range(30):
            dx,dy=body_map(j,weight)
            amount=float(np.interp(j,[0,3,7,13,20,28,30],[0,.12,.8,1,.56,0,0]))
            drop=amount*smooth((322-XX)/112)
            arm=cv2.remap(left,XX+8*drop,YY-20*drop,cv2.INTER_LINEAR)
            actor=over(plate,arm)
            a,b,c,d=ARM_REGION
            actor[b:d,a:c]=over(actor[b:d,a:c],arm_at(drawings,pegs(j),j))
            # Join the composed gesture to the exact thinking painting.
            transition=float(smooth(j/3)*smooth((30-j)/5))
            actor=actor*transition+master*(1-transition)
            actor=cv2.remap(actor,XX-dx,YY-dy,cv2.INTER_LINEAR)
            if j==RELEASE:
                cues["touch-"+level]=move(pegs(j)[-1],dx,dy)
            key=f"flick-{level}-{j:02}"
            cels[key]=as_image(tone(actor))
            names.append(key)
        shots[level]=names
    motions["flicks"]=shots
    return cels,motions,cues


def strip(cels,motions,out):
    plan=[motions["think"][0],motions["think"][22],*(motions["flicks"]["middle"][i]
          for i in (3,6,9,11,14,18,23,28))]
    board=Image.new("RGB",(1350,580),(143,125,145))
    d=ImageDraw.Draw(board)
    for i,k in enumerate(plan):
        cel=cels[k].crop((42,30,464,925)).resize((133,282),Image.Resampling.LANCZOS)
        x,y=(i%5)*270+65,(i//5)*290
        board.paste(cel,(x,y),cel)
        d.text((x+6,y+271),k,fill=(247,232,238))
    board.save(out)


def export(directory,draft):
    images,motions,cues=exposures(directory)
    DRAFT.mkdir(parents=True,exist_ok=True)
    strip(images,motions,DRAFT/"poses.png")
    if draft:
        for level,names in motions["flicks"].items():
            cels=[images[key] for key in motions["think"][::3]+names]
            cards=[]
            for sprite in cels:
                sample=Image.new("RGB",sprite.size,(119,103,125))
                sample.paste(sprite,(0,0),sprite)
                cards.append(sample.resize((350,645),Image.Resampling.LANCZOS))
            cards[0].save(DRAFT/(level+".gif"),save_all=True,append_images=cards[1:],duration=40,loop=0)
        print(json.dumps(cues))
        return
    out=ART/"cels"
    out.mkdir(exist_ok=True)
    for name,image in images.items():
        image.save(out/(name+".png"),compress_level=4)
    atlases=pack_poses(images,prefix="quarter-cels",scale=.70)
    unique=len({hashlib.sha256(im.tobytes()).digest() for im in images.values()})
    record=dict(canvas=[WIDTH,HEIGHT],baseline=FLOOR,fingers=cues,exposures=list(images),
                atlases=atlases,motions=motions,fps=FPS,releaseFrame=RELEASE,uniqueImages=unique)
    (ART/"registration.json").write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":
    cli=argparse.ArgumentParser()
    cli.add_argument("--draft",action="store_true")
    args=cli.parse_args()
    export(DRAFT if args.draft else ARTWORK,args.draft)
