// Scene-first layout, authored from the preserved playable baseline.
const fs=require('node:fs'),path=require('node:path');
const N=require('./native-assets.cjs'),{root,read,copy,ref,vec,color,asset,uuid,script,Graph,cleanComponent,graphicTemplate}=N;
const {move}=require('./ui-authoring.cjs');
const T=read('assets/resources/ui/immersive-theme.json'),ink='eadfc7',muted='c1bda8';
const theme=asset(uuid('assets/resources/ui/immersive-theme.json'),'cc.JsonAsset');
function load(file){const g=new Graph(file,path.basename(file));g.graph=JSON.parse(fs.readFileSync(path.join(root,'tools/editor-authoring/baselines/layout-v0',file),'utf8'));g.root=g.graph[0].data.__id__;return g;}
function comps(g,n){return g.graph[n]._components?.map(r=>g.graph[r.__id__])??[];}
function comp(g,n,type){return comps(g,n).find(c=>c.__type__===type);}
function find(g,name){return g.graph.findIndex(o=>o.__type__==='cc.Node'&&o._name===name);}
function size(g,n,w,h){const ui=comp(g,n,'cc.UITransform');if(ui)ui._contentSize={__type__:'cc.Size',width:w,height:h};}
function put(g,n,x,y,w,h){g.graph[n]._lpos=vec(x-720,450-y);if(w!==undefined)size(g,n,w,h);}
function bind(g,key){return g.graph.find(c=>c.__type__===script('UIValue')&&c.key===key)?.node.__id__;}
function actor(g,name,x,y){for(const n of g.graph.filter(o=>o.__type__==='cc.Node'&&o._prefab)){const info=g.graph[n._prefab.__id__],instance=info.instance?g.graph[info.instance.__id__]:null;if(!instance)continue;const props=instance.propertyOverrides.map(r=>g.graph[r.__id__]);if(props.find(p=>p.propertyPath.length===1&&p.propertyPath[0]==='_name')?.value===name)props.find(p=>p.propertyPath.length===1&&p.propertyPath[0]==='_lpos').value=vec(x-720,450-y);}}
function contactShadow(g,name,prefab){const source=read(prefab),shadow=source.find(o=>o.__type__==='cc.Node'&&o._name==='Shadow'),id=source[shadow._prefab.__id__].fileId;for(const n of g.graph.filter(o=>o.__type__==='cc.Node'&&o._prefab)){const info=g.graph[n._prefab.__id__],instance=info.instance?g.graph[info.instance.__id__]:null;if(!instance)continue;const props=instance.propertyOverrides.map(r=>g.graph[r.__id__]);if(props.find(p=>p.propertyPath.length===1&&p.propertyPath[0]==='_name')?.value!==name)continue;const target=g.add({__type__:'cc.TargetInfo',localID:[id]});instance.propertyOverrides.push(ref(g.add({__type__:'CCPropertyOverrideInfo',targetInfo:ref(target),propertyPath:['_lpos'],value:vec(0,18,0)})));}}
function type(g,n,font=18,bold=false,tint=ink){const l=comp(g,n,'cc.Label');if(!l)return;Object.assign(l,{_font:null,_fontFamily:'Microsoft YaHei',_isSystemFontUsed:true,_fontSize:font,_lineHeight:font+7,_isBold:bold,_color:color(tint),_overflow:2,_enableWrapText:true,_enableOutline:true,_outlineColor:color('111b14',180),_outlineWidth:1.3});}
function text(g,key,x,y,w,h,font=18,bold=false,align=1){const n=bind(g,key);if(n===undefined)return;put(g,n,x,y,w,h);type(g,n,font,bold);comp(g,n,'cc.Label')._horizontalAlign=align;return n;}
function action(g,id,x,y,w,h){const a=g.graph.find(o=>o.__type__===script('ButtonAction')&&o.actionId===id);if(!a)return;put(g,a.node.__id__,x,y,w,h);const p=comp(g,a.node.__id__,script('ButtonPresentation'));if(p){p.theme=copy(theme);p.darkSurface=false;size(g,p.surface.__id__,w,h);size(g,g.graph[p.focusRing.__id__].node.__id__,w+8,h+8);size(g,g.graph[a.caption.__id__].node.__id__,w-24,h-8);}return a;}
function skin(g){for(const o of g.graph){if(o.__type__==='cc.Label'){o._color=color(ink);o._enableOutline=true;o._outlineColor=color('111b14',180);o._outlineWidth=1.2;}if(o.__type__===script('UIValue')){o.normalColor=color(ink);o.alertColor=color('e7b087');o.plate=null;}if(o.__type__===script('ButtonPresentation')){o.theme=copy(theme);o.darkSurface=false;}if(o.__type__===script('UIProgress')){o.filledColor=color('acb98b');o.emptyColor=color('545b49');}}}
function clearPanels(g,parent=g.root){g.graph[parent]._children=g.graph[parent]._children.filter(r=>!['Panel','Line'].includes(g.graph[r.__id__]._name));}
function shade(g,right=0){const n=g.node('SceneEdgeShade',g.root,0,0,1440,900);g.component(n,'cc.Graphics',cleanComponent(graphicTemplate));g.component(n,script('SceneShade'),{top:185,bottom:210,right});const children=g.graph[g.root]._children,world=children.findIndex(r=>g.graph[r.__id__]._name==='World');children.splice(children.findIndex(r=>r.__id__===n),1);children.splice(Math.max(0,world+1),0,ref(n));}
function atmosphere(g){const world=find(g,'World');if(world<0)return;clearPanels(g,world);const cover=g.graph[world]._children.find(r=>g.graph[r.__id__]._name==='cover')?.__id__;if(cover!==undefined){g.graph[cover]._lscale=vec(1.015,1.015,1);const s=comp(g,cover,'cc.Sprite');if(s)s._color=color('d6d8c4');}const particles=g.node('AmbientDust',world,0,0,1440,900),graphics=g.component(particles,'cc.Graphics',cleanComponent(graphicTemplate));const items=g.graph[world]._children;items.splice(items.findIndex(r=>r.__id__===particles),1);items.splice(Math.min(1,items.length),0,ref(particles));g.component(world,script('SceneAtmosphere'),{backdrop:cover===undefined?null:ref(cover),dust:ref(graphics)});}
function deck(g,key,x,y){const root=find(g,key),number=bind(g,key+'/text0'),title=bind(g,key+'/text1');g.graph[root]._children=[];put(g,root,x,y,84,116);move(g,number,root);move(g,title,root);g.graph[number]._lpos=vec(0,-28);size(g,number,58,26);type(g,number,22,true,'454637');comp(g,number,'cc.Label')._enableOutline=false;g.graph[title]._lpos=vec(0,-62);size(g,title,90,26);type(g,title,14,false);const stack=g.node('CanvasDeck',root,0,0,72,104);g.component(stack,'cc.Graphics',cleanComponent(graphicTemplate));g.component(stack,script('DeckStackGraphic'));g.graph[root]._children=[ref(stack),ref(number),ref(title)];}
for(const name of ['JournalScreen','DayTwoScreen','FailureScreen','MapScreen','BattleScreen','RewardScreen','RestScreen','ShelterScreen']){
 const file='assets/prefabs/screens/'+name+'.prefab',g=load(file);skin(g);clearPanels(g);atmosphere(g);shade(g,['JournalScreen','DayTwoScreen','FailureScreen','RestScreen','ShelterScreen'].includes(name)?230:0);
 const environment=['BattleScreen','MapScreen'].includes(name)?'field-sketch-street-v1':['RestScreen','ShelterScreen','DayTwoScreen'].includes(name)?'field-sketch-shelter-v1':'field-sketch-depot-v1';
 if(fs.existsSync(path.join(root,'assets/resources/art/'+environment+'.plist.meta'))){const world=find(g,'World'),cover=g.graph[world]._children.find(r=>g.graph[r.__id__]._name==='cover').__id__,sprite=comp(g,cover,'cc.Sprite');sprite._spriteFrame=asset(uuid('assets/resources/art/'+environment+'.plist')+'@49047','cc.SpriteFrame');sprite._color=color('ffffff');}
 if(name==='BattleScreen'){
  actor(g,'Player',350,655);actor(g,'Wanderer',1070,655);actor(g,'Brute',1070,655);
  contactShadow(g,'Player','assets/prefabs/actors/PlayerActor.prefab');contactShadow(g,'Wanderer','assets/prefabs/actors/WandererActor.prefab');contactShadow(g,'Brute','assets/prefabs/actors/BruteActor.prefab');
  const world=find(g,'World'),cover=g.graph[world]._children.find(r=>g.graph[r.__id__]._name==='cover').__id__,background=comp(g,cover,'cc.Sprite');
  if(fs.existsSync(path.join(root,'assets/resources/art/field-sketch-street-v1.plist.meta'))){background._spriteFrame=asset(uuid('assets/resources/art/field-sketch-street-v1.plist')+'@49047','cc.SpriteFrame');background._color=color('ffffff');g.graph[cover]._lscale=vec(1.15,1.15,1);g.graph[cover]._lpos=vec(0,55);}
  for(const key of ['banner/text0','banner/text2']){const n=bind(g,key);if(n!==undefined)g.graph[n]._active=false;}
  text(g,'banner/text1',1285,117,280,34,22,true);text(g,'battle/text0',1320,264,200,34,22,true);text(g,'battle/text1',1320,297,200,26,14);
  text(g,'battle/text3',180,536,180,28,19,true);text(g,'battle/text4',180,566,180,28,17,true);text(g,'battle/text5',1285,151,250,28,18,true);
  put(g,find(g,'healthTrack'),180,591,180,6);put(g,find(g,'healthFill'),180,591,180,6);put(g,find(g,'enemyTrack'),1285,177,210,6);put(g,find(g,'enemyFill'),1285,177,210,6);
  text(g,'battle/text6',244,505,340,28,14,true);text(g,'battle/text9',720,612,480,42,14);text(g,'battle/text10',1320,889,194,22,12);
  const turn=action(g,'end-turn',1320,816,116,116);if(turn){const p=comp(g,turn.node.__id__,script('ButtonPresentation'));g.graph[p.panel.__id__].corner=24;const label=g.graph[turn.caption.__id__];label._string='结束\n回合';label._enableWrapText=true;label._fontSize=23;label._lineHeight=28;}
  deck(g,'drawPile',72,794);deck(g,'discardPile',1340,650);
  put(g,find(g,'enemy-target'),1070,405,380,520);
  const hand=g.graph.find(o=>o.__type__===script('HandPresentation'));hand.fanAngle=3;hand.fanCurve=7;hand.spacing=12;
  const target=find(g,'TargetGuide');clearPanels(g,target);const label=bind(g,'battle/text2');if(label!==undefined)text(g,'battle/text2',1040,550,310,28,16,true);
 }
 if(['JournalScreen','DayTwoScreen','FailureScreen'].includes(name)){
  text(g,'journal/text0',1070,173,560,28,13,false,0);text(g,'journal/text1',1070,240,560,76,36,true,0);text(g,'journal/text2',1070,423,560,246,20,false,0);text(g,'journal/text3',1070,630,560,80,16,false,0);
  const a=action(g,'journal-start',1155,798,360,60);if(a)g.graph[a.caption.__id__]._string=name==='JournalScreen'?'离开避难所':name==='FailureScreen'?'返回出发日志':'再次整理行囊';
  if(name==='DayTwoScreen'){text(g,'journal/text4',1070,702,560,58,16,false,0);const body=bind(g,'journal/text2');comp(g,body,'cc.Label')._string='门闩重新落下，外面的脚步声渐渐远去。\n\n你带回的不只是物资，\n还有下一次出发的底气。\n\n这一夜，终于熬过去了。';}
 }
 if(name==='MapScreen'){
  text(g,'banner/text0',353,126,600,22,12,false,0);text(g,'banner/text1',353,165,600,46,31,true,0);text(g,'banner/text2',353,205,600,34,15,false,0);
  const graph=find(g,'RouteGraph');for(const point of g.graph.filter(o=>o.__type__===script('MapPointPresentation'))){point.availableFill=color('75633e');point.visitedFill=color('4d6040');point.lockedFill=color('30382d');point.availableOutline=color('d1ba81');point.normalOutline=color('6b725b');}
  // The route remains a tactical overlay on the world rather than a windowed dashboard.
  if(graph>=0)g.graph[graph]._children=g.graph[graph]._children.filter(r=>g.graph[r.__id__]._name!=='Panel');
 }
 if(name==='RewardScreen'){
  text(g,'banner/text0',720,126,900,22,12);text(g,'banner/text1',720,171,900,50,32,true);text(g,'banner/text2',720,218,900,30,16);
  g.graph.filter(c=>c.__type__===script('RewardChoice')).forEach((c,index)=>put(g,c.node.__id__,560+270*index,460));
  text(g,'rewards/text0',235,789,330,34,16);text(g,'rewards/text1',235,832,330,34,13);action(g,'reward-bag',490,824,250,48);action(g,'rewards-done',1175,824,350,56);
 }
 if(name==='RestScreen'){
  text(g,'rest/text0',820,265,390,50,24,true);text(g,'rest/text1',820,340,390,98,18);action(g,'rest-cash',820,430,330,54);
  text(g,'rest/text2',1210,265,350,50,24,true);text(g,'rest/text3',1210,350,350,100,18);action(g,'rest-bag',1210,430,300,54);
  text(g,'rest/text4',1000,660,760,66,20);action(g,'rest-done',1190,815,380,58);
 }
 g.save();
}
{
 const file='assets/prefabs/ui/HUD.prefab',g=load(file);const bar=g.graph.find(o=>o.__type__===script('StatusBar'));bar.presentation='floating';bar.theme=copy(theme);const paper=g.graph[bar.paper.__id__];paper.fill=color('000000',0);paper.line=color('000000',0);paper.innerLine=color('000000',0);
 for(const l of g.graph.filter(o=>o.__type__==='cc.Label')){l._color=color(ink);l._enableOutline=true;l._outlineColor=color('111b14',200);l._outlineWidth=1.5;}
 for(const o of g.graph.filter(o=>o.__type__===script('ButtonPresentation'))){o.theme=copy(theme);o.darkSurface=false;const owner=o.node.__id__,a=comp(g,owner,script('ButtonAction'));if(a?.actionId==='bag')o.variant='quiet';}
 g.graph[bar.brand.__id__]._fontSize=18;g.graph[bar.save.__id__]._fontSize=10;g.graph[bar.day.__id__]._fontSize=19;g.graph[bar.supplies.__id__]._fontSize=20;g.graph[bar.health.__id__]._fontSize=20;
 g.save();
}
// Notifications use the scene's open upper centre with no opaque banner.
{
 const file='assets/TheEnd.scene',g=new Graph(file,'TheEnd');g.graph=JSON.parse(fs.readFileSync(path.join(root,'tools/editor-authoring/baselines/layout-v0',file),'utf8'));const d=g.graph.find(o=>o.hud&&o.screens),toast=d.toastRoot.__id__,label=d.toastLabel.__id__;g.graph[toast]._lpos=vec(0,345);size(g,toast,520,42);size(g,g.graph[label].node.__id__,500,40);Object.assign(g.graph[label],{_fontSize:16,_lineHeight:22,_isBold:false,_color:color('dfc994'),_overflow:2,_enableOutline:true,_outlineColor:color('111b14',220),_outlineWidth:1.5});g.graph[toast]._components=g.graph[toast]._components.filter(r=>![script('ShapeGraphic'),'cc.Graphics'].includes(g.graph[r.__id__].__type__));N.write(file,g.graph);
}
console.log(JSON.stringify({layout:'scene-first',screens:8,sidebar:false,actorSizeChanges:0}));

// Paper, ink and illustrations stay in the same field-sketch material family.
for(const file of ['assets/prefabs/cards/HandCard.prefab','assets/prefabs/cards/RewardCard.prefab']){
 const g=load(file),card=g.graph.find(o=>o.__type__===script('CardPresentation'));card.theme=asset(uuid('assets/resources/ui/field-card-theme.json'),'cc.JsonAsset');g.save();
}
{
 const g=load('assets/prefabs/ui/InventoryPopup.prefab'),frames=Object.values(read('assets/resources/ui/cards/items.plist.meta').subMetas),names=['attack','dodge','knife','evade','repair','heavy','slash','cash'];
 for(const row of g.graph.filter(o=>o.__type__===script('InventoryRowPresentation'))){row.illustrations=names.map(name=>asset(frames.find(f=>f.name==='ui-card-'+name).uuid,'cc.SpriteFrame'));row.artworkSize=42;}
 const backdrop=g.graph.find(o=>o.__type__==='cc.BlockInputEvents').node.__id__,close=g.graph.find(o=>o.__type__===script('ButtonAction')&&o.actionId==='modal-close').node.__id__;
 g.graph[backdrop]._lpos=vec();size(g,backdrop,1440,900);g.component(g.root,script('ButtonFocusGroup'),{buttons:[],modal:true,initialButton:ref(close)});g.component(g.root,script('ModalPanel'),{backdrop:ref(backdrop),closeAction:'modal-close',closeOnBackdrop:false,closeOnEscape:true});
 g.save();
}
