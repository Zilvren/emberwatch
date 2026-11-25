// Adopt the HUD in place: preserve its asset UUID and existing action/label fileIds.
const fs=require('node:fs'),path=require('node:path');
const {root,read,ref,vec,color,asset,uuid,script,ensureMeta,Graph,cleanComponent,graphicTemplate}=require('./native-assets.cjs');
const {button,move}=require('./ui-authoring.cjs');
const theme=read('assets/resources/ui/theme.json'),C=theme.colors,H=theme.hud,hex=s=>s.replace('#','');
function component(g,node,type){return g.graph[node]._components.map(r=>g.graph[r.__id__]).find(c=>c.__type__===type);}
function size(g,node,w,h,anchor){const ui=component(g,node,'cc.UITransform');ui._contentSize={__type__:'cc.Size',width:w,height:h};if(anchor)ui._anchorPoint={__type__:'cc.Vec2',x:anchor[0],y:anchor[1]};}
function label(g,parent,name,text,y,font,height,bold=false,existing){
 let node,id;if(existing!==undefined){id=existing;node=g.graph[id].node.__id__;move(g,node,parent);g.graph[node]._name=name;}else{const made=g.label(name,text,0,0,160,height,font,hex(C.ink));node=made.node;id=made.label;move(g,node,parent);}
 g.graph[node]._lpos=vec(-80,y);size(g,node,160,height,[0,.5]);g.graph[node]._components=g.graph[node]._components.filter(r=>g.graph[r.__id__].__type__!==script('UIValue'));
 Object.assign(g.graph[id],{_string:text,_font:null,_fontFamily:'Microsoft YaHei',_isSystemFontUsed:true,_fontSize:font,_lineHeight:height,_isBold:bold,_horizontalAlign:0,_verticalAlign:1,_overflow:2,_enableWrapText:false,_color:color(hex(C.ink))});return id;
}
const hudFile='assets/prefabs/ui/HUD.prefab',hud=read(hudFile);let adopted=false;
if(!hud.some(c=>c.__type__===script('StatusBar'))){
 const g=new Graph(hudFile,'HUD');g.graph=hud;g.root=hud[0].data.__id__;
 const oldLabel=key=>{const v=hud.find(c=>c.__type__===script('UIValue')&&c.key===key);return hud[v.node.__id__]._components.find(r=>hud[r.__id__].__type__==='cc.Label').__id__;};
 const labels=Array.from({length:7},(_,i)=>oldLabel('header/text'+i));
 const action=id=>hud.find(c=>c.__type__===script('ButtonAction')&&c.actionId===id).node.__id__;
 const actions=['bag','log','help','audio','restart'].map(action),meter=hud.find(c=>c.__type__===script('UIProgress'));
 hud[g.root]._children=[];size(g,g.root,1440,80);
 hud[g.root]._components=hud[g.root]._components.filter(r=>hud[r.__id__].__type__!==script('UIProgress'));
 const paper=g.node('StatusPaper',g.root,0,0,1440,80);g.component(paper,'cc.Graphics',cleanComponent(graphicTemplate));const panel=g.component(paper,script('PaperPanel'),{fill:color(hex(C.paper)),line:color(hex(C.line)),innerLine:color(hex(C.lineSoft),60),lineWidth:1.1,corner:5});
 const sections=['Identity','Day','Supplies','Health','Carrying'].map(name=>g.node(name,g.root,0,0,180,64));
 const brand=label(g,sections[0],'Brand','THE END',10,22,30,true,labels[0]);
 const save=label(g,sections[0],'SaveState','自动保存',-17,H.hintSize,18,false,labels[1]);
 label(g,sections[1],'DayTitle','生存日',17,H.labelSize,18);
 const day=label(g,sections[1],'DayValue','第 1 天',-9,20,30,true,labels[2]);
 label(g,sections[2],'SuppliesTitle','物资',20,H.labelSize,18);
 const supplies=label(g,sections[2],'SuppliesValue','10',-2,H.valueSize,28,true,labels[3]);
 const suppliesHint=label(g,sections[2],'SuppliesHint','生存补给',-24,H.hintSize,16,false,labels[4]);
 const healthTitle=label(g,sections[3],'HealthTitle','血量',20,H.labelSize,18);
 const health=label(g,sections[3],'HealthValue','10 / 10',-2,H.valueSize,28,true,labels[5]);
 const gauge=g.node('HealthGauge',sections[3],0,-24,180,4);meter.node=ref(gauge);meter.track=null;meter.fill=null;meter.filledColor=color(hex(C.olive));meter.emptyColor=color(hex(C.paperShade));hud[gauge]._components.push(ref(hud.indexOf(meter)));
 meter.ticks.forEach((r,index)=>{move(g,r.__id__,gauge);g.graph[r.__id__]._name='HealthSegment'+index;g.graph[r.__id__]._lpos=vec(-85+index*18,0);size(g,r.__id__,15,4);const graphic=component(g,r.__id__,script('ShapeGraphic'));graphic.fill=color(hex(C.olive));graphic.outlineWidth=0;});
 move(g,actions[0],sections[4]);
 const carryHint=label(g,sections[4],'CarryHint','剩余 3 负重',-24,H.hintSize,16,false,labels[6]);
 const utilities=actions.slice(1);utilities.forEach(node=>move(g,node,g.root));
 actions.forEach((node,index)=>{const p=component(g,node,script('ButtonPresentation'));p.darkSurface=false;p.variant=index===4?'danger':index===0?'secondary':'quiet';const a=component(g,node,script('ButtonAction'));const caption=g.graph[a.caption.__id__];caption._string=['背包 27 / 30','记录','帮助','声音开','重开'][index];caption._fontSize=16;caption._lineHeight=22;caption._isBold=false;});
 g.component(g.root,'cc.BlockInputEvents');
 g.component(g.root,script('StatusBar'),{theme:asset(uuid('assets/resources/ui/theme.json'),'cc.JsonAsset'),paper:ref(panel),sections:sections.map(ref),utilities:utilities.map(ref),brand:ref(brand),save:ref(save),day:ref(day),supplies:ref(supplies),suppliesHint:ref(suppliesHint),healthTitle:ref(healthTitle),health:ref(health),carryHint:ref(carryHint),bag:ref(actions[0]),healthMeter:ref(hud.indexOf(meter))});
 g.save();adopted=true;
}
// The old HUD used y=410 on each child. The canonical prefab now sits at its own origin.
const sceneFile='assets/TheEnd.scene',sceneData=read(sceneFile),director=sceneData.find(c=>c.__type__===script('GameDirector'));
const hudInstance=sceneData[sceneData[sceneData[director.hud.__id__]._prefab.__id__].instance.__id__];
if(!sceneData.some(c=>c.__type__===script('WebViewport'))){const main=new Graph(sceneFile,'Main');main.graph=sceneData;main.component(director.node.__id__,script('WebViewport'));}
for(const r of hudInstance.propertyOverrides){const value=sceneData[r.__id__];if(value.propertyPath.length===1&&value.propertyPath[0]==='_lpos')value.value=vec(0,410);}
fs.writeFileSync(path.join(root,sceneFile),JSON.stringify(sceneData,null,2)+'\n');

const reviewFile='assets/StatusBarDesignReview.scene',sceneUuid=ensureMeta(reviewFile,'scene'),g=new Graph(reviewFile,'StatusBarDesignReview'),scene=g.graph[g.graph[0].scene.__id__];
g.graph[0]._name=scene._name='StatusBarDesignReview';scene._id=sceneUuid;g.graph[g.root]._children=g.graph[g.root]._children.filter(r=>g.graph[r.__id__]._name==='Camera');g.root=g.node('StatusBarDesignReview',g.root);
g.shape('Canvas',0,0,1440,900,hex(C.canvas));g.label('Eyebrow','THE END  /  UI STUDY 04',0,410,1320,24,13,hex(C.muted));g.label('Heading','状态栏 · 每次行动前都能读清楚',0,366,1320,52,28,hex(C.ink));g.label('Subheading','日期、物资、血量与携带情况各有位置。风险用文字和颜色一起提示。',0,319,1320,28,16,hex(C.muted));
const headings=[],bars=[],captions=['资源充足','补给偏低 / 血量偏低','感染临界 / 有暂存物品','实际操作 · 长数值与保存状态'];
for(let index=0;index<4;index++){const y=224-index*128;headings.push(ref(g.label('Case'+index,captions[index],0,y+63,1320,26,15,hex(C.muted)).node));bars.push(ref(g.linked(hudFile,'StatusCase'+index,0,y)));}
const names=['supplies-state','health-state','carry-state','save-state','width-state','lock-state','reset-state'],texts=['物资状态','血量状态','携带状态','保存状态','中等宽度','切换锁定','重置示例'];
const controls=names.map((id,index)=>ref(button(g,id,texts[index],(index-3)*184,-316,160,48,'secondary')));
const status=g.label('Counts','',0,-377,1320,26,15,hex(C.muted));
g.component(g.root,script('ButtonFocusGroup'),{buttons:[],modal:false});g.component(g.root,script('StatusBarDesignReview'),{bars,headings,controls,status:ref(status.label)});
g.component(g.root,script('WebViewport'));
g.graph[scene._prefab.__id__].fileId=sceneUuid;g.graph[scene._prefab.__id__].nestedPrefabInstanceRoots=g.links;g.save();
const config=read('build-config.json');Object.assign(config,{name:'the-end-status-bar-design',outputName:'ui-status',startScene:sceneUuid,scenes:[{url:'db://'+reviewFile,uuid:sceneUuid}]});fs.writeFileSync(path.join(root,'build-status-review.json'),JSON.stringify(config,null,2)+'\n');
console.log(JSON.stringify({adopted,canonicalPrefab:hudFile,scene:reviewFile,sceneUuid,examples:4}));
