"""Fit the two orbital surfaces inside the actual Blender eyelids using the portrait's gaze."""
import math
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from blender_head import portrait_to_blender,load_image


def white_ambient(mesh):
    ao=mesh.color_attributes.get('Ambient') or mesh.color_attributes.new(name='Ambient',type='BYTE_COLOR',domain='POINT')
    ao.data.foreach_set('color',np.ones((len(mesh.vertices),4),'f4').ravel());mesh.color_attributes.active_color=ao


def make_eyes(rig,staging):
    head=bpy.data.objects['YouthPortrait'];neutral=np.array([v.co[:] for v in head.data.vertices]);a=math.radians(30);scale=1.61/800
    x=(neutral[:,0]+.01)*math.cos(a)+neutral[:,1]*math.sin(a);z=(neutral[:,0]+.01)*math.sin(a)-neutral[:,1]*math.cos(a)
    source=np.stack([x/(scale*.285),518+(923-neutral[:,2]/scale-155)/.285,315+z/(scale*.285)],axis=1)
    tree=BVHTree.FromPolygons([Vector(p) for p in source],[list(p.vertices) for p in head.data.polygons])
    def height(x,y):
        pt,_,_,_=tree.ray_cast(Vector((x,y,800)),Vector((0,0,-1)),800)
        return pt.z if pt else 460.
    verts=[];faces=[];uv=[];columns=31;rows=11
    for side in [-1,1]:
        base=len(verts)
        for v in np.linspace(0,1,rows):
            for u in np.linspace(-.998,.998,columns):
                x=side*(61.0+31.7*u);line=328.5-6.3*u;arch=(1-u*u)**.66
                top=line-10.9*arch;bottom=line+9.5*arch;y=(1-v)*top+v*bottom
                near=(1-v)*height(x,top-1.3)+v*height(x,bottom+1.2)
                z=max(height(x,y)+1.10,near+1.45+5.7*arch*math.sin(math.pi*v))
                verts.append([x,y,z]);uv.append([(371+x-257)/230,1-(y-282)/75])
        for row in range(rows-1):
            for col in range(columns-1):
                i=base+row*columns+col;poly=[i,i+1,i+columns+1,i+columns];faces.append(poly if side<0 else poly[::-1])
    mesh=bpy.data.meshes.new('Eyes • fitted to eyelids');mesh.from_pydata(portrait_to_blender(np.array(verts)).tolist(),[],faces);mesh.update()
    obj=bpy.data.objects.new('SurvivorEyes',mesh);rig.users_collection[0].objects.link(obj);obj.parent=rig
    for p in mesh.polygons:p.use_smooth=True
    layer=mesh.uv_layers.new(name='Iris paint');layer.data.foreach_set('uv',np.array(uv,'f4')[[x.vertex_index for x in mesh.loops]].ravel());white_ambient(mesh)
    group=obj.vertex_groups.new(name='Head');group.add(list(range(len(verts))),1,'REPLACE');mod=obj.modifiers.new('Survivor armature','ARMATURE');mod.object=rig
    m=bpy.data.materials.new('Eyes • painted umber');m.use_nodes=True;tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=load_image(staging/'eye-paint.png','Survivor • approved gaze');shader=m.node_tree.nodes['Principled BSDF'];shader.inputs['Roughness'].default_value=.87;m.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color']);mesh.materials.append(m)
    return obj,m
