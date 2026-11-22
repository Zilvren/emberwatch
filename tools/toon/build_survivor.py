"""Rebuild the native review character, its three spatial card targets and four action clips."""
import cv2
import numpy as np
from PIL import Image

from gltf import GLB,Geometry
from model_surface import ART,ROOT
from portrait_model import build_portrait
from costume_model import build_costume
from arms_model import build_arms
from ambient import bake_occlusion
from survivor_pose import CARD_NAMES,CONTACT,DURATION,THINK,actor_pose,bind_pose,card_pose,hierarchy,standing_pose


def cards(glb,root):
    background=cv2.cvtColor(cv2.imread(str(ART.parent/'concepts/threshold/scene-with-selected-detail.png')),cv2.COLOR_BGR2RGB)
    outlines = [[(790,513),(887,516),(852,595),(744,588)],[(946,515),(1047,520),(1033,602),(920,598)],[(1091,522),(1188,527),(1195,605),(1076,601)]]
    nodes=[]
    for name,outline in zip(CARD_NAMES,outlines):
        # The three faces reuse the symbols at the gatekeeper's stall.
        matrix=cv2.getPerspectiveTransform(np.float32(outline),np.float32([(0,0),(191,0),(191,255),(0,255)]))
        face=cv2.warpPerspective(background,matrix,(192,256));back=np.empty_like(face);back[:]=[84,65,78]
        cv2.rectangle(back,(9,9),(182,246),(161,128,111),2);cv2.rectangle(back,(16,16),(175,239),(116,89,91),1)
        cv2.polylines(back,[np.int32([(96,88),(121,126),(96,165),(71,126)])],True,(167,137,114),3)
        material=glb.material(name,Image.fromarray(np.concatenate([face,back],axis=1)))
        geo=Geometry();x=35.;y=49.;b=3.
        contour=[(-x+b,-y),(x-b,-y),(x,-y+b),(x,y-b),(x-b,y),(-x+b,y),(-x,y-b),(-x,-y+b)]
        for side in range(2):
            for xx,yy in contour:
                u=.017+.966*(xx/x+1)/2;v=.017+.966*(1-yy/y)/2
                geo.vertex([xx,yy,1.65 if side==0 else -1.65],[(u+side)/2,v])
        for j in range(1,7): geo.faces.extend([(0,j,j+1),(8,8+j+1,8+j)])
        for j in range(8):
            k=(j+1)%8;geo.faces.extend([(j,8+j,k),(k,8+j,8+k)])
        frame,_=card_pose(0,len(nodes),'think',0)
        nodes.append(glb.node('Card'+name,root,mesh=glb.mesh('Printed'+name,geo,material),translation=(frame.p/800).tolist(),rotation=frame.r.as_quat().tolist()))
    return nodes


def transform(frame,parent):
    if parent is None: return frame.p/800,frame.r.as_quat()
    inv=parent.r.inv()
    return inv.apply(frame.p-parent.p)/800,(inv*frame.r).as_quat()


def sleeve_clearance(pose):
    # Finger pads and the palm must stay outside the opposite sleeve as the right arm unfolds.
    points=[f.p for name,f in pose.items() if name.startswith('L') and (name[-1:].isdigit() or name.endswith('Tip'))]
    points.append(pose['LHand'].p+pose['LHand'].r.apply([0,28,0])); points=np.asarray(points)
    pads=np.array([4.5]*(len(points)-1)+[14.]); clearance=float('inf')
    for start,end,first,last in [('RUpper','RFore',41,29),('RFore','RHand',30,19)]:
        a=pose[start].p; axis=pose[end].p-a; u=np.clip((points-a)@axis/(axis@axis),0,1)
        distance=np.linalg.norm(points-a-u[:,None]*axis,axis=1)
        clearance=min(clearance,float(np.min(distance-(first+u*(last-first))-pads)))
    return clearance


def main():
    glb=GLB();root=glb.node('SurvivorToon');parents=hierarchy();rest=bind_pose();thinking=actor_pose();joints={};idx={};bind=[]
    for name,parent in parents.items():
        frame=rest[name];p,r=transform(frame,rest.get(parent))
        idx[name]=len(joints);joints[name]=glb.node(name,joints.get(parent,root),translation=p.tolist(),rotation=r.tolist())
        matrix=np.eye(4);matrix[:3,:3]=frame.r.as_matrix();matrix[:3,3]=frame.p/800
        bind.append(np.linalg.inv(matrix).T.reshape(-1))
    glb.g['skins'].append({'name':'SurvivorRig','skeleton':joints['Pelvis'],'joints':list(joints.values()),'inverseBindMatrices':glb.accessor(bind,'MAT4')})
    groups=[('TurnaroundCloth',build_costume(idx)),('SelectedPortrait',build_portrait(idx)),('LinenAndGloves',build_arms(rest,idx))]
    bake_occlusion([piece for _,(pieces,_) in groups for piece in pieces])
    triangle_count=0
    for material,(pieces,painting) in groups:
        mat=glb.material(material,painting)
        for name,geo in pieces:
            triangle_count+=len(geo.faces)
            glb.node(name,root,mesh=glb.mesh(name,geo,mat,True),skin=0)
    card_nodes=cards(glb,root)
    minimum_clearance=float('inf')
    for name,phase,selected,duration,rate in [('Stand','stand',0,THINK,12),('Think','think',0,THINK,24),('Fan','fan',0,.60,30)]+[('Flick'+n,'flick',i,DURATION,60) for i,n in enumerate(CARD_NAMES)]:
        times=np.unique(np.round(np.r_[np.linspace(0,duration,round(duration*rate)+1),CONTACT] if phase=='flick' else np.linspace(0,duration,round(duration*rate)+1),6))
        curves={}
        def put(node,axis,value):curves.setdefault((node,axis),[]).append(value)
        for t in times:
            pose=standing_pose(rest,t) if phase=='stand' else thinking if phase=='fan' else actor_pose(t,phase,selected)
            if phase!='stand':minimum_clearance=min(minimum_clearance,sleeve_clearance(pose))
            for n,parent in parents.items():
                pos,rot=transform(pose[n],pose.get(parent));put(joints[n],'translation',pos);put(joints[n],'rotation',rot)
            for i,node in enumerate(card_nodes):
                f,scale=card_pose(t,i,phase,selected);put(node,'translation',f.p/800);put(node,'rotation',f.r.as_quat());put(node,'scale',[scale]*3)
        glb.animation(name,times,[(k[0],k[1],v) for k,v in curves.items()])
    glb.g['scenes'].append({'nodes':[root],'name':'SurvivorToon'})
    # Blender owns the artist-editable source and the final engine export.
    out=ROOT/'temp/survivor-blender-input/rig.glb'
    for i in range(3):
        p=actor_pose(CONTACT,'flick',i)['RIndexTip'].p;card=card_pose(CONTACT,i,'flick',i)[0]; target=card.p+card.r.apply([-26,-17,2.3]);assert np.linalg.norm(p-target)<.2,(i,p,target)
    assert minimum_clearance>-1.5,f'Folded hand intersects the sleeve by {-minimum_clearance:.1f} px'
    glb.save(out)
    print(f'{out.name}: {len(idx)} joints, {triangle_count} character triangles, {out.stat().st_size:,} bytes; three contact targets verified; minimum sleeve clearance {minimum_clearance:.2f} design px')


if __name__=='__main__':main()
