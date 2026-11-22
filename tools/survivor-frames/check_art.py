"""Check exact source registration and draw the same-scale visual proof."""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from pack import ART, WIDTH, HEIGHT, card_faces


def font(size):
    filename=Path("C:/Windows/Fonts/msyh.ttc")
    return ImageFont.truetype(str(filename),size) if filename.exists() else ImageFont.load_default()


def proof(source, cels, timing):
    preview=ART/"preview"
    backdrop=(152,134,151)
    headings=("三视图原稿","托腮待机","出牌接触帧")
    panel=Image.new("RGB",(1230,878),backdrop)
    draw=ImageDraw.Draw(panel)
    for index,(image,caption) in enumerate(zip((source,cels["think"],cels["touch-middle"]),headings)):
        canvas=Image.new("RGBA",(WIDTH,HEIGHT))
        if index:
            for i,(card,metrics) in enumerate(zip(card_faces().values(),timing["cards"])):
                x,y=metrics["contact"] if index==2 and i==1 else metrics["rest"]
                dims=round(metrics["width"]),round(metrics["height"])
                card=card.resize(dims,Image.Resampling.LANCZOS)
                card=card.rotate(metrics["angle"],Image.Resampling.BICUBIC,expand=True)
                canvas.alpha_composite(card,(round(x-card.width/2),round(y-card.height/2)))
        canvas.alpha_composite(image)
        result=canvas.resize((443,816),Image.Resampling.LANCZOS)
        x=410*index-26
        panel.paste(result,(x,52),result)
        draw.text((410*index+150,16),caption,font=font(21),fill=(49,37,52),anchor="mt")
        draw.line([(410*index+24,850),(410*index+373,850)],fill=(124,108,123),width=1)
    panel.save(preview/"model-comparison.png",optimize=True)

    # Keep every pixel peg identical in this magnified source comparison.
    headers=("原稿侧脸","待机帧","触牌帧")
    detail=Image.new("RGB",(882,312),backdrop)
    labels=ImageDraw.Draw(detail)
    for i,(cel,title) in enumerate(zip((source,cels["think"],cels["touch-middle"]),headers)):
        rgba=cel.crop((105,6,252,152)).resize((264,261),Image.Resampling.LANCZOS)
        detail.paste(rgba,(i*294+15,45),rgba)
        labels.text((i*294+147,13),title,fill=(49,37,52),font=font(20),anchor="mt")
    detail.save(preview/"face-comparison.png",optimize=True)


def check():
    source=Image.open(ART/"source/profile.png").convert("RGBA")
    template=np.array(source)
    sheet=Image.open(ART.parent/"turnaround-golden.png").convert("RGB")
    original=np.asarray(sheet.crop((600,0,600+WIDTH,HEIGHT)))
    record=json.loads((ART/"registration.json").read_text(encoding="utf-8"))
    timings=json.loads((ART/"preview/timing.json").read_text(encoding="utf-8"))
    cels={key:Image.open(ART/"cels"/(key+".png")).convert("RGBA") for key in record["exposures"]}
    head=template[:153,:271]
    boots=template[605:]
    assert np.array_equal(head[:,:,:3][head[:,:,3]==255],original[:153,:271][head[:,:,3]==255])
    for name,image in cels.items():
        data=np.asarray(image)
        assert image.size==(WIDTH,HEIGHT) and not data[0,:,3].any()
        assert np.array_equal(data[:153,:271],head), name+" face/rim mismatch"
        assert np.array_equal(data[605:],boots), name+" movement below the peg"
    for name,(x,y) in record["fingers"].items():
        alpha=np.asarray(cels[name])[:,:,3]
        x,y=round(x),round(y)
        assert alpha[y-4:y+5,x-4:x+5].max()>180,name+" finger missing"
    assert len({im.tobytes() for im in cels.values()})==len(cels)
    proof(source,cels,timings)
    stats={"source":"turnaround-golden.png","sourceCropOrigin":[600,0],"frameSize":[WIDTH,HEIGHT],
           "uniqueFullFigurePNGs":len(cels),"matchingHeadRectRGBA":[0,0,271,153],
           "opaqueHeadPixelsComparedPerFrame":int((head[:,:,3]==255).sum()),
           "matchingLowerRectRGBA":[0,605,512,339],"maxMismatchedPixelsPerFrame":0}
    print(json.dumps(stats))
    (ART/"preview/art-check.json").write_text(json.dumps(stats,indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":
    check()
