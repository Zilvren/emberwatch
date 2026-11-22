"""Mount the painted thinking pose and its hidden chest surfaces on the existing rig."""
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt


CHARACTER=Path(__file__).resolve().parents[2]/"art-source/ashen-labyrinth/battle-survivor"
REFERENCES=CHARACTER/"spine-flick-golden/reference"
POSE_FILE=REFERENCES/"body-think-three-quarter.png"
LINING_FILE=REFERENCES/"body-cloth-underpaint.png"
SUPPORT_FILE=REFERENCES/"right-cheek-support.png"
W,H=1024,1536
MAG=(1500.-253.5)/(1515.-243.)
OFFSET=np.array((546.,253.5))-MAG*np.array((526.,243.))


def pin(x,y):
    """Convert a point in the original painting to the common authoring canvas."""
    return tuple(np.round(np.array((x,y))*MAG+OFFSET,3))


RIGHT_SHOULDER=pin(376,341)
RIGHT_ELBOW=pin(423,472)
RIGHT_WRIST=pin(499,269)
# The pad of the near palm takes the jaw load, away from the lips.
RIGHT_KNUCKLE=pin(472,210)
RIGHT_CHEEK_PAD=pin(500,228)
RIGHT_REST_ANGLE=136.
LEFT_SHOULDER=pin(606,340)
LEFT_ELBOW=pin(636,507)
LEFT_WRIST=pin(487,525)
NEAR_HIP,NEAR_KNEE,NEAR_ANKLE=pin(416,800),pin(437,1065),pin(399,1362)
FAR_HIP,FAR_KNEE,FAR_ANKLE=pin(555,793),pin(586,1038),pin(567,1339)
NEAR_TOE,FAR_TOE=pin(461,1512),pin(685,1475)

# All traces below use the unscaled source painting. Keep seams and joint pins
# in this one coordinate system, including the asymmetric floor contacts.
RIGHT_GLOVE="""465,265 460,258 450,251 441,245 435,239 432,231 429,221
426,216 423,211 421,206 420,201 422,195 424,187 427,181 431,176
435,171 439,168 442,168 445,171 445,174 443,179 440,184
445,179 450,174 452,173 455,174 457,177 456,182 453,187 450,191 450,198
451,201 453,195 456,190 459,186 462,183 465,182 468,184 468,188
466,193 465,199 466,204 470,208 477,215 485,219 494,224 501,227
506,231 510,236 513,243 513,251 511,259 510,267 507,272 494,269 478,266"""
RIGHT_WRAP="""465,261 477,258 492,259 505,263 511,269 508,282 502,294 503,305
498,320 495,334 495,346 491,360 489,375 486,391 487,405 483,415
486,427 482,439 484,449 478,461 477,476 470,489
465,504 457,522 449,535 432,546 414,551 394,548 374,537 360,525 355,512
364,498 373,483 381,468 388,449 397,437 405,426 408,411 418,404 424,386
430,373 435,352 441,338 443,323 449,315 452,300 454,290 459,280 461,271"""
LEFT_WRAP="""465,541 480,537 498,535 515,536 533,530 544,528 556,520 574,515
586,507 603,498 613,490 625,484 642,482 656,484 666,489 674,499 675,512
673,526 670,541 667,553 660,564 646,572 630,580 611,587 591,591 575,592
558,589 539,589 523,587 503,586 486,588 471,584 464,575"""
LEFT_CUP="""354,527 355,518 358,513 361,512 368,518 372,527 382,533 396,538
402,538 396,534 391,531 391,522 394,517 399,515 408,517 419,521 434,524
451,530 463,535 472,540 476,549 475,565 473,577 468,584 454,587 435,585
416,586 401,584 389,581 378,575 369,569 363,562 361,554 357,547"""


def polygon(text,shape=(H,W)):
    vertices=np.array([tuple(map(float,p.split(","))) for p in text.split()])
    mask=np.zeros(shape,np.uint8)
    cv2.fillPoly(mask,[np.rint(vertices*16).astype(np.int32)],255,lineType=cv2.LINE_AA,shift=4)
    return mask


def clean_alpha(rgba):
    a=rgba[:,:,3]
    _,labels,stats,_=cv2.connectedComponentsWithStats((a>105).astype(np.uint8))
    main=(labels==1+np.argmax(stats[1:,cv2.CC_STAT_AREA])).astype(np.uint8)
    edge=cv2.dilate(main,np.ones((5,5),np.uint8))
    alpha=np.rint(np.clip((a.astype(float)-5)*255/241,0,255)).astype(np.uint8)*edge
    result=rgba.copy();result[:,:,3]=alpha
    result[alpha==0]=0
    return result


def refine_mask(rgb,outline,radius=4):
    """Resolve antialiased paint edges inside a narrow strip around the tracing."""
    m=polygon(outline);ys,xs=np.where(m>0)
    y0,y1=max(0,ys.min()-12),min(H,ys.max()+13)
    x0,x1=max(0,xs.min()-12),min(W,xs.max()+13)
    patch=m[y0:y1,x0:x1];k=np.ones((2*radius+1,2*radius+1),np.uint8)
    trim=np.zeros(patch.shape,np.uint8)
    trim[cv2.dilate(patch,k)>0]=cv2.GC_PR_BGD
    trim[patch>100]=cv2.GC_PR_FGD
    trim[cv2.erode(patch,k)>150]=cv2.GC_FGD
    cv2.setRNGSeed(34)
    cv2.grabCut(rgb[y0:y1,x0:x1,:3].copy(),trim,None,np.zeros((1,65)),np.zeros((1,65)),4,cv2.GC_INIT_WITH_MASK)
    chosen=np.isin(trim,[cv2.GC_FGD,cv2.GC_PR_FGD]).astype(np.uint8)*255
    cleaned=np.zeros_like(m)
    cleaned[y0:y1,x0:x1]=cv2.GaussianBlur(chosen,(3,3),.55)
    return cleaned


def cut(rgba,mask):
    result=rgba.copy()
    result[:,:,3]=np.rint(result[:,:,3].astype(float)*mask/255).astype(np.uint8)
    result[result[:,:,3]==0]=0
    return result


def mount(array,nearest=False):
    m=np.column_stack((np.eye(2)*MAG,OFFSET))
    if nearest:return cv2.warpAffine(array,m,(W,H),flags=cv2.INTER_NEAREST)
    # Resample colour premultiplied only for registration, then export straight
    # alpha for the project's Cocos material.
    rgba=array.astype(np.float32)/255
    rgba[:,:,:3]*=rgba[:,:,3,None]
    rgba=cv2.warpAffine(rgba,m,(W,H),flags=cv2.INTER_LINEAR)
    rgba[:,:,:3]/=np.maximum(rgba[:,:,3,None],1.e-6)
    return np.rint(np.clip(rgba,0,1)*255).astype(np.uint8)


@lru_cache(maxsize=1)
def registered_support():
    source=clean_alpha(np.array(Image.open(SUPPORT_FILE).convert("RGBA")))
    # Fit against 650 unaltered landmarks around the edited wrist and hand.
    source=cv2.resize(source,(717,894),interpolation=cv2.INTER_AREA)
    matrix=np.array([[1.00027511,-.00106415,.06260673],[-.00193112,1.00012104,.85991946]])
    patch=cv2.resize(cv2.warpAffine(source,matrix,(717,894)),(478,596),interpolation=cv2.INTER_AREA)
    result=np.zeros((H,W,4),np.uint8);result[22:618,248:726]=patch
    return result


def fit_segment(rgba,start,tip,end_start,end_tip):
    """Change only the segment's projected length, preserving cuff width."""
    start,tip,end_start,end_tip=map(lambda v:np.asarray(v,dtype=float),(start,tip,end_start,end_tip))
    src=tip-start;dst=end_tip-end_start
    s=src/np.linalg.norm(src);d=dst/np.linalg.norm(dst)
    normal=lambda v:np.array((-v[1],v[0]))
    basis=np.outer(d,s)*np.linalg.norm(dst)/np.linalg.norm(src)+np.outer(normal(d),normal(s))
    affine=np.column_stack((basis,end_start-basis@start))
    floating=rgba.astype(np.float32)/255;floating[:,:,:3]*=floating[:,:,3,None]
    out=cv2.warpAffine(floating,affine,(W,H),flags=cv2.INTER_LINEAR)
    out[:,:,:3]/=np.maximum(out[:,:,3,None],1.e-6)
    return np.uint8(np.clip(np.rint(out*255),0,255))


def front_rim(x):
    return np.interp(x,[0,390,404,414,424,435,450,466,481,496,508,520,540,550,560,569,1024],
        [247,248,248,249,253,259,265,270,275,278,277,274,269,265,258,256,256])


def scarf_occlusion():
    yy,xx=np.mgrid[:H,:W]
    x=(xx-OFFSET[0])/MAG;y=(yy-OFFSET[1])/MAG
    # Only the front fold may cover the independent neck. An antialias
    # gutter at the rear of the opening must stay on the back layer.
    keep=np.where((x>=389)&(x<=565),np.clip(y-front_rim(x)+.15,0,1),1)
    return np.rint(keep*255).astype(np.uint8)


def clean_chest(master):
    lining=clean_alpha(np.array(Image.open(LINING_FILE).convert("RGBA")))
    # The edit was made on (249,178)-(736,736). These optical registration
    # coefficients use 262 shared cloth/buckle landmarks across that crop.
    edit=cv2.resize(lining,(730,837),interpolation=cv2.INTER_AREA)
    affine=np.array([[.98940979,-.00081805,1.576335],[.00086348,1.00088699,-1.065672]])
    fit=cv2.warpAffine(edit,affine,(730,837),flags=cv2.INTER_LINEAR)
    upper=cv2.resize(fit,(487,558),interpolation=cv2.INTER_AREA)
    base=master.copy()
    base[:178]=0
    base[178:599]=0
    base[178:599,249:736]=upper[:421]
    # Join on the independently visible belt, below both arms.
    for y in range(599,633):
        t=(y-599)/34; w=t*t*(3-2*t)
        base[y,249:736]=np.rint(upper[y-178]*(1-w)+master[y,249:736]*w)
    # The rear rim and the front fold are different depth surfaces. The
    # previous face must never be visible through, or on top of, the real neck.
    y,x=np.mgrid[:H,:W]
    rear=np.interp(x[0],[0,380,393,405,417,434,470,498,521,537,551,566,587,1024],
                   [234,234,238,235,236,237,238,239,241,247,252,259,260,234])
    rim=front_rim(x[0])
    original_alpha=base[:,:,3].copy()
    rgb=base[:,:,:3].astype(int)
    warm=(rgb[:,:,0]-rgb[:,:,2]>38)&(rgb[:,:,1]-rgb[:,:,2]>5)
    base[:,:,3][(y<234)|((x>=409)&(x<=538)&(y<rear[None,:]))]=0
    behind=(x>=389)&(x<=565)&(y<rim[None,:])
    throat=behind&(y>=rear[None,:])&(warm|(original_alpha<128)|((x>=424)&(x<=522)))
    material=Image.fromarray(upper).crop((528-249,256-178,537-249,266-178)).resize((184,62),Image.Resampling.BICUBIC)
    fabric=np.zeros_like(base)
    fabric[230:292,384:568]=np.asarray(material)
    # Fill the old neck region with real dark scarf lining. This complete
    # surface is in the torso slot behind the independent portrait.
    base[throat,:3]=fabric[throat,:3]
    base[throat,3]=255
    base[base[:,:,3]==0]=0
    return base,behind.astype(np.uint8)*255


def material_labels(base,inner):
    labels=np.zeros((H,W),np.uint8)
    def mark(tag,line):labels[polygon(line)>118]=tag
    # Pants appear below the two different hems. Their shins and boots use the
    # same leg weights so that neither sole can shear away from its ankle.
    mark(1,"245,1255 318,1237 325,1158 339,1118 382,1052 444,992 499,946 500,1026 523,1040 600,1067 594,879 676,865 775,840 782,1535 245,1535")
    yy,xx=np.mgrid[:H,:W]
    split=np.interp(yy[:,0],[946,1020,1110,1250,1515],[502,495,483,487,499])[:,None]
    labels[(labels==1)&(xx<split)]=2
    mark(3,"249,239 587,242 618,294 702,358 727,548 679,568 655,506 626,491 605,503 588,518 528,509 480,548 406,584 345,687 287,662 246,544")
    # Foremost near shoulder ends on the painted sweep of the cape, where the
    # arm can pass from beneath the cloth into the foreground.
    mark(8,"256,257 384,269 466,304 495,336 482,351 449,372 420,386 391,395 363,412 336,441 308,478 282,504 250,501")
    mark(6,"269,733 280,699 299,675 326,664 350,673 374,681 400,684 405,705 403,744 406,778 398,809 384,839 365,850 323,848 292,830 269,806 254,773")
    mark(7,"560,645 571,645 570,626 575,619 625,616 633,624 636,643 647,647 650,727 643,741 566,743 564,713")
    mark(4,"277,220 635,223 642,291 605,314 583,317 564,327 548,335 535,342 519,345 499,345 481,341 464,335 442,327 423,317 392,307 365,301 332,301 316,311 288,323")
    # Interior lining draws behind the neck; only the original front rim occludes it.
    labels[inner>64]=0
    return labels


@lru_cache(maxsize=1)
def body_assets():
    master=clean_alpha(np.array(Image.open(POSE_FILE).convert("RGBA")))
    if master.shape!=(H,W,4):raise ValueError("Unexpected body master registration")
    base,inner=clean_chest(master);labels=material_labels(base,inner)
    support=registered_support()
    fist_mask=refine_mask(support,RIGHT_GLOVE,2)
    palm_mask=refine_mask(master,LEFT_CUP,3)
    far_mask=refine_mask(master,LEFT_WRAP,4)
    traced=refine_mask(support,RIGHT_WRAP,4)
    right=support.copy()
    # Reconstruct only the underside of the elbow hidden by the supporting
    # palm using the adjacent painted sleeve. It becomes visible during play.
    yy,xx=np.mgrid[:H,:W]
    cuff_line=np.interp(np.arange(W),[0,460,466,473,482,490,498,506,512,1024],
                        [261,261,264,261,259,260,262,267,273,273])
    fist_mask=np.uint8(np.rint(fist_mask*np.clip(cuff_line[None,:]-yy+.65,0,1)))
    axis=np.array((80.,-243.));axis/=np.linalg.norm(axis)
    along=(xx-406)*axis[0]+(yy-508)*axis[1]
    across=(xx-406)*(-axis[1])+(yy-508)*axis[0]
    cap=(across/44)**2+(np.minimum(along,0)/30)**2
    rounded=np.rint(255*np.clip((1.018-cap)*33,0,1)).astype(np.uint8)
    blend=np.clip(along/27,0,1);blend=blend*blend*(3-2*blend)
    near_mask=np.rint(rounded*(1-blend)+traced*blend).astype(np.uint8)
    bottom=(along<31)&(near_mask>0)
    overlap=cv2.dilate(palm_mask,np.ones((7,7),np.uint8))>0
    RGB=support[:,:,:3].astype(int)
    dyed=(RGB[:,:,0]-RGB[:,:,2]<13)|(RGB[:,:,0]<57)
    missing=bottom&(overlap|(along<-6)|dyed)
    if missing.any():
        usable=(traced>218)&(~overlap)&(~dyed)&(along>12)&(along<93)
        nearest=distance_transform_edt(~usable,return_distances=False,return_indices=True)
        step=24+.55*np.abs(along[missing])
        sx=np.rint(406+step*axis[0]-across[missing]*.83*axis[1]).astype(int)
        sy=np.rint(508+step*axis[1]+across[missing]*.83*axis[0]).astype(int)
        shade=1-.07*np.clip(-along[missing]/30,0,1)
        right[missing,:3]=np.rint(support[nearest[0,sy,sx],nearest[1,sy,sx],:3]*shade[:,None])
    right_arm=fit_segment(cut(right,near_mask),(406,508),(486,265),(423,472),(499,269))
    left_arm=fit_segment(cut(master,far_mask),(636,526),(470,561),(636,507),(487,525))
    left_palm=cv2.warpAffine(cut(master,palm_mask),np.float32([[1,0,17],[0,1,-36]]),(W,H))
    cheek_hand=cv2.warpAffine(cut(support,fist_mask),np.float32([[1,0,13],[0,1,4]]),(W,H))
    return (mount(base),mount(labels,True),mount(right_arm),mount(left_arm),mount(cheek_hand),mount(left_palm))
