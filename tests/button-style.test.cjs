const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),load=require('../tools/load-ts.cjs').createLoader();
const {buttonState,buttonColors}=load(path.join(root,'assets/game/presentation/ui/ButtonStyle.ts'));
const theme=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/ui/theme.json'),'utf8'));
const base={enabled:true,down:false,inside:false,hovered:false,keyboardFocus:false};
test('disabled controls override hover, pointer-down and keyboard focus',()=>{assert.equal(buttonState({...base,enabled:false,down:true,inside:true,hovered:true,keyboardFocus:true}),'disabled');});
test('pointer press cancels visually outside the original target bounds',()=>{assert.equal(buttonState({...base,down:true,inside:true}),'pressed');assert.equal(buttonState({...base,down:true,inside:false}),'normal');});
test('focus and hover remain independent and return to focus after hover leaves',()=>{assert.equal(buttonState({...base,keyboardFocus:true}),'focus');assert.equal(buttonState({...base,keyboardFocus:true,hovered:true}),'hover');});
test('disabled button text stays readable without fading the whole control',()=>{
 const luminance=hex=>{const n=parseInt(hex.slice(1),16),v=[n>>16,(n>>8)&255,n&255].map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return .2126*v[0]+.7152*v[1]+.0722*v[2];};
 for(const onDark of [false,true])for(const variant of ['primary','secondary','quiet','danger'])for(const state of ['normal','hover','pressed','disabled','focus']){
  const p=buttonColors(theme,variant,state,onDark),bg=p.fillAlpha? p.fill:onDark?'#37362f':theme.colors.canvas,light=Math.max(luminance(bg),luminance(p.text)),dark=Math.min(luminance(bg),luminance(p.text));assert.ok((light+.05)/(dark+.05)>=4.5,variant+' '+state+' text contrast');
 }
});
test('button prefabs have valid parentage and native self-bound activation events',()=>{
 const {compressUUID}=require(path.join(process.env.APPDATA,'cocos-default/cocos-4.0.0-beta.1/dist/core/base/utils/uuid.js'));
 const meta=JSON.parse(fs.readFileSync(path.join(root,'assets/game/presentation/ui/ButtonPresentation.ts.meta'),'utf8')),type=compressUUID(meta.uuid,false);
 for(const name of ['primary','secondary','quiet','danger']){
  const graph=JSON.parse(fs.readFileSync(path.join(root,'assets/prefabs/ui/buttons/'+name+'.prefab'),'utf8')),node=graph[graph[0].data.__id__];assert.equal(node._parent,null);assert.ok(!node._children.some(ref=>ref.__id__===graph[0].data.__id__));
  const button=graph.find(o=>o.__type__==='cc.Button');assert.equal(button.clickEvents.length,1);const event=graph[button.clickEvents[0].__id__];assert.equal(event.component,'ButtonAction');assert.equal(event.handler,'activate');assert.equal(graph.find(o=>o.__type__===type).previewState,'');
 }
});
