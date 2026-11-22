"""Blender head authoring: one connected quad surface from the skull, through the ears, to the neck."""
from pathlib import Path
import bpy
import numpy as np


def smooth(x):
    x=np.clip(x,0,1);return x*x*(3-2*x)


def local_to_blender(x,y,z):
    x,y,z=np.broadcast_arrays(x,y,z);a=np.radians(30.);scale=1.61/800
    return np.stack([scale*(np.cos(a)*x+np.sin(a)*z)-.01,scale*(np.sin(a)*x-np.cos(a)*z),scale*(923-y)],axis=-1)


def portrait_to_blender(p):
    return local_to_blender(.285*p[:,0],155+.285*(p[:,1]-518),.285*(p[:,2]-315))


def portrait_cage(source):
    def initial(p):
        x,y,z=p.T
        height=np.interp(y,[5.72,5.95,6.17,6.31,6.46,6.55,6.63,6.73,6.84,6.95,7.10,7.29,7.45,7.60,7.85,8.14,8.50],
                            [635,568,517,494,472,458,449,435,413,401,372,329,300,265,201,139,76])
        return np.column_stack([x*188,height,238+170*z])
    pts=[];dest=[]
    def add(x,y,z,dx,dy,dz):
        for sign in ([1,-1] if x else [1]):pts.append([sign*x,y,z]);dest.append([sign*dx,dy,dz])
    # Front coordinates are relative to the midline. Z is read from the side drawing, in pixels.
    for pair in [(0,6.158,1.419,0,518,477),(0,6.29,1.49,0,496,497),(0,6.50,1.51,0,472,499),
                 (0,6.57,1.569,0,462,505),(0,6.63,1.558,0,449,510),(0,6.67,1.601,0,444,513),
                 (0,6.79,1.543,0,427,503),(0,6.85,1.617,0,415,511),(0,6.947,1.680,0,401,534),
                 (0,7.06,1.630,0,378,523),(0,7.27,1.510,0,336,505),(0,7.48,1.51,0,292,499),
                 (0,7.82,1.49,0,219,481),(0,8.48,.54,0,79,337),
                 (.17,7.283,1.53,32,334,480),(.448,7.308,1.390,93,322,445),
                 (.310,7.331,1.552,60,320,466),(.310,7.248,1.553,60,340,467),
                 (.16,7.433,1.505,26,302,490),(.337,7.501,1.423,67,292,458),(.512,7.419,1.318,103,302,432),
                 (.124,6.876,1.603,23,410,495),(.252,6.635,1.410,41,450,477),
                 (.45,6.347,1.03,84,478,401),(.607,6.65,.73,112,431,357),(.64,6.92,1.02,111,397,396),
                 (.78,6.96,.48,140,394,310),(.862,7.22,.35,157,354,293),(.797,7.34,.585,139,307,323),
                 (.730,7.49,.42,137,285,302),(.67,7.84,.2,134,208,261),
                 (0,7.40,-.38,0,303,170),(0,7.88,-.33,0,199,179),(0,6.81,-.15,0,439,203),
                 (.34,6.15,0,62,519,243),(0,6.09,.75,0,545,401),(0,5.75,.67,0,621,400),
                 (.55,5.76,.12,93,622,271),(.35,6.22,.59,63,513,365)]:add(*pair)
    pts=np.array(pts);diff=np.array(dest)-initial(pts);k=np.linalg.norm(pts[:,None]-pts[None,:],axis=2);aff=np.c_[np.ones(len(pts)),pts]
    matrix=np.block([[k-np.eye(len(k))*.012,aff],[aff.T,np.zeros((4,4))]])
    coeff=np.linalg.solve(matrix,np.vstack([diff,np.zeros((4,3))]));dist=np.linalg.norm(source[:,None]-pts[None,:],axis=2)
    return initial(source)+dist@coeff[:len(pts)]+np.c_[np.ones(len(source)),source]@coeff[len(pts):],initial(source)


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj


def load_image(path,name):
    image=bpy.data.images.load(str(path),check_existing=True);image.name=name;image.pack();return image


def make_head(rig,root,staging):
    old=bpy.data.objects['YouthPortrait'];bpy.data.objects.remove(old,do_unlink=True)
    with np.load(root/'tools/toon/reference/head-topology.npz') as a:
        src=a['positions'].astype(float);faces=a['faces'];source_uv=a['uv'];uv_indices=a['face_uv']
    portrait,neutral=portrait_cage(src);coords=portrait_to_blender(portrait)
    mesh=bpy.data.meshes.new('Head • continuous quad topology');mesh.from_pydata(coords.tolist(),[],faces.tolist());mesh.update()
    obj=bpy.data.objects.new('YouthPortrait',mesh);rig.users_collection[0].objects.link(obj);obj.parent=rig
    for poly in mesh.polygons:poly.use_smooth=True
    obj.shape_key_add(name='Basis');base=obj.shape_key_add(name='Neutral anatomy reference');base.data.foreach_set('co',portrait_to_blender(neutral).astype('f4').ravel());base.value=0
    # Existing artist UV islands are repacked in Blender after isolating the head from the full body.
    albedo=mesh.uv_layers.new(name='Head albedo');albedo.data.foreach_set('uv',source_uv[uv_indices.ravel()].astype('f4').ravel())
    activate(obj);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.select_all(action='SELECT');bpy.ops.uv.pack_islands(rotate=True,margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
    vid=np.array([loop.vertex_index for loop in mesh.loops],dtype=int)
    x,y,z=portrait.T;px=371+x;fy=1-y/609
    for name,us in [('Front painting',px/691),('Profile painting',z/691)]:
        uv=mesh.uv_layers.new(name=name);uv.data.foreach_set('uv',np.stack([us,fy],1)[vid].astype('f4').ravel())
    mesh.uv_layers.active=mesh.uv_layers['Head albedo'];mesh.uv_layers['Head albedo'].active_render=True
    # The side painting takes over continuously at the temples. Ear pigment is confined to the actual pinna.
    src_x,src_y,src_z=src.T;theta=np.degrees(np.arctan2(np.abs(x),np.maximum(1,z-315)))
    side=smooth((theta-29)/37);side=np.maximum(side,smooth((1.14-src_z)/.28)*smooth((6.75-src_y)/.39))
    ear=smooth((np.abs(src_x)-.65)/.12)*smooth((.92-src_z)/.24)*(1-smooth((src_y-7.39)/.11))*smooth((src_y-6.8)/.11)
    deep=smooth((.71-src_z)/.53)*(1-ear);neck=smooth((6.43-src_y)/.35)*smooth((1.16-src_z)/.32)
    side=np.maximum(side,neck);neutral_tone=np.maximum(deep*.83,neck*.58)
    weights=np.stack([side,ear,neutral_tone,np.ones(len(x))],axis=1).astype('f4');mix=mesh.color_attributes.new(name='Painting blend',type='FLOAT_COLOR',domain='POINT');mix.data.foreach_set('color',weights.ravel())
    head=obj.vertex_groups.new(name='Head');chest=obj.vertex_groups.new(name='Chest')
    for i,(height,depth) in enumerate(zip(src_y,src_z)):
        w=float(.12+.88*smooth((height-5.89)/.54));w=max(w,float(smooth((depth-.78)/.38)))
        head.add([i],w,'REPLACE');chest.add([i],1-w,'REPLACE')
    mat=bpy.data.materials.new('Portrait bake source');mat.use_nodes=True;mesh.materials.append(mat);nodes=mat.node_tree.nodes;links=mat.node_tree.links;nodes.clear()
    pictures=[load_image(staging/(f+'.png'),label) for f,label in [('face-front','Reference • face front'),('face-side','Reference • face profile'),('ear-side','Reference • ear')]]
    def texture(img,uvname):
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map=uvname;n=nodes.new('ShaderNodeTexImage');n.image=img;n.extension='EXTEND';links.new(uv.outputs['UV'],n.inputs['Vector']);return n.outputs['Color']
    front=texture(pictures[0],'Front painting');profile=texture(pictures[1],'Profile painting');eartex=texture(pictures[2],'Profile painting')
    attr=nodes.new('ShaderNodeVertexColor');attr.layer_name=mix.name;split=nodes.new('ShaderNodeSeparateColor');links.new(attr.outputs['Color'],split.inputs[0])
    def blend(a,b,factor):
        n=nodes.new('ShaderNodeMixRGB');links.new(factor,n.inputs[0]);links.new(a,n.inputs[1]);
        if isinstance(b,tuple):n.inputs[2].default_value=b
        else:links.new(b,n.inputs[2]);
        return n.outputs[0]
    color=blend(front,profile,split.outputs[0]);color=blend(color,eartex,split.outputs[1]);color=blend(color,(.34,.177,.108,1),split.outputs[2]);em=nodes.new('ShaderNodeEmission');links.new(color,em.inputs[0]);output=nodes.new('ShaderNodeOutputMaterial');links.new(em.outputs[0],output.inputs['Surface'])
    baked=bpy.data.images.new('Survivor • painted head',1536,1536,alpha=False);baked.colorspace_settings.name='sRGB';target=nodes.new('ShaderNodeTexImage');target.image=baked;nodes.active=target
    for node in nodes:node.select=False
    target.select=True;scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.device='CPU';scene.render.bake.margin=9
    activate(obj);bpy.ops.object.bake(type='EMIT',margin=9,use_clear=True,uv_layer='Head albedo');baked.pack()
    # Keep the projection graph available for revisions. Export and viewport shading use the painted bake.
    mat.use_fake_user=True;mesh.materials.clear();result=bpy.data.materials.new('Youth • baked portrait');result.use_nodes=True;mesh.materials.append(result)
    bs=result.node_tree.nodes.get('Principled BSDF');tex=result.node_tree.nodes.new('ShaderNodeTexImage');tex.image=baked;result.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.90
    # Preserve the two projection charts and their blend weights in the working file for rebaking.
    ao=mesh.color_attributes.new(name='Ambient',type='BYTE_COLOR',domain='POINT');ao.data.foreach_set('color',np.ones((len(src),4),'f4').ravel());mesh.color_attributes.active_color=ao
    sub=obj.modifiers.new('Portrait smoothing','SUBSURF');sub.levels=1;sub.render_levels=1;sub.subdivision_type='CATMULL_CLARK'
    arm=obj.modifiers.new('Survivor armature','ARMATURE');arm.object=rig
    obj['construction']='Continuous MakeHuman CC0 quad mesh. Portrait fit sculpted against the selected front and side drawings.'
    return obj
