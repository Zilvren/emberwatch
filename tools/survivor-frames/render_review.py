"""Package the transparent frame sequence and deliver captured Cocos playback."""
import argparse
import io
import json
from pathlib import Path
import subprocess
from zipfile import ZipFile

from PIL import Image, ImageDraw

from pack import ART, ROOT


PREVIEW=ART/"preview"
CAPTURE=ROOT/"temp/survivor-frames/film"


def stills():
    report=json.loads((PREVIEW/"runtime-check.json").read_text(encoding="utf-8"))
    count=report["film"]["frames"]
    return [Image.open(CAPTURE/f"{i:03}.png").convert("RGB") for i in range(count)]


def gif(images):
    # Keep the opening and first breath, then show the three flicks in succession.
    window=images[:40]+images[101:]
    frames=[im.crop((60,0,566,606)).resize((466,558),Image.Resampling.LANCZOS) for im in window]
    palette_source=Image.new("RGB",(320,50*8))
    for i,img in enumerate(frames[::17][:32]):
        patch=img.resize((80,100),Image.Resampling.BOX)
        palette_source.paste(patch,((i%4)*80,(i//4)*50))
    palette=palette_source.quantize(colors=236,method=Image.Quantize.MEDIANCUT)
    indexed=[img.quantize(palette=palette,dither=Image.Dither.NONE) for img in frames]
    indexed[0].save(PREVIEW/"survivor-frames.gif",save_all=True,append_images=indexed[1:],
                    duration=40,loop=0,optimize=True,disposal=1)


def video(images,ffmpeg):
    args=[ffmpeg,"-hide_banner","-loglevel","error","-y","-f","image2pipe","-framerate","25","-c:v","mjpeg",
          "-i","pipe:0","-an","-c:v","libvpx","-b:v","1900k","-pix_fmt","yuv420p",
          str(PREVIEW/"survivor-frames.webm")]
    with subprocess.Popen(args,stdin=subprocess.PIPE) as encoder:
        for image in images:
            packet=io.BytesIO()
            image.save(packet,format="JPEG",quality=96,subsampling=0)
            encoder.stdin.write(packet.getvalue())
        encoder.stdin.close()
        if encoder.wait():
            raise RuntimeError("Could not encode the Cocos recording")


def strip(images):
    indices=[142,148,151,153,161]
    result=Image.new("RGB",(1300,271),(48,41,54))
    draw=ImageDraw.Draw(result)
    for index,frame in enumerate(indices):
        panel=images[frame].crop((92,7,380,277)).resize((257,241),Image.Resampling.LANCZOS)
        result.paste(panel,(index*260,0))
        draw.text((index*260+7,248),f"{(frame-140)/25:.2f} s",fill=(234,223,216))
    result.save(PREVIEW/"native-gesture-strip.png",optimize=True)


def package():
    record=json.loads((ART/"registration.json").read_text(encoding="utf-8"))
    with ZipFile(ART/"survivor-frame-sequence.zip","w") as output:
        for name in record["exposures"]:
            cel=Path("cels")/(name+".png")
            output.write(ART/cel,cel.as_posix())
        output.write(ART/"registration.json","registration.json")
        output.write(PREVIEW/"timing.json","timing.json")
    with ZipFile(ART/"survivor-frame-sequence.zip") as output:
        assert output.testzip() is None and len(output.namelist())==len(record["exposures"])+2


if __name__=="__main__":
    cli=argparse.ArgumentParser()
    cli.add_argument("--ffmpeg")
    opts=cli.parse_args()
    images=stills()
    gif(images)
    strip(images)
    if opts.ffmpeg:
        video(images,opts.ffmpeg)
    package()
