"""Prepare registered painting references for baking in Blender, without projecting hair onto skin."""
import cv2
import numpy as np
from PIL import Image
from model_surface import ART,ROOT


def clean_plate(photo,polygon,features,base):
    y,x=np.mgrid[:photo.shape[0],:photo.shape[1]];r,g,b=photo.astype(float).transpose(2,0,1)
    region=np.zeros(y.shape,'uint8');cv2.fillPoly(region,[np.int32(polygon)],1)
    ok=((r-g>19)&(r-b>37)&(region>0)).astype('uint8')
    for outline in features:cv2.fillPoly(ok,[np.int32(outline)],1)
    w=ok.astype('float32');spread=cv2.GaussianBlur(w,(0,0),20)
    low=cv2.GaussianBlur(photo.astype('float32')*w[...,None],(0,0),20)/np.maximum(spread[...,None],.0001)
    blend=np.clip(spread/.16,0,1)[...,None];fill=np.array(base)*(1-blend)+low*blend
    soft=cv2.GaussianBlur(w,(0,0),1.3)[...,None]
    return np.uint8(np.clip(photo*soft+fill*(1-soft),0,255))


def main():
    target=ROOT/'temp/survivor-blender-input';target.mkdir(exist_ok=True,parents=True)
    art=np.asarray(Image.open(ART/'head-turnaround.png').convert('RGB'))[:610];front=art[:,:692];side=art[:,692:1384]
    mask=[(250,331),(268,291),(326,257),(376,236),(429,217),(480,291),(494,347),(474,430),(455,469),(403,510),(359,515),(321,492),(279,452),(258,399)]
    eyes=[[(263,302),(290,286),(348,297),(357,316),(343,346),(289,347),(270,332)],[(392,312),(403,293),(458,283),(478,301),(469,337),(448,344),(402,343)],[(330,434),(415,434),(416,475),(327,475)]]
    f=clean_plate(front,mask,eyes,[164,116,90]);sf=[(343,396),(378,382),(409,357),(432,337),(477,342),(492,321),(503,321),(515,361),(536,390),(535,399),(507,415),(511,440),(499,470),(495,502),(471,509),(414,480),(365,449)]
    profile=clean_plate(side,sf,[],[162,114,90]);ear=np.zeros(side.shape[:2],'uint8');cv2.ellipse(ear,(304,354),(34,49),-18,0,360,255,-1)
    ew=(cv2.GaussianBlur(ear,(0,0),1.4)/255.)[...,None];earpaint=np.uint8(np.clip(side*ew+profile*(1-ew),0,255))
    for name,img in [('face-front',f),('face-side',profile),('ear-side',earpaint)]:Image.fromarray(img).save(target/(name+'.png'))
    Image.fromarray(front[282:357,257:487]).resize((460,150),Image.Resampling.LANCZOS).save(target/'eye-paint.png')
    # Pack neutral, tileable small material images for actual Blender accessories and their glTF materials.
    m=Image.open(ART/'toon/material-study.png').convert('RGB');w,h=m.size;leather=m.crop((7,h//2+7,w//2-7,h-7)).resize((384,384),Image.Resampling.LANCZOS);leather.save(target/'saddle-leather.png')
    p=np.asarray(leather).astype(float);grain=(p-p.mean((0,1)))*.44
    for name,tone in [('aged-brass',[135,109,77]),('card-stock',[194,173,150]),('wallet-lining',[75,55,57])]:
        Image.fromarray(np.uint8(np.clip(tone+grain,0,255))).resize((192,192)).save(target/(name+'.png'))

if __name__=='__main__':main()
