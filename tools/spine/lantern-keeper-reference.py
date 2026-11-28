"""Cut the supplied standing painting into registered, independently skinned parts."""
import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt


def visible_owners(rgba, spec, names):
    # Boundaries are traced in the original 1024 x 1536 canvas. Follow the
    # pigment edge within a narrow band around each trace.
    alpha = rgba[:, :, 3]
    initial = np.full(alpha.shape, names.index('cloak-back') + 1, np.uint8)
    for cut in spec['visibleCuts']:
        cv2.fillPoly(initial, [np.int32(cut['polygon'])], names.index(cut['part']) + 1)
    solid = alpha >= 64
    markers = np.zeros(alpha.shape, np.int32)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    for index in range(1, len(names) + 1):
        core = cv2.erode(np.uint8((initial == index) & solid), kernel)
        markers[core != 0] = index
    background = len(names) + 1
    markers[cv2.erode(np.uint8(~solid), kernel) != 0] = background
    paint = cv2.cvtColor(cv2.GaussianBlur(rgba[:, :, :3], (3, 3), 0), cv2.COLOR_RGB2LAB)
    cv2.watershed(paint, markers)
    reliable = (markers > 0) & (markers < background) & solid
    seed = distance_transform_edt(~reliable, return_distances=False, return_indices=True)
    owner = cv2.medianBlur(markers[tuple(seed)].astype(np.uint8), 5)
    # Isolated strands and the low-alpha edge inherit the nearest visible part.
    nearest = distance_transform_edt(~solid, return_distances=False, return_indices=True)
    owner[~solid] = owner[tuple(nearest[:, ~solid])]
    owner[alpha == 0] = 0
    return owner


def hidden_paint(rgba, spec, names, owner):
    alpha = rgba[:, :, 3]
    yy, xx = np.ogrid[:alpha.shape[0], :alpha.shape[1]]
    (x0, y0), (x1, y1) = spec['sleeveEdge']
    sleeve_edge = y0 + (xx - x0) * (y1 - y0) / (x1 - x0)
    fold=np.asarray(spec['outerFold'])
    outer_x=np.interp(yy+.5,fold[:,1],fold[:,0])
    lining=(yy>387) & (xx>outer_x+2) & ((yy>517) | (xx<643))
    outer=(yy<383) | (xx<outer_x-2) | ((yy<513) & (xx>647))
    under = np.zeros_like(owner)
    distance = np.full(alpha.shape, 1.0, np.float32)
    donor = np.zeros_like(rgba[:, :, :3])
    inside_silhouette = distance_transform_edt(alpha >= 128)
    for index, name in enumerate(names, start=1):
        part = spec['parts'][name]
        covers = [names.index(other) + 1 for other in part['behind']]
        if not covers:
            continue
        dist = distance_transform_edt(~((owner == index) & (alpha >= 200)))
        ratio = dist / part['underlap']
        take = (ratio < distance) & (alpha >= 248) & (inside_silhouette >= dist*.65) & np.isin(owner, covers)
        if name == 'rest-arm':
            take &= (yy < sleeve_edge - 3) & outer
        if name == 'cloak-front':
            take &= (owner != names.index('rest-arm') + 1) | lining | (yy > sleeve_edge + 3)
        if name == 'cast-hand':
            take &= (yy > 458) & outer
        interior=cv2.erode(np.uint8((owner==index)&(alpha>210)),np.ones((11,11),np.uint8))
        nearest=distance_transform_edt(interior==0,return_distances=False,return_indices=True)
        extension = rgba[tuple(nearest)][:, :, :3]
        extension = cv2.GaussianBlur(extension, (0, 0), 2.0)
        under[take] = index
        distance[take] = ratio[take]
        donor[take] = extension[take]
    smooth = 1 - distance * distance * (3 - 2 * distance)
    backing_alpha = np.rint(224 * smooth).astype(np.int32)
    # The near arm and knee move far enough to uncover an entire occluded
    # strip. Continue the adjoining painted fabric through it at material
    # density. Sample well inside the same fabric along its folds.
    inner=np.asarray(spec['liningBehindArm'])
    inside_edge=xx<=np.interp(yy,inner[:,1],inner[:,0])
    arm=(owner==names.index('rest-arm')+1) & (inside_silhouette>3)
    has_lining=inside_edge & (lining | (yy>sleeve_edge+3))
    def fill(name,mask,offsets):
        mask=mask & (alpha>64)
        if not np.any(mask):
            return
        ident=names.index(name)+1
        clean=(owner==ident) & (alpha>=200)
        confidence=cv2.distanceTransform(clean.astype(np.uint8),cv2.DIST_L2,5)
        nearest=distance_transform_edt(confidence<8,return_distances=False,return_indices=True)
        ys,xs=np.nonzero(mask)
        total=np.full(len(ys),.12)
        color=rgba[nearest[0][mask],nearest[1][mask],:3].astype(np.float64)*total[:,None]
        for dx,dy in offsets:
            sx=np.clip(xs+dx,0,alpha.shape[1]-1); sy=np.clip(ys+dy,0,alpha.shape[0]-1)
            weight=np.clip((confidence[sy,sx]-3)/14,0,1)
            color+=rgba[sy,sx,:3]*weight[:,None]
            total+=weight
        donor[mask]=np.uint8(np.rint(color/total[:,None]))
        under[mask]=ident
        backing_alpha[mask]=np.minimum(234,np.maximum(0,alpha[mask].astype(np.int32)-10))
    fill('cloak-front',arm & has_lining,[(-83,112),(-112,145),(72,-105),(-42,65)])
    fill('coat',arm & ~has_lining,[(72,-45),(61,61),(82,95),(54,25)])
    garment=np.isin(owner,[names.index(n)+1 for n in ('coat','cloak-front','cloak-back')])
    for name,outline in spec['upperTrouserBackings'].items():
        support=np.zeros_like(owner)
        cv2.fillPoly(support,[np.int32(outline)],1)
        # The rear cloak always draws behind the trousers.
        fill(name,(support!=0) & garment & (owner!=names.index('cloak-back')+1) & (inside_silhouette>4),
             [(0,84),(-7,60),(5,111)])
    return under, backing_alpha, donor


def compensate(front, back_alpha, back_rgb):
    # The painting is translucent even inside the cloth (typically A=253).
    # Solve source-over in byte space so the hidden seam allowance doesn't
    # brighten, darken or thicken its visible owner in the standing pose.
    color = front[:, :3].astype(np.int32)
    alpha = front[:, 3].astype(np.int32)
    target = (color * alpha[:, None] + 127) // 255
    output = front.copy()
    pending = np.arange(len(front))
    # Match both black and white backgrounds under RGBA8 rounding. The
    # destination transmission is then correct on intermediate backgrounds too.
    desired_back = back_alpha.copy()
    for opacity in (1., .98, .90, .70, .48, .25, 0.):
        if not len(pending):
            break
        back_alpha[pending] = np.rint(desired_back[pending] * opacity).astype(np.int32)
        for delta in (0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5):
            if not len(pending):
                break
            ba = back_alpha[pending, None]
            fa = np.clip(np.rint(255*(alpha[pending,None]-ba)/(255-ba)).astype(np.int32)+delta, 1, 255)
            black = (back_rgb[pending]*ba+127)//255
            white = black+255-ba
            required = target[pending]
            fg = np.clip(np.rint((255*required-black*(255-fa))/fa),0,255).astype(np.int32)
            valid = np.all(((fg*fa+black*(255-fa)+127)//255 == required) &
                           ((fg*fa+white*(255-fa)+127)//255 == required+255-alpha[pending,None]), axis=1)
            output[pending[valid]] = np.column_stack((fg[valid],fa[valid]))
            pending = pending[~valid]
    if len(pending):
        raise ValueError('Unable to register the translucent seam')
    return output, back_alpha


def cut_reference(source, output):
    spec = json.loads((source / 'standing-registration.json').read_text(encoding='utf-8'))
    path = source / spec['reference']
    rgba = np.array(Image.open(path).convert('RGBA'))
    if tuple(spec['canvas']) != rgba.shape[1::-1]:
        raise ValueError('Standing reference dimensions differ from its cut registration')
    names = list(spec['parts'])
    owner = visible_owners(rgba, spec, names)
    under, back_alpha, donor = hidden_paint(rgba, spec, names, owner)
    overlap = back_alpha > 0
    foreground = rgba.copy()
    foreground[overlap], back_alpha[overlap] = compensate(
        rgba[overlap], back_alpha[overlap], donor[overlap].astype(np.int32))
    ox, oy = spec['origin']
    unit = spec['unitsPerPixel']
    output.mkdir(parents=True, exist_ok=True)
    Image.fromarray(owner).save(output / 'visible-owners.png')
    registration = {}
    for index, name in enumerate(names, start=1):
        part = np.zeros_like(rgba)
        visible = owner == index
        blocked = (under == index) & (back_alpha > 0)
        part[visible] = foreground[visible]
        part[blocked, :3] = donor[blocked]
        part[blocked, 3] = back_alpha[blocked]
        ys, xs = np.nonzero(part[:, :, 3])
        left, top = max(0, int(xs.min()) - 2), max(0, int(ys.min()) - 2)
        right, bottom = min(rgba.shape[1], int(xs.max()) + 3), min(rgba.shape[0], int(ys.max()) + 3)
        crop = part[top:bottom, left:right].copy()
        # Populate RGB just outside the matte for bilinear minification.
        clear = crop[:, :, 3] == 0
        nearest = distance_transform_edt(clear, return_distances=False, return_indices=True)
        crop[clear, :3] = crop[nearest[0][clear], nearest[1][clear], :3]
        Image.fromarray(crop).save(output / (name + '.png'))
        w, h = right - left, bottom - top
        registration[name] = {
            'sourceRect': [left, top, w, h],
            'bounds': [round(n, 7) for n in ((left-ox)*unit, (oy-bottom)*unit, w*unit, h*unit)],
            'joint': spec['parts'][name]['joint'],
        }
    result = {'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'parts': registration}
    (output / 'parts.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    return result


if __name__ == '__main__':
    cv2.setNumThreads(1)
    cut_reference(Path(sys.argv[1]), Path(sys.argv[2]))
