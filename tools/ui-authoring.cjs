const {ref,vec,color,asset,uuid,script,cleanComponent,graphicTemplate,buttonTemplate}=require('./native-assets.cjs');
const theme=require('./native-assets.cjs').read('assets/resources/ui/theme.json'),C=theme.colors,B=theme.button,hex=s=>s.replace('#','');
const presentationType=script('ButtonPresentation'),actionType=script('ButtonAction');
function move(g,node,parent){const old=g.graph[node]._parent?.__id__;if(old!==undefined)g.graph[old]._children=g.graph[old]._children.filter(r=>r.__id__!==node);g.graph[node]._parent=ref(parent);g.graph[parent]._children.push(ref(node));}
function decorate(g,node,caption,variant='secondary',preview=''){
 const objects=g.graph,owner=objects[node],ui=owner._components.map(r=>objects[r.__id__]).find(o=>o.__type__==='cc.UITransform'),w=ui._contentSize.width,h=ui._contentSize.height;
 const button=owner._components.map(r=>objects[r.__id__]).find(o=>o.__type__==='cc.Button');
 for(const item of owner._components.map(r=>objects[r.__id__]))if(item.__type__==='cc.Graphics'||item.__type__===script('ShapeGraphic'))item._enabled=false;
 const opacity=owner._components.map(r=>objects[r.__id__]).find(o=>o.__type__==='cc.UIOpacity');if(opacity)opacity._opacity=255;
 const ring=g.node('KeyboardFocus',node,0,0,w+8,h+8);g.component(ring,'cc.Graphics',cleanComponent(graphicTemplate));
 const focus=g.component(ring,script('PaperPanel'),{fill:color(hex(C.paper),0),line:color(hex(B.focusLine)),innerLine:color(hex(C.paper),0),lineWidth:1.6,corner:6});objects[ring]._active=false;
 const surface=g.node('ButtonSurface',node,0,0,w,h);g.component(surface,'cc.Graphics',cleanComponent(graphicTemplate));
 const palette=B.variants[variant],panel=g.component(surface,script('PaperPanel'),{fill:color(hex(palette.fill)),line:color(hex(palette.line)),innerLine:color(hex(C.paper),0),lineWidth:B.lineWidth,corner:4});
 const captionNode=objects[caption].node.__id__;move(g,captionNode,surface);objects[captionNode]._lpos=vec(0,0,0);
 const labelUi=objects[captionNode]._components.map(r=>objects[r.__id__]).find(o=>o.__type__==='cc.UITransform');labelUi._contentSize={__type__:'cc.Size',width:Math.max(20,w-B.paddingX*2),height:h-10};
 Object.assign(objects[caption],{_font:null,_isSystemFontUsed:true,_fontFamily:'Microsoft YaHei',_fontSize:h<44?16:h>=56?20:B.fontSize,_lineHeight:h>=56?24:22,_isBold:variant==='primary',_overflow:2,_enableWrapText:false,_horizontalAlign:1,_verticalAlign:1});
 button._transition=0;button._target=ref(surface);
 g.component(node,presentationType,{surface:ref(surface),panel:ref(panel),focusRing:ref(focus),caption:ref(caption),theme:asset(uuid('assets/resources/ui/theme.json'),'cc.JsonAsset'),variant,previewState:preview});
}
function button(g,name,caption,x,y,w,h,variant,preview=''){
 const node=g.node(name,g.prefab&&g.graph.length===1?null:g.root,x,y,w,h),label=g.label(name+'Caption',caption,0,0,w-20,h-10,18,hex(C.ink));move(g,label.node,node);
 g.component(node,'cc.Button',{...cleanComponent(buttonTemplate),_interactable:!preview,_transition:0,_target:ref(node),clickEvents:[]});
 if(!preview){const handler=g.add({__type__:'cc.ClickEvent',target:ref(node),component:'ButtonAction',_componentId:actionType,handler:'activate',customEventData:''});g.graph[node]._components.map(r=>g.graph[r.__id__]).find(o=>o.__type__==='cc.Button').clickEvents=[ref(handler)];g.component(node,actionType,{actionId:name,payload:'',caption:ref(label.label),disabledOpacity:150});}
 decorate(g,node,label.label,variant,preview);return node;
}

module.exports={move,decorate,button};
