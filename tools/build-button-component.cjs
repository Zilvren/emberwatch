// Reusable native button prefabs, state workshop and in-place adoption by existing actions.
const fs=require('node:fs'),path=require('node:path');
const {root,read,copy,ref,vec,color,asset,uuid,script,ensureMeta,write,Graph,cleanComponent,graphicTemplate,buttonTemplate}=require('./native-assets.cjs');
const theme=read('assets/resources/ui/theme.json'),C=theme.colors,B=theme.button,hex=s=>s.replace('#','');
const presentationType=script('ButtonPresentation'),actionType=script('ButtonAction'),mapType=script('MapPointPresentation');
const {move,decorate,button}=require('./ui-authoring.cjs');
for(const variant of ['primary','secondary','quiet','danger']){
 const file='assets/prefabs/ui/buttons/'+variant+'.prefab';fs.mkdirSync(path.join(root,'assets/prefabs/ui/buttons'),{recursive:true});ensureMeta(file,'prefab');
 const g=new Graph(file,'Button_'+variant);g.root=1;button(g,'Button_'+variant,{primary:'继续探索',secondary:'返回',quiet:'查看记录',danger:'放弃物品'}[variant],0,0,180,48,variant);g.graph[g.root]._parent=null;g.save();
}
const primaryIds=new Set(['journal-start','end-turn','rewards-done','rest-done','shelter-done','modal-confirm']);
function variantFor(id){if(id==='restart'||id.startsWith('discard-'))return 'danger';if(primaryIds.has(id))return 'primary';if(['help','log','audio','modal-cancel','modal-close','bag-prev','bag-next'].includes(id))return 'quiet';return 'secondary';}
let migrated=0;
function adopt(folder){for(const item of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,item.name);if(item.isDirectory()){if(item.name!=='buttons')adopt(file);continue;}if(!/\.(prefab|scene)$/.test(item.name)||item.name==='ButtonDesignReview.scene')continue;
 const relative=path.relative(root,file).replaceAll('\\','/'),data=read(relative),g=new Graph(relative,'Existing');g.graph=data;g.root=g.prefab?data[0].data.__id__:data.findIndex(o=>o.__type__==='cc.Node'&&o._name==='Canvas');let dirty=false;
 for(const node of data.filter(o=>o.__type__==='cc.Node'&&o._components)){
  const components=node._components.map(r=>data[r.__id__]);if(components.some(o=>o.__type__===mapType))continue;
  const action=components.find(o=>o.__type__===actionType),control=components.find(o=>o.__type__==='cc.Button');
  if(!action?.caption||!control)continue;
  const existing=components.find(o=>o.__type__===presentationType);if(existing){existing.darkSurface=true;dirty=true;continue;}
  decorate(g,data.indexOf(node),action.caption.__id__,variantFor(action.actionId));dirty=true;migrated++;
  data[node._components[node._components.length-1].__id__].darkSurface=true;
 }
 const director=data.find(o=>o.__type__===script('GameDirector'));
 if(director&&!data.some(o=>o.__type__===script('ButtonFocusGroup'))){g.component(director.node.__id__,script('ButtonFocusGroup'),{buttons:[]});dirty=true;}
 if(dirty)g.save();
}}
adopt(path.join(root,'assets'));

const sceneFile='assets/ButtonDesignReview.scene',sceneUuid=ensureMeta(sceneFile,'scene'),g=new Graph(sceneFile,'ButtonDesignReview');
const object=g.graph[g.graph[0].scene.__id__];g.graph[0]._name=object._name='ButtonDesignReview';object._id=sceneUuid;
g.graph[g.root]._children=g.graph[g.root]._children.filter(r=>g.graph[r.__id__]._name==='Camera');g.root=g.node('ButtonDesignReview',g.root);
g.shape('Canvas',0,0,1440,900,hex(C.canvas));
g.label('Eyebrow','THE END  /  UI STUDY 02',0,406,1320,24,13,hex(C.muted));
g.label('Heading','按钮组件 · 用途与交互状态',0,360,1320,52,29,hex(C.ink));
g.label('Subheading','细线与纸色保持一致。点击反馈克制，键盘焦点清楚。',0,309,1320,32,17,hex(C.muted));
const states=['normal','hover','pressed','disabled','focus'],names=['普通','悬停','按下','禁用','键盘焦点'],variants=['primary','secondary','quiet','danger'],rowNames=['主操作','次要操作','轻操作','危险操作'],captions=['继续探索','返回地图','查看记录','放弃物品'],samples=[];
states.forEach((state,i)=>g.label('State'+i,names[i],(i-2)*220+40,258,190,30,17,hex(C.ink)));
variants.forEach((variant,row)=>{const y=194-row*70;g.label('Variant'+row,rowNames[row],-610,y,140,40,18,hex(C.ink));states.forEach((state,col)=>samples.push(ref(button(g,'sample-'+variant+'-'+state,captions[row],(col-2)*220+40,y,180,48,variant,state))));});
g.label('TryHeading','实际操作',0,-105,1320,32,19,hex(C.ink));
const backdrop=g.shape('DarkSurface',0,-166,1320,74,'37362f');g.graph[backdrop]._active=false;
const live=variants.map((variant,i)=>ref(g.linked('assets/prefabs/ui/buttons/'+variant+'.prefab','live-'+variant,(i-1.5)*300,-166)));
const status=g.label('Counts','',0,-222,1320,32,16,hex(C.ink));
const compact=button(g,'live-compact','返回',-455,-285,88,40,'secondary'),long=button(g,'live-long','继续 · 放弃未领取奖励',-220,-285,300,56,'secondary');
const toggle=button(g,'toggle-live','切换禁用',150,-285,160,48,'quiet'),reset=button(g,'reset-counts','清零计数',365,-285,160,48,'quiet');
const surfaceToggle=button(g,'toggle-surface','深底对照',570,-285,140,48,'quiet');
g.label('Hint','可按 Tab / Shift+Tab 切换焦点，Enter 或空格激活；按住后移出按钮再松开会取消。',0,-371,1320,38,16,hex(C.muted));
g.component(g.root,script('ButtonFocusGroup'),{buttons:[...live,ref(compact),ref(long),ref(toggle),ref(reset),ref(surfaceToggle)]});
g.component(g.root,script('ButtonDesignReview'),{liveButtons:live,samples,controls:[ref(compact),ref(long),ref(toggle),ref(reset),ref(surfaceToggle)],status:ref(status.label),darkBackdrop:ref(backdrop)});
g.graph[object._prefab.__id__].fileId=sceneUuid;g.graph[object._prefab.__id__].nestedPrefabInstanceRoots=g.links;g.save();
const config=read('build-config.json');Object.assign(config,{name:'the-end-button-design',outputName:'ui-buttons',startScene:sceneUuid,scenes:[{url:'db://'+sceneFile,uuid:sceneUuid}]});fs.writeFileSync(path.join(root,'build-button-review.json'),JSON.stringify(config,null,2)+'\n');
console.log(JSON.stringify({prefabs:4,variants:4,states:5,migrated,scene:sceneFile,sceneUuid}));
