const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const data=read('assets/resources/actors/sketch08/motion-manifest.json');
test('08 actor resources contain 144 distinct, bounded, registered native sprite frames',()=>{
 let total=0;
 for(const [actor,definition]of Object.entries(data.actors))for(const [action,sheet]of Object.entries(definition.actions)){
  const frameCount=action==='idle'?24:8;
  assert.equal(sheet.frames.length,frameCount);assert.equal(sheet.uniqueFrames,frameCount);assert.ok(sheet.alphaZeroRatio>(action==='idle'?0.35:0.60));
  if(action==='idle'){assert.equal(sheet.duration,3);assert.equal(new Set(sheet.frames.map(frame=>frame.scale)).size,1);}
  const meta=read('assets/resources/actors/sketch08/'+sheet.atlas+'.meta');const imported=new Set(Object.values(meta.subMetas).map(frame=>frame.uuid));
  for(const frame of sheet.frames){const[x,y,width,height]=frame.rect;assert.ok(x>=0&&y>=0&&width>0&&height>0&&x+width<=sheet.width&&y+height<=sheet.height);assert.ok(imported.has(frame.uuid));assert.ok(Number.isFinite(frame.offset[0])&&Number.isFinite(frame.offset[1]));total++;}
  const clip=read('assets/animations/sketch08/Sketch08_'+actor+'_'+action+'.anim'),curve=clip.find(item=>item.__type__==='cc.ObjectCurve');assert.equal(clip[0]._duration,sheet.duration);
  if(action==='idle'){
   assert.equal(new Set(curve._values.map(value=>value.__uuid__)).size,1,'idle must keep one original drawing');
   const motion=clip.find(item=>item.__type__==='cc.RealCurve');assert.equal(motion._values.length,24);assert.equal(motion._values[0].value,0);assert.equal(motion._values[23].value,0);
  }else assert.equal(curve._values.length,frameCount);
  if(action==='attack'){assert.equal(clip[0]._events.length,1);assert.equal(clip[0]._events[0].func,'notifyImpact');assert.equal(clip[0]._events[0].frame,0.28);}else assert.equal(clip[0]._events.length,0);
 }
 assert.equal(total,144);
});
test('stable idle uses the exact approved 08 pixels and locks head and feet',()=>{
 const crypto=require('node:crypto');
 const approved=fs.readFileSync(path.join(root,'docs/designs/character-style-exploration/10-08-thin-outline.png'));
 assert.deepEqual(fs.readFileSync(path.join(root,'assets/resources/actors/sketch08/master08-thin.png')),approved);
 const hash=crypto.createHash('sha256').update(approved).digest('hex');
 for(const actor of Object.keys(data.actors)){
  const rig=read('assets/resources/actors/sketch08/'+actor+'-rig.json');assert.equal(rig.sourceSha256,hash);assert.equal(rig.sourcePixelsChanged,false);
  assert.ok(rig.vertices.length>100&&rig.vertices.length<4000);
  assert.ok(rig.indices.every(index=>index>=0&&index<rig.vertices.length));
  assert.ok(rig.vertices.some(v=>v[4]!==0||v[5]!==0));
  for(const v of rig.vertices){if(v[3]*1024<rig.lockedHeadAboveY-0.01||v[1]<-90){assert.equal(Math.abs(v[4]),0);assert.equal(Math.abs(v[5]),0);}}
 }
});
test('motion review uses real native prefab links and explicit Inspector button events',()=>{
 const graph=read('assets/ActorMotionReview.scene');assert.equal(graph.filter(item=>item.__type__==='cc.PrefabInstance').length,3);
 const buttons=graph.filter(item=>item.__type__==='cc.Button');assert.equal(buttons.length,7);
 for(const button of buttons){assert.equal(button.clickEvents.length,1);const event=graph[button.clickEvents[0].__id__];assert.equal(event.__type__,'cc.ClickEvent');assert.equal(event.component,'ActorMotionReview');assert.ok(event.handler);}
});
