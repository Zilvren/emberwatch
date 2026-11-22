"""Register a neutral matte for the original right-profile drawing."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "art-source/ashen-labyrinth/battle-survivor"
SOURCE = ART / "frames/source"
SIZE = (512,944)
SHEET_X = 600


def build():
    reg = json.loads((ART/"spine/parts-register.json").read_text(encoding="utf-8"))
    parts = {p["name"]:p for p in reg["parts"]}
    matte = Image.new("RGBA",(612,1868))
    for name in reg["setupDrawOrder"]:
        x,y,w,h = parts[name]["sourceXYWH"]
        swatch = Image.open(ART/"spine/parts"/(name+".png")).convert("RGBA")
        assert swatch.size==(w,h)
        matte.alpha_composite(swatch,(x,y))
    transparent = Image.new("L",SIZE)
    transparent.paste(matte.getchannel("A").resize((306,934),Image.Resampling.LANCZOS),(625-SHEET_X,0))
    sheet = Image.open(ART/"turnaround-golden.png").convert("RGB")
    original = sheet.crop((SHEET_X,0,SHEET_X+SIZE[0],SIZE[1])).convert("RGBA")
    original.putalpha(transparent)
    data = np.array(original)
    data[data[:,:,3]==0]=0
    Image.fromarray(data).save(SOURCE/"profile.png",optimize=True)


if __name__=="__main__":
    build()
