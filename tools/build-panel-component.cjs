// Explicit native resource authoring. Normal builds never regenerate these editable assets.
const fs=require('node:fs'),path=require('node:path');
const {root,read,ref,vec,color,asset,uuid,script,ensureMeta,Graph,cleanComponent,graphicTemplate}=require('./native-assets.cjs');
const {button,move}=require('./ui-authoring.cjs');
const theme=read('assets/resources/ui/theme.json'),C=theme.colors,P=theme.panel,hex=s=>s.replace('#','');
function size(g,node,w,h,anchor){const ui=g.graph[node]._components.map(r=>g.graph[r.__id__]).find(c=>c.__type__==='cc.UITransform');ui._contentSize={__type__:'cc.Size',width:w,height:h};if(anchor)ui._anchorPoint={__type__:'cc.Vec2',x:anchor[0],y:anchor[1]};}
function label(g,name,text,parent,w,h,font=18){const result=g.label(name,text,0,0,w,h,font,hex(C.ink));move(g,result.node,parent);size(g,result.node,w,h,[0,1]);Object.assign(g.graph[result.label],{_font:null,_isSystemFontUsed:true,_fontFamily:'Microsoft YaHei',_isBold:false,_lineHeight:font===18?P.lineHeight:font+8,_horizontalAlign:0,_verticalAlign:0,_enableWrapText:true,_overflow:3});return result;}
function line(g,name,parent){const node=g.shape(name,0,0,100,1,hex(C.lineSoft));move(g,node,parent);return node;}
function paper(g,parent){const sheet=g.node('PanelSheet',parent,0,0,760,580);g.component(sheet,'cc.Graphics',cleanComponent(graphicTemplate));g.component(sheet,script('PaperPanel'),{fill:color(hex(C.paper)),line:color(hex(C.line)),innerLine:color(hex(C.lineSoft),70),lineWidth:P.lineWidth,corner:6});g.component(sheet,'cc.BlockInputEvents');return sheet;}
function action(g,parent,id,text,variant,width=160,existing){let node=existing;if(node===undefined){node=button(g,id,text,0,0,width,48,variant);}move(g,node,parent);const components=g.graph[node]._components.map(r=>g.graph[r.__id__]);const presenter=components.find(c=>c.__type__===script('ButtonPresentation'));presenter.darkSurface=false;presenter.variant=variant;const control=components.find(c=>c.__type__===script('ButtonAction'));control.actionId=id;const caption=g.graph[control.caption.__id__];caption._string=text;caption._fontSize=18;caption._lineHeight=24;caption._isBold=variant==='primary';size(g,node,width,48);return node;}
function panel(g,parent,options={}){
 const {modal=false,confirm=false,title='阅读面板',body='',subtitle='',width=760,height=580,existing={}}=options;
 const owner=parent,backdrop=modal?g.shape('ModalBackdrop',0,0,1440,900,hex(P.backdrop),P.backdropAlpha):null;
 if(modal){move(g,backdrop,owner);g.component(backdrop,'cc.BlockInputEvents');}
 const sheet=paper(g,owner);
 let heading=existing.title,copy=existing.body;
 if(heading===undefined)heading=label(g,'PanelTitle',title,sheet,width-110,40,P.titleSize).label;
 else{move(g,g.graph[heading].node.__id__,sheet);size(g,g.graph[heading].node.__id__,width-110,40,[0,1]);Object.assign(g.graph[heading],{_font:null,_fontFamily:'Microsoft YaHei',_isSystemFontUsed:true,_fontSize:P.titleSize,_lineHeight:32,_horizontalAlign:0,_verticalAlign:0,_isBold:true,_overflow:3,_enableWrapText:true});}
 const sub=label(g,'PanelSubtitle',subtitle,sheet,width-48,22,P.subtitleSize);
 const close=action(g,sheet,confirm?'modal-cancel':'modal-close','×','quiet',40);
 const header=line(g,'HeaderDivider',sheet),footer=line(g,'FooterDivider',sheet);
 const viewport=g.node('ContentViewport',sheet,0,0,width-48,300);
 g.component(viewport,'cc.Mask',{_type:0,_inverted:false,_segments:4});
 const content=g.node('Content',viewport,0,150,width-48,300);size(g,content,width-48,300,[.5,1]);
 if(copy===undefined)copy=label(g,'BodyText',body,content,width-66,300,P.bodySize).label;
 else{move(g,g.graph[copy].node.__id__,content);size(g,g.graph[copy].node.__id__,width-66,300,[0,1]);Object.assign(g.graph[copy],{_font:null,_fontFamily:'Microsoft YaHei',_isSystemFontUsed:true,_fontSize:P.bodySize,_lineHeight:P.lineHeight,_horizontalAlign:0,_verticalAlign:0,_isBold:false,_overflow:3,_enableWrapText:true});}
 const scroll=g.component(viewport,'cc.ScrollView',{_content:ref(content),horizontal:false,vertical:true,elastic:false,inertia:false,brake:1,bounceDuration:0,cancelInnerEvents:true,scrollEvents:[],_horizontalScrollBar:null,_verticalScrollBar:null});
 const hint=label(g,'ScrollHint','↓',sheet,16,24,16);size(g,hint.node,16,24,[.5,.5]);
 const actions=confirm?[
  action(g,sheet,'modal-cancel','返回','secondary',144,existing.cancel),
  action(g,sheet,'modal-confirm','确认选择','primary',224,existing.confirm),
 ]:[action(g,sheet,'modal-close','返回游戏','secondary',160,existing.close)];
 const common=g.component(owner,script('CommonPanel'),{theme:asset(uuid('assets/resources/ui/theme.json'),'cc.JsonAsset'),sheet:ref(sheet),title:ref(heading),subtitle:ref(sub.label),body:ref(copy),closeButton:ref(close),headerLine:ref(header),footerLine:ref(footer),viewport:ref(viewport),content:ref(content),scroll:ref(scroll),scrollHint:ref(hint.label),actions:actions.map(ref),preferredWidth:width,preferredHeight:height});
 if(modal){g.component(owner,script('ButtonFocusGroup'),{buttons:[...actions,close].map(ref),modal:true,initialButton:ref(actions[0])});g.component(owner,script('ModalPanel'),{backdrop:ref(backdrop),closeAction:confirm?'modal-cancel':'modal-close',closeOnBackdrop:!confirm,closeOnEscape:true});}
 return {common,actions,close,sheet};
}
const short='离开避难所前，把需要确认的信息放在同一张纸上。\n\n标题、内容与操作区各自清楚，保持一致的阅读顺序。';
const long='这是长内容的排版示例。正文超出可见范围后，在内容区内滚动。\n\n标题与操作区保持固定。滚轮和拖动都只移动正文，不改变纸面的大小。\n\n较长的说明按段落组织，留出足够的行距。\n\n关闭后再次打开，回到内容顶部。\n\n记录可以逐段阅读，最后一段也不会藏在按钮下面。\n\n这是一组容器示例，不代表新增游戏规则。\n\n阅读结束。';
for(const [name,width,height,confirm]of [['InfoPanel',760,580,false],['ConfirmPanel',600,360,true],['WidePanel',1040,680,false]]){
 const file='assets/prefabs/ui/panels/'+name+'.prefab';fs.mkdirSync(path.join(root,'assets/prefabs/ui/panels'),{recursive:true});ensureMeta(file,'prefab');const g=new Graph(file,name);g.root=g.node(name,null);panel(g,g.root,{modal:true,confirm,width,height,title:confirm?'确认这次选择？':'阅读面板',body:confirm?'确认前，请阅读这次操作的说明。':long,subtitle:'THE END  /  FIELD NOTES'});g.save();
}
// Preserve existing UIValue, ButtonAction and fileIds while replacing the old popup chrome.
const adopted=[];
for(const name of ['HelpPopup','LogPopup','ConfirmPopup']){
 const file='assets/prefabs/ui/'+name+'.prefab',g=new Graph(file,name);g.graph=read(file);g.root=g.graph[0].data.__id__;
 if(g.graph.some(c=>c.__type__===script('CommonPanel')))continue;
 const values=g.graph.filter(c=>c.__type__===script('UIValue')),findLabel=key=>values.find(c=>c.key===key)?.node.__id__,labelAt=node=>g.graph[node]._components.map(r=>g.graph[r.__id__]).findIndex(c=>c.__type__==='cc.Label');
 const titleNode=findLabel('modal/text0'),bodyNode=findLabel('modal/text1');
 const labelId=node=>g.graph[node]._components.find(r=>g.graph[r.__id__].__type__==='cc.Label').__id__;
 const getAction=id=>g.graph.find(c=>c.__type__===script('ButtonAction')&&c.actionId===id)?.node.__id__;
 for(const r of g.graph[g.root]._children){const node=g.graph[r.__id__];if(node._name==='Panel')node._active=false;}
 const existing={title:labelId(titleNode),body:labelId(bodyNode),close:getAction('modal-close'),cancel:getAction('modal-cancel'),confirm:getAction('modal-confirm')};
 const confirm=name==='ConfirmPopup';panel(g,g.root,{modal:true,confirm,width:confirm?680:800,height:confirm?380:620,existing});
 for(const val of values){val.normalColor=color(hex(C.ink));g.graph[labelId(val.node.__id__)]._color=color(hex(C.ink));}
 g.save();adopted.push(file);
}
const sceneFile='assets/PanelDesignReview.scene',sceneUuid=ensureMeta(sceneFile,'scene'),g=new Graph(sceneFile,'PanelDesignReview'),scene=g.graph[g.graph[0].scene.__id__];
g.graph[0]._name=scene._name='PanelDesignReview';scene._id=sceneUuid;g.graph[g.root]._children=g.graph[g.root]._children.filter(r=>g.graph[r.__id__]._name==='Camera');g.root=g.node('PanelDesignReview',g.root);
g.shape('Canvas',0,0,1440,900,hex(C.canvas));
g.label('Eyebrow','THE END  /  UI STUDY 03',0,410,1320,22,13,hex(C.muted));g.label('Heading','通用面板 · 清楚的容器与阅读顺序',0,365,1320,52,28,hex(C.ink));g.label('Subheading','固定标题与操作区，长内容在中间滚动。纸色、细线和按钮延续同一套设计。',0,319,1320,30,16,hex(C.muted));
const samples=[];
for(const [index,title,body,height,confirm]of [[0,'基础内容面板',short,480,false],[1,'滚动内容',long,480,false],[2,'确认这次选择？','说明操作的结果，再让玩家选择。\n\n危险操作的确认按钮可使用淡棕红样式。',416,true]]){
 const node=g.node('Sample'+index,g.root,(index-1)*440,30+(480-height)/2,416,520);panel(g,node,{title,body,subtitle:index===2?'确认窗口':'THE END  /  FIELD NOTES',width:416,height,confirm});samples.push(ref(node));
}
g.label('FooterNote','尺寸统一由容器计算；内容较窄时，底部按钮自动纵向排列。',0,-253,1320,28,15,hex(C.muted));
const controls=[button(g,'open-info','打开阅读面板',-460,-316,196,48,'secondary'),button(g,'open-confirm','打开确认窗口',-225,-316,196,48,'primary'),button(g,'open-wide','打开宽面板',10,-316,196,48,'secondary'),button(g,'toggle-width','窄尺寸对照',245,-316,196,48,'quiet'),button(g,'toggle-title','使用长标题',480,-316,196,48,'quiet')];
const status=g.label('Status','',0,-375,1320,28,15,hex(C.muted));g.component(g.root,script('ButtonFocusGroup'),{buttons:controls.map(ref),modal:false});
const dialogs=['InfoPanel','ConfirmPanel','WidePanel'].map(name=>{const node=g.linked('assets/prefabs/ui/panels/'+name+'.prefab','Live'+name,0,0);const info=g.graph[g.graph[node]._prefab.__id__],instance=g.graph[info.instance.__id__];for(const r of instance.propertyOverrides){const property=g.graph[r.__id__];if(property.propertyPath[0]==='_active')property.value=false;}return ref(node);});
g.component(g.root,script('PanelDesignReview'),{dialogs,samples,status:ref(status.label)});g.graph[scene._prefab.__id__].fileId=sceneUuid;g.graph[scene._prefab.__id__].nestedPrefabInstanceRoots=g.links;g.save();
const config=read('build-config.json');Object.assign(config,{name:'the-end-panel-design',outputName:'ui-panels',startScene:sceneUuid,scenes:[{url:'db://'+sceneFile,uuid:sceneUuid}]});fs.writeFileSync(path.join(root,'build-panel-review.json'),JSON.stringify(config,null,2)+'\n');
console.log(JSON.stringify({prefabs:3,scene:sceneFile,sceneUuid,adopted}));
