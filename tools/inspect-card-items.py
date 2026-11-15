"""Read-only sprite inspection. Export atlas metadata; never modify bitmap pixels."""
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets/resources/ui/cards'
image = Image.open(OUT / 'items.png').convert('RGBA')
alpha = image.getchannel('A')
histogram = alpha.histogram()
if histogram[0] / sum(histogram) < .60:
    raise ValueError('Item atlas background requires transparency review')
mask = alpha.point(lambda value: 255 if value > 180 else 0)
dictionary = ET.Element('dict')
ET.SubElement(dictionary, 'key').text = 'frames'
frames = ET.SubElement(dictionary, 'dict')
manifest = {'version': 1, 'image': 'items.png', 'width': image.width, 'height': image.height, 'frames': {}}
for index, name in enumerate(['attack', 'dodge', 'knife', 'evade', 'repair', 'heavy', 'slash', 'cash']):
    col, row = index % 4, index // 4
    x0, y0, x1, y1 = col * image.width // 4, row * image.height // 2, (col + 1) * image.width // 4, (row + 1) * image.height // 2
    bounds = mask.crop((x0, y0, x1, y1)).getbbox()
    if not bounds or bounds[0] < 3 or bounds[2] > x1 - x0 - 3:
        raise ValueError(f'{name}: illustration crosses its cell')
    left, top, right, bottom = bounds
    x, y, width, height = x0 + left - 3, y0 + top - 3, right - left + 6, bottom - top + 6
    if max(width, height) > 384:
        raise ValueError(f'{name}: illustration requires a larger logical canvas')
    manifest['frames'][name] = {'name': 'ui-card-' + name, 'rect': [x, y, width, height], 'viewBox': [x + width / 2 - 192, y + height / 2 - 192, 384, 384]}
    ET.SubElement(frames, 'key').text = 'ui-card-' + name
    frame = ET.SubElement(frames, 'dict')
    for key, value in [('frame', '{{%d,%d},{%d,%d}}' % (x, y, width, height)), ('offset', '{0,0}'), ('sourceSize', '{384,384}')]:
        ET.SubElement(frame, 'key').text = key
        ET.SubElement(frame, 'string').text = value
    ET.SubElement(frame, 'key').text = 'rotated'
    ET.SubElement(frame, 'false')
ET.SubElement(dictionary, 'key').text = 'metadata'
meta = ET.SubElement(dictionary, 'dict')
for key, value, kind in [('format', '2', 'integer'), ('textureFileName', 'items.png', 'string'), ('realTextureFileName', 'items.png', 'string'), ('size', '{%d,%d}' % image.size, 'string')]:
    ET.SubElement(meta, 'key').text = key
    ET.SubElement(meta, kind).text = value
root = ET.Element('plist', version='1.0')
root.append(dictionary)
ET.indent(root, space='  ')
(OUT / 'items.plist').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' + ET.tostring(root, encoding='unicode') + '\n', encoding='utf-8')
(OUT / 'items-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'icons': 8, 'sourcePixelsChanged': False, 'transparentBackground': True}))

materials = Image.open(OUT / 'materials.png').convert('RGBA')
material_alpha = materials.getchannel('A')
if material_alpha.histogram()[0] / (materials.width * materials.height) < .60:
    raise ValueError('Material icons require transparency review')
material_mask = material_alpha.point(lambda value: 255 if value > 180 else 0)
material_root = ET.Element('plist', version='1.0')
material_dict = ET.SubElement(material_root, 'dict')
ET.SubElement(material_dict, 'key').text = 'frames'
material_frames = ET.SubElement(material_dict, 'dict')
manifest['images'] = {'items.png': {'width': image.width, 'height': image.height}, 'materials.png': {'width': materials.width, 'height': materials.height}}
for entry in manifest['frames'].values():
    entry['image'] = 'items.png'
for index, name in enumerate(['rope', 'battery']):
    x0, x1 = index * materials.width // 2, (index + 1) * materials.width // 2
    left, top, right, bottom = material_mask.crop((x0, 0, x1, materials.height)).getbbox()
    x, y, width, height = x0 + left - 3, top - 3, right - left + 6, bottom - top + 6
    if min(left, x1 - x0 - right, top, materials.height - bottom) < 3 or max(width, height) > 512:
        raise ValueError(f'{name}: material icon crosses its safe frame')
    manifest['frames'][name] = {'name': 'ui-card-' + name, 'image': 'materials.png', 'rect': [x, y, width, height], 'viewBox': [x + width / 2 - 256, y + height / 2 - 256, 512, 512]}
    ET.SubElement(material_frames, 'key').text = 'ui-card-' + name
    frame = ET.SubElement(material_frames, 'dict')
    for key, value in [('frame', '{{%d,%d},{%d,%d}}' % (x, y, width, height)), ('offset', '{0,0}'), ('sourceSize', '{512,512}')]:
        ET.SubElement(frame, 'key').text = key
        ET.SubElement(frame, 'string').text = value
    ET.SubElement(frame, 'key').text = 'rotated'
    ET.SubElement(frame, 'false')
ET.SubElement(material_dict, 'key').text = 'metadata'
meta = ET.SubElement(material_dict, 'dict')
for key, value, kind in [('format', '2', 'integer'), ('textureFileName', 'materials.png', 'string'), ('realTextureFileName', 'materials.png', 'string'), ('size', '{%d,%d}' % materials.size, 'string')]:
    ET.SubElement(meta, 'key').text = key
    ET.SubElement(meta, kind).text = value
ET.indent(material_root, space='  ')
(OUT / 'materials.plist').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' + ET.tostring(material_root, encoding='unicode') + '\n', encoding='utf-8')
(OUT / 'items-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'icons': 10, 'sourcePixelsChanged': False}))
