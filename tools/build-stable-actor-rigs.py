"""Read the approved drawing without changing pixels; export native textured mesh geometry."""
import hashlib
import json
from collections import deque
from pathlib import Path
from PIL import Image
import cv2
import numpy as np
from scipy.spatial import Delaunay

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/designs/character-style-exploration/10-08-thin-outline.png'
OUT = ROOT / 'assets/resources/actors/sketch08'
image = Image.open(SOURCE).convert('RGB')
manifest = json.loads((OUT / 'motion-manifest.json').read_text(encoding='utf-8'))
regions = {
    'survivor': ((95, 95, 490, 649), (260, 292, 90, 100), 260),
    'wanderer': ((550, 45, 875, 649), (702, 260, 72, 110), 190),
    'brute': ((910, 16, 1480, 649), (1190, 295, 175, 135), 245),
}

for actor, (box, chest, head_limit) in regions.items():
    crop = image.crop(box)
    width, height = crop.size
    pixels = crop.load()
    walls = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            walls[y * width + x] = int(.2126 * r + .7152 * g + .0722 * b < 208)
    outside = bytearray(width * height)
    queue = deque()
    for y in range(height):
        for x in (0, width - 1):
            i = y * width + x
            if not walls[i] and not outside[i]:
                outside[i] = 1
                queue.append(i)
    for x in range(width):
        for y in (0, height - 1):
            i = y * width + x
            if not walls[i] and not outside[i]:
                outside[i] = 1
                queue.append(i)
    while queue:
        i = queue.popleft()
        x, y = i % width, i // width
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                ni = ny * width + nx
                if not walls[ni] and not outside[ni]:
                    outside[ni] = 1
                    queue.append(ni)
    mask = bytearray(1 - n for n in outside)
    # Keep connected character parts; discard isolated paper flecks.
    seen = bytearray(width * height)
    for initial in range(width * height):
        if not mask[initial] or seen[initial]:
            continue
        component, queue = [], deque([initial])
        seen[initial] = 1
        while queue:
            i = queue.popleft()
            component.append(i)
            x, y = i % width, i // width
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < width and 0 <= ny < height:
                    ni = ny * width + nx
                    if mask[ni] and not seen[ni]:
                        seen[ni] = 1
                        queue.append(ni)
        if len(component) < 180:
            for i in component:
                mask[i] = 0
    occupied = [i for i, value in enumerate(mask) if value]
    top, bottom = min(i // width for i in occupied), max(i // width for i in occupied) + 1
    foot = [i % width for i in occupied if i // width >= bottom - 4]
    center = (min(foot) + max(foot)) / 2 + box[0]
    scale = manifest['actors'][actor]['baseHeight'] / (bottom - top)
    binary = np.frombuffer(mask, dtype=np.uint8).reshape(height, width)
    contours, _ = cv2.findContours(binary.copy(), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    points = set()
    for contour in contours:
        for px, py in cv2.approxPolyDP(contour, .65, True).reshape(-1, 2):
            points.add((int(px), int(py)))
    distance = cv2.distanceTransform(binary, cv2.DIST_L2, 3)
    for py in range(top + 8, bottom, 20):
        for px in range(8, width, 20):
            if distance[py, px] >= 2:
                points.add((px, py))
    points = sorted(points)
    triangulation = Delaunay(np.array(points))
    tolerance = cv2.dilate(binary, np.ones((3, 3), np.uint8))
    indices = []
    def inside(point, field):
        x, y = round(point[0]), round(point[1])
        return 0 <= x < width and 0 <= y < height and field[y, x]
    for triangle in triangulation.simplices:
        a, b, c = [np.array(points[i]) for i in triangle]
        if not inside((a + b + c) / 3, binary):
            continue
        samples = [(u * t + v * (1 - t)) for u, v in ((a, b), (b, c), (c, a)) for t in (.25, .5, .75)]
        if all(inside(p, tolerance) for p in samples):
            indices.extend([int(triangle[0]), int(triangle[2]), int(triangle[1])])
    vertices = []
    for px, py in points:
        gx, gy = px + box[0], py + box[1]
        dx, dy = (gx - chest[0]) / chest[2], (gy - chest[1]) / chest[3]
        fade = max(0, min(1, (gy - head_limit) / 24))
        weight = max(0, 1 - dx * dx - dy * dy) ** 2 * fade * fade * (3 - 2 * fade)
        vertices.append([round((gx - center) * scale, 5), round((bottom + box[1] - gy) * scale - 112, 5), round(gx / image.width, 7), round(gy / image.height, 7), round(dx * 1.2 * weight * scale, 6), round(3 * weight * scale, 6)])
    data = {'version': 1, 'actor': actor, 'source': 'master08-thin.png', 'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'sourcePixelsChanged': False, 'lockedHeadAboveY': head_limit, 'baseHeight': manifest['actors'][actor]['baseHeight'], 'vertices': vertices, 'indices': indices}
    if len(vertices) > 4000:
        raise ValueError(f'{actor}: too many vertices')
    (OUT / f'{actor}-rig.json').write_text(json.dumps(data, separators=(',', ':')) + '\n', encoding='utf-8')
    print(actor, 'vertices', len(vertices), 'source bounds', box, 'height', bottom - top)
