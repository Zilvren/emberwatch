"""Write the survivor's editable joint hierarchy and painted meshes as glTF 2.0."""
import json
import struct
from io import BytesIO

import numpy as np


class Geometry:
    def __init__(self):
        self.positions = []
        self.uvs = []
        self.faces = []
        self.joints = []
        self.weights = []

    def vertex(self, position, uv, weights=()):
        index = len(self.positions)
        self.positions.append(position)
        self.uvs.append(uv)
        self.joints.append([j for j, _ in weights] + [0] * (4 - len(weights)))
        self.weights.append([w for _, w in weights] + [0.] * (4 - len(weights)))
        return index

    def normals(self):
        v = np.array(self.positions)
        f = np.array(self.faces)
        n = np.zeros_like(v, dtype=float)
        area = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
        for i in range(3):
            np.add.at(n, f[:, i], area)
        # UV chart splits and the ends of a periodic cloth ring describe the same surface.
        # Average their normals, keeping the independently modelled lining and hem separate.
        _,ids=np.unique(np.round(v,4),axis=0,return_inverse=True)
        welded=np.zeros((int(ids.max())+1,3));np.add.at(welded,ids,n);n=welded[ids]
        return n / np.maximum(np.linalg.norm(n, axis=1)[:, None], 1e-9)


class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.g = {k: [] for k in ('nodes', 'meshes', 'skins', 'animations', 'scenes', 'materials',
                                    'textures', 'images', 'bufferViews', 'accessors')}
        self.g.update(asset={'version': '2.0', 'generator': 'The End / survivor toon authoring',
                             'copyright': 'The End character art. Face topology: MediaPipe, Apache-2.0. Hand topology: MakeHuman, CC0.'}, scene=0)
        self.g['samplers'] = [{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}]

    def view(self, data, target=None):
        self.bin.extend(bytes(-len(self.bin) % 4))
        i = len(self.g['bufferViews'])
        view = {'buffer':0, 'byteOffset':len(self.bin), 'byteLength':len(data)}
        if target:
            view['target'] = target
        self.g['bufferViews'].append(view)
        self.bin.extend(data)
        return i

    def accessor(self, data, shape, dtype='<f4', target=None, bounds=False):
        a = np.ascontiguousarray(data, dtype=dtype)
        record = {'bufferView':self.view(a.tobytes(), target), 'componentType':{'<f4':5126,'<u2':5123,'<u4':5125,'u1':5121}[dtype],
                  'count':len(a), 'type':shape}
        if bounds:
            flat = a.reshape(len(a), -1)
            record.update(min=flat.min(axis=0).tolist(),max=flat.max(axis=0).tolist())
        self.g['accessors'].append(record)
        return len(self.g['accessors']) - 1

    def material(self, name, picture):
        stream = BytesIO()
        picture.convert('RGB').save(stream, 'JPEG', quality=94, subsampling=0, optimize=True)
        index = len(self.g['materials'])
        self.g['images'].append({'name':name + '_paint', 'mimeType':'image/jpeg','bufferView':self.view(stream.getvalue())})
        self.g['textures'].append({'sampler':0,'source':index})
        self.g['materials'].append({'name':name, 'doubleSided':True, 'pbrMetallicRoughness':{
            'baseColorTexture':{'index':index}, 'metallicFactor':0., 'roughnessFactor':1.}})
        return index

    def node(self, name, parent=None, **fields):
        i = len(self.g['nodes'])
        self.g['nodes'].append(dict(name=name, **fields))
        if parent is not None:
            self.g['nodes'][parent].setdefault('children', []).append(i)
        return i

    def mesh(self, name, geometry, material, skin=False):
        attr = {'POSITION':self.accessor(np.array(geometry.positions)/800., 'VEC3',target=34962,bounds=True),
                'NORMAL':self.accessor(geometry.normals(), 'VEC3',target=34962),
                'TEXCOORD_0':self.accessor(geometry.uvs, 'VEC2',target=34962)}
        if skin:
            attr['JOINTS_0'] = self.accessor(geometry.joints, 'VEC4','<u2',34962)
            attr['WEIGHTS_0'] = self.accessor(geometry.weights,'VEC4',target=34962)
        if hasattr(geometry,'occlusion'):
            rgb=np.broadcast_to(np.rint(geometry.occlusion*255)[:,None],(len(geometry.positions),3));alpha=np.full((len(rgb),1),255)
            color=self.accessor(np.concatenate([rgb,alpha],axis=1),'VEC4','u1',34962)
            self.g['accessors'][color]['normalized']=True;attr['COLOR_0']=color
        idx = np.array(geometry.faces).ravel()
        primitive = {'attributes':attr, 'indices':self.accessor(idx,'SCALAR','<u2' if max(idx)<65536 else '<u4',34963), 'material':material}
        self.g['meshes'].append({'name':name,'primitives':[primitive]})
        return len(self.g['meshes']) - 1

    def animation(self, name, times, curves):
        anim = {'name':name,'channels':[],'samplers':[]}
        timeline = self.accessor(times,'SCALAR',bounds=True)
        for node, prop, values in curves:
            a = np.asarray(values).copy()
            if prop == 'rotation':
                for i in range(1,len(a)):
                    if a[i] @ a[i-1] < 0:
                        a[i] *= -1
            if np.max(abs(a - a[0])) < 1e-6:
                # Explicit if another clip animates it. An interrupted action must reset fully.
                time = self.accessor([times[0]],'SCALAR',bounds=True)
                a = a[:1]
            else:
                time = timeline
            s = len(anim['samplers'])
            anim['channels'].append({'sampler':s,'target':{'node':node,'path':prop}})
            anim['samplers'].append({'input':time,'output':self.accessor(a,'VEC4' if prop=='rotation' else 'VEC3'),'interpolation':'LINEAR'})
        self.g['animations'].append(anim)

    def save(self, path):
        self.bin.extend(bytes(-len(self.bin) % 4))
        self.g['buffers'] = [{'byteLength':len(self.bin)}]
        data = json.dumps(self.g, separators=(',',':')).encode()
        data += b' ' * (-len(data) % 4)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(struct.pack('<4sII',b'glTF',2,28 + len(data) + len(self.bin)) +
                         struct.pack('<I4s',len(data),b'JSON') + data + struct.pack('<I4s',len(self.bin),b'BIN\0') + self.bin)
