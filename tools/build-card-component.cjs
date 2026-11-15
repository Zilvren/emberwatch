// Author the reusable card component and its isolated native Cocos design review.
const fs=require('node:fs'),path=require('node:path');
const {root,read,copy,ref,vec,color,asset,uuid,script,ensureMeta,write,Graph,cleanComponent,spriteTemplate,graphicTemplate}=require('./native-assets.cjs');
const theme=read('assets/resources/ui/theme.json'),C=theme.colors,hex=value=>value.replace('#','');
const metadata=read('assets/resources/ui/cards/items.plist.meta');
const materialMetadata=read('assets/resources/ui/cards/materials.plist.meta');
const illustrations=['attack','dodge','knife','evade','repair','heavy','slash','cash','rope','battery'].map(name=>{
 const frame=[...Object.values(metadata.subMetas),...Object.values(materialMetadata.subMetas)].find(m=>m.name==='ui-card-'+name);
 if(!frame)throw Error('UI illustration was not imported: '+name);
 return asset(frame.uuid,'cc.SpriteFrame');
});
const cardType=script('CardPresentation');
function clip(source,name,duration){
 const graph=read('assets/animations/'+source+'.anim'),ratio=duration/graph[0]._duration;
 graph[0]._name=name;graph[0]._duration=duration;
 for(const item of graph){if(item.__type__==='cc.animation.HierarchyPath'&&item.path==='Visual')item.path='Motion';if(item.__type__==='cc.RealCurve'||item.__type__==='cc.ObjectCurve')item._times=item._times.map(t=>t*ratio);}
 graph[0]._events=graph[0]._events.map(event=>({...event,frame:event.frame*ratio}));
 const file='assets/animations/ui/'+name+'.anim';fs.mkdirSync(path.join(root,'assets/animations/ui'),{recursive:true});ensureMeta(file,'animation-clip');write(file,graph);return asset(uuid(file),'cc.AnimationClip');
}
const draw=clip('CardDraw','Card_Enter',.18),play=clip('CardPlay','Card_Play',.24);
function reparent(graph,node,parent,x,y){const previous=graph.graph[node]._parent?.__id__;if(previous!==undefined)graph.graph[previous]._children=graph.graph[previous]._children.filter(r=>r.__id__!==node);graph.graph[node]._parent=ref(parent);graph.graph[node]._lpos=vec(x,y,0);graph.graph[parent]._children.push(ref(node));}
function preserveIds(graph,previous){
 for(const node of graph.graph.filter(o=>o.__type__==='cc.Node')){
  const old=previous.find(o=>o.__type__==='cc.Node'&&o._name===node._name);if(!old)continue;
  if(old._prefab&&node._prefab)graph.graph[node._prefab.__id__].fileId=previous[old._prefab.__id__].fileId;
  for(const r of node._components){const component=graph.graph[r.__id__],oldComponent=old._components.map(r=>previous[r.__id__]).find(o=>o.__type__===component.__type__);if(component.__prefab&&oldComponent?.__prefab)graph.graph[component.__prefab.__id__].fileId=previous[oldComponent.__prefab.__id__].fileId;}
 }
}
for(const [name,width,height]of [['HandCard',156,242],['RewardCard',236,345]]){
 const file='assets/prefabs/cards/'+name+'.prefab',previous=read(file),g=new Graph(file,name);
 const card=g.node(name,null,0,0,width,height),scale=Math.min(width/224,height/340);
 const motion=g.node('Motion',card,0,0,width,height);g.component(motion,'cc.UIOpacity',{_opacity:255});
 const visual=g.node('Visual',motion,0,0,width,height);
 const node=(name,parent,x,y,w,h)=>g.node(name,parent,x*scale,y*scale,w*scale,h*scale);
 const panel=(name,parent,x,y,w,h,fill,line,lineWidth=1.2)=>{
  const n=node(name,parent,x,y,w,h);g.component(n,'cc.Graphics',cleanComponent(graphicTemplate));
  const p=g.component(n,script('PaperPanel'),{fill:color(hex(fill)),line:color(hex(line)),innerLine:color(hex(C.lineSoft),95),lineWidth:lineWidth*scale,corner:5*scale});return {node:n,panel:p};
 };
 const label=(name,parent,text,x,y,w,h,size=16,tint=C.ink,bold=false,align=0,lineHeight=size+3)=>{
  const result=g.label(name,text,x*scale,y*scale,w*scale,h*scale,size*scale,hex(tint));reparent(g,result.node,parent,x*scale,y*scale);
  Object.assign(g.graph[result.label],{_font:null,_isSystemFontUsed:true,_isBold:bold,_horizontalAlign:align,_verticalAlign:1,_lineHeight:lineHeight*scale,_enableWrapText:true});return result;
 };
 const paper=panel('Paper',visual,0,0,224,340,C.paper,C.line);
 const selected=panel('SelectedOutline',visual,0,0,229,345,C.paper,C.ochre,1.8);g.graph[selected.node]._active=false;
 g.graph[selected.panel].fill=color(hex(C.paper),0);g.graph[selected.panel].innerLine=color(hex(C.paper),0);
 const title=label('Title',visual,'菜刀',-18,142,148,34,20,C.ink,true);
 const tag=label('Type',visual,'装备',-26,114,140,20,12,C.muted);
 const costBadge=panel('CostBadge',visual,80,134,38,46,'#e4e1d2',C.lineSoft,.85);g.graph[costBadge.panel].innerLine=color(hex(C.paper),0);
 const cost=label('Cost',costBadge.node,'2',0,10,34,25,22,C.ink,true,1);
 const costUnit=label('CostUnit',costBadge.node,'体力',0,-10,34,13,11,C.ink,false,1,13);
 const front=node('FrontContent',visual,0,0,224,270);
 const art=node('Artwork',front,0,44,132,132);
 const defaults=cleanComponent(spriteTemplate);delete defaults.geometry;
 g.component(art,'cc.Sprite',{...defaults,_spriteFrame:illustrations[2],_sizeMode:0,_isTrimmedMode:false,_color:color('ffffff')});
 const disabled=node('UnavailableArtWash',front,0,44,136,136);
 g.component(disabled,'cc.Graphics',cleanComponent(graphicTemplate));g.component(disabled,script('ShapeGraphic'),{shape:0,fill:color(hex(C.paper),115),outline:color(hex(C.paper),0),outlineWidth:0,points:[],tiles:[],palette:[],tileColors:[]});g.graph[disabled]._active=false;
 const keywordLabels=[],keywordPlates=[];
 for(let i=0;i<3;i++){const chip=panel('Keyword'+i,front,0,-24,40,16,C.paperShade,C.lineSoft,.6);g.graph[chip.panel].innerLine=color(hex(C.paper),0);const text=label('KeywordText'+i,chip.node,'关键词',0,0,34,16,11,C.ink,false,1,14);keywordLabels.push(ref(text.label));keywordPlates.push(ref(chip.node));g.graph[chip.node]._active=false;}
 const rule=node('EffectRule',front,0,-35,188,1);g.component(rule,'cc.Graphics',cleanComponent(graphicTemplate));g.component(rule,script('ShapeGraphic'),{shape:0,fill:color(hex(C.lineSoft),150),outline:color(hex(C.lineSoft),0),outlineWidth:0,points:[],tiles:[],palette:[],tileColors:[]});
 const effect=label('Effect',front,'下回合起每回合生成「挥砍」',0,-60,188,42,17,C.ink,true,0,20);
 const detail=label('Description',front,'占用唯一武器槽。',0,-105,188,44,15,C.muted,false,0,18);
 const divider=node('FooterRule',visual,0,-135,188,.8);g.component(divider,'cc.Graphics',cleanComponent(graphicTemplate));g.component(divider,script('ShapeGraphic'),{shape:0,fill:color(hex(C.lineSoft),100),outlineWidth:0,points:[],tiles:[],palette:[],tileColors:[]});
 const status=label('Status',visual,'点击 / 拖动',-45,-151,105,20,12,C.muted,false,0,15);
 const weight=label('Weight',visual,'负重 3',62,-151,72,20,13,C.muted,false,2,16);
 const viewport=node('DetailsViewport',visual,0,-10,188,218);g.graph[viewport]._active=false;
 const full=label('FullDescription',viewport,'',0,109,188,218,16,C.ink,false,0,22);
 const fullTransform=g.graph[full.node]._components.map(r=>g.graph[r.__id__]).find(o=>o.__type__==='cc.UITransform');fullTransform._anchorPoint={__type__:'cc.Vec2',x:.5,y:1};g.graph[full.label]._overflow=3;g.graph[full.label]._verticalAlign=0;
 g.component(card,'cc.Animation',{playOnLoad:false,_clips:[draw,play],_defaultClip:draw});
 g.component(card,cardType,{costLabel:ref(cost.label),costUnitLabel:ref(costUnit.label),costBadge:ref(costBadge.node),keywordLabels,keywordPlates,titleLabel:ref(title.label),typeLabel:ref(tag.label),effectLabel:ref(effect.label),descriptionLabel:ref(detail.label),statusLabel:ref(status.label),weightLabel:ref(weight.label),artwork:ref(g.graph[art]._components.find(r=>g.graph[r.__id__].__type__==='cc.Sprite').__id__),disabledOverlay:ref(disabled),visualRoot:ref(visual),selectionOutline:ref(selected.node),panel:ref(paper.panel),theme:asset(uuid('assets/resources/ui/theme.json'),'cc.JsonAsset'),frontContent:ref(front),detailsViewport:ref(viewport),detailsLabel:ref(full.label),illustrations,drawClip:draw,playClip:play,normalText:color(hex(C.muted)),blockedText:color(hex(C.danger))});
 g.component(card,script('CardInteraction'));
 preserveIds(g,previous);g.save();
}

// Reuse the new illustration assets wherever existing card metadata already appears.
const inventoryFile='assets/prefabs/ui/InventoryRow.prefab';
if(fs.existsSync(path.join(root,inventoryFile))){const graph=read(inventoryFile),type=script('InventoryRowPresentation');for(const item of graph)if(item.__type__===type)item.illustrations=illustrations;write(inventoryFile,graph);}
const battleFile='assets/prefabs/screens/BattleScreen.prefab',battleGraph=read(battleFile),handType=script('HandPresentation');
for(const item of battleGraph)if(item.__type__===handType){item.hoverLift=theme.card.hoverLift;item.hoverScale=theme.card.hoverScale;}
write(battleFile,battleGraph);

const sceneFile='assets/CardDesignReview.scene',sceneUuid=ensureMeta(sceneFile,'scene'),scene=new Graph(sceneFile,'CardDesignReview');
const object=scene.graph[scene.graph[0].scene.__id__];scene.graph[0]._name=object._name='CardDesignReview';object._id=sceneUuid;
scene.graph[scene.root]._children=scene.graph[scene.root]._children.filter(child=>scene.graph[child.__id__]._name==='Camera');
scene.root=scene.node('CardDesignReview',scene.root);
scene.shape('Canvas',0,0,1440,900,hex(C.canvas));
scene.label('Eyebrow','THE END  /  UI STUDY 01',0,405,1320,24,13,hex(C.muted));
scene.label('Heading','卡牌组件 · 正式版字段与状态',0,357,1320,54,29,hex(C.ink));
scene.label('Subheading','体力消耗、探索负重、战斗资格与关键词，采用同一套卡牌结构。',0,305,1320,32,17,hex(C.muted));
const cards=[],stateLabels=[],captions=['普通 · 可交互','悬停','选中','不可用 · 体力不足'];
for(let i=0;i<4;i++){const x=(i-1.5)*296;stateLabels.push(ref(scene.label('State'+i,captions[i],x,239,260,30,17,hex(C.ink)).label));cards.push(ref(scene.linked('assets/prefabs/cards/RewardCard.prefab','Card'+i,x,20)));}
const status=scene.label('Status','',0,-216,1320,36,17,hex(C.ink));
scene.label('InteractionHint','左侧卡牌支持悬停、单击、长按查看完整说明，以及拖动回弹。',0,-263,1320,30,16,hex(C.muted));
const controls=[['previous','上一张卡牌','previousCard'],['details','展开 / 收起说明','toggleDetails'],['longtext','长文本校验','toggleLongText'],['next','下一张卡牌','nextCard']].map(([name,caption,method],i)=>scene.button(name,caption,(i-1.5)*216,-330,method,'CardDesignReview'));
const drag=scene.node('DragLayer');
scene.component(scene.root,script('CardDesignReview'),{referenceCards:asset(uuid('assets/resources/ui/card-reference.json'),'cc.JsonAsset'),stateLabels,cards,controls:controls.map(b=>ref(b.node)),dragLayer:ref(drag),status:ref(status.label)});
scene.graph[object._prefab.__id__].fileId=sceneUuid;scene.graph[object._prefab.__id__].nestedPrefabInstanceRoots=scene.links;scene.save();
const config=read('build-config.json');Object.assign(config,{name:'the-end-card-design',outputName:'ui-cards',startScene:sceneUuid,scenes:[{url:'db://'+sceneFile,uuid:sceneUuid}]});fs.writeFileSync(path.join(root,'build-card-review.json'),JSON.stringify(config,null,2)+'\n');
console.log(JSON.stringify({component:'CardPresentation',prefabs:2,states:4,illustrations:10,scene:sceneFile,sceneUuid,reference:'formal-workbook'}));
