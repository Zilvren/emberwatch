const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),{panelLayout}=require('../tools/load-ts.cjs').createLoader()(path.join(root,'assets/game/presentation/ui/PanelLayout.ts'));
const input={availableWidth:1440,availableHeight:900,width:760,height:580,titleHeight:32,subtitleHeight:22,actionWidths:[144,224],padding:24,margin:20,gap:12,buttonHeight:48};
test('unequal footer actions keep their identity, order and right alignment',()=>{
 const p=panelLayout(input),[cancel,confirm]=p.actions;
 assert.equal(cancel.width,144);assert.equal(confirm.width,224);assert.ok(cancel.x<confirm.x);
 assert.equal(confirm.x+confirm.width/2,p.width/2-p.padding);
 assert.equal(confirm.x-confirm.width/2-(cancel.x+cancel.width/2),12);
 assert.equal(cancel.y,confirm.y);
});
test('narrow containers stack full-width actions without losing the primary action',()=>{
 const p=panelLayout({...input,availableWidth:408,availableHeight:720,width:600,height:360});
 assert.equal(p.width,368);assert.ok(p.stacked);assert.equal(p.actions.length,2);
 for(const a of p.actions){assert.equal(a.width,p.innerWidth);assert.equal(a.x,0);}
 assert.ok(p.actions[0].y>p.actions[1].y);assert.ok(p.bodyHeight>=127.9);
});
test('long titles reserve more header space while preserving content and footer separation',()=>{
 for(const availableWidth of [360,408,800,1440])for(const titleHeight of [32,64,96]){
  const p=panelLayout({...input,availableWidth,titleHeight,availableHeight:720,height:400});
  assert.ok(p.width<=availableWidth-40);assert.ok(p.height<=680);assert.ok(p.bodyHeight>=127.9);
  const contentTop=p.bodyY+p.bodyHeight/2,contentBottom=p.bodyY-p.bodyHeight/2;
  assert.ok(contentTop<=p.height/2-p.headerHeight);assert.ok(contentBottom>=-p.height/2+p.footerHeight);
  for(const a of p.actions){assert.ok(a.x-a.width/2>=-p.width/2+p.padding-1e-8);assert.ok(a.x+a.width/2<=p.width/2-p.padding+1e-8);}
 }
});
test('an action-free panel reserves no empty button row',()=>{
 const p=panelLayout({...input,actionWidths:[]});assert.equal(p.actions.length,0);assert.equal(p.footerHeight,p.padding);assert.ok(p.bodyHeight>panelLayout(input).bodyHeight);
});
test('native confirmation panels cancel by default and block backdrop activation',()=>{
 const {read,script}=require('../tools/native-assets.cjs');
 for(const file of ['assets/prefabs/ui/panels/ConfirmPanel.prefab','assets/prefabs/ui/ConfirmPopup.prefab']){
  const a=read(file),modal=a.find(o=>o.__type__===script('ModalPanel')),focus=a.find(o=>o.__type__===script('ButtonFocusGroup'));
  assert.equal(modal.closeOnBackdrop,false);assert.equal(modal.closeAction,'modal-cancel');assert.equal(focus.modal,true);
  const initial=focus.initialButton.__id__,action=a[initial]._components.map(r=>a[r.__id__]).find(o=>o.__type__===script('ButtonAction'));assert.equal(action.actionId,'modal-cancel');
  const backdrop=a[modal.backdrop.__id__];assert.ok(backdrop._components.some(r=>a[r.__id__].__type__==='cc.BlockInputEvents'));
 }
});
