"""Build the registration sheets and the painted lineup from the actual Spine attachments."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art-source' / 'ashen-labyrinth' / 'battle-bestiary'
ORIGINAL = [('ash-moth', '灰灯蛾'), ('stone-claw', '叩石螯'), ('veil-idol', '垂幡守像')]
MYTHIC = [
    ('minotaur', '弥诺陶洛斯'), ('cyclops', '独眼石巨人'), ('hydra', '许德拉'),
    ('stymphalian-bird', '斯廷法洛斯鸟'), ('charybdis', '卡律布狄斯'), ('symplegades', '相撞双岩'),
]


def font(size):
    for name in ['msyh.ttc', 'NotoSansCJK-Regular.ttc', 'DejaVuSans.ttf']:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def parts_sheet(folder, name):
    registry = json.loads((folder / 'parts-register.json').read_text(encoding='utf8'))
    parts = registry['parts']
    cols, cell_w, cell_h = 4, 194, 147
    sheet = Image.new('RGB', (cols*cell_w+32, ((len(parts)+cols-1)//cols)*cell_h+78), '#37333e')
    draw = ImageDraw.Draw(sheet)
    draw.text((19, 14), name, fill='#f1dfc1', font=font(23))
    for i, part in enumerate(parts):
        x, y = 16 + i % cols * cell_w, 55 + i // cols * cell_h
        draw.rounded_rectangle((x, y, x+cell_w-5, y+cell_h-5), 5, fill='#4d4652')
        pic = Image.open(folder / 'parts' / (part['name']+'.png')).convert('RGBA')
        pic.thumbnail((cell_w-23, cell_h-36), Image.Resampling.LANCZOS)
        sheet.paste(pic, (x+(cell_w-pic.width)//2, y+5+(cell_h-38-pic.height)//2), pic)
        draw.text((x+9, y+cell_h-28), part['name'], fill='#eee2d2', font=font(14))
    sheet.save(folder / 'parts-sheet.png')


def lineup():
    sheet = Image.new('RGB', (1200, 970), '#3c3743')
    draw = ImageDraw.Draw(sheet)
    old_scale = {'ash-moth':1.02, 'stone-claw':.91, 'veil-idol':1.05}
    for row, group in enumerate([ORIGINAL, MYTHIC[:3], MYTHIC[3:]]):
        top = [41, 373, 668][row]
        if row < 2:
            draw.text((29, top-26), ['现有三怪', '神话遭遇'][row], fill='#c9b9a8', font=font(19))
            draw.line((146,top-8,1170,top-8),fill='#746674')
        for column, (identifier, name) in enumerate(group):
            folder=ART / identifier
            pic=Image.open(folder / 'setup.png').convert('RGBA')
            pic=pic.crop(pic.getchannel('A').getbbox())
            register=json.loads((folder/'parts-register.json').read_text(encoding='utf8'))
            visible_bottom=max(p['sourceXYWH'][1]+p['sourceXYWH'][3] for p in register['parts'])
            lift=max(0,(register['origin'][1]-visible_bottom)*register['scale']*.60)
            scale=old_scale.get(identifier,1)*.343
            pic=pic.resize((max(1,round(pic.width*scale)),max(1,round(pic.height*scale))),Image.Resampling.LANCZOS)
            center=204+396*column
            sheet.paste(pic,(center-pic.width//2,top+245-pic.height-round(lift)),pic)
            draw.text((center,top+261),name,fill='#f2dfc4',font=font(20),anchor='mt')
    sheet.save(ART/'preview'/'mythic-lineup.png')


if __name__ == '__main__':
    for identifier, title in MYTHIC:
        parts_sheet(ART/identifier, title)
    lineup()
