"""Read-only PNG analysis and atlas metadata export. Source image pixels are never changed."""
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DIRECTORY = ROOT / 'assets/resources/actors/sketch08'
ACTORS = ['survivor', 'wanderer', 'brute']
ACTIONS = ['idle', 'attack', 'hurt', 'death']
TIMINGS = {
    'idle': [0.125] * 24,
    'attack': [0.08, 0.07, 0.07, 0.06, 0.05, 0.06, 0.08, 0.09],
    'hurt': [0.025, 0.035, 0.045, 0.06, 0.045, 0.035, 0.025, 0.04],
    'death': [0.07, 0.08, 0.09, 0.10, 0.10, 0.12, 0.15, 0.20],
}

def gaps(values, start, end):
    runs, first = [], None
    for y in range(start, end):
        if not values[y] and first is None:
            first = y
        elif values[y] and first is not None:
            if y - first >= 2:
                runs.append((first, y))
            first = None
    if first is not None and end - first >= 2:
        runs.append((first, end))
    return runs

def analyze(file, columns):
    image = Image.open(file).convert('RGBA')
    width, height = image.size
    alpha = image.getchannel('A')
    histogram = alpha.histogram()
    minimum_empty = 0.35 if columns == 6 else 0.60
    if histogram[0] / (width * height) < minimum_empty:
        raise ValueError(f'{file.name}: transparent background requires review')
    mask = alpha.point(lambda value: 255 if value > 180 else 0)
    vertical = mask.getprojection()[1]
    cuts = [0]
    for row in range(1, 4):
        expected = round(height * row / 4)
        candidates = gaps(vertical, max(cuts[-1] + 10, expected - 85), min(height, expected + 85))
        if not candidates:
            raise ValueError(f'{file.name}: no clear separation at row {row}')
        run = min(candidates, key=lambda run: abs((run[0] + run[1]) / 2 - expected))
        cuts.append(round(sum(run) / 2))
    cuts.append(height)
    frames = []
    for index in range(columns * 4):
        row, column = divmod(index, columns)
        x0, x1 = column * width // columns, (column + 1) * width // columns
        y0, y1 = cuts[row], cuts[row + 1]
        local = mask.crop((x0, y0, x1, y1))
        bounds = local.getbbox()
        if not bounds:
            raise ValueError(f'{file.name}: frame {index} is empty')
        left, top, right, bottom = bounds
        if left < 3 or right > x1 - x0 - 3:
            raise ValueError(f'{file.name}: frame {index} crosses a horizontal cell edge')
        pixels = local.load()
        foot = [x for x in range(left, right) if sum(pixels[x, y] > 0 for y in range(max(top, bottom - 5), bottom)) >= 2]
        if not foot:
            foot = list(range(left, right))
        rect = [x0 + max(0, left - 3), y0 + max(0, top - 3), min(x1 - x0, right + 3) - max(0, left - 3), min(y1 - y0, bottom + 3) - max(0, top - 3)]
        frames.append({
            'index': index, 'rect': rect, 'bodyHeight': bottom - top,
            'feet': {'left': x0 + min(foot), 'right': x0 + max(foot), 'center': x0 + sum(foot) / len(foot), 'y': y0 + bottom - 1},
            'contentHash': hashlib.sha256(image.crop((rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3])).tobytes()).hexdigest(),
        })
    return {'image': file.name, 'width': width, 'height': height, 'columns': columns, 'alphaZeroRatio': round(histogram[0] / (width * height), 4), 'rowCuts': cuts, 'frames': frames}

def value(parent, key, content, kind='string'):
    ET.SubElement(parent, 'key').text = key
    ET.SubElement(parent, kind).text = str(content)

def export_atlas(sheet):
    root = ET.Element('plist', version='1.0')
    dictionary = ET.SubElement(root, 'dict')
    ET.SubElement(dictionary, 'key').text = 'frames'
    frames = ET.SubElement(dictionary, 'dict')
    for frame in sheet['frames']:
        ET.SubElement(frames, 'key').text = frame['name']
        entry = ET.SubElement(frames, 'dict')
        x, y, width, height = frame['rect']
        value(entry, 'frame', '{{%d,%d},{%d,%d}}' % (x, y, width, height))
        value(entry, 'offset', '{%.4f,%.4f}' % tuple(frame['offset']))
        ET.SubElement(entry, 'key').text = 'rotated'
        ET.SubElement(entry, 'false')
        value(entry, 'sourceSize', '{%d,%d}' % tuple(frame['sourceSize']))
    ET.SubElement(dictionary, 'key').text = 'metadata'
    metadata = ET.SubElement(dictionary, 'dict')
    value(metadata, 'format', 2, 'integer')
    value(metadata, 'textureFileName', sheet['image'])
    value(metadata, 'realTextureFileName', sheet['image'])
    value(metadata, 'size', '{%d,%d}' % (sheet['width'], sheet['height']))
    ET.indent(root, space='  ')
    text = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' + ET.tostring(root, encoding='unicode') + '\n'
    (DIRECTORY / sheet['atlas']).write_text(text, encoding='utf-8')

data = {'version': 1, 'date': '2026-11-14', 'reference': 'docs/designs/character-style-exploration/10-08-thin-outline.png', 'status': 'motion-review', 'logicalSize': [640, 256], 'actors': {}}
for actor in ACTORS:
    sheets = {action: analyze(DIRECTORY / f'{actor}-{action}.png', 6 if action == 'idle' else 2) for action in ACTIONS}
    base_height = sheets['idle']['frames'][0]['bodyHeight']
    for action, sheet in sheets.items():
        base = sheet['frames'][0]
        clip_scale = base_height / base['bodyHeight']
        time = 0.0
        for frame in sheet['frames']:
            index = frame['index']
            column = index % sheet['columns']
            scale = clip_scale
            raw_width, raw_height = math.ceil(640 / scale), math.ceil(256 / scale)
            feet = frame['feet']
            if action == 'attack':
                pivot_x = feet['left'] if actor == 'survivor' else feet['right']
            elif action == 'death':
                pivot_x = column * sheet['width'] / sheet['columns'] + base['feet']['center']
            else:
                pivot_x = feet['center']
            x, y, width, height = frame['rect']
            frame.update({
                'name': f'{actor}-{action}-{index:02}', 'scale': round(scale, 6),
                'sourceSize': [raw_width, raw_height],
                'offset': [round(x + width / 2 - pivot_x, 4), round(feet['y'] - y - height / 2 - raw_height * 0.4375, 4)],
                'time': round(time, 6), 'duration': TIMINGS[action][index],
            })
            time += TIMINGS[action][index]
        sheet.update({'atlas': f'{actor}-{action}.plist', 'duration': round(time, 6), 'loop': action == 'idle', 'impactTime': 0.28 if action == 'attack' else None, 'uniqueFrames': len({frame['contentHash'] for frame in sheet['frames']})})
        if sheet['uniqueFrames'] != len(TIMINGS[action]):
            raise ValueError(f'{actor}-{action}: repeated frames require review')
        export_atlas(sheet)
    data['actors'][actor] = {'name': {'survivor': '幸存者', 'wanderer': '游荡感染者', 'brute': '重型感染者'}[actor], 'baseHeight': base_height, 'actions': sheets}
(DIRECTORY / 'motion-manifest.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'actors': len(data['actors']), 'clips': 12, 'frames': sum(len(sheet['frames']) for actor in data['actors'].values() for sheet in actor['actions'].values()), 'sourcePixelsChanged': False, 'transparencyChecked': True}))
