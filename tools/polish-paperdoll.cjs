const N=require('./native-assets.cjs');
const file='assets/prefabs/actors/PlayerActor.prefab',g=N.read(file),node=name=>g.find(o=>o.__type__==='cc.Node'&&o._name===name);
for(const name of ['RearShin','FrontShin'])node(name)._lpos.y=-80;
for(const name of ['RearFoot','FrontFoot'])node(name)._lpos.y=-68;
const cape=node('poncho');g[cape._components[0].__id__]._contentSize.height=142;
const slots=node('Slots');const upper=slots._children.find(ref=>g[ref.__id__]._name==='front-upper-arm');slots._children=slots._children.filter(ref=>ref!==upper);slots._children.splice(1,0,upper);
N.write(file,g);
console.log('Extended leg reach, covered shoulder/waist joints and kept the original actor root.');
