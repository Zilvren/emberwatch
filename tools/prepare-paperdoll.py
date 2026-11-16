"""Read alpha bounds only; output native atlas metadata without modifying generated artwork."""
import json, hashlib
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'assets/resources/actors/paperdoll08'
def runs(values):
    result=[];start=None
    for i,v in enumerate(values+[True]):
        if not v and start is None:start=i
        if v and start is not None:
            if i-start>=4:result.append((start,i))
            start=None
    return result
def split(values,count):
    width=len(values);cuts=[0]
    for k in range(1,count):
        target=width*k/count
        gaps=[r for r in runs(values) if abs(sum(r)/2-target)<width/count*.40]
        if not gaps:raise ValueError('No clear atlas gutter at '+str(target))
        cut=min(gaps,key=lambda r:abs(sum(r)/2-target));cuts.append(round(sum(cut)/2))
    return cuts+[width]
def item(parent,key,text,kind='string'):
    ET.SubElement(parent,'key').text=key;ET.SubElement(parent,kind).text=str(text)
def analyze(name,columns,ids):
    file=OUT/(name+'.png');im=Image.open(file).convert('RGBA');alpha=im.getchannel('A');mask=alpha.point(lambda a:255 if a>180 else 0)
    w,h=im.size;rowCuts=split(list(mask.getprojection()[1]),2);frames=[]
    for row in range(2):
        y0,y1=rowCuts[row:row+2];cols=split(list(mask.crop((0,y0,w,y1)).getprojection()[0]),columns)
        for col in range(columns):
            x0,x1=cols[col:col+2];bounds=mask.crop((x0,y0,x1,y1)).getbbox()
            if not bounds:raise ValueError('Empty component')
            l,t,r,b=bounds
            assert l>2 and t>2 and r<x1-x0-2 and b<y1-y0-2,'Clipped component'
            part=ids[row*columns+col];rect=[x0+l-2,y0+t-2,r-l+4,b-t+4]
            # Joint continuation caps are hidden source overlap, not visible clothing.
            # Native frame rectangles select the painted limb, while the PNG remains byte-for-byte intact.
            trims={'rear-upper-arm':(.13,0),'front-upper-arm':(.13,0),'rear-forearm':(.16,.11),'front-forearm':(.14,.11),'rear-hand':(.15,0),'front-hand':(.15,0),'rear-thigh':(.12,.06),'front-thigh':(.12,.06),'rear-shin':(.13,.07),'front-shin':(.13,.07)}
            sourceRect=list(rect)
            if part in trims:
                top,bottom=trims[part];dt=round(rect[3]*top);db=round(rect[3]*bottom);rect[1]+=dt;rect[3]-=dt+db
            frames.append({'id':part,'rect':rect,'alphaBounds':sourceRect})
    plist=ET.Element('plist',version='1.0');data=ET.SubElement(plist,'dict');ET.SubElement(data,'key').text='frames';entries=ET.SubElement(data,'dict')
    for f in frames:
        ET.SubElement(entries,'key').text=f['id'];e=ET.SubElement(entries,'dict');x,y,fw,fh=f['rect']
        item(e,'frame','{{%d,%d},{%d,%d}}'%(x,y,fw,fh));item(e,'offset','{0,0}');ET.SubElement(e,'key').text='rotated';ET.SubElement(e,'false');item(e,'sourceSize','{%d,%d}'%(fw,fh))
    ET.SubElement(data,'key').text='metadata';meta=ET.SubElement(data,'dict');item(meta,'format',2,'integer');item(meta,'textureFileName',name+'.png');item(meta,'realTextureFileName',name+'.png');item(meta,'size','{%d,%d}'%(w,h))
    ET.indent(plist,space='  ');(OUT/(name+'.plist')).write_text('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'+ET.tostring(plist,encoding='unicode')+'\n',encoding='utf-8')
    return {'image':name+'.png','sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'width':w,'height':h,'alphaZeroRatio':alpha.histogram()[0]/(w*h),'frames':frames}
sheets=[analyze('survivor-body',4,['head','torso','poncho','backpack','hips','weapon','rear-boot','front-boot']),analyze('survivor-limbs',5,['rear-upper-arm','front-upper-arm','rear-forearm','front-forearm','rear-hand','front-hand','rear-thigh','front-thigh','rear-shin','front-shin'])]
(OUT/'parts.json').write_text(json.dumps({'sourcePixelsChanged':False,'reference':'../sketch08/master08-thin.png','sheets':sheets},indent=2)+'\n',encoding='utf-8')
print(json.dumps([{'file':s['image'],'parts':len(s['frames']),'transparent':round(s['alphaZeroRatio'],3)} for s in sheets]))
