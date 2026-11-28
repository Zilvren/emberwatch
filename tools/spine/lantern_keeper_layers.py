"""Paint registration for the two parts that stay on model through the fall.
Cut lines are local to the padded, artist-painted landing poses. The head
and lowered glove use the registered standing reference.
"""
import cv2
import numpy as np
from scipy.ndimage import binary_fill_holes, distance_transform_edt
from scipy.interpolate import PchipInterpolator

# Near-arm bounds in the painted poses, clipped at the cuff when replacing the glove.
GLOVE_REGIONS = {
    0: [(136, 214), (179, 201), (177, 251), (168, 277), (173, 308), (182, 336), (172, 361), (151, 365), (140, 353), (137, 306), (129, 268)],
    1: [(148, 210), (199, 190), (196, 239), (206, 278), (225, 319), (245, 344), (247, 363), (224, 378), (199, 376), (194, 364), (193, 343), (177, 318), (161, 285), (152, 267), (145, 233)],
    2: [(196, 169), (266, 153), (270, 171), (266, 193), (270, 226), (276, 251), (280, 290), (282, 311), (292, 341), (309, 354), (314, 373), (307, 386), (278, 395), (256, 386), (251, 363), (251, 348), (240, 313), (230, 294), (217, 280), (204, 255), (197, 226), (190, 197)],
    5: [(252, 169), (322, 156), (320, 178), (311, 201), (313, 219), (313, 256), (311, 289), (314, 322), (317, 337), (331, 348), (332, 372), (322, 381), (277, 381), (275, 355), (277, 335), (269, 311), (266, 294), (262, 273), (254, 253), (253, 229), (246, 205)],
}

def polygon(shape, vertices):
    mask=np.zeros(shape[:2],np.uint8)
    cv2.fillPoly(mask,[np.int32(vertices)],255,lineType=cv2.LINE_AA)
    return mask.astype(np.float32)[:,:,None]/255

# The top of the outfit follows the collar below the separate head painting.
COLLAR = {
    0: [(0,77),(176,86),(194,95),(212,107),(237,122),(248,118),(255,108),(276,112),(400,151)],
    1: [(0,65),(228,81),(247,91),(263,107),(279,124),(291,132),(299,117),(319,117),(410,144)],
    2: [(0,42),(280,51),(305,63),(323,79),(339,108),(349,141),(362,132),(380,114),(470,123)],
    5: [(0,15),(280,26),(294,35),(310,49),(323,60),(338,85),(347,108),(354,135),(369,124),(379,118),(493,143)],
}
def outfit_key(art, cell):
    height, width = art.shape[:2]
    silhouette = polygon(art.shape,[*COLLAR[cell],(width+2,height+2),(-2,height+2)])
    collar_band=cv2.dilate(silhouette[:,:,0],cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(17,17)))[:,:,None]
    cloth=(art[:,:,2:3]+.035>=art[:,:,0:1]) & (art[:,:,3:4]>.9)
    silhouette=np.maximum(silhouette,collar_band*cloth)
    # Keep the actual sleeve and shoulder in each approved drawing. Only the
    # glove and cuff are replaced by the registered closing hand.
    yy,xx=np.ogrid[:height,:width]
    x0,y0,slope={0:(152,294,-.03),1:(221,336,-.40),2:(280,336,-.16),5:(300,336,-.11)}[cell]
    cuff = np.clip((yy-(y0+slope*(xx-x0)) + 3)/4,0,1).astype(np.float32)[:,:,None]
    cut = polygon(art.shape,GLOVE_REGIONS[cell]) * cuff
    body = art * silhouette * (1-cut)
    # Only fill a cut if it opens the interior of the garment. The outside of
    # the moving arm and the opening between the planted fist and boot stay clear.
    solid = body[:,:,3] > .5
    closed = cv2.morphologyEx(solid.astype(np.uint8), cv2.MORPH_CLOSE,
                              cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(13,13)))
    hidden = binary_fill_holes(closed) & ~solid & (cut[:,:,0]>.5)
    if np.any(hidden):
        exclude=cv2.dilate((cut[:,:,0]>.01).astype(np.uint8),np.ones((5,5),np.uint8))
        donors=solid & (exclude==0)
        closest=distance_transform_edt(~donors,return_distances=False,return_indices=True)
        fill=art[tuple(closest)]
        color=np.uint8(np.clip(np.rint(fill[:,:,:3]*255/np.maximum(fill[:,:,3:4],.001)),0,255))
        color=cv2.inpaint(color,exclude,7,cv2.INPAINT_TELEA)
        a=fill[hidden,3:4]
        body[hidden]=np.column_stack((color[hidden]/255*a,a))
    return body

def paint_head(canvas,parts,delta,angle,origin,density,pivot,lamp):
    """One rigid source for the head and lamp, area-sampled on the final grid."""
    r=np.deg2rad(angle)
    rot=np.array([[np.cos(r),-np.sin(r)],[np.sin(r),np.cos(r)]])
    def world(p):return (p-pivot)@rot.T+pivot+delta
    def pixel(p):return density*(origin+world(p)*[1,-1])
    for raw,(x,y,w,h) in parts:
        source=np.float32([[0,0],[raw.shape[1],0],[0,raw.shape[0]]])
        target=pixel(np.array([[x,y+h],[x+w,y+h],[x,y]]))
        corners=np.vstack((target,target[1]+target[2]-target[0]))
        lo=np.maximum(0,np.floor(corners.min(axis=0)).astype(int)-2)
        hi=np.minimum(canvas.shape[1::-1],np.ceil(corners.max(axis=0)).astype(int)+2)
        width,height=hi-lo
        # Supersample from the original high-resolution paint directly. Small
        # translations then conserve the energy and radius of the tiny lamp.
        scale=4
        matrix=cv2.getAffineTransform(source,np.float32((target-lo)*scale))
        layer=cv2.warpAffine(raw,matrix,(width*scale,height*scale),flags=cv2.INTER_LINEAR)
        layer=cv2.resize(layer,(width,height),interpolation=cv2.INTER_AREA)
        region=canvas[lo[1]:hi[1],lo[0]:hi[0]]
        region[:]=layer+region*(1-layer[:,:,3:4])
    return canvas,world(lamp)

def phase(times,values,time):
    return PchipInterpolator(times,values)(time)

def supporting_glove(pose):
    edge=[(282,336),(291,338),(302,338),(308,335),(312,335),(314,338),
          (319,340),(325,347),(327,352),(326,361),(324,366),(320,370),
          (313,371),(307,371),(302,372),(296,371),(288,372),(281,370),
          (279,367),(280,352),(280,344)]
    return pose*polygon(pose.shape,edge)

def right_arm(part,closed,t,times,warp_affine,grid,origin,landmarks):
    # All positions below refer to the actor's own right arm. Each row across
    # the wrapping has the same width as the master. Only the fingers foreshorten.
    source,bounds,size=part
    x,y,w,h=bounds; iw,ih=size
    elbow,wrist,tip=(landmarks[key] for key in ('elbow','wrist','tip'))
    lower=wrist-elbow
    def at(values): return phase(times,values,t)
    def rotation(degrees):
        a=np.deg2rad(degrees);return np.array([[np.cos(a),-np.sin(a)],[np.sin(a),np.cos(a)]])
    upper_turn=at([0,0,7,17,14,11,12])
    lower_turn=at([0,0,10,14,6,4,6])
    palm_turn=at([0,0,5,9,3,3,3])
    curl=at([0,.02,.58,1,1,1,1])
    grip=at([0,0,.49,1,1,1,1])
    # Preserve the wrist-to-palm length; roll the distal finger pads up under
    # the palm, with the thumb starting earlier on its own side of the glove.
    def hand_local(px,py):
        length=wrist[1]-py
        thumb=np.clip((px-wrist[0]-7)/4,0,1)
        crease=21-7*thumb
        distal=np.maximum(0,length-crease)
        shortened=length-distal*curl*(.87-.12*thumb)
        side=(px-wrist[0])*(1+.08*curl*np.clip(length/18,0,1))
        side-=thumb*curl*np.clip((length-8)/15,0,1)*4.2
        side-=curl*np.clip(distal/18,0,1)*.6
        return np.stack((side,-shortened),axis=-1)@rotation(palm_turn).T
    # The fingertip/knuckle path and fixed-length forearm determine the wrist.
    fist_scale=.64
    finger_ref=(1-grip)*hand_local(*tip)+grip*(rotation(palm_turn)@[0,-32*fist_scale])
    drop=np.array([at([tip[0],tip[0]-.2,-45.,-39.,-42.4,-42.4,-42.4]),
                   at([tip[1],tip[1]-.2,131.,77.,4.4,4.4,4.4])])
    target_wrist=drop-finger_ref
    target_elbow=target_wrist-rotation(lower_turn)@lower
    def sleeve_coords(px,py):
        p=np.stack((px,py),axis=-1)
        lo=(p-wrist)@rotation(lower_turn).T+target_wrist
        hi=(p-elbow)@rotation(upper_turn).T+target_elbow
        mix=np.clip((py-(elbow[1]-12))/24,0,1)
        mix=mix*mix*(3-2*mix)
        return lo+(hi-lo)*mix[...,None]
    # Forward map a fine regular strip once. Shared triangle edges use the
    # same coordinates in adjacent cells. Keep straight-alpha seams out of it.
    u,v=np.meshgrid(np.linspace(0,1,9),np.linspace(0,1,64))
    px=x+u*w; py=y+(1-v)*h
    dst=sleeve_coords(px,py)
    hand=hand_local(px,py)+target_wrist
    mix=np.clip((wrist[1]+4-py)/8,0,1)
    dst+=(hand-dst)*mix[...,None]
    src=np.stack((px,py),axis=-1)
    arm=paint_strip(source,src,dst,origin,grid)
    wrist_screen=origin+target_wrist*[1,-1]
    local=(grid-wrist_screen)@rotation(-palm_turn)
    distal=np.clip((local[:,:,1:2]+9)/5,0,1)
    if grip<.001:return arm*distal,drop,target_elbow,target_wrist
    matrix=fist_scale*rotation(-palm_turn)
    fist=warp_affine(closed,np.column_stack((matrix,wrist_screen-matrix@[303,338])))
    sleeve=np.clip((3-local[:,:,1:2])/3,0,1)*arm
    if grip>=.999:return (fist+sleeve*(1-fist[:,:,3:4]))*distal,drop,target_elbow,target_wrist
    opened=arm*np.clip((local[:,:,1:2]+1)/2,0,1)
    # Both grips share a registered palm and wrist. Interpolate their signed
    # outlines so the closing fingers leave just one opaque glove silhouette.
    def signed_outline(im):
        solid=np.uint8(im[:,:,3]>.5)
        return cv2.distanceTransform(solid,cv2.DIST_L2,3)-cv2.distanceTransform(1-solid,cv2.DIST_L2,3)
    distance=(1-grip)*signed_outline(opened)+grip*signed_outline(fist)
    opacity=np.clip(distance+.5,0,1)[:,:,None]
    color=(1-grip)*opened+grip*fist
    hand=np.dstack((color[:,:,:3]/np.maximum(color[:,:,3:4],.0001)*opacity,opacity))
    return (hand+sleeve*(1-opacity))*distal,drop,target_elbow,target_wrist

def paint_strip(source,src,dst,origin,grid):
    rows,cols=src.shape[:2]
    triangles=[]
    for j in range(rows-1):
        for i in range(cols-1):
            a=j*cols+i
            triangles.extend([(a,a+1,a+cols),(a+1,a+cols+1,a+cols)])
    return raster_mesh(source,origin+src.reshape(-1,2)*[1,-1],origin+dst.reshape(-1,2)*[1,-1],triangles,grid)

def raster_mesh(source,src,dst,triangles,grid):
    src=src.astype(np.float32);dst=dst.astype(np.float32)
    h,w=grid.shape[:2]
    # Pixels outside the strip sample transparent space.
    inv=np.full((h,w,2),-2,np.float32)
    for tri in triangles:
        d=dst[list(tri)];s=src[list(tri)]
        x,y,bw,bh=cv2.boundingRect(d)
        l,top,r,b=max(0,x),max(0,y),min(w,x+bw),min(h,y+bh)
        if r<=l or b<=top:continue
        pts=grid[top:b,l:r]
        mask=np.zeros((b-top,r-l),np.uint8)
        cv2.fillConvexPoly(mask,np.int32(np.rint((d-[l,top])*256)),255,shift=8)
        select=mask!=0
        m=cv2.getAffineTransform(d,s).astype(np.float32)
        inv[top:b,l:r][select]=pts[select]@m[:,:2].T+m[:,2]
    return cv2.remap(source,inv,None,cv2.INTER_LINEAR)
