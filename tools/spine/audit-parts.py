"""Inspect exported PNG bytes and alpha; never redraw or modify source images."""
import hashlib,json
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2]
parts=[]
for actor in ['survivor','wanderer','brute']:
    manifest=json.loads((root/'art-source/spine08/parts'/actor/'parts.json').read_text())
    for p in manifest['parts']:
        file=root/'art-source/spine08/parts'/actor/(p['name']+'.png')
        image=Image.open(file).convert('RGBA');alpha=image.getchannel('A')
        corners=[alpha.getpixel(x) for x in [(0,0),(image.width-1,0),(0,image.height-1),(image.width-1,image.height-1)]]
        assert alpha.getbbox() and alpha.histogram()[0]>0 and max(corners)==0,(actor,p['name'],'not transparent',corners)
        rgb=list(image.convert('RGB').getdata());a=list(alpha.getdata())
        assert any(opacity>200 and min(color)<210 for color,opacity in zip(rgb,a)),(actor,p['name'],'blank image')
        assert image.size==(p['width'],p['height']),(actor,p['name'],'stale registration')
        parts.append(dict(actor=actor,name=p['name'],bone=p['bone'],path=str(file.relative_to(root)).replace('\\','/'),width=image.width,height=image.height,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),corners=corners,transparent=True,mode=p.get('mode','native-source')))
report=dict(passed=True,count=len(parts),parts=parts)
(root/'temp/spine08-decomposition/part-image-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(passed=True,independentPNGs=len(parts),transparentCorners=True,noBlankImages=True)))
