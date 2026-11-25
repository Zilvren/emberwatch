// Explicit whole-page authoring. Builds only import these editable native resources.
throw new Error('此侧栏/大面板方案已被用户否决并撤回。当前资源编写工具为 tools/build-immersive-layout.cjs。');
// The first design baseline is retained in temp/wasteland-layout-before/.
const fs=require('node:fs'),path=require('node:path');
const N=require('./native-assets.cjs'),{root,read,copy,ref,vec,color,asset,uuid,script,Graph,cleanComponent,graphicTemplate}=N;
const {move,button}=require('./ui-authoring.cjs');
const theme=read('assets/resources/ui/wasteland-theme.json'),C=theme.colors,hex=s=>s.replace('#','');
const themeRef=asset(uuid('assets/resources/ui/wasteland-theme.json'),'cc.JsonAsset');
const frameData=read('assets/resources/ui/cards/items.plist.meta');
const arts=['attack','dodge','knife','evade','repair','heavy','slash','cash'].map(name=>asset(Object.values(frameData.subMetas).find(m=>m.name==='ui-card-'+name).uuid,'cc.SpriteFrame'));
const originalCard=JSON.parse(fs.readFileSync(path.join(root,'temp/wasteland-layout-before/assets/prefabs/cards/HandCard.prefab'),'utf8'));
const cardScript=originalCard.find(o=>o.__type__===script('CardPresentation'));
const spriteTemplate=copy(originalCard[cardScript.artwork.__id__]);
function load(file){const g=new Graph(file,path.basename(file));const backup=path.join(root,'temp/wasteland-layout-before',file);g.graph=fs.existsSync(backup)?JSON.parse(fs.readFileSync(backup,'utf8')):read(file);g.root=g.graph[0].data.__id__;g.chrome=[];return g;}
function comps(g,node){return g.graph[node]._components?.map(r=>g.graph[r.__id__])??[];}
function comp(g,node,type){return comps(g,node).find(c=>c.__type__===type);}
function instance(g,node){const info=g.graph[g.graph[node]._prefab?.__id__];return info?.instance?g.graph[info.instance.__id__]:null;}
function name(g,node){return g.graph[node]._name??instance(g,node)?.propertyOverrides.map(r=>g.graph[r.__id__]).find(p=>p.propertyPath.length===1&&p.propertyPath[0]==='_name')?.value;}
function find(g,key){return g.graph.findIndex(o=>o.__type__==='cc.Node'&&name(g,g.graph.indexOf(o))===key);}
function size(g,node,w,h){const ui=comp(g,node,'cc.UITransform');if(ui)ui._contentSize={__type__:'cc.Size',width:w,height:h};}
function pos(g,node,x,y){const value=vec(x-720,450-y),i=instance(g,node);if(i){const p=i.propertyOverrides.map(r=>g.graph[r.__id__]).find(o=>o.propertyPath.length===1&&o.propertyPath[0]==='_lpos');if(p)p.value=value;else throw Error('No native position override '+name(g,node));}else g.graph[node]._lpos=value;}
function raw(g,node,x,y){g.graph[node]._lpos=vec(x,y);}
function put(g,node,x,y,w,h){if(node<0||node===undefined)throw Error('Missing layout node');pos(g,node,x,y);if(w!==undefined)size(g,node,w,h);return node;}
function binding(g,key){const value=g.graph.find(c=>c.__type__===script('UIValue')&&c.key===key);return value?.node.__id__;}
function text(g,key,x,y,w,h,font=18,bold=false,align=0){const node=binding(g,key);if(node===undefined)return;put(g,node,x,y,w,h);const label=comp(g,node,'cc.Label');Object.assign(label,{_font:null,_fontFamily:'Microsoft YaHei',_isSystemFontUsed:true,_fontSize:font,_lineHeight:font+8,_isBold:bold,_horizontalAlign:align,_verticalAlign:1,_overflow:2,_enableWrapText:true,_color:color(hex(C.ink))});return node;}
function caption(g,parent,label,x,y,w,h,font=16,tint=C.muted,align=0){const made=g.label('FieldCaption'+g.graph.length,label,x-720,450-y,w,h,font,hex(tint));if(parent!==g.root)move(g,made.node,parent);Object.assign(g.graph[made.label],{_font:null,_isSystemFontUsed:true,_fontFamily:'Microsoft YaHei',_isBold:false,_horizontalAlign:align,_overflow:2,_enableWrapText:true});return made.node;}
function field(g,x,y,w,h,options={}){const node=g.node(options.name??'FieldPanel'+g.graph.length,g.root,x-720,450-y,w,h);g.component(node,'cc.Graphics',cleanComponent(graphicTemplate));g.component(node,script('FieldPanel'),{fill:color(hex(options.fill??C.paper),options.alpha??248),line:color(hex(options.line??C.line)),accent:color(hex(C.ochre)),edge:7,marked:options.marked??true});g.chrome.push(node);return node;}
function line(g,x,y,w,h,tint=C.lineSoft,parent=g.root){const node=g.shape('FieldLine'+g.graph.length,x-720,450-y,w,h,hex(tint));if(parent!==g.root)move(g,node,parent);g.chrome.push(node);return node;}
function action(g,id,x,y,w,h,variant){const a=g.graph.find(c=>c.__type__===script('ButtonAction')&&c.actionId===id);if(!a)return;put(g,a.node.__id__,x,y,w,h);const p=comp(g,a.node.__id__,script('ButtonPresentation'));if(p){p.theme=copy(themeRef);p.darkSurface=false;if(variant)p.variant=variant;const surface=p.surface?.__id__;if(surface!==undefined)size(g,surface,w,h);if(p.focusRing)size(g,g.graph[p.focusRing.__id__].node.__id__,w+8,h+8);const label=g.graph[a.caption.__id__];size(g,label.node.__id__,w-24,h-8);label._fontSize=h<44?16:18;label._lineHeight=24;}return a.node.__id__;}
function skin(g){for(const o of g.graph){if(o.__type__===script('ButtonPresentation')){o.theme=copy(themeRef);o.darkSurface=false;}if(o.__type__===script('CardPresentation')||o.__type__===script('CommonPanel')||o.__type__===script('StatusBar'))o.theme=copy(themeRef);if(o.__type__==='cc.Label'){o._color=color(hex(o._fontSize<=16?C.muted:C.ink));o._font=null;o._fontFamily='Microsoft YaHei';o._isSystemFontUsed=true;}if(o.__type__===script('UIValue')){o.normalColor=color(hex(C.ink));o.alertColor=color(hex(C.danger));o.normalFill=color(hex(C.paper));o.alertFill=color('50352d');o.plate=null;}if(o.__type__===script('PaperPanel')){o.fill=color(hex(C.paper));o.line=color(hex(C.line));o.innerLine=color(hex(C.lineSoft),50);o.corner=4;o.lineWidth=1;}if(o.__type__===script('UIProgress')){o.filledColor=color(hex(C.olive));o.emptyColor=color(hex(C.lineSoft));}}}
function removeOldChrome(g,parent=g.root){g.graph[parent]._children=g.graph[parent]._children.filter(r=>!['Panel','Line'].includes(g.graph[r.__id__]._name));}
function finish(g){const children=g.graph[g.root]._children,world=children.find(r=>name(g,r.__id__)==='World'),backdrops=children.filter(r=>/Backdrop$/.test(name(g,r.__id__)??''));g.graph[g.root]._children=[...backdrops,...(world?[world]:[]),...g.chrome.filter(n=>g.graph[n]._parent?.__id__===g.root).map(ref),...children.filter(r=>r!==world&&!g.chrome.includes(r.__id__)&&!backdrops.includes(r))];g.save();}
function atmosphere(g){const world=find(g,'World');if(world<0)return;removeOldChrome(g,world);const node=g.shape('FieldAtmosphere',0,0,1440,900,'142018',112);move(g,node,world);const list=g.graph[world]._children;g.graph[world]._children=[...list.filter(r=>name(g,r.__id__)==='cover'),ref(node),...list.filter(r=>r.__id__!==node&&name(g,r.__id__)!=='cover')];}
function actor(g,key,x,y){const node=find(g,key);if(node>=0)pos(g,node,x,y);}
function banner(g){field(g,575,84,662,120,{alpha:238});text(g,'banner/text0',581,47,616,24,13);text(g,'banner/text1',581,84,616,46,29,true);text(g,'banner/text2',581,124,616,32,15);}
function sprite(g,parent,name,x,y,w,h,frame){const node=g.node(name,parent,x,y,w,h);const fields=cleanComponent(spriteTemplate);delete fields.node;delete fields.__prefab;g.component(node,'cc.Sprite',{...fields,_spriteFrame:copy(frame),_sizeMode:0,_isTrimmedMode:true,_color:color('ffffff')});return node;}
function deck(g,key,x,y){const node=find(g,key),value=binding(g,key+'/text0'),label=binding(g,key+'/text1');g.graph[node]._children=[];size(g,node,84,110);pos(g,node,x,y);for(const child of [value,label])move(g,child,node);const plate=g.node('DeckCase',node,0,0,66,82);g.component(plate,'cc.Graphics',cleanComponent(graphicTemplate));g.component(plate,script('FieldPanel'),{fill:color(hex(C.paper)),line:color(hex(C.ochre)),accent:color(hex(C.ochre)),marked:false});g.graph[node]._children=[ref(plate),ref(value),ref(label)];raw(g,value,0,-17);size(g,value,60,28);Object.assign(comp(g,value,'cc.Label'),{_fontSize:22,_lineHeight:28,_horizontalAlign:1,_isBold:true});raw(g,label,0,-58);size(g,label,84,26);Object.assign(comp(g,label,'cc.Label'),{_fontSize:14,_lineHeight:20,_horizontalAlign:1});const plus=caption(g,node,'+',720,435,44,40,30,C.ochre,1);raw(g,plus,0,16);}

// Global chrome is now a full-height equipment rail.
{
 const g=load('assets/prefabs/ui/HUD.prefab');skin(g);const bar=g.graph.find(c=>c.__type__===script('StatusBar'));bar.presentation='sidebar';size(g,g.root,220,900);const paper=g.graph[bar.paper.__id__];paper.fill=color('1b251e');paper.line=color(hex(C.line));size(g,paper.node.__id__,220,900);const top=caption(g,g.root,'SURVIVOR / FIELD KIT',110,28,172,20,11,C.ochre,0),bottom=caption(g,g.root,'THE ASHFALL DISTRICT',110,886,172,18,10,C.muted,0);raw(g,top,0,422);raw(g,bottom,0,-436);for(const y of [126,218,332,444,584]){const rule=line(g,110,y,172,1);raw(g,rule,0,450-y);}g.save();
 const file='assets/TheEnd.scene',s=JSON.parse(fs.readFileSync(path.join(root,'temp/wasteland-layout-before',file),'utf8')),d=s.find(c=>c.__type__===script('GameDirector')),n=s[d.hud.__id__],i=s[s[n._prefab.__id__].instance.__id__];i.propertyOverrides.map(r=>s[r.__id__]).find(o=>o.propertyPath.length===1&&o.propertyPath[0]==='_lpos').value=vec(-610,0);fs.writeFileSync(path.join(root,file),JSON.stringify(s,null,2)+'\n');
}
// Battle: open arena, separated information, and a dedicated hand workbench.
{
 const g=load('assets/prefabs/screens/BattleScreen.prefab');skin(g);removeOldChrome(g);atmosphere(g);banner(g);
 actor(g,'Player',480,600);actor(g,'Wanderer',1110,600);actor(g,'Brute',1110,600);
 field(g,1110,62,590,84,{name:'ThreatConsole',alpha:242}); // repositioned below to retain a compact enemy instrument
 const threat=g.chrome.pop();put(g,threat,1110,62,588,84);g.chrome.push(threat);
 text(g,'battle/text0',1110,48,540,34,23,true,1);text(g,'battle/text1',1110,81,540,24,14,false,1);
 // Keep the enemy console away from the left chapter block.
 put(g,threat,1162,62,492,84);text(g,'battle/text0',1162,48,444,34,23,true,1);text(g,'battle/text1',1162,81,444,24,14,false,1);
 field(g,492,605,322,52,{marked:false});field(g,1102,605,252,52,{marked:false});
 text(g,'battle/text3',435,595,180,24,18,true,0);text(g,'battle/text4',582,595,120,24,18,true,1);text(g,'battle/text5',1102,595,220,24,18,true,1);
 for(const [name,x]of [['healthTrack',492],['healthFill',492],['enemyTrack',1102],['enemyFill',1102]])put(g,find(g,name),x,619,name.startsWith('health')?288:220,5);
 text(g,'battle/text6',495,554,420,26,16,true,1);text(g,'battle/text9',811,591,300,44,14,false,1);
 action(g,'end-turn',1320,605,174,50,'primary');text(g,'battle/text10',1317,646,180,22,13,false,1);
 field(g,830,763,1172,254,{name:'HandWorkbench',fill:'#202b23'});caption(g,g.root,'HAND / 战斗手牌',374,625,330,24,13,C.ochre,0);
 deck(g,'drawPile',286,690);deck(g,'discardPile',286,806);
 put(g,find(g,'Hand'),861,763,1054,242);const hand=g.graph.find(c=>c.__type__===script('HandPresentation'));hand.spacing=12;hand.fanAngle=0;hand.fanCurve=0;
 put(g,find(g,'PlayArea'),830,359,1150,430);put(g,find(g,'enemy-target'),1110,350,320,450);
 const guide=find(g,'TargetGuide'),targetText=binding(g,'battle/text2');g.graph[guide]._children=[];move(g,targetText,guide);text(g,'battle/text2',1110,550,300,28,16,true,1);const ring=g.node('TargetBrackets',guide,390,100,320,450);g.component(ring,'cc.Graphics',cleanComponent(graphicTemplate));g.component(ring,script('FieldPanel'),{fill:color('000000',0),line:color(hex(C.ochre)),accent:color(hex(C.ochre)),marked:true});g.graph[guide]._children=[ref(ring),ref(targetText)];
 const slot=find(g,'WeaponSlot'),weaponName=binding(g,'battle/text7'),weaponInfo=binding(g,'battle/text8');g.graph[slot]._children=[];put(g,slot,770,183,240,66);for(const n of [weaponName,weaponInfo])move(g,n,slot);const frame=g.node('EquippedCase',slot,0,0,240,66);g.component(frame,'cc.Graphics',cleanComponent(graphicTemplate));g.component(frame,script('FieldPanel'),{fill:color(hex(C.paper)),line:color(hex(C.line)),accent:color(hex(C.ochre)),marked:false});g.graph[slot]._children=[ref(frame),ref(weaponName),ref(weaponInfo)];raw(g,weaponName,28,12);raw(g,weaponInfo,28,-14);size(g,weaponName,168,26);size(g,weaponInfo,168,24);comp(g,weaponName,'cc.Label')._fontSize=16;comp(g,weaponInfo,'cc.Label')._fontSize=13;sprite(g,slot,'EquippedArt',-90,0,42,42,arts[2]);finish(g);
}
// Story pages: a character field portrait alongside a record/work order.
for(const name of ['JournalScreen','DayTwoScreen','FailureScreen']){
 const g=load('assets/prefabs/screens/'+name+'.prefab');skin(g);removeOldChrome(g);atmosphere(g);actor(g,'Player',430,770);
 field(g,438,440,380,704,{alpha:0,line:C.ochre});field(g,1060,448,668,784,{name:'FieldJournal'});
 text(g,'journal/text0',1060,132,570,28,14);text(g,'journal/text1',1060,198,570,76,31,true);text(g,'journal/text2',1060,395,570,270,20);text(g,'journal/text3',1060,596,570,80,18);
 if(name==='DayTwoScreen'){text(g,'journal/text4',1060,670,570,64,17);text(g,'journal/text5',438,816,350,46,22,true,1);text(g,'journal/text6',438,858,350,24,11,false,1);}else{text(g,'journal/text4',438,816,350,46,22,true,1);text(g,'journal/text5',438,858,350,24,11,false,1);}
 action(g,'journal-start',1060,760,570,64,'primary');caption(g,g.root,'THE END / FIELD REPORT',438,68,350,24,13,C.ochre,1);finish(g);
}
// Map: a scout field portrait and a legible two-branch route board.
{
 const g=load('assets/prefabs/screens/MapScreen.prefab');skin(g);removeOldChrome(g);atmosphere(g);banner(g);actor(g,'Player',360,770);
 field(g,940,505,928,690,{name:'RouteBoard',fill:'#253227'});field(g,360,815,220,116,{marked:false});
 text(g,'map/text0',360,791,194,40,16,false,1);text(g,'map/text1',360,838,194,52,13,false,1);text(g,'map/text2',1360,194,50,24,14,false,1);text(g,'map/text3',755,194,500,28,16,true,0);
 const graph=find(g,'RouteGraph');removeOldChrome(g,graph);
 // Old route links are replaced with connections matching the new node positions.
 g.graph[graph]._children=g.graph[graph]._children.filter(r=>{const n=g.graph[r.__id__];return !comp(g,r.__id__,script('ShapeGraphic'))||comp(g,r.__id__,script('MapPointPresentation'))||comp(g,r.__id__,script('ButtonAction'))||comp(g,r.__id__,'cc.Label');});
 const locations={fixed:[940,270,260,78],'A-enemy1':[730,490,300,72],'A-scavenge':[730,592,300,72],'B-scavenge':[1150,490,300,72],'B-enemy1':[1150,592,300,72],rest:[940,704,390,64],enemy2:[940,800,390,64]};
 for(const point of g.graph.filter(o=>o.__type__===script('MapPointPresentation'))){const n=point.node.__id__,p=locations[name(g,n)];put(g,n,...p);point.availableFill=color('5e5639');point.visitedFill=color('35492f');point.lockedFill=color('2c382d');point.availableOutline=color(hex(C.ochre));point.normalOutline=color(hex(C.lineSoft));const shape=g.graph[point.plate.__id__];shape.outlineWidth=1;size(g,n,p[2],p[3]);for(const child of g.graph[n]._children){const label=comp(g,child.__id__,'cc.Label');if(label){label._color=color(hex(C.ink));label._fontSize=child.__id__===g.graph[point.status.__id__].node.__id__?13:18;}}}
 action(g,'route-A',730,393,300,52);action(g,'route-B',1150,393,300,52);
 const road=(x,y,w,h)=>line(g,x,y,w,h,'667553',graph);
 for(const item of [[940,335,1,52],[940,358,420,1],[730,363,1,12],[1150,363,1,12],[730,445,1,50],[1150,445,1,50],[730,542,1,30],[1150,542,1,30],[730,650,1,44],[1150,650,1,44],[940,671,420,1],[940,750,1,28]])road(...item);
 const graphChildren=g.graph[graph]._children;g.graph[graph]._children=[...graphChildren.filter(r=>g.chrome.includes(r.__id__)),...graphChildren.filter(r=>!g.chrome.includes(r.__id__))];
 const hint=find(g,'InitialHint');removeOldChrome(g,hint);const fixedText=binding(g,'map/fixedReward');if(fixedText!==undefined)text(g,'map/fixedReward',940,475,590,140,20,false,1);const plate=field(g,940,476,660,218,{marked:true});move(g,plate,hint);g.graph[hint]._children=[ref(plate),...g.graph[hint]._children.filter(r=>r.__id__!==plate)];caption(g,hint,'FIRST CONTACT / 首个搜刮点',940,389,590,26,14,C.ochre,1);finish(g);
}
// Loot, camp and shelter are new arrangements of the existing commands and data.
{
 const g=load('assets/prefabs/screens/RewardScreen.prefab');skin(g);removeOldChrome(g);atmosphere(g);banner(g);actor(g,'Player',360,754);
 field(g,360,812,220,118,{marked:false});text(g,'rewards/text0',360,792,196,40,16,false,1);text(g,'rewards/text1',360,835,196,46,13,false,1);
 g.graph.filter(c=>c.__type__===script('RewardChoice')).forEach((choice,index)=>put(g,choice.node.__id__,680+270*index,427));
 field(g,970,731,850,82,{marked:false});text(g,'rewards/text2',650,731,180,38,22,true,1);text(g,'rewards/text3',866,731,260,34,16,false,1);action(g,'claim-supplies',1220,731,310,50,'primary');action(g,'reward-bag',700,836,310,58,'secondary');action(g,'rewards-done',1180,836,440,58,'primary');finish(g);
}
{
 const g=load('assets/prefabs/screens/RestScreen.prefab');skin(g);removeOldChrome(g);atmosphere(g);banner(g);actor(g,'Player',380,760);
 field(g,750,379,408,348);field(g,1200,379,408,348);field(g,970,650,858,106,{marked:false});field(g,380,812,248,110,{marked:false});
 text(g,'rest/text0',750,267,352,56,24,true,1);text(g,'rest/text1',750,358,352,116,18,false,1);action(g,'rest-cash',750,478,352,52);
 text(g,'rest/text2',1200,267,352,56,24,true,1);text(g,'rest/text3',1200,358,352,116,18,false,1);action(g,'rest-bag',1200,478,352,52);
 text(g,'rest/text4',970,650,802,78,20,false,1);text(g,'rest/text5',380,812,216,84,16,false,1);action(g,'rest-done',1150,818,500,60,'primary');caption(g,g.root,'整装之后，再走下一段。',748,817,384,46,18,C.muted,0);finish(g);
}
{
 const g=load('assets/prefabs/screens/ShelterScreen.prefab');skin(g);removeOldChrome(g);atmosphere(g);banner(g);actor(g,'Player',408,792);
 field(g,800,328,360,300);field(g,1200,328,360,300);field(g,1000,650,760,256);
 text(g,'shelter/text0',800,220,308,50,22,true,1);text(g,'shelter/text1',800,292,308,72,22,true,1);text(g,'shelter/text2',800,380,308,102,16,false,1);
 text(g,'shelter/text3',1200,220,308,50,22,true,1);text(g,'shelter/text4',1200,304,308,100,20,false,1);action(g,'shelter-repair',1200,423,308,52,'primary');
 text(g,'shelter/text5',1000,556,700,48,22,true,0);text(g,'shelter/text6',1000,617,700,64,22,true,1);text(g,'shelter/text7',1000,676,700,48,16,false,1);text(g,'shelter/text8',820,750,330,48,14,false,0);action(g,'shelter-done',1200,750,320,52,'primary');finish(g);
}
// Cards become worn dark equipment cards with a light canvas illustration inset.
for(const file of ['assets/prefabs/cards/HandCard.prefab','assets/prefabs/cards/RewardCard.prefab']){
 const g=load(file);skin(g);const card=g.graph.find(o=>o.__type__===script('CardPresentation'));card.normalText=color(hex(C.muted));card.blockedText=color(hex(C.danger));
 const artwork=g.graph[card.artwork.__id__],node=artwork.node.__id__,parent=g.graph[node]._parent.__id__,ui=comp(g,node,'cc.UITransform');
 const plate=g.node('CanvasArtInset',parent,g.graph[node]._lpos.x,g.graph[node]._lpos.y,ui._contentSize.width+10,ui._contentSize.height+8);g.component(plate,'cc.Graphics',cleanComponent(graphicTemplate));g.component(plate,script('PaperPanel'),{fill:color('c2b79e'),line:color('8e8c6e'),innerLine:color('c2b79e',0),lineWidth:.65,corner:2});const siblings=g.graph[parent]._children.filter(r=>r.__id__!==plate),at=siblings.findIndex(r=>r.__id__===node);siblings.splice(at,0,ref(plate));g.graph[parent]._children=siblings;
 for(const badge of [card.costBadge,...(card.keywordPlates??[])])if(badge){const shape=comp(g,badge.__id__,script('ShapeGraphic')),paper=comp(g,badge.__id__,script('PaperPanel'));if(shape)shape.fill=color('435139');if(paper)paper.fill=color('435139');}
 if(card.disabledOverlay){const overlay=g.graph[card.disabledOverlay.__id__];const opacity=comp(g,card.disabledOverlay.__id__,'cc.UIOpacity');if(opacity)opacity._opacity=55;const shape=comp(g,card.disabledOverlay.__id__,script('ShapeGraphic'));if(shape)shape.fill=color('101912',90);overlay._active=false;}
 g.save();
}
// Generic dialogs use the same field material and align with the main page.
for(const file of ['assets/prefabs/ui/HelpPopup.prefab','assets/prefabs/ui/LogPopup.prefab','assets/prefabs/ui/ConfirmPopup.prefab']){
 const g=load(file);skin(g);const panel=g.graph.find(o=>o.__type__===script('CommonPanel'));raw(g,panel.sheet.__id__,110,0);panel.preferredWidth=file.includes('Confirm')?720:820;panel.preferredHeight=file.includes('Confirm')?420:650;g.save();
}
// Inventory is now six canvas-lined equipment bins rather than an old spreadsheet row.
{
 const g=load('assets/prefabs/ui/InventoryPopup.prefab');skin(g);removeOldChrome(g);field(g,830,450,1172,844,{name:'InventoryWorkbench'});
 text(g,'bag/text0',780,85,1000,56,31,true,0);comp(g,binding(g,'bag/text0'),'cc.Label')._string='随身行囊';text(g,'bag/text1',830,141,1100,32,18);
 action(g,'modal-close',1350,83,100,44,'quiet');action(g,'bag-prev',1050,820,128,46);text(g,'bag/text20',1184,820,100,30,18,false,1);action(g,'bag-next',1320,820,128,46);
 action(g,'discard-supply',420,820,300,46,'danger');text(g,'bag/text21',830,866,1100,34,14,false,0);
 const rows=g.graph.filter(o=>o.__type__===script('InventoryRowPresentation'));
 rows.forEach((row,index)=>{const node=row.node.__id__,nameNode=g.graph[row.nameLabel.__id__].node.__id__,weightNode=g.graph[row.weightLabel.__id__].node.__id__,statusNode=g.graph[row.statusLabel.__id__].node.__id__,artNode=g.graph[row.artwork.__id__].node.__id__,toggleNode=g.graph[row.toggle.__id__].node.__id__,discardNode=g.graph[row.discard.__id__].node.__id__;
  g.graph[node]._children=[nameNode,weightNode,statusNode,artNode,toggleNode,discardNode].map(ref);put(g,node,470+(index%3)*360,320+Math.floor(index/3)*280,340,250);
  const plate=g.node('EquipmentBin',node,0,0,340,250);g.component(plate,'cc.Graphics',cleanComponent(graphicTemplate));g.component(plate,script('FieldPanel'),{fill:color('233025'),line:color(hex(C.line)),accent:color(hex(C.ochre)),marked:true});g.graph[node]._children=[ref(plate),...g.graph[node]._children.filter(r=>r.__id__!==plate)];
  raw(g,nameNode,0,90);size(g,nameNode,304,52);Object.assign(comp(g,nameNode,'cc.Label'),{_fontSize:20,_lineHeight:25,_isBold:true,_horizontalAlign:0,_enableWrapText:true});
  const backing=g.node('CanvasLining',node,-92,-5,116,116);g.component(backing,'cc.Graphics',cleanComponent(graphicTemplate));g.component(backing,script('PaperPanel'),{fill:color('c2b79e'),line:color('8e8c6e'),innerLine:color('c2b79e',0),corner:2,lineWidth:.7});
  raw(g,artNode,-92,-5);size(g,artNode,104,104);g.graph[node]._children=g.graph[node]._children.filter(r=>r.__id__!==backing);g.graph[node]._children.splice(g.graph[node]._children.findIndex(r=>r.__id__===artNode),0,ref(backing));
  raw(g,weightNode,69,-13);size(g,weightNode,160,28);Object.assign(comp(g,weightNode,'cc.Label'),{_fontSize:16,_lineHeight:24,_horizontalAlign:0});raw(g,statusNode,69,-49);size(g,statusNode,160,44);Object.assign(comp(g,statusNode,'cc.Label'),{_fontSize:14,_lineHeight:20,_horizontalAlign:0,_enableWrapText:true});
  const detail=caption(g,node,'',720,420,160,50,15,C.ink,0);raw(g,detail,69,30);row.detailLabel=ref(comp(g,detail,'cc.Label')?g.graph.indexOf(comp(g,detail,'cc.Label')):0);row.illustrations=copy(arts);row.cashGlyph=null;
  raw(g,toggleNode,-80,-96);raw(g,discardNode,80,-96);for(const n of [toggleNode,discardNode]){size(g,n,144,40);const p=comp(g,n,script('ButtonPresentation'));p.theme=copy(themeRef);p.darkSurface=false;size(g,p.surface.__id__,144,40);size(g,g.graph[p.caption.__id__].node.__id__,120,30);g.graph[p.caption.__id__]._fontSize=14;}
 });
 const backdrop=g.shape('InventoryBackdrop',0,0,1440,900,'101912',160);g.component(backdrop,'cc.BlockInputEvents');g.graph[g.root]._children=[ref(backdrop),...g.graph[g.root]._children.filter(r=>r.__id__!==backdrop)];
 const close=g.graph.find(o=>o.__type__===script('ButtonAction')&&o.actionId==='modal-close').node.__id__;g.component(g.root,script('ButtonFocusGroup'),{buttons:[],modal:true,initialButton:ref(close)});g.component(g.root,script('ModalPanel'),{backdrop:ref(backdrop),closeAction:'modal-close',closeOnBackdrop:false,closeOnEscape:true});finish(g);
}
// Reusable chrome resources share the new palette when used by a later page.
for(const folder of ['assets/prefabs/ui/buttons','assets/prefabs/ui/panels'])for(const entry of fs.readdirSync(path.join(root,folder)).filter(n=>n.endsWith('.prefab'))){const g=load(folder+'/'+entry);skin(g);g.save();}
console.log(JSON.stringify({scope:'whole-page',screens:8,sidebarWidth:220,actorScaleChanges:0,theme:'assets/resources/ui/wasteland-theme.json'}));
