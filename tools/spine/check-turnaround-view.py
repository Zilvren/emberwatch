"""Compare the unretouched native render to all three orthographic source views."""
from pathlib import Path
import hashlib
import json
import argparse

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.interpolate import LinearNDInterpolator

from turnaround_quarter import ART, SOURCE_HASH, registered
from turnaround_surfaces import HEAD_PAINTING, HEAD_YAW, JAW_Y, NEAR_JAW, FAR_JAW, mounted_portrait
from three_quarter_body import POSE_FILE, LINING_FILE, MAG as BODY_SCALE, OFFSET as BODY_OFFSET, clean_alpha


ROOT=Path(__file__).resolve().parents[2]
RIG=ART/"spine-flick-golden"
QA=ROOT/"output/playwright/survivor-golden"


def native_actor():
    black=np.asarray(Image.open(QA/"comparison-black.png").convert("RGB"),dtype=float)
    white=np.asarray(Image.open(QA/"comparison-white.png").convert("RGB"),dtype=float)
    if black[0,0].max()>2 or white[0,0].min()<253:
        raise ValueError("Failed to capture the camera's two native background colours.")
    alpha=np.clip(1-np.median(white-black,axis=2)/255,0,1)
    _,labels,stats,_=cv2.connectedComponentsWithStats((alpha>.18).astype(np.uint8))
    body=(labels==1+np.argmax(stats[1:,cv2.CC_STAT_AREA])).astype(np.uint8)
    alpha*=cv2.dilate(body,np.ones((9,9),np.uint8))
    colour=np.clip(black/np.maximum(alpha[:,:,None],1/255),0,255)
    result=Image.fromarray(np.dstack((colour,alpha*255)).round().astype(np.uint8))
    return result.crop(result.getchannel("A").getbbox())


def source_view(view):
    rgb,guide=registered()
    x,y,w,h=guide["views"]["body-"+view]["cropXYWH"]
    field=cv2.imread(str(ART/"model/depth-guides"/("body-"+view+"-16.png")),cv2.IMREAD_UNCHANGED)
    mask=(field!=0).astype(np.uint8)*255
    # Restore pigment in small enclosed gaps in the depth map.
    _,labels,stats,_=cv2.connectedComponentsWithStats((mask==0).astype(np.uint8))
    for i in range(1,len(stats)):
        if stats[i,cv2.CC_STAT_AREA]<200:mask[labels==i]=255
    im=Image.fromarray(np.dstack((rgb[y:y+h,x:x+w],mask)))
    return im.crop(im.getchannel("A").getbbox())


def board():
    padding,cell,height=22,308,718
    sheet=Image.new("RGB",(2*padding+cell*4,824),(148,136,151))
    d=ImageDraw.Draw(sheet)
    font=ImageFont.truetype("C:/Windows/Fonts/msyh.ttc",21)
    small=ImageFont.truetype("C:/Windows/Fonts/msyh.ttc",14)
    rows=[("三视图 · 正面",source_view("front")),("游戏内 · 托腮",native_actor()),
          ("三视图 · 右侧",source_view("right")),("三视图 · 背面",source_view("back"))]
    top=62
    for i,(label,picture) in enumerate(rows):
        left=padding+cell*i
        d.text((left+cell/2,24),label,font=font,fill=(38,30,44),anchor="mt")
        w=round(picture.width*height/picture.height)
        if w>cell-12:raise ValueError("Source figure exceeds comparison column")
        im=picture.resize((w,height),Image.Resampling.LANCZOS)
        sheet.paste(im,(left+(cell-w)//2,top),im)
        for y in [top,top+round((360.5-14)/907*height),top+height]:
            for x in [left+3,left+cell-16]:d.line((x,y,x+13,y),fill=(105,91,109),width=1)
    d.text((sheet.width/2,800),"四图按头顶与靴底等比对齐，短线标出原稿腰带高度。",font=small,
           fill=(47,37,51),anchor="mm")
    sheet.save(QA/"turnaround-comparison.png",optimize=True)


def previous_comparison(previous, registration):
    """Show the supplied screenshot and actual game capture at the same height."""
    middle,top,sole=registration
    old=Image.open(previous).convert("RGB")
    native=Image.open(QA/"guard-think.png").convert("RGB")
    cell,height,pad=256,585,18
    whole=Image.new("RGB",(cell*4+pad*2,676),(148,136,151))
    draw=ImageDraw.Draw(whole)
    title=ImageFont.truetype("C:/Windows/Fonts/msyh.ttc",20)
    small=ImageFont.truetype("C:/Windows/Fonts/msyh.ttc",13)
    def scene_panel(im,x,roof,floor):
        span=floor-roof
        ratio=height/span
        width=cell/ratio
        return im.transform((cell,height+14),Image.Transform.EXTENT,
            (x-width/2,roof-7/ratio,x+width/2,floor+7/ratio),Image.Resampling.BICUBIC)
    # The native comparison is a matte pair from the same pose at 1.90x.
    # Register its extents back into the 1080px full-body capture at 1.51x.
    black=np.array(Image.open(QA/"comparison-black.png").convert("RGB"),dtype=float)
    white=np.array(Image.open(QA/"comparison-white.png").convert("RGB"),dtype=float)
    mask=(np.median(white-black,axis=2)<205).astype(np.uint8)
    _,_,stats,_=cv2.connectedComponentsWithStats(mask)
    x,y,w,h,_=stats[1+np.argmax(stats[1:,cv2.CC_STAT_AREA])]
    cx=(587+(x+w/2-642)*1.51/1.90)*.75
    crown=(750+(y-870)*1.51/1.90)*.75
    bottom=(750+(y+h-870)*1.51/1.90)*.75
    items=[("原稿正面",source_view("front"),False),("你发来的截图",scene_panel(old,middle,top,sole),True),
           ("本次游戏待机",scene_panel(native,cx,crown,bottom),True),("原稿右侧",source_view("right"),False)]
    for i,(label,pic,is_scene) in enumerate(items):
        left=pad+cell*i
        draw.text((left+cell/2,13),label,font=title,fill=(37,29,43),anchor="mt")
        if is_scene:whole.paste(pic,(left,43))
        else:
            w=round(pic.width*height/pic.height)
            pic=pic.resize((w,height),Image.Resampling.LANCZOS)
            whole.paste(pic,(left+(cell-w)//2,50),pic)
    draw.text((whole.width/2,656),"按发顶与靴底等比对齐。中间两列保留各自在游戏里的姿势和颜色。",font=small,
              fill=(44,34,49),anchor="mm")
    whole.save(QA/"before-after-turnaround.png",optimize=True)


def portrait_comparison():
    reference=Image.open(ART/"head-turnaround.png").convert("RGB")
    native=Image.open(QA/"face-native.png").convert("RGB")
    a=np.array(native).astype(int)
    bg=a[0,0]
    occupied=(np.max(abs(a-bg),axis=2)>18).astype(np.uint8)
    _,_,stats,_=cv2.connectedComponentsWithStats(occupied)
    x,top,width,h,_=stats[1+np.argmax(stats[1:,cv2.CC_STAT_AREA])]
    # The Cocos close-up is sampled at the head's authored rest angle.
    # The new painting goes from crown y=21 to chin y=873 and neck y=1152.
    chin=top+h*(873-21)/(1152-21)
    cell,face_height=364,335
    result=Image.new("RGB",(3*cell,438),(148,136,151));d=ImageDraw.Draw(result)
    font=ImageFont.truetype("C:/Windows/Fonts/msyh.ttc",19)
    small=ImageFont.truetype("C:/Windows/Fonts/msyh.ttc",13)
    entries=[("定稿正脸",reference.crop((0,0,692,758)),355,31,518),
             ("本次游戏中的脸",native,x+width/2,top,chin),
             ("定稿右侧脸",reference.crop((692,0,1384,758)),322,31,511)]
    for i,(label,im,center,crown,jaw) in enumerate(entries):
        rate=face_height/(jaw-crown);rw=cell/rate
        extent=(center-rw/2,crown-11/rate,center+rw/2,jaw+35/rate)
        # The native crop can be a few pixels narrower than the paper panel.
        border=Image.new("RGB",(im.width+100,im.height+100),tuple(map(int,np.asarray(im)[0,0])))
        border.paste(im,(50,50));extent=tuple(z+50 for z in extent)
        portrait=border.transform((cell,face_height+46),Image.Transform.EXTENT,extent,Image.Resampling.BICUBIC)
        result.paste(portrait,(i*cell,31))
        d.text((i*cell+cell/2,5),label,font=font,fill=(35,29,42),anchor="mt")
    d.text((result.width/2,424),"按发顶到下巴的高度对齐。中间取自 Cocos 的头部骨骼附件。",font=small,
           fill=(46,37,51),anchor="mm")
    result.save(QA/"face-comparison.png",optimize=True)


def cheek_comparison(previous):
    current=Image.open(QA/"face-native.png").convert("RGB")
    old=Image.open(previous).convert("RGB")
    if old.size!=current.size:raise ValueError("Face takes must use the same camera and scale")
    # Use the same unmodified game pixels at the same crop and scale. The
    # hair, eyes and nose provide registration while the contour moves.
    crop=(40,104,465,513)
    views=[("修改前 · 3/4",old),("本次 · 3/4",current)]
    width,height=crop[2]-crop[0],crop[3]-crop[1]
    sheet=Image.new("RGB",(2*width+2,height+44),(148,136,151));d=ImageDraw.Draw(sheet)
    font=ImageFont.truetype("C:/Windows/Fonts/msyh.ttc",19)
    for i,(label,im) in enumerate(views):
        x=i*(width+2);sheet.paste(im.crop(crop),(x,40))
        d.text((x+width/2,8),label,font=font,fill=(38,29,44),anchor="mt")
    sheet.save(QA/"face-before-after.png",optimize=True)


def body_registration():
    source=clean_alpha(np.array(Image.open(POSE_FILE).convert("RGBA")))
    black=np.asarray(Image.open(QA/"comparison-black.png").convert("RGB"),dtype=float)
    white=np.asarray(Image.open(QA/"comparison-white.png").convert("RGB"),dtype=float)
    live=np.median(white-black,axis=2)<128
    # Same camera and foot baseline used by the native matte captures.
    scale=.30*1.90
    shift=np.array([642.,870.])+scale*(BODY_OFFSET-np.array((505.,1503.)))
    affine=np.column_stack((np.eye(2)*BODY_SCALE*scale,shift))
    expected=cv2.warpAffine(source[:,:,3],affine,(live.shape[1],live.shape[0]))>128
    y,x=np.mgrid[:live.shape[0],:live.shape[1]]
    raw_x=(x-shift[0])/(BODY_SCALE*scale)
    raw_y=(y-shift[1])/(BODY_SCALE*scale)
    def agreement(mask):
        return round(float(np.sum(live&expected&mask)/np.sum((live|expected)&mask)),5)
    ratio=agreement(raw_y>=780)
    boots=agreement(raw_y>=1350)
    def soles(mask):
        return [int(np.max(y[mask&(raw_y>1380)&side])) for side in [raw_x<500,raw_x>=500]]
    actual=soles(live);target=soles(expected)
    if min(ratio,boots)<.965 or max(abs(a-b) for a,b in zip(actual,target))>2:
        raise ValueError("Native stance no longer matches the registered painting: "+str((ratio,boots,actual,target)))
    return {"lowerSilhouetteIoU":ratio,"bootSilhouetteIoU":boots,"soleYInNativeCapture":actual,
            "soleYInPaintingAtSameScale":target,"stanceDepthPixels":actual[0]-actual[1]}


def body_comparison(user_file,previous_frame):
    original=cv2.imread(str(previous_frame));old=cv2.imread(str(user_file))
    current=cv2.imread(str(QA/"body-review.png"))
    sift=cv2.SIFT_create(nfeatures=5500,contrastThreshold=.015)
    p,a=sift.detectAndCompute(cv2.cvtColor(original,cv2.COLOR_BGR2GRAY),None)
    q,b=sift.detectAndCompute(cv2.cvtColor(old,cv2.COLOR_BGR2GRAY),None)
    pairs=[m for m,n in cv2.BFMatcher().knnMatch(a,b,k=2) if m.distance<.73*n.distance]
    src=np.float32([p[m.queryIdx].pt for m in pairs]);dst=np.float32([q[m.trainIdx].pt for m in pairs])
    affine,inliers=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,ransacReprojThreshold=2.2)
    if affine is None or inliers.sum()<30:raise ValueError("The screenshot could not be registered")
    error=np.linalg.norm(cv2.transform(src[:,None,:],affine)[:,0]-dst,axis=1)
    p90=round(float(np.quantile(error[inliers.ravel().astype(bool)],.9)),3)
    if p90>2.2:raise ValueError("Screenshot comparison is not aligned")
    crop_info=QA/"body-crop-register.json"
    calibrated=False
    if crop_info.exists():
        info=json.loads(crop_info.read_text(encoding="utf8"))
        revision=json.loads((RIG/"export-check.json").read_text(encoding="utf8"))["projectSha256"]
        calibrated=(info.get("revision")==revision and info.get("targetSha256")==hashlib.sha256(user_file.read_bytes()).hexdigest()
                    and np.allclose(np.array(info["matrix"]),affine,atol=.01))
    if calibrated:
        new=cv2.imread(str(QA/"body-crop-native.png"))
        if new.shape[:2]!=old.shape[:2]:raise ValueError("Unexpected camera crop")
    else:
        affine[:,:2]*=original.shape[1]/current.shape[1]
        new=cv2.warpAffine(current,affine,(old.shape[1],old.shape[0]),flags=cv2.INTER_LANCZOS4)
    h,w=old.shape[:2]
    l=round(w*.035);r=round(w*.88)
    board=Image.new("RGB",(2*(r-l)+4,h+39),(52,46,57));d=ImageDraw.Draw(board)
    font=ImageFont.truetype("C:/Windows/Fonts/msyh.ttc",20)
    for k,(label,im) in enumerate([("你发来的截图",old),("本次游戏画面",new)]):
        start=k*(r-l+4)
        board.paste(Image.fromarray(cv2.cvtColor(im[:,l:r],cv2.COLOR_BGR2RGB)),(start,39))
        d.text((start+14,7),label,font=font,fill=(246,238,226))
    board.save(QA/"body-before-after.png",optimize=True)
    return {"matchedFeatures":int(inliers.sum()),"p90RegistrationErrorPixels":p90,"nativePixelScaleCapture":bool(calibrated)}


def atlas_check():
    atlas=(RIG/"runtime/survivor-flick.atlas").read_text().splitlines()
    visible=0;names=[]
    for i,line in enumerate(atlas):
        if line.endswith(".png"):
            page=np.array(Image.open(RIG/"runtime"/line).convert("RGBA"))
        elif line and not line.startswith(" ") and ":" not in line:
            name=line;path=RIG/"parts"/(name+".png")
            part=np.array(Image.open(path).convert("RGBA"))
            x,y=map(int,atlas[i+2].split(":")[1].split(","))
            region=page[y:y+part.shape[0],x:x+part.shape[1]]
            ink=part[:,:,3]>0
            if not np.array_equal(region[:,:,3],part[:,:,3]) or not np.array_equal(region[ink],part[ink]):
                raise ValueError("Packed colour or alpha drift: "+name)
            visible+=int(ink.sum());names.append(name)
    return {"regions":len(names),"visibleTexels":visible,"visibleRGBAExact":True}


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--before",type=Path)
    parser.add_argument("--previous-portrait",type=Path)
    parser.add_argument("--body-screenshot",type=Path)
    parser.add_argument("--body-before-frame",type=Path)
    parser.add_argument("--registration",nargs=3,type=float,metavar=("CENTER_X","CROWN_Y","SOLE_Y"))
    args=parser.parse_args()
    if bool(args.before)!=bool(args.registration):parser.error("Supply both screenshot and its body registration")
    if bool(args.body_screenshot)!=bool(args.body_before_frame):parser.error("Supply both frames for the body comparison")
    board()
    portrait_comparison()
    if args.previous_portrait:cheek_comparison(args.previous_portrait)
    if args.before:previous_comparison(args.before,args.registration)
    reuse=json.loads((RIG/"source-reuse.json").read_text(encoding="utf8"))
    old=ART/"spine"
    for name,digest in reuse["originalParts"].items():
        for file in [RIG/"parts"/name,old/"parts"/name]:
            if hashlib.sha256(file.read_bytes()).hexdigest()!=digest:raise ValueError("Changed R3 part "+name)
    skeleton=json.loads((RIG/"runtime/survivor-flick.json").read_text(encoding="utf8"))
    head=skeleton["skins"][0]["attachments"]["q-face-art"]["golden-head"]
    vertices=np.array(head["vertices"]).reshape(-1,2)
    uv=np.array(head["uvs"]).reshape(-1,2)
    _,box=mounted_portrait()
    atlas_span=np.array([box[2]-box[0],box[3]-box[1]])
    source_xy=np.array(box[:2])+uv*atlas_span
    stable=(source_xy[:,1]<=579)|(source_xy[:,1]>=900)
    design=np.column_stack((uv,np.ones(len(uv))))
    affine=np.linalg.lstsq(design[stable],vertices[stable],rcond=None)[0]
    horizontal,vertical=affine[:2]
    aspect=(np.linalg.norm(horizontal)/np.linalg.norm(vertical))/(head["width"]/head["height"])
    if abs(aspect-1)>.002 or abs(horizontal@vertical)/(np.linalg.norm(horizontal)*np.linalg.norm(vertical))>.001:
        raise ValueError("The fixed features changed scale on the rig")
    lookup=LinearNDInterpolator(uv,vertices)
    def joint(x,y):
        point=(np.array((x,y))-box[:2])/atlas_span
        return np.asarray(lookup(point)).ravel(),np.r_[point,1]@affine
    fixed=[(710,555),(882,555),(829,685),(798,752),(786,873),(575,980)]
    pin_drift=max(np.linalg.norm(a-b) for a,b in [joint(*point) for point in fixed])
    changes={}
    for y in (690,730,760,790):
        l=np.interp(y,JAW_Y,NEAR_JAW);r=np.interp(y,JAW_Y,FAR_JAW)
        nl,ol=joint(l,y);nr,orr=joint(r,y)
        changes[str(y)]=round(float(np.linalg.norm(nr-nl)/np.linalg.norm(orr-ol)-1)*100,2)
    if pin_drift>.022 or not all(3.8<v<7.0 for v in changes.values()):
        raise ValueError("Unexpected cheek correction or feature drift: "+str((changes,pin_drift)))
    report={"source":"turnaround-golden-master.png","sourceSha256":SOURCE_HASH,"sourceSize":[5539,3467],
            "headReference":"head-turnaround.png","headPainting":"reference/head-three-quarter.png","headYawDegrees":HEAD_YAW,
            "headPaintingSha256":hashlib.sha256(HEAD_PAINTING.read_bytes()).hexdigest(),"nativeFaceAspectScaleRatio":round(aspect,5),
            "restCheekJawWidthGainPercent":changes,"unchangedFeatureMaxDeviation":round(float(pin_drift),5),
            "independentArmSources":["right-cheek-support.png, right arm and palm at the jaw",
                                     "body-think-three-quarter.png, left arm and supporting palm",
                                     "right-wrist-release.png, dorsal right hand in flight"],
            "bodyPainting":"reference/body-think-three-quarter.png","bodyPaintingSha256":hashlib.sha256(POSE_FILE.read_bytes()).hexdigest(),
            "underpaintSha256":hashlib.sha256(LINING_FILE.read_bytes()).hexdigest(),
            "cameraYawDegrees":33,"bodyRegistration":body_registration(),"atlas":atlas_check(),
            "byteIdenticalR3Textures":len(reuse["originalParts"]),"board":"turnaround-comparison.png"}
    if args.body_screenshot:report["screenshotComparison"]=body_comparison(args.body_screenshot,args.body_before_frame)
    (QA/"turnaround-check.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")
    print(json.dumps(report))
