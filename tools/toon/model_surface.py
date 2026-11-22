"""Shared model coordinates, material sampling and smooth cloth surfaces."""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from scipy.spatial.transform import Rotation

from gltf import Geometry

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art-source/ashen-labyrinth/battle-survivor'
SCALE = 1.61
TURN = Rotation.from_euler('y', 30, degrees=True).as_matrix()


def world(p):
    """Front turnaround units: right, downward, forward. glTF uses right, up, forward."""
    p = np.asarray(p, dtype=float)
    return ((p-[0,923,0])*[SCALE,-SCALE,SCALE]) @ TURN.T + [-8,0,0]


def point(x,y,z):
    return np.array([x-505.,1484.-y,z])


def norm(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1.e-8)


def smooth(x):
    x=np.clip(x,0,1);return x*x*(3-2*x)


def rgb_sample(image,x,y):
    shape=np.broadcast_shapes(np.shape(x),np.shape(y));x=np.broadcast_to(x,shape);y=np.broadcast_to(y,shape)
    return cv2.remap(image,x.astype('f4'),y.astype('f4'),cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)


def extend_color(image,mask):
    """Pad only with pixels from this material, including behind occluding accessories."""
    y,x=distance_transform_edt(~mask,return_distances=False,return_indices=True)
    return image[y,x]


class Atlas:
    def __init__(self,w=2048,h=2048):
        self.w,self.h=w,h
        self.canvas=Image.new('RGB',(w,h),(77,61,75));self.x=self.y=self.shelf=0

    def tile(self,pixels):
        pixels=np.asarray(pixels,dtype=np.uint8);h,w=pixels.shape[:2];pad=4
        if self.x+w+2*pad>self.w:self.x=0;self.y+=self.shelf;self.shelf=0
        if self.y+h+2*pad>self.h:raise ValueError('Paint atlas is full')
        x,y=self.x+pad,self.y+pad
        self.canvas.paste(Image.fromarray(np.pad(pixels,((pad,pad),(pad,pad),(0,0)),mode='edge')),(self.x,self.y))
        self.x+=w+2*pad;self.shelf=max(self.shelf,h+2*pad)
        return lambda u,v:((x+.5+np.asarray(u)*(w-1))/self.w,(y+.5+np.asarray(v)*(h-1))/self.h)


def grid(size):
    u,v=np.meshgrid(np.linspace(0,1,size[0]),np.linspace(0,1,size[1]));return u,v


def patch(geo,atlas,surface,paint,weights,*,mesh=(54,22),tex=(300,130),flip=False):
    u,v=grid(tex);pixels=paint(surface(u,v),u,v);uv=atlas.tile(np.uint8(np.clip(pixels,0,255)))
    u,v=grid(mesh);local=surface(u,v);positions=world(local);uu,vv=uv(u,v);base=len(geo.positions)
    for p,q,s,t,a,b in zip(positions.reshape(-1,3),local.reshape(-1,3),u.flat,v.flat,uu.flat,vv.flat):
        geo.vertex(p,[a,b],weights(q,s,t))
    w,h=mesh
    for row in range(h-1):
        for col in range(w-1):
            a=base+row*w+col;b=a+w;c=a+1;d=b+1
            geo.faces.extend([(a,b,c),(c,b,d)] if not flip else [(a,c,b),(c,d,b)])


def loft(rows,shape=None):
    data=np.asarray(rows,dtype=float);knots=np.linspace(0,1,len(rows))
    def f(u,v):
        ang=(u-.5)*2*np.pi
        y,rx,rz,cx,cz=(np.interp(v,knots,col) for col in data.T)
        if shape is not None:y,rx,rz,cx,cz=shape(ang,v,y,rx,rz,cx,cz)
        return np.stack([cx+rx*np.sin(ang),y,cz+rz*np.cos(ang)],axis=-1)
    return f


class CostumePaint:
    def __init__(self):
        master=Image.open(ART/'turnaround-golden-master.png').convert('RGB');self.res=2
        self.sheet=np.asarray(master.resize((1585*self.res,992*self.res),Image.Resampling.LANCZOS))
        self.maps={}
        sheet=np.asarray(Image.open(ART/'toon/material-study.png').convert('RGB'));h,w=sheet.shape[:2];h//=2;w//=2
        self.samples={n:sheet[y+7:y+h-7,x+7:x+w-7] for n,(x,y) in zip(['wool','scarf','leather','linen'],[(0,0),(w,0),(0,h),(w,h)])}

    def register(self,name,windows,accept):
        layers=[]
        for box in windows:
            x,y,w,h=box;im=self.sheet[2*y:2*(y+h),2*x:2*(x+w)].copy();rgb=im.astype(float)
            mask=accept(rgb);mask=cv2.erode(mask.astype('uint8'),np.ones((3,3),np.uint8)).astype(bool)
            if not mask.any():raise ValueError((name,box))
            layers.append((extend_color(im,mask),x,y))
        self.maps[name]=layers

    def material(self,name,p,u,v):
        theta=(u-.5)*2*np.pi
        wfront=np.maximum(0,np.cos(theta))**3;wback=np.maximum(0,-np.cos(theta))**3;wside=np.abs(np.sin(theta))**3
        total=(wfront+wside+wback)[...,None];out=np.zeros(p.shape,dtype=float)
        for (im,x,y),coord,weight in zip(self.maps[name],[300+p[...,0],769+p[...,2],1284-p[...,0]],[wfront,wside,wback]):
            out+=rgb_sample(im,(coord-x)*2,(p[...,1]-y)*2)*weight[...,None]
        return out/np.maximum(total,1.e-6)

    def swatch(self,rect,u,v):
        x,y,w,h=rect
        return rgb_sample(self.sheet,2*(x+(.50-.49*np.cos(2*np.pi*u))*w),2*(y+.07*h+.86*h*v)).astype(float)

    def fabric(self,name,u,v,turns=1):
        sample=self.samples[name];h,w=sample.shape[:2]
        # Mirror at each textile tile boundary. Physical grain density is independent of the silhouette.
        mirror=lambda t:1-np.abs(t%2-1)
        return rgb_sample(sample,mirror(u*turns)*(w-1),mirror(v)*(h-1)).astype(float)

    def volume_paint(self,p,u,charts):
        a=(u-.5)*2*np.pi;values=(np.cos(a),np.sin(a),-np.cos(a));sides=(np.sin(a),np.cos(a),-np.sin(a));w=(np.maximum(0,values[0])**4,np.abs(values[1])**4,np.maximum(0,values[2])**4)
        rgb=np.zeros_like(p);y=p[...,1]
        for chart,side,weight in zip(charts,sides,w):
            ys,left,right=np.asarray(chart).T;row=np.clip(y,ys[0],ys[-1]);l=np.interp(row,ys,left);r=np.interp(row,ys,right)
            pix=l+(r-l)*(.5+.46*side);rgb+=rgb_sample(self.sheet,pix*2,row*2)*weight[...,None]
        return rgb/(sum(w)[...,None]+1.e-8)


def bound(bones,name):return lambda p,u,v:[(bones[name],1.)]
