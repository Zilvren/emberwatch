"""Analyze generated pixels read-only; export native atlas metadata, never resample the PNGs."""
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets/resources/actors/sketch08'
TIMES = [0.08, 0.07, 0.07, 0.06, 0.05, 0.06, 0.08, 0.09]

def empty_runs(projection, start, end):
    result, first = [], None
    for i in range(start, end):
        if not projection[i] and first is None:
            first = i
        if projection[i] and first is not None:
            if i-first >= 4: result.append((first, i))
            first = None
    if first is not None and end-first >= 4: result.append((first, end))
    return result

def analyze(name, first_index):
    image = Image.open(OUT / name).convert('RGBA')
    width, height = image.size
    alpha = image.getchannel('A')
    ratio = alpha.histogram()[0] / (width*height)
    if ratio < 0.45: raise ValueError(f'{name}: transparent background requires review')
    mask = alpha.point(lambda a: 255 if a > 180 else 0)
    rows = mask.getprojection()[1]
    gaps = empty_runs(rows, height//3, height*2//3)
    if not gaps: raise ValueError(f'{name}: cannot identify transparent row gutter')
    cut = round(sum(min(gaps, key=lambda r: abs(sum(r)/2-height/2)))/2)
    row_cuts = [0, cut, height]
    frames, column_cuts = [], []
    for row in range(2):
        y0, y1 = row_cuts[row:row+2]
        projection = mask.crop((0,y0,width,y1)).getprojection()[0]
        gaps = empty_runs(projection, width//3, width*2//3)
        if not gaps: raise ValueError(f'{name}: cannot identify column gutter in row {row}')
        split = round(sum(min(gaps, key=lambda r: abs(sum(r)/2-width/2)))/2)
        column_cuts.append(split)
        for col, (x0,x1) in enumerate([(0,split),(split,width)]):
            local = mask.crop((x0,y0,x1,y1)); bounds = local.getbbox()
            if not bounds: raise ValueError(f'{name}: empty pose')
            left,top,right,bottom = bounds
            if left < 3 or right > x1-x0-3 or top < 3 or bottom > y1-y0-3:
                raise ValueError(f'{name}: pose intersects atlas gutter')
            pixels = local.load()
            feet = [x for x in range(left,right) if sum(pixels[x,y]>0 for y in range(max(top,bottom-6),bottom))>=2]
            if not feet: raise ValueError(f'{name}: cannot register feet')
            rect = [x0+left-3,y0+top-3,right-left+6,bottom-top+6]
            crop = image.crop((rect[0],rect[1],rect[0]+rect[2],rect[1]+rect[3]))
            frames.append({'index':first_index+row*2+col,'image':name,'rect':rect,'bodyHeight':bottom-top,
                           'feet':{'left':x0+min(feet),'right':x0+max(feet),'center':x0+(min(feet)+max(feet))/2,'y':y0+bottom-1},
                           'contentHash':hashlib.sha256(crop.tobytes()).hexdigest()})
    return {'image':name,'width':width,'height':height,'alphaZeroRatio':round(ratio,5),'rowCuts':row_cuts,'columnCuts':column_cuts,'frames':frames}

def value(parent,key,text,kind='string'):
    ET.SubElement(parent,'key').text=key; ET.SubElement(parent,kind).text=str(text)

def export(sheet,frames):
    root=ET.Element('plist',version='1.0'); data=ET.SubElement(root,'dict')
    ET.SubElement(data,'key').text='frames'; entries=ET.SubElement(data,'dict')
    for frame in frames:
        ET.SubElement(entries,'key').text=frame['name']; e=ET.SubElement(entries,'dict'); x,y,w,h=frame['rect']
        value(e,'frame','{{%d,%d},{%d,%d}}'%(x,y,w,h));value(e,'offset','{%.4f,%.4f}'%tuple(frame['offset']))
        ET.SubElement(e,'key').text='rotated';ET.SubElement(e,'false');value(e,'sourceSize','{%d,%d}'%tuple(frame['sourceSize']))
    ET.SubElement(data,'key').text='metadata'; m=ET.SubElement(data,'dict')
    value(m,'format',2,'integer');value(m,'textureFileName',sheet['image']);value(m,'realTextureFileName',sheet['image']);value(m,'size','{%d,%d}'%(sheet['width'],sheet['height']))
    ET.indent(root,space='  ')
    file=OUT / sheet['image'].replace('.png','.plist')
    file.write_text('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'+ET.tostring(root,encoding='unicode')+'\n',encoding='utf-8')
    return file.name

old=json.loads((OUT/'motion-manifest.json').read_text(encoding='utf-8'))
sheets=[analyze('survivor-attack-detail-a.png',0),analyze('survivor-attack-detail-b.png',4)]
source_frames=sheets[0]['frames']+sheets[1]['frames']
# The endpoint intentionally holds the same neutral drawing. It is not an extra drawn pose.
frames=source_frames[:7]+[{**source_frames[0],'index':7,'reusesDrawing':0}]
base=frames[0]; reference_height=old['actors']['survivor']['baseHeight']
scale=reference_height/base['bodyHeight']
size=[math.ceil(640/scale),math.ceil(256/scale)]
left_offset=base['feet']['left']-base['feet']['center']
time=0
for frame in frames:
    x,y,w,h=frame['rect']; feet=frame['feet']; pivot=feet['left']-left_offset
    frame.update({'name':f'survivor-attack-detail-{frame["index"]:02d}','sourceSize':size,'scale':scale,
                  'offset':[round(x+w/2-pivot,4),round(feet['y']-y-h/2-size[1]*0.4375,4)],
                  'time':round(time,6),'duration':TIMES[frame['index']]})
    time+=frame['duration']
for sheet in sheets:
    sheet['atlas']=export(sheet,[f for f in frames if f['image']==sheet['image']])
manifest={'version':1,'date':'2026-11-16','status':'native-import-pending','logicalSize':[640,256],
          'referenceHeight':reference_height,'sourcePixelsChanged':False,'uniformActionScale':scale,'duration':round(time,6),'impactTime':0.28,
          'keyframes':8,'uniqueDrawings':len(set(f['contentHash'] for f in frames)),'neutralEndpointReusesStart':True,
          'registration':'one action scale; first neutral feet center matches idle, left-foot anchor and ground baseline remain fixed',
          'sheets':[{k:v for k,v in s.items() if k!='frames'} for s in sheets],'frames':frames}
(OUT/'survivor-attack-detail.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'sheets':len(sheets),'keyframes':8,'uniqueDrawings':manifest['uniqueDrawings'],'bodyHeights':[f['bodyHeight'] for f in frames],'sourceSize':size,'uniformScale':scale}))
