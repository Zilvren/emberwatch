"""Material seams, face landmarks and sleeve attachments in the approved drawings."""
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ART = Path(__file__).resolve().parents[2]/"art-source/ashen-labyrinth/battle-survivor"
HEAD_YAW = 33.
HEAD_PAINTING = ART/"spine-flick-golden/reference/head-three-quarter.png"
# The supplied side/front references put the sole at 1500 and the chin at 254.
# This one similarity transform registers the new angle without stretching the face.
HEAD_CHIN = np.array((786.,873.))
MOUNTED_CHIN = np.array((546.,253.5))
HEAD_SCALE = (253.5-31.)/(873.-21.)

# Landmarks along the two jaw contours in the approved-reference three-quarter
# painting. The eye sockets, bridge, mouth, chin tip, skull and neck remain fixed.
JAW_Y = np.array([587,620,655,690,730,760,790,815,840,860,873,890])
NEAR_JAW = np.array([555,531,513,507,518,542,581,626,683,739,785,795])
FAR_JAW = np.array([945,936,924,910,896,884,871,860,850,837,814,806])
WIDTH_GAIN = np.array([0,.012,.036,.049,.058,.064,.064,.060,.045,.022,0,0])


def points(text):
    return np.array([tuple(map(float,p.split(","))) for p in text.split()],np.float32)


def polygon(mask, outline, value, scale=1):
    cv2.fillPoly(mask,[np.rint(points(outline)*scale*16).astype(np.int32)],value,shift=4)


@lru_cache(maxsize=1)
def front_materials():
    # Coordinates in the published 1585 x 992 reference. These edges belong to
    # the garment and remain registered when the camera angle changes.
    s=2
    m=np.zeros((992*s,1585*s),np.uint8)
    polygon(m,"140,745 205,745 215,680 222,651 245,610 273,578 300,559 300,615 326,624 348,634 367,645 365,520 408,513 449,517 459,929 140,929",1,s)
    near=(np.indices(m.shape,dtype=np.int16)[1]<311*s)&(m==1)
    m[near]=2
    polygon(m,"132,155 454,155 452,351 426,342 418,323 400,322 382,334 371,353 348,340 300,350 245,350 221,340 211,336 190,343 177,361 164,392 138,388",3,s)
    polygon(m,"127,167 306,168 363,174 345,196 323,224 300,247 278,267 248,284 216,297 188,300 164,314 145,332 127,337",8,s)
    polygon(m,"172,140 431,140 430,194 389,189 369,197 346,205 325,212 304,219 275,215 247,206 220,198 190,193 172,195",4,s)
    polygon(m,"187,418 205,407 218,409 236,421 239,433 241,458 238,481 231,497 219,508 207,515 191,513 177,499 177,459",6,s)
    polygon(m,"329,397 335,391 335,378 340,373 371,373 378,377 378,390 384,394 385,438 381,445 334,446 329,441",7,s)
    # Remove only the face/neck paint itself, not the real raised collar
    # immediately behind it. Both sheets share these registered coordinates.
    painted,_=head_paint()
    yy,xx=np.mgrid[:380,:890].astype(np.float32)
    hu=((xx/s+.5)*5539/1585-.5-678).astype(np.float32)
    hv=((yy/s+.5)*3467/992-.5-18).astype(np.float32)
    head=cv2.remap(painted,hu,hv,cv2.INTER_LINEAR)
    m[:380,:890][head>35]=5
    return m


@lru_cache(maxsize=1)
def head_paint():
    picture=np.array(Image.open(ART/"head-turnaround.png").crop((0,0,692,660)).convert("RGB"))
    depth=cv2.imread(str(ART/"model/depth-guides/head-front-16.png"),cv2.IMREAD_UNCHANGED)[:660]
    painted=(depth>0).astype(np.uint8)
    count,labels,stats,_=cv2.connectedComponentsWithStats(1-painted)
    for i in range(1,count):
        if stats[i,cv2.CC_STAT_AREA]<150:painted[labels==i]=1
    h,w=painted.shape
    stroke=np.zeros((h,w),np.uint8)
    polygon(stroke,"0,0 691,0 691,511 465,511 464,537 470,554 489,573 518,587 516,597 486,610 452,625 412,640 394,641 353,627 314,615 280,603 231,586 232,578 255,566 270,552 277,534 277,511 0,511",255)
    alpha=np.minimum(255*painted,stroke)
    rgb=picture.astype(np.int16)
    skin=(rgb[:,:,0]-rgb[:,:,1]>18)&(rgb[:,:,1]-rgb[:,:,2]>9)
    for y in range(510,h):
        inside=np.flatnonzero(skin[y] & (stroke[y]>0))
        alpha[y]=0
        if len(inside):alpha[y,inside[0]:inside[-1]+1]=255
    return alpha,picture


def mounted_portrait():
    original=np.array(Image.open(HEAD_PAINTING).convert("RGBA"))
    alpha=original[:,:,3]
    count,labels,stats,_=cv2.connectedComponentsWithStats((alpha>72).astype(np.uint8))
    if count<2:raise ValueError("Missing painted head silhouette")
    main=(labels==1+np.argmax(stats[1:,cv2.CC_STAT_AREA])).astype(np.uint8)
    keep=cv2.dilate(main,np.ones((5,5),np.uint8))>0
    original[:,:,3]=np.where(keep,alpha,0)
    rgba=Image.fromarray(original)
    box=rgba.getchannel("A").getbbox()
    box=(box[0]-4,box[1]-4,box[2]+4,box[3]+4)
    cut=rgba.crop(box)
    size=(round(cut.width*640/cut.height),640)
    return cut.resize(size,Image.Resampling.LANCZOS),box


def face_vertices(x,y):
    x,y=np.broadcast_arrays(np.asarray(x,dtype=float),np.asarray(y,dtype=float))
    near=np.interp(y,JAW_Y,NEAR_JAW);far=np.interp(y,JAW_Y,FAR_JAW)
    gain=(far-near)*np.interp(y,JAW_Y,WIDTH_GAIN)
    def falloff(d,r):
        k=np.clip(1-abs(d)/r,0,1)
        return k*k*(3-2*k)
    dx=gain*(-.62*falloff(x-near,88)+.38*falloff(x-far,48))
    # Cover each painted feature, including its outer contour, with a fixed
    # patch. Only the flesh between these patches and the jaw outline moves.
    def fixed_patch(cx,cy,rx,ry):
        dist=np.maximum(abs(x-cx)/rx,abs(y-cy)/ry)
        k=np.clip((dist-1)/.25,0,1)
        return k*k*(3-2*k)
    dx*=fixed_patch(823,661,59,54)*fixed_patch(799,753,67,26)
    dx*=1-falloff(x-447,45)*falloff(y-613,101)
    return (MOUNTED_CHIN[0]+(x+dx-HEAD_CHIN[0])*HEAD_SCALE,
            MOUNTED_CHIN[1]+(y-HEAD_CHIN[1])*HEAD_SCALE)


SLEEVES={
    "right":("210,335 221,336 229,341 229,354 229,360 226,367 222,373 222,382 218,391 216,402 212,408 207,420 203,428 198,433 196,445 195,455 191,469 162,469 162,457 164,449 163,440 165,435 168,426 169,413 170,404 168,398 167,391 170,383 171,375 175,370 175,362 180,357 182,347 190,343", (207,351),(177,464),1.52),
    "left":("401,321 413,318 422,320 426,325 425,340 429,347 435,358 435,366 431,373 432,383 436,391 437,400 439,410 437,414 439,424 439,432 442,442 443,447 440,452 442,461 442,470 416,470 415,460 413,450 410,440 407,431 404,420 399,414 398,405 393,403 392,396 389,389 385,385 383,375 379,371 379,360 380,349 380,340 384,334 390,328", (405,347),(428,464),1.45),
}


def original_forearm(side,rgb,guide):
    outline,elbow,wrist,width=SLEEVES[side]
    xy=points(outline); scales=np.array((rgb.shape[1]/1585,rgb.shape[0]/992))
    low=np.floor(xy.min(axis=0)*scales).astype(int)-17
    high=np.ceil(xy.max(axis=0)*scales).astype(int)+18
    colors=rgb[low[1]:high[1],low[0]:high[0]]
    mask=np.zeros(colors.shape[:2],np.uint8)
    cv2.fillPoly(mask,[np.rint((xy*scales-low)*16).astype(np.int32)],255,shift=4)
    # Refine the ink boundary against the actual adjacent cloak and bag.
    trim=np.full(mask.shape,cv2.GC_BGD,np.uint8)
    trim[cv2.dilate(mask,np.ones((23,23),np.uint8))>0]=cv2.GC_PR_BGD
    trim[mask>0]=cv2.GC_PR_FGD
    trim[cv2.erode(mask,np.ones((19,19),np.uint8))>0]=cv2.GC_FGD
    cv2.setRNGSeed(51)
    cv2.grabCut(colors,trim,None,np.zeros((1,65)),np.zeros((1,65)),5,cv2.GC_INIT_WITH_MASK)
    selected=(trim==cv2.GC_FGD)|(trim==cv2.GC_PR_FGD)
    x0,y0,_,_=guide["views"]["body-front"]["cropXYWH"]
    valid=cv2.imread(str(ART/"model/depth-guides/body-front-16.png"),cv2.IMREAD_UNCHANGED)
    selected&=valid[low[1]-y0:high[1]-y0,low[0]-x0:high[0]-x0]>0
    alpha=cv2.GaussianBlur(selected.astype(np.uint8)*255,(3,3),.58)
    return Image.fromarray(np.dstack((colors,alpha))),np.array(elbow)*scales-low,np.array(wrist)*scales-low,width/scales[0]

