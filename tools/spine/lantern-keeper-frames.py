"""Bake registered RGBA exposures for the Lantern Keeper. Authoring only.
Inputs: existing painted keys plus the standing skin. Requires Pillow, numpy,
scipy and OpenCV. Runtime playback selects a single atlas region per exposure.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.interpolate import PchipInterpolator
import lantern_keeper_layers as layers

WIDTH, HEIGHT = 544, 464
DENSITY = 7/8  # One fixed sampling grid keeps the full atlas below 2048 px per side.
ORIGIN = np.array([332., 448.])
AXES = np.array([1., -1.])
GRID = np.dstack(np.meshgrid(np.arange(WIDTH), np.arange(HEIGHT))).astype(np.float32)
TIMES = [0., .07, .23, .4, .60, .735, .94]
EXPOSURES = [0., .035, .07, .12, .175, .23, .277, .32, .36, .4, .44, .48, .52, .56, .60, .645, .69, .735, .80, .87, .94]
NAMES = {0.: "stand", .07: "release", .23: "bend", .4: "drop", .60: "contact", .735: "compress", .94: "settle"}
SOLES = np.array([[398,549],[880,549],[1398,548],[477,994],[950,994],[1473,994]])
# Each row is the same feature in the full standing reference and the first three
# painted keys and final painting. The middle grounded keys use the last drawing.
FEATURES = {
    "crown": [(613,24),(272,21),(756,44),(1330,104),(1353,639)],
    "mask": [(661,161),(291,76),(784,103),(1372,176),(1386,716)],
    "ear": [(556,185),(266,77),(753,104),(1348,174),(1359,709)],
    "chin": [(683,264),(318,102),(804,128),(1395,204),(1410,751)],
    "backHair": [(458,136),(218,62),(709,80),(1281,138),(1313,673)],
    "clasp": [(631,373),(290,136),(772,161),(1325,228),(1348,770)],
    "shoulder": [(395,535),(220,155),(686,199),(1231,218),(1293,753)],
    "elbow": [(365,692),(201,261),(665,275),(1224,334),(1282,864)],
    "wrist": [(372,809),(201,303),(706,360),(1258,431),(1292,957)],
    "fist": [(414,965),(211,348),(719,388),(1269,463),(1300,991)],
    "belt": [(603,653),(281,238),(740,264),(1274,309),(1277,814)],
    "pouch": [(698,687),(326,255),(784,279),(1308,316),(1316,820)],
    "rearKnee": [(362,1135),(201,395),(670,414),(1205,461),(1209,986)],
    "rearAnkle": [(322,1356),(184,505),(625,503),(1100,502),(1103,970)],
    "rearToe": [(409,1504),(221,546),(661,543),(1141,543),(1082,984)],
    "frontKnee": [(650,1090),(313,395),(835,379),(1341,372),(1395,809)],
    "frontAnkle": [(667,1355),(326,504),(812,502),(1333,502),(1402,945)],
    "frontHeel": [(617,1458),(302,542),(784,542),(1299,541),(1366,986)],
    "toe": [(843,1473),(398,549),(880,549),(1398,548),(1473,994)],
    "fold": [(295,836),(134,338),(584,351),(1082,366),(1148,880)],
    "train": [(64,1334),(67,492),(501,490),(989,470),(1006,983)],
    "back": [(321,457),(166,196),(650,219),(1204,224),(1230,755)],
}
FAR = {
    "leftShoulder":[(687,450),(311,151),(781,181),(1315,235),(1359,790)],
    "leftElbow":[(775,575),(342,200),(817,250),(1301,281),(1333,837)],
    "leftWrist":[(876,454),(388,162),(859,233),(1268,269),(1296,806)],
    "leftPalm":[(919,390),(409,129),(870,198),(1258,248),(1275,781)],
}
# Offsets in world space from the accepted final drawing at impact and at
# maximum compression. The grounded fist, rear knee and sole have zero offset.
SETTLE = {
    "crown": [(-5,6),(6,-11)], "backHair":[(-6,6),(7,-10)],
    "mask":[(-4,6),(6,-10)], "ear":[(-5,6),(6,-10)], "chin":[(-4,5),(6,-9)],
    "clasp":[(-3,4),(4,-7)], "shoulder":[(-2,4),(4,-6)],
    "elbow":[(-1,2),(2,-3)], "belt":[(-1,2),(2,-3)], "pouch":[(-1,2),(2,-3)],
    "back":[(-4,5),(4,-5)], "fold":[(-6,14),(-9,18)], "train":[(-7,25),(-19,36)],
}

def stage(sheet_point, cell):
    return np.array([96., 2.]) + (np.array(sheet_point)-SOLES[cell])*.8*AXES

def screen(world):
    return ORIGIN + world*AXES

def landmark_tracks(features,reference_world):
    result = {}
    for name, (standing,release,bend,drop,settled) in features.items():
        end = stage(settled,5)
        a,b = SETTLE.get(name,[(0,0),(0,0)])
        result[name] = np.array([reference_world(standing),stage(release,0),stage(bend,1),stage(drop,2),end+a,end+b,end])
    return result

def image_data(file):
    raw = np.asarray(Image.open(file).convert("RGBA"),np.float32)/255.
    raw[:,:,:3] *= raw[:,:,3:4]
    return raw

def warp_image(im,transform):
    return cv2.warpAffine(im,np.array(transform,np.float32),(WIDTH,HEIGHT),flags=cv2.INTER_LINEAR)

def over(front,back):
    return front + back*(1-front[:,:,3:4])

def prepare(folder, inputs):
    parts={}
    for part in inputs["standing"]:
        x,y,w,h = part["bounds"]
        art = image_data(folder/(part["id"]+".png"))
        placed = warp_image(art, [[w/art.shape[1],0,ORIGIN[0]+x],[0,h/art.shape[0],ORIGIN[1]-y-h]])
        parts[part["id"]]=(placed,part["bounds"],(art.shape[1],art.shape[0]))
    legs=over(parts["rear-leg"][0],parts["front-leg"][0])
    spec=inputs['spec']
    refxy=(GRID-ORIGIN)/spec['unitsPerPixel']+spec['origin']
    (x0,y0),(x1,y1)=spec['sleeveEdge']
    seam=y0+(refxy[:,:,0]-x0)*(y1-y0)/(x1-x0)
    foreground=(refxy[:,:,1]>=seam)[:,:,None]
    wrist_y=spec['nearArm']['wrist'][1]
    sleeve=parts['rest-arm'][0]*((refxy[:,:,1]-wrist_y)*spec['unitsPerPixel']<1.0)[:,:,None]
    fold=np.asarray(spec['outerFold'])
    px,py=refxy[:,:,0],refxy[:,:,1]
    lining=((py>=385)&(px>=np.interp(py,fold[:,1],fold[:,0]))&((py>=515)|(px<645)))[:,:,None]
    cloth=parts['cloak-front'][0]
    body=over(cloth*lining,over(parts["coat"][0],over(legs,parts["cloak-back"][0])))
    body=over(cloth*~lining,over(sleeve*~foreground,body))
    bodies=[over(sleeve*foreground,body)]
    arms=[over(parts["cast-hand"][0],parts["cast-upper"][0])]
    # Separate the sleeve where it goes under the shoulder cape. It can now
    # retire behind an opaque torso while the right arm stays in the foreground.
    far_seams = [
        [(338,78),(464,78),(464,237),(354,237),(335,215),(322,197),(329,182),(343,165)],
        [(825,144),(912,144),(912,284),(826,284),(797,266),(789,242),(798,221),(807,200)],
    ]
    for cell in (0,1,2,5):
        art = image_data(folder/("pose-%d.png"%cell))
        x,y = inputs["keys"][cell]
        mask = np.zeros(art.shape[:2],np.uint8)
        if cell<2:
            cv2.fillPoly(mask,[np.int32(far_seams[cell])-[x,y]],255,lineType=cv2.LINE_AA)
        mask = mask.astype(np.float32)[:,:,None]/255.
        sx,sy=screen(stage([x,y],cell))
        transform=[[.8,0,sx],[0,.8,sy]]
        outfit=layers.outfit_key(art*(1-mask),cell)
        bodies.append(warp_image(outfit,transform))
        arms.append(warp_image(art*mask,transform))
    return parts,bodies,arms

def mesh_warp(image,source,target):
    if np.max(np.abs(source-target))<.001:
        return image
    fixed = np.float32([[0,0],[WIDTH//2,0],[WIDTH-1,0],[WIDTH-1,HEIGHT//2],
                         [WIDTH-1,HEIGHT-1],[WIDTH//2,HEIGHT-1],[0,HEIGHT-1],[0,HEIGHT//2]])
    src = np.vstack((screen(source),fixed)).astype(np.float32)
    dst = np.vstack((screen(target),fixed)).astype(np.float32)
    # Local least-squares similarities turn the illustrated limbs without
    # introducing diagonal creases when neighbouring landmarks pass each other.
    sample=GRID[::3,::3]
    diff=sample[:,:,None,:]-dst
    weights=(np.sum(diff*diff,axis=3)+4)**-1.50
    weights/=weights.sum(axis=2,keepdims=True)
    pc=weights@dst
    qc=weights@src
    dp=dst-pc[:,:,None,:]
    dq=src-qc[:,:,None,:]
    norm=np.maximum((weights*np.sum(dp*dp,axis=3)).sum(axis=2),.0001)
    a=(weights*np.sum(dp*dq,axis=3)).sum(axis=2)/norm
    b=(weights*(dp[:,:,:,0]*dq[:,:,:,1]-dp[:,:,:,1]*dq[:,:,:,0])).sum(axis=2)/norm
    x,y=(sample-pc).transpose(2,0,1)
    offset=qc+np.dstack((a*x-b*y,b*x+a*y))-sample
    mapping=GRID+cv2.remap(offset,GRID/3,None,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
    return cv2.remap(image,mapping,None,cv2.INTER_LINEAR)

def luma(im):
    flat=im[:,:,:3]+.7*(1-im[:,:,3:4])
    return np.uint8(np.clip(cv2.cvtColor(flat,cv2.COLOR_RGB2GRAY)*255,0,255))

def bridge(a,b,mix):
    # Solve only residual brush-detail motion after joint registration, in
    # both directions. Filtering and compositing stay in premultiplied RGBA.
    if mix<.001: return a
    if mix>.999: return b
    flow=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    ax,by=luma(a),luma(b)
    def aligned(image,source,destination,fraction):
        residual=flow.calc(source,destination,None)
        length=np.maximum(1,np.linalg.norm(residual,axis=2,keepdims=True)/22)
        return cv2.remap(image,GRID-fraction*residual/length,None,cv2.INTER_LINEAR)
    older=aligned(a,ax,by,mix)
    newer=aligned(b,by,ax,1-mix)
    primary,other,weight=(older,newer,mix) if mix<.5 else (newer,older,1-mix)
    alpha=primary[:,:,3:4]
    # Retain a single silhouette on the leg and far-arm inbetweens.
    difference=np.max(abs(primary[:,:,:3]-other[:,:,:3]),axis=2,keepdims=True)
    inside=(alpha>.97)&(other[:,:,3:4]>.97)
    blend=weight*inside*np.clip(1-difference/.065,0,1)
    return np.dstack((primary[:,:,:3]+blend*(other[:,:,:3]-primary[:,:,:3]),alpha))

def forearm_pose(image,source,target):
    p0,p1=screen(source[[1,3]])
    q0,q1=screen(target[[1,3]])
    u,v=p1-p0,q1-q0
    a=np.dot(u,v)/np.dot(u,u)
    b=(u[0]*v[1]-u[1]*v[0])/np.dot(u,u)
    matrix=np.array([[a,-b],[b,a]])
    return warp_image(image,np.column_stack((matrix,q0-matrix@p0)))

def main(folder):
    inputs=json.loads((folder/"inputs.json").read_text(encoding="utf-8"))
    spec=inputs['spec']
    def reference_world(pixel):
        return (np.asarray(pixel)-spec['origin'])*spec['unitsPerPixel']*AXES
    near_arm={name:reference_world(p) for name,p in spec['nearArm'].items()}
    head_pivot=reference_world(spec['headPivot'])
    lamp_center=reference_world(spec['cheekLamp'])
    parts,bodies,arms=prepare(folder,inputs)
    closed=layers.supporting_glove(image_data(folder/'pose-5.png'))
    head_parts=[(image_data(folder/(name+'.png')),parts[name][1]) for name in ('head','neck-wrap')]
    tracks=landmark_tracks(FEATURES,reference_world)
    def sequence(tracks):
        return np.stack(list(tracks.values()),axis=1)
    body_keys=sequence(tracks)
    far_keys=sequence(landmark_tracks(FAR,reference_world))
    body_curve=PchipInterpolator(TIMES,body_keys,axis=0)
    far_curve=PchipInterpolator(TIMES,far_keys,axis=0)
    result=[]
    for index,time in enumerate(EXPOSURES):
        interval=min(np.searchsorted(TIMES,time,side="right")-1,len(TIMES)-2)
        t=(time-TIMES[interval])/(TIMES[interval+1]-TIMES[interval])
        pose=body_curve(time); far_pose=far_curve(time)
        right,fist,elbow,wrist=layers.right_arm(parts['rest-arm'],closed,time,TIMES,warp_image,GRID,ORIGIN,near_arm)
        for key,position in [('elbow',elbow),('wrist',wrist),('fist',fist)]:
            pose[list(FEATURES).index(key)]=position
        def plate(paintings):
            if interval>=4:
                return mesh_warp(paintings[-1],body_keys[-1],pose)
            older=mesh_warp(paintings[interval],body_keys[interval],pose)
            if t<.001:return older
            next_key=-1 if interval==3 else interval+1
            newer=mesh_warp(paintings[next_key],body_keys[next_key],pose)
            return bridge(older,newer,t)
        body=plate(bodies)
        behind=np.zeros_like(body)
        if interval<3:
            if interval==2:
                # Pivot the last visible far forearm inward about the elbow.
                # The same painted palm travels entirely behind the coat.
                ease=t*t*(3-2*t)
                elbow=(1-ease)*far_keys[2,1]+ease*(body_keys[3,list(FEATURES).index("clasp")]+[-8,-38])
                v=far_keys[2,3]-far_keys[2,1]
                angle=np.deg2rad(117*ease)
                rot=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
                far_pose[1],far_pose[3]=elbow,elbow+rot@v
            behind=forearm_pose(arms[interval],far_keys[interval],far_pose)
            if interval<2:
                other=forearm_pose(arms[interval+1],far_keys[interval+1],far_pose)
                behind=bridge(behind,other,t)
        # The standing paint and the approved bent/kneeling paint each supply
        # the cloth visible in that pose. Joint and hem pins register the inbetweens.
        clasp=list(FEATURES).index('clasp')
        ear=list(FEATURES).index('ear')
        fastener=pose[clasp]
        composed=over(right, over(body,behind))
        name=NAMES.get(time,"inbetween-%02d"%index)
        composed=cv2.resize(composed,None,fx=DENSITY,fy=DENSITY,interpolation=cv2.INTER_AREA)
        # Use the existing idle head, including its painted cheek lamp. A
        # rigid turn changes its pose without changing hair volume or light.
        turn=float(layers.phase(TIMES,[0,-1,-7,-18,-24,-28,-24],time))
        delta=pose[ear]-body_keys[0,ear]
        composed,lamp=layers.paint_head(composed,head_parts,delta,turn,ORIGIN,DENSITY,head_pivot,lamp_center)
        alpha=composed[:,:,3:4]
        rgb=composed[:,:,:3]/np.maximum(alpha,.0001)
        rgba=np.uint8(np.rint(np.clip(np.dstack((rgb,alpha)),0,1)*255))
        ys,xs=np.where(rgba[:,:,3]>3)
        l,r=max(0,int(xs.min())-2),min(rgba.shape[1],int(xs.max())+3)
        top,bottom=max(0,int(ys.min())-2),min(rgba.shape[0],int(ys.max())+3)
        Image.fromarray(rgba[top:bottom,l:r]).save(folder/("landing-"+name+".png"))
        def marker(n):
            return pose[list(FEATURES).index(n)].round(2).tolist()
        result.append(dict(name=name,time=time,x=round((l+r)/(2*DENSITY)-ORIGIN[0],4),
                           y=round(ORIGIN[1]-(top+bottom)/(2*DENSITY),4),
                           width=round((r-l)/DENSITY,4),height=round((bottom-top)/DENSITY,4),
                           fist=fist.round(2).tolist(),rearKnee=marker("rearKnee"),toe=marker("toe"),
                           lamp=lamp.round(2).tolist(),clasp=fastener.round(2).tolist(),headAngle=round(turn,3)))
    (folder/"frames.json").write_text(json.dumps({"contact":.6,"frames":result}),encoding="utf-8")

if __name__=="__main__":
    cv2.setNumThreads(1)
    main(Path(sys.argv[1]))
