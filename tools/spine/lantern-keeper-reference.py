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


def kneeling_backings(source, rgba):
    """Register the single clean costume pieces underneath parts hidden in the standing painting."""
    sheet = np.asarray(Image.open(source / 'parts.png').convert('RGBA'))
    height, width = rgba.shape[:2]
    def registered(box, src, dst):
        x, y, right, bottom = box
        # Separate neighboring pieces before filtering their transparent edges.
        piece = sheet[y:bottom,x:right]
        matrix = cv2.getAffineTransform(np.float32(np.asarray(src)-[x,y]), np.float32(dst))
        return cv2.warpAffine(piece, matrix, (width,height), flags=cv2.INTER_LINEAR)

    torso = registered((478,0,746,427), [(622,206),(675,217),(600,418)],
        [(603,652),(706,682),(502,1147)])
    sleeve = registered((145,425,316,852), [(191,738),(191,688),(241,738)],
        [(372,809),(365,747),(434,802)])
    yy,xx=np.ogrid[:height,:width]
    # Only the missing upper sleeve runs underneath the shoulder cape. The
    # exposed cuff and glove already have their complete painted silhouette.
    sleeve[yy > 659-(xx-310)*91/135,3]=0
    lining = registered((478,230,746,427), [(490,390),(730,380),(620,240)],
        [(283,1094),(736,1080),(526,782)])
    lining[:,:,:3] = np.rint(lining[:,:,:3]*.76).astype(np.uint8)

    # The trouser tops are entirely covered at rest. Continue the leg fabric
    # up to the hip so the raised thigh and the bent rear knee stay solid.
    def trousers(box, profile):
        x0,y0,x1,y1 = box
        piece = sheet[y0:y1,x0:x1]
        y,x = np.mgrid[0:height,0:width]
        rows,centres,radii = np.array(profile).T
        radius=np.interp(y,rows,radii)
        u=(x-np.interp(y,rows,centres))/np.maximum(radius,1)
        sy=np.clip((y-rows[0])/(rows[-1]-rows[0])*(piece.shape[0]-1),0,piece.shape[0]-1)
        edges=[]
        for row in piece:
            solid=np.flatnonzero(row[:,3]>200)
            edges.append((solid[0],solid[-1]) if len(solid) else (5,10))
        low,high=np.array(edges).T
        middle=(low+high)/2
        sx=np.interp(sy,np.arange(len(middle)),middle)+np.clip(u,-1,1)*np.interp(sy,np.arange(len(low)),(high-low)*.42)
        result=cv2.remap(piece,sx.astype(np.float32),sy.astype(np.float32),cv2.INTER_LINEAR)
        result[:,:,3]=np.uint8(np.clip((1-np.abs(u))*radius+.5,0,1)*255)
        result[(y<rows[0])|(y>rows[-1]),3]=0
        return result
    front=trousers((490,850,635,1042),[(804,596,21),(842,604,51),(924,616,69),(1030,640,73),(1094,644,66),(1164,645,51)])
    rear=trousers((135,872,320,1020),[(809,411,24),(857,403,53),(964,384,64),(1065,370,68),(1126,360,62),(1181,346,48)])
    return {'coat':torso,'rest-arm':sleeve,'cloak-back':lining,'front-leg':front,'rear-leg':rear}

def profile_surfaces(source, output, owner, names, backings):
    """Three fixed views of surfaces revealed by bending the knee and closing the hand."""
    spec=json.loads((source/'kneel-registration.json').read_text(encoding='utf-8'))
    held=Image.open(source/spec['reference']).convert('RGBA')
    cover=Image.open(source/'landing-far-arm-cover.png').convert('RGBA')
    held.paste(cover.crop((288,0,432,210)),(1146,771))
    result={}
    for name,outline in spec['surfaces'].items():
        polygon=np.int32(outline)
        left,top=np.min(polygon,axis=0)-2
        right,bottom=np.max(polygon,axis=0)+3
        w,h=int(right-left),int(bottom-top)
        cut=np.array(held.crop((left,top,right,bottom)))
        mask=np.zeros((h*4,w*4),np.uint8)
        cv2.fillPoly(mask,[4*(polygon-[left,top]).astype(np.int32)],255,lineType=cv2.LINE_AA)
        coverage=cv2.resize(mask,(w,h),interpolation=cv2.INTER_AREA)
        cut[:,:,3]=np.uint8(np.rint(cut[:,:,3].astype(np.float32)*coverage/255))
        strip = spec['strips'].get(name)
        if strip:
            # Unwrap a single fabric texture along the leg. Visible standing
            # pigment supplies the boot and trousers; material hidden under
            # the coat comes from the same costume's bent view.
            part='front-leg' if name=='raised-trousers' else 'rear-leg'
            px,py,*_=backings[part]['sourceRect']
            neutral=np.asarray(Image.open(output/(part+'-backed.png')).convert('RGBA'))
            height=(len(strip)-1)*32
            v,u=np.mgrid[0:height,0:160].astype(np.float32)
            v=(v+.5)/32; u=(u+.5)/160
            stations=np.array(strip)
            def coordinates(rows):
                a,b,c,d=(np.interp(v,np.arange(len(rows)),col) for col in rows.T)
                return (a+(c-a)*u).astype(np.float32),(b+(d-b)*u).astype(np.float32)
            x0,y0=coordinates(stations[:,0])
            x1,y1=coordinates(stations[:,1])
            def fabric(image,x,y):
                nearest=distance_transform_edt(image[:,:,3]<128,return_distances=False,return_indices=True)
                return cv2.remap(image[:,:,:3][tuple(nearest)],np.float32(x),np.float32(y),
                                 cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
            standing=fabric(neutral,x0-px,y0-py)
            folded=fabric(cut,x1-left,y1-top)
            visible=np.uint8(owner==names.index(part)+1)
            depth=cv2.distanceTransform(visible,cv2.DIST_L2,5)
            mix=np.clip(cv2.remap(depth,x0,y0,cv2.INTER_LINEAR)/22,0,1)[:,:,None]
            rgb=standing*mix+folded*(1-mix)*.94
            opacity=np.minimum(np.minimum(u,1-u)*160,1)
            cut=np.dstack((np.uint8(np.rint(rgb)),np.uint8(np.rint(opacity*255))))
        Image.fromarray(cut).save(output/(name+'.png'))
        result[name]={'rect':[int(left),int(top),w,h],'strip':strip}
    return result


def cut_reference(source, output):
    spec = json.loads((source / 'standing-registration.json').read_text(encoding='utf-8'))
    path = source / spec['reference']
    rgba = np.array(Image.open(path).convert('RGBA'))
    if tuple(spec['canvas']) != rgba.shape[1::-1]:
        raise ValueError('Standing reference dimensions differ from its cut registration')
    names = list(spec['parts'])
    owner = visible_owners(rgba, spec, names)
    under, back_alpha, under_rgb = hidden_paint(rgba, spec, names, owner)
    overlap = back_alpha > 0
    foreground = rgba.copy()
    foreground[overlap], back_alpha[overlap] = compensate(
        rgba[overlap], back_alpha[overlap], under_rgb[overlap].astype(np.int32))
    ox, oy = spec['origin']
    unit = spec['unitsPerPixel']
    output.mkdir(parents=True, exist_ok=True)
    Image.fromarray(owner).save(output / 'visible-owners.png')
    registration = {}
    backings = kneeling_backings(source, rgba)
    backed_parts = {}
    for index, name in enumerate(names, start=1):
        part = np.zeros_like(rgba)
        visible = owner == index
        blocked = (under == index) & (back_alpha > 0)
        part[visible] = foreground[visible]
        part[blocked, :3] = under_rgb[blocked]
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
        if name in backings:
            # In a deep bend the covering part moves away. Use the real
            # visible pigment and the clean underpainting as one fixed skin.
            material = backings[name]
            covers = spec['parts'][name]['behind']
            hidden = np.isin(owner,[names.index(other)+1 for other in covers]) & (rgba[:,:,3] > 128)
            trouser = name in ('front-leg','rear-leg')
            if name == 'rest-arm' or name == 'coat':
                material[~(hidden | visible),3] = 0
            if name == 'coat':
                # Under the clasp the torso stays behind the cowl as the far
                # hand withdraws. Keep the backing below the original collar.
                material[:370,:,3]=0
            ay,ax = np.nonzero(visible | (material[:,:,3]>0))
            x0,y0 = max(0,int(ax.min())-2),max(0,int(ay.min())-2)
            x1,y1 = min(rgba.shape[1],int(ax.max())+3),min(rgba.shape[0],int(ay.max())+3)
            donor = material[y0:y1,x0:x1].copy()
            original = rgba[y0:y1,x0:x1]
            visible_part = visible[y0:y1,x0:x1]
            local_alpha = original[:,:,3].astype(np.float32)/255
            # Overlap the pigments inside solid fabric. A hard edge at the
            # old tunic cut would leave a rectangular patch on a raised knee.
            distance = cv2.distanceTransform(visible_part.astype(np.uint8),cv2.DIST_L2,5)
            edge_mix = np.clip(distance/(44 if trouser else 18),0,1)
            edge_mix = edge_mix*edge_mix*(3-2*edge_mix)
            if trouser:
                lower = np.clip((np.arange(y0,y1)[:,None]-1040)/110,0,1)
                edge_mix *= lower*lower*(3-2*lower)
            material_coverage = donor[:,:,3].astype(np.float32)/255
            mix = np.where(visible_part,local_alpha*(1-material_coverage*(1-edge_mix)),0)[:,:,None]
            dst_alpha = donor[:,:,3:4].astype(np.float32)/255 * (1-mix)
            total = mix+dst_alpha
            rgb = (mix*original[:,:,:3]+dst_alpha*donor[:,:,:3])/np.maximum(total,1.e-6)
            donor[:,:,:3] = np.uint8(np.rint(np.clip(rgb,0,255)))
            donor[:,:,3] = np.uint8(np.rint(total[:,:,0]*255))
            clear = donor[:,:,3] == 0
            nearest = distance_transform_edt(clear,return_distances=False,return_indices=True)
            donor[clear,:3] = donor[nearest[0][clear],nearest[1][clear],:3]
            Image.fromarray(donor).save(output/(name+'-backed.png'))
            backed_parts[name] = {
                'sourceRect':[x0,y0,x1-x0,y1-y0],
                'bounds':[(x0-ox)*unit,(oy-y1)*unit,(x1-x0)*unit,(y1-y0)*unit],
                'joint':spec['parts'][name]['joint'],
            }
        w, h = right - left, bottom - top
        registration[name] = {
            'sourceRect': [left, top, w, h],
            'bounds': [round(n, 7) for n in ((left-ox)*unit, (oy-bottom)*unit, w*unit, h*unit)],
            'joint': spec['parts'][name]['joint'],
        }
    result = {'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'parts': registration,
              'backings':backed_parts, 'profiles':profile_surfaces(source,output,owner,names,backed_parts)}
    (output / 'parts.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    return result


if __name__ == '__main__':
    cv2.setNumThreads(1)
    cut_reference(Path(sys.argv[1]), Path(sys.argv[2]))
