"""Bake short-range ambient occlusion across adjacent costume pieces in the bind pose."""
import numpy as np
from scipy.spatial import cKDTree
from model_surface import norm


def bake_occlusion(pieces):
    surfaces=[]
    for _,geo in pieces:
        p=np.asarray(geo.positions);surfaces.append(p[np.asarray(geo.faces)])
    triangles=np.concatenate(surfaces);edge_a=triangles[:,1]-triangles[:,0];edge_b=triangles[:,2]-triangles[:,0]
    crosses=np.cross(edge_a,edge_b);areas=.5*np.linalg.norm(crosses,axis=1)
    rng=np.random.default_rng(37);count=60000;chosen=rng.choice(len(areas),size=count,p=areas/areas.sum())
    a,b=rng.random((2,count));over=a+b>1;a[over]=1-a[over];b[over]=1-b[over]
    samples=triangles[chosen,0]+edge_a[chosen]*a[:,None]+edge_b[chosen]*b[:,None];sample_normals=norm(crosses[chosen])
    tree=cKDTree(samples);patch_area=areas.sum()/count
    for _,geo in pieces:
        p=np.asarray(geo.positions);normal=geo.normals();result=[]
        for off in range(0,len(p),1400):
            q=p[off:off+1400];d,idx=tree.query(q,k=90);r=(samples[idx]-q[:,None,:])/np.maximum(d[...,None],.01)
            own=np.maximum(0,np.sum(r*normal[off:off+len(q),None,:],axis=2));other=np.maximum(.07,-np.sum(r*sample_normals[idx],axis=2))
            form=own*other*np.exp(-d/55)*patch_area/(np.pi*(d*d+10));form[d<2.1]=0
            result.extend(np.clip(np.exp(-.79*form.sum(axis=1)),.64,1))
        geo.occlusion=np.array(result)
