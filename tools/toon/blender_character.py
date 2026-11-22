"""Run inside Blender. --author builds the working file. --export exports an edited .blend as-is."""
import math
from pathlib import Path
import sys
import bpy
import bmesh
import numpy as np
from mathutils import Vector

HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from blender_head import activate,load_image,local_to_blender,make_head
from blender_eyes import make_eyes,white_ambient

ROOT=HERE.parents[1];STAGING=ROOT/'temp/survivor-blender-input'
SOURCE=ROOT/'art-source/ashen-labyrinth/battle-survivor/toon/Survivor.blend';OUTPUT=ROOT/'assets/ashen-survivor-toon/survivor.glb'


def coordinate(p):return Vector(local_to_blender(*p).tolist())


def material(name,path):
    m=bpy.data.materials.new(name);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=load_image(path,name+' • albedo');m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.93;return m


def hardware(rig):
    brass=material('Hardware • worn brass',STAGING/'aged-brass.png');hide=material('Hardware • saddle leather',STAGING/'saddle-leather.png')
    made=[];center=np.array([24,359,48.6]);angle=.30
    def band(p):
        x,y,z=p;return coordinate(center+[x*np.cos(angle)+z*np.sin(angle),y,z*np.cos(angle)-x*np.sin(angle)])
    def wire(name,points,r,m,cyclic=False):
        data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=6;data.bevel_depth=r;data.bevel_resolution=3;data.use_fill_caps=True
        curve=data.splines.new('POLY');curve.points.add(len(points)-1)
        for pt,co in zip(curve.points,points):pt.co=(*band(co),1)
        curve.use_cyclic_u=cyclic;o=bpy.data.objects.new(name,data);rig.users_collection[0].objects.link(o);o.data.materials.append(m);activate(o);bpy.ops.object.convert(target='MESH');made.append(bpy.context.object)
    outline=[]
    for xx,yy,begin in [(9,5,0),(-9,5,90),(-9,-5,180),(9,-5,270)]:
        for a in np.linspace(begin,begin+90,6):outline.append([xx+2.4*math.cos(math.radians(a)),yy+2.4*math.sin(math.radians(a)),4.6])
    wire('Belt • buckle',outline,.0025,brass,True);wire('Belt • tongue',[[-9,.1,4.8],[1,.2,6.2],[8,.2,4.8]],.00165,brass)
    for offset in [18,24]:wire('Belt • keeper',[[offset,-8,1],[offset,-8,4],[offset,8,4],[offset,8,1]],.0029,hide)
    for obj in made:
        obj.parent=rig;vg=obj.vertex_groups.new(name='Pelvis');vg.add(list(range(len(obj.data.vertices))),1,'REPLACE');am=obj.modifiers.new('Armature','ARMATURE');am.object=rig
    bpy.ops.object.select_all(action='DESELECT');
    for obj in made:obj.select_set(True)
    bpy.context.view_layer.objects.active=made[0];bpy.ops.object.join();result=bpy.context.object;result.name='BeltHardware'
    for poly in result.data.polygons:poly.use_smooth=True
    white_ambient(result.data)


def dress_meshes(rig):
    # Weld split UV seams in edit geometry. Blender keeps UV coordinates per corner.
    for name in ['SculptedHair','WovenCostume','TravelEquipment','ArticulatedHands','BootsAndTrousers']:
        obj=bpy.data.objects[name];bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm,verts=bm.verts[:],dist=.000004);bm.to_mesh(obj.data);bm.free();obj.data.update()
        for poly in obj.data.polygons:poly.use_smooth=True
    hair=bpy.data.objects['SculptedHair'];hair.shape_key_add(name='Basis');key=hair.shape_key_add(name='Crown and nape sweep')
    a=math.radians(30);size=1.61/800
    for vert,target in zip(hair.data.vertices,key.data):
        x,y,z=vert.co;xf=x+.01;localx=(xf*math.cos(a)+y*math.sin(a))/size;localz=(xf*math.sin(a)-y*math.cos(a))/size
        high=np.clip((z-1.68)/.12,0,1);back=np.clip((-localz+3)/38,0,1);outer=np.clip((abs(localx)-25)/28,0,1)
        # Sculpt the crown away from the cheeks and sweep the occipital locks away from the ears.
        target.co=vert.co+Vector((.005*high-.003*outer*back,.009*back*outer,.010*high*(1-.48*outer)))
    key.value=1.;hair['construction']='Individually volumetric locks over a scalp. Crown profile revised in Blender.'
    hardware(rig)


def source_image(m):
    named=m.get('paint_image');im=bpy.data.images.get(named) if named else None
    if im:return im
    if not m.use_nodes:return None
    node=next((n for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None);return node.image if node else None


def make_toon_material(m):
    im=source_image(m)
    if not im:return
    m['paint_image']=im.name;m.use_nodes=True;nt=m.node_tree;n=nt.nodes;l=nt.links;n.clear()
    tex=n.new('ShaderNodeTexImage');tex.image=im;tex.location=(-600,150);diff=n.new('ShaderNodeBsdfDiffuse');diff.location=(-630,-100);diff.inputs[0].default_value=(.85,.85,.85,1)
    lum=n.new('ShaderNodeShaderToRGB');lum.location=(-430,-100);l.new(diff.outputs[0],lum.inputs[0]);ramp=n.new('ShaderNodeValToRGB');ramp.location=(-240,-140);l.new(lum.outputs[0],ramp.inputs['Fac']);ramp.color_ramp.interpolation='EASE'
    ramp.color_ramp.elements[0].position=.19;ramp.color_ramp.elements[0].color=(.52,.54,.64,1);middle=ramp.color_ramp.elements.new(.42);middle.color=(.81,.82,.88,1);ramp.color_ramp.elements[-1].position=.68;ramp.color_ramp.elements[-1].color=(1.04,1.01,.97,1)
    mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1;mult.location=(5,140);l.new(tex.outputs['Color'],mult.inputs[1]);l.new(ramp.outputs['Color'],mult.inputs[2]);em=n.new('ShaderNodeEmission');em.location=(200,140);l.new(mult.outputs[0],em.inputs['Color']);out=n.new('ShaderNodeOutputMaterial');out.location=(380,140);l.new(em.outputs[0],out.inputs[0])


def set_action(rig,name):
    for obj in [rig,*rig.children_recursive]:
        ad=obj.animation_data
        if not ad:continue
        track=next((t for t in ad.nla_tracks if t.name==name and t.strips),None)
        if track:
            strip=track.strips[0];ad.action=strip.action
            if hasattr(strip,'action_slot') and strip.action_slot:ad.action_slot=strip.action_slot


def make_studio(rig):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.render.fps=50;scene.frame_end=170;scene.render.engine='BLENDER_EEVEE_NEXT';scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
    studio=bpy.data.collections.new('Studio | lighting and references');scene.collection.children.link(studio)
    def light(name,loc,power,size,tint):
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=tint;o=bpy.data.objects.new(name,data);studio.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.25))-o.location).to_track_quat('-Z','Y').to_euler()
    light('Key • broad daylight',(-2.5,-3.9,4.6),520,4.0,(1,.90,.83));light('Fill • stone bounce',(3,-1.1,2.5),250,4,(.76,.83,1));light('Rim • cloak',(.2,3.1,3),340,3,(.88,.85,1))
    world=bpy.data.worlds.new('Dusty lavender studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.17,.143,.183,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.72;scene.world=world
    camdata=bpy.data.cameras.new('Portrait camera');camdata.type='ORTHO';camdata.ortho_scale=2.08;cam=bpy.data.objects.new('Portrait camera',camdata);studio.objects.link(cam);cam.location=(.30,-4.1,1.18);cam.rotation_euler=(Vector((.015,0,.96))-cam.location).to_track_quat('-Z','Y').to_euler();scene.camera=cam;scene.render.resolution_x=850;scene.render.resolution_y=960;scene.render.resolution_percentage=100
    reference=load_image(ROOT/'art-source/ashen-labyrinth/battle-survivor/turnaround-golden.png','Guide • approved full turnaround');ref=bpy.data.objects.new('Guide • full turnaround',None);studio.objects.link(ref);ref.empty_display_type='IMAGE';ref.data=reference;ref.empty_display_size=2.6;ref.location=(2.5,.7,1.1);ref.rotation_euler=(math.pi/2,0,0);ref.hide_set(True);ref.hide_render=True
    materials={m for o in rig.children_recursive if o.type=='MESH' for m in o.data.materials if m}
    for m in materials:make_toon_material(m)
    # Keep the working viewport uncluttered. The armature, material graphs and clips stay directly editable.
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type!='VIEW_3D':continue
            sp=area.spaces.active;sp.region_3d.view_rotation=cam.rotation_euler.to_quaternion();sp.region_3d.view_distance=3.20;sp.region_3d.view_location=(0,0,1.01);sp.region_3d.view_perspective='ORTHO';sp.shading.type='MATERIAL';sp.shading.use_scene_lights=True;sp.shading.use_scene_world=True;sp.overlay.show_overlays=False
    set_action(rig,'Think');scene.frame_set(20);activate(bpy.data.objects['YouthPortrait']);bpy.context.preferences.filepaths.save_version=0


def export_game(rig):
    # Changes below occur in the export session only; the saved .blend retains keys, modifiers and toon graphs.
    set_action(rig,'Stand');bpy.context.scene.frame_set(0)
    for name in ['YouthPortrait','SculptedHair']:
        o=bpy.data.objects[name];activate(o)
        if name=='YouthPortrait':
            for uvname in ['Front painting','Profile painting']:
                if o.data.uv_layers.get(uvname):o.data.uv_layers.remove(o.data.uv_layers[uvname])
            attr=o.data.color_attributes.get('Painting blend')
            if attr:o.data.color_attributes.remove(attr)
        if o.data.shape_keys:
            mixed=o.shape_key_add(name='Game silhouette',from_mix=True);coords=[v.co.copy() for v in mixed.data];o.shape_key_clear()
            for v,p in zip(o.data.vertices,coords):v.co=p
        for mod in list(o.modifiers):
            if mod.type=='SUBSURF':bpy.ops.object.modifier_apply(modifier=mod.name)
    objects=[rig,*[o for o in rig.children_recursive if o.type=='MESH']];used={m for o in objects if o.type=='MESH' for m in o.data.materials if m}
    for m in used:
        im=source_image(m)
        if not im:continue
        n=m.node_tree.nodes;l=m.node_tree.links;n.clear();tex=n.new('ShaderNodeTexImage');tex.image=im;bs=n.new('ShaderNodeBsdfPrincipled');bs.inputs['Roughness'].default_value=.96;l.new(tex.outputs['Color'],bs.inputs['Base Color']);out=n.new('ShaderNodeOutputMaterial');l.new(bs.outputs[0],out.inputs[0])
    bpy.ops.object.select_all(action='DESELECT');
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=rig
    to=OUTPUT
    if '--output' in sys.argv:to=Path(sys.argv[sys.argv.index('--output')+1])
    to.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(to),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_step=1,export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_morph=False,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_extras=False)
    print('BLENDER EXPORT',to,to.stat().st_size)


def main():
    if '--author' in sys.argv:
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=50
        bpy.ops.import_scene.gltf(filepath=str(STAGING/'rig.glb'),import_pack_images=True)
        rig=bpy.data.objects['SurvivorToon'];set_action(rig,'Stand');bpy.context.scene.frame_set(0);make_head(rig,ROOT,STAGING);make_eyes(rig,STAGING);dress_meshes(rig);make_studio(rig)
        bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True);print('BLENDER SOURCE',SOURCE)
    if '--export' in sys.argv:export_game(bpy.data.objects['SurvivorToon'])


if __name__=='__main__':main()
