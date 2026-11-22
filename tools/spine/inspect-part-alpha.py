"""Read-only alpha inspection and silhouette metadata; never modifies image pixels."""
import json
from pathlib import Path
from PIL import Image
import cv2
import numpy as np
root=Path(__file__).resolve().parents[2]
items=json.loads((root/'temp/spine08-decomposition/repair-inputs.json').read_text(encoding='utf8'))
for item in items:
    image=Image.open(item['sourcePath']).convert('RGBA')
    alpha=image.getchannel('A')
    item['width'],item['height']=image.size
    item['alphaBounds']=list(alpha.point(lambda p:255 if p>=200 else 0).getbbox())
    item['alphaZeroRatio']=alpha.histogram()[0]/(image.width*image.height)
    item['alphaMax']=alpha.getextrema()[1]
    contours,_=cv2.findContours(np.asarray(alpha.point(lambda p:255 if p>=200 else 0)),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    contour=max(contours,key=cv2.contourArea)
    item['contour']=cv2.approxPolyDP(contour,.6,True).reshape(-1,2).tolist()
(root/'temp/spine08-decomposition/repair-inspection.json').write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps([{k:v for k,v in i.items() if k not in ('prompt',)} for i in items]))
