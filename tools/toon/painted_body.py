"""Fit the approved costume and face paint to a closed, skinnable three-quarter mesh."""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.interpolate import LinearNDInterpolator, RBFInterpolator
from scipy.optimize import least_squares
from scipy.spatial import Delaunay
from scipy.spatial.transform import Rotation

from gltf import Geometry

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art-source/ashen-labyrinth/battle-survivor'


def point(x, y, z):
    return np.array([x - 505., 1484. - y, z])


def profile(x, pairs):
    a = np.asarray(pairs)
    return np.interp(x, a[:, 0], a[:, 1])


def silhouette(im):
    rgb = np.asarray(im, dtype=float)
    bg = np.median(rgb[:, :55],axis=1)
    distance = np.linalg.norm(rgb - bg[:,None,:],axis=2)
    return np.uint8(distance > 22)


def body_mask(im):
    mask = silhouette(im)
    # The costume plate includes loose hanging sleeves. The pose rig supplies these in 3D.
    for y in range(420, 587):
        left = profile(y, [(420,0),(452,265),(472,316),(490,372),(499,390),(548,397),(566,400),(570,0)])
        right = profile(y, [(420,680),(445,636),(472,615),(543,608),(555,616),(565,620),(575,622),(586,639)])
        mask[y,:int(left)] = 0
        mask[y,int(right):] = 0
    soles = np.zeros_like(mask)
    for outline in [[(330,1409),(386,1408),(421,1421),(446,1443),(455,1469),(455,1476),(435,1481),(375,1482),(335,1475),(330,1469)],
                    [(545,1400),(616,1399),(643,1423),(681,1435),(711,1442),(728,1452),(731,1468),(697,1474),(604,1477),(546,1470)]]:
        cv2.fillPoly(soles,[np.int32(outline)],1)
    mask[1420:] &= soles[1420:]
    mask = cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    return np.uint8(labels == 1 + np.argmax(stats[1:,4]))


def paint_atlas(front, mask):
    # The back UVs derive from the independently drawn back turnaround, at corresponding heights.
    back = np.asarray(Image.open(ART/'turnaround-golden.png').convert('RGB').crop((1110,0,1460,936)))
    bmask = silhouette(back)
    h,w = mask.shape
    xx, yy = np.meshgrid(np.arange(w),np.arange(h))
    by = np.interp(yy[:,0],[17,238,330,567,835,1142,1340,1482],[15,157,214,367,537,707,837,919])
    bx = np.zeros((h,w),np.float32)
    for y in range(h):
        fg = np.flatnonzero(mask[y]); bg = np.flatnonzero(bmask[int(by[y])])
        if len(fg) > 1 and len(bg) > 1:
            bx[y] = np.interp(xx[y], [fg[0],fg[-1]], [bg[-1]-1,bg[0]+1])
    _, back_near = cv2.distanceTransformWithLabels(1-bmask,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
    back = back[bmask.astype(bool)][back_near-1]
    back_registered = cv2.remap(back,bx,np.broadcast_to(by[:,None],(h,w)).astype(np.float32),cv2.INTER_LINEAR)
    # Dilate paint up to the silhouette to avoid lilac seams at oblique angles and in mipmaps.
    core=cv2.erode(mask,np.ones((3,3),np.uint8));_, nearest = cv2.distanceTransformWithLabels(1-core,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
    front = np.asarray(front)
    front = front[core.astype(bool)][nearest - 1]
    back_registered = back_registered[core.astype(bool)][nearest-1]
    return Image.fromarray(np.concatenate([front,back_registered],axis=1))


def facial_surface():
    obj = Path(__file__).parent/'reference/canonical_face_model.obj'
    xyz = np.array([list(map(float,line.split()[1:4])) for line in obj.read_text().splitlines() if line.startswith('v ')])
    marks = {33:(517,160),133:(539,165),362:(555,165),263:(579,158),1:(566,192),4:(568,189),
             61:(539,210),291:(562,207),152:(548,237),10:(544,108),234:(475,174),454:(583,168),
             172:(497,211),397:(569,214),13:(551,209),168:(549,155)}
    ids = list(marks); target = np.array(list(marks.values()))
    def projection(p):
        rotated = Rotation.from_euler('yxz',p[1:4],degrees=True).apply(xyz)*p[0]
        return np.stack((rotated[:,0]+p[4],p[5]-rotated[:,1]),axis=-1),rotated[:,2]+45
    fit = least_squares(lambda p:(projection(p)[0][ids]-target).ravel(),[7,35,0,0,523,175],
                        bounds=([4,12,-24,-18,485,143],[11,67,24,18,560,200]))
    xy,z = projection(fit.x)
    adjust = RBFInterpolator(xy[ids],target-xy[ids],smoothing=14)
    xy += adjust(xy)
    return xy,LinearNDInterpolator(xy,z)


def intervals(row):
    breaks = np.flatnonzero(np.diff(np.r_[0,row,0]))
    return list(zip(breaks[::2],breaks[1::2]-1))


def body_mesh(bones):
    image = Image.open(ART/'toon/costume-plate.png').convert('RGB')
    mask = body_mask(image)
    heights, width = mask.shape
    face_xy,face_depth = facial_surface()
    rng = np.random.default_rng(42)
    samples = []
    for y in range(16,1484,13):
        for x in range(245,739,13):
            qx,qy = x + rng.integers(-3,4),y + rng.integers(-3,4)
            if mask[qy,qx]: samples.append((qx,qy))
    for qx,qy in face_xy:
        if 0 < qy < heights and 0 < qx < width and mask[round(qy),round(qx)]: samples.append((qx,qy))
    for margin in [0,4,10]:
        inside = cv2.erode(mask,np.ones((2*margin+1,2*margin+1),np.uint8)) if margin else mask
        for contour in cv2.findContours(inside,cv2.RETR_LIST,cv2.CHAIN_APPROX_NONE)[0]:
            if len(contour)<5: continue
            if margin==0:
                samples.extend(cv2.approxPolyDP(contour,0.85,True)[:,0,:])
            samples.extend(contour[::5 if margin==0 else 11,0,:])
    points = np.unique(np.round(samples,1),axis=0)
    triangles = Delaunay(points).simplices
    pts = points[triangles]
    keep = np.ones(len(pts),bool)
    for probe in [pts.mean(axis=1),*(.5*(pts[:,i]+pts[:,(i+1)%3]) for i in range(3))]:
        q = np.round(probe).astype(int)
        keep &= mask[q[:,1],q[:,0]].astype(bool)
    tri = triangles[keep][:,[0,2,1]] # Design Y points down. Front normals must face the camera, +Z.
    fid = face_depth(points)
    whole = cv2.distanceTransform(mask,cv2.DIST_L2,5)
    rows = [intervals(r) for r in mask]
    geometry = Geometry()
    front_z, back_z = [], []
    for i,(x,y) in enumerate(points):
        u,v = int(round(x)),int(round(y))
        a,b = min(rows[v],key=lambda ab:max(ab[0]-u,0,u-ab[1]))
        width_here = max((b-a)*.5,1)
        h = np.clip((x-(a+b)/2)/width_here,-1,1)
        elliptic = np.sqrt(max(0,1-h*h))
        max_depth = profile(y,[(15,48),(76,79),(150,83),(219,65),(255,52),(287,86),(335,108),
                               (398,102),(525,83),(580,72),(705,92),(834,106),(989,91),(1150,61),(1298,45),(1418,66),(1483,84)])
        radius = min(max_depth,width_here*1.16)
        edge = min(1,np.sqrt(max(0,whole[v,u])/13.))
        bias = 13-20*h if y < 1130 else (20 if x<493 else -27)
        front = bias + radius*elliptic*edge
        back = bias - radius*elliptic*edge
        if np.isfinite(fid[i]) and y<243 and x>467:
            blend = min(1, max(0,(y-127)/27),max(0,(x-469)/19))
            front = front*(1-blend)+fid[i]*blend
        fold = 3.5*np.sin(x*.085 + y*.017) + 2*np.sin(x*.043-y*.014)
        if 273 < y < 1170: front += fold*elliptic*edge
        front_z.append(max(front,bias+1.4)); back_z.append(min(back,bias-1.4))

    # Relax depth locally before joining the shells. The narrow openings in the line of the
    # hair and the coat should never turn into a long spike when viewed from the side.
    pixel=np.round(points).astype(int);occupied=np.zeros_like(mask);occupied[pixel[:,1],pixel[:,0]]=1
    _,near=cv2.distanceTransformWithLabels(1-occupied,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
    for z in (front_z,back_z):
        surface=np.zeros_like(mask,dtype=np.float32);surface[pixel[:,1],pixel[:,0]]=z
        smoothed=cv2.GaussianBlur(surface[occupied.astype(bool)][near-1],(0,0),5.5)
        for i,(u,v) in enumerate(pixel):
            w=.22 if 475<u<584 and 135<v<239 else .74
            z[i]=(1-w)*z[i]+w*smoothed[v,u]
    for side,z in enumerate((front_z,back_z)):
        for (x,y),d in zip(points,z):
            head = np.clip((279-y)/55,0,1)
            chest = (1-head)*np.clip((740-y)/186,0,1)
            hem = (1-head-chest)*np.clip((y-690)/218,0,1)*np.clip((1138-y)/120,0,1)*np.clip((450-x)/80,0,1)
            weights = [(bones[k],w) for k,w in [('Head',head),('Chest',chest),('MantleHem',hem),('Pelvis',max(0,1-head-chest-hem))] if w>1e-6]
            geometry.vertex(point(x,y,d),[(x+.5+side*width)/(2*width),(y+.5)/heights],weights)
    n = len(points)
    geometry.faces.extend(tri.tolist()); geometry.faces.extend((tri[:,::-1]+n).tolist())
    edges = {}
    for a,b,c in tri:
        for s,e in [(a,b),(b,c),(c,a)]:
            key = (min(s,e),max(s,e))
            if key in edges: del edges[key]
            else: edges[key]=(s,e)
    edge_back={}
    for s,e in edges.values():
        for k in (s,e):
            if k not in edge_back:
                idx=k+n
                weights=[(j,w) for j,w in zip(geometry.joints[idx],geometry.weights[idx]) if w>0]
                edge_back[k]=geometry.vertex(geometry.positions[idx],geometry.uvs[k],weights)
        geometry.faces.extend([(e,s,edge_back[s]),(e,edge_back[s],edge_back[e])])
    return geometry,paint_atlas(image,mask)
