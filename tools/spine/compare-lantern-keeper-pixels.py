"""Compare native black/white readbacks on the exact uploaded artwork's grid."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art-source/ashen-labyrinth/lantern-keeper'
OUT = ROOT / 'output/playwright/lantern-keeper-reference-pixels'
SPEC = json.loads((SRC/'standing-registration.json').read_text(encoding='utf-8'))


def pixels(path):
    return np.asarray(Image.open(path).convert('RGBA'), dtype=np.int16)


def premultiply(raw):
    pm = raw.copy()
    pm[:, :, :3] = (raw[:, :, :3].astype(np.int32)*raw[:, :, 3:4]+127)//255
    return pm


def counts(diff, mask):
    d = diff[mask]
    maximum = d.max(axis=1)
    return {
        'pixels': int(len(d)), 'exactPixels': int(np.sum(maximum == 0)),
        'differentPixels': int(np.sum(maximum != 0)), 'overOne': int(np.sum(maximum > 1)),
        'overEight': int(np.sum(maximum > 8)), 'maxDelta': int(maximum.max()),
        'channelMaxRGBA': d.max(axis=0).tolist(), 'meanAbsoluteRGBA': round(float(d.mean()), 8),
    }


def display(pm):
    background = np.array([74,68,78])
    rgb = pm[:, :, :3] + (255-pm[:, :, 3:4])*background/255
    return Image.fromarray(np.uint8(np.clip(np.rint(rgb),0,255)))


def heatmap(diff):
    maximum = diff.max(axis=2)
    heat = np.zeros((*maximum.shape,3), np.uint8)
    heat[maximum == 1] = [55,142,201]
    heat[(maximum > 1) & (maximum <= 8)] = [241,179,51]
    heat[maximum > 8] = [235,81,74]
    return Image.fromarray(heat)


def strip(items, filename, crop=None, size=None):
    fontpath = Path('C:/Windows/Fonts/msyh.ttc')
    font = ImageFont.truetype(str(fontpath),20) if fontpath.exists() else ImageFont.load_default(size=20)
    images = [(name, image.crop(crop) if crop else image) for name,image in items]
    if size:
        images = [(name,image.resize(size,Image.Resampling.LANCZOS)) for name,image in images]
    width,height=images[0][1].size
    out=Image.new('RGB',(len(images)*width,height+42),(37,34,41))
    draw=ImageDraw.Draw(out)
    for i,(name,image) in enumerate(images):
        draw.text((i*width+12,6),name,fill=(244,236,226),font=font)
        out.paste(image,(i*width,42))
    out.save(OUT/filename)


def main():
    reference_path = SRC/SPEC['reference']
    raw = pixels(reference_path)
    ref = premultiply(raw)
    masks_dir = ROOT/'temp/keeper-reference-parts'
    owners = np.asarray(Image.open(masks_dir/'visible-owners.png'))
    names = list(SPEC['parts'])
    cloak = np.isin(owners, [1+names.index('cloak-front'),1+names.index('cloak-back')])
    Image.fromarray(np.uint8(cloak)*255).save(OUT/'reference-cloak-mask.png')
    all_pixels = np.ones(cloak.shape, bool)
    assert tuple(SPEC['canvas']) == raw.shape[1::-1]
    report = {
        'project': 'The end', 'measuredAtUTC': datetime.now(timezone.utc).isoformat(),
        'engine': 'Pink/Cocos 4.0.0-beta.1, web-desktop',
        'reference': str(reference_path.relative_to(ROOT)).replace('\\','/'),
        'referenceSha256': hashlib.sha256(reference_path.read_bytes()).hexdigest(),
        'referencePremultipliedPixelsSha256': hashlib.sha256(ref.astype(np.uint8).tobytes()).hexdigest(),
        'canvas': SPEC['canvas'], 'origin': SPEC['origin'], 'unitsPerPixel': SPEC['unitsPerPixel'],
        'sourcePose': 'idle at 0 seconds, native player skeleton, card slot hidden for this comparison',
        'readback': 'RGB on black plus coverage recovered from the same frozen pose on white; no image alignment or fitting after capture',
    }
    views = [('参考原图',display(ref))]
    for stage, label in [('before','修前实机'),('after','修后实机')]:
        capture=json.loads((OUT/(stage+'-capture.json')).read_text(encoding='utf-8'))
        control=pixels(OUT/(stage+'-control-pm.png'))
        actual=pixels(OUT/(stage+'-idle-pm.png'))
        diff=np.abs(actual-ref)
        target=ref[:,:,3]>=128
        visible=actual[:,:,3]>=128
        report[stage]={
            'skeletonUuid':capture['asset']['uuid'],
            'textures':capture['asset']['textures'], 'slots':len(capture['asset']['slots']),
            'premultipliedPixelsSha256':hashlib.sha256(actual.astype(np.uint8).tobytes()).hexdigest(),
            'calibration':counts(np.abs(control-ref),all_pixels),
            'wholeCanvas':counts(diff,all_pixels),
            'foregroundUnion':counts(diff,(actual[:,:,3]>0)|(ref[:,:,3]>0)),
            'visibleCloak':counts(diff,cloak),
            'silhouetteAtAlpha128':{
                'missing':int(np.sum(target & ~visible)), 'extra':int(np.sum(visible & ~target)),
                'intersectionOverUnion':float(np.sum(visible&target)/np.sum(visible|target)),
            },
            'regions':{},
        }
        for name,rect in {'clasp':[588,345,668,400],'sleeveOpening':[290,560,455,825],
                          'turnedHem':[23,930,344,1345]}.items():
            l,t,r,b=rect
            report[stage]['regions'][name]={'sourceRect':rect,**counts(diff[t:b,l:r],all_pixels[t:b,l:r])}
        report[stage]['decodedStraightRGBA']=counts(np.abs(pixels(OUT/(stage+'-idle.png'))-raw),all_pixels)
        report[stage]['straightRGBAControl']=counts(np.abs(pixels(OUT/(stage+'-control.png'))-raw),all_pixels)
        report[stage]['straightMatchesCalibration']=bool(np.array_equal(pixels(OUT/(stage+'-idle.png')),pixels(OUT/(stage+'-control.png'))))
        if 'fingerSamples' in capture:
            report[stage]['fingerSamples']=capture['fingerSamples']
        report[stage]['runtimeErrors']=capture['errors']
        heatmap(diff).save(OUT/(stage+'-difference.png'))
        views.append((label,display(actual)))
    strip(views,'comparison.png',size=(330,495))
    strip(views,'cloak-edge-1to1.png',crop=(42,830,432,1220))
    final=report['after']
    report['passed']=all(report[k]['calibration']['differentPixels']==0 for k in ('before','after')) and (
        final['wholeCanvas']['differentPixels']==0 and final['silhouetteAtAlpha128']['missing']==0 and
        final['silhouetteAtAlpha128']['extra']==0)
    (OUT/'pixel-comparison.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k]['wholeCanvas'] for k in ('before','after')},indent=2))
    if not report['passed']:
        raise SystemExit('The calibrated native standing pose differs from the supplied reference.')


if __name__ == '__main__':
    main()
