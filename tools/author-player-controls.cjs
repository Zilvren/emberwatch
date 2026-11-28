// Explicit native asset update. Does not run as part of a normal build.
const fs = require('node:fs');
const path = require('node:path');
const N = require('./native-assets.cjs');
const U = require('./ui-authoring.cjs');
const atlasFile = 'assets/ashen-labyrinth/interface/control-icons.plist';
const atlas = N.read(atlasFile + '.meta');
const theme = N.asset(N.uuid('assets/ashen-labyrinth/interface/theme.json'), 'cc.JsonAsset');
const settingsFile = 'assets/prefabs/ui/SettingsPopup.prefab';
const pilesFile = 'assets/prefabs/ui/BattlePilePopup.prefab';
const sceneFile = 'assets/TheEnd.scene';
const comp = (g,n,type) => g.graph[n]._components.map(r=>g.graph[r.__id__]).find(o=>o.__type__===type);

function edit(file) {
    const g = new N.Graph(file, '');
    g.graph = N.read(file);
    g.root = g.graph[0].data.__id__;
    return g;
}
function child(g, parent, name) { return g.graph[parent]._children.find(r => g.graph[r.__id__]._name === name)?.__id__; }
function glyph(g,parent,nodeName,id,x,y,side,hex) {
    const frame = Object.values(atlas.subMetas).find(m=>m.name === 'ic-' + id);
    if (!frame) throw Error('Missing imported icon '+id);
    if (child(g,parent,nodeName) !== undefined) return;
    const n = g.node(nodeName,parent,x,y,side,side);
    g.component(n,'cc.Sprite',{...N.cleanComponent(N.spriteTemplate), _type:0, _sizeMode:0,
        _spriteFrame:N.asset(frame.uuid,'cc.SpriteFrame'),_color:N.color(hex),_customMaterial:null});
}
function label(g,parent,name,value,x,y,w,h,size,tint,bold=false) {
    const item=g.label(name,value,0,0,w,h,size,tint);
    U.move(g,item.node,parent); g.graph[item.node]._lpos=N.vec(x,y);
    Object.assign(g.graph[item.label],{_font:null,_fontFamily:'Microsoft YaHei',_isSystemFontUsed:true,
        _isBold:bold,_horizontalAlign:1,_verticalAlign:1,_overflow:2,_enableWrapText:true,_enableOutline:false});
    return item;
}
function button(g,parent,id,caption,x,y,w=56,h=44,variant='secondary') {
    const n=U.button(g,id,caption,0,0,w,h,variant);
    U.move(g,n,parent); g.graph[n]._lpos=N.vec(x,y);
    Object.assign(comp(g,n,N.script('ButtonPresentation')),{theme,darkSurface:true});
    return n;
}
function actionRef(g,n) {
    return g.graph[n]._components.find(r=>g.graph[r.__id__].__type__ === N.script('ButtonAction'));
}
const hudArt = require('./battle-hud-art.cjs');
function identifyHudBranch(g, id, path) {
    const owner = g.graph[id];
    const seed = g.file + ':hud:' + path;
    owner._id = N.identifier(seed);
    g.graph[owner._prefab.__id__].fileId = N.identifier(seed + ':node');
    for (const ref of owner._components) {
        const component = g.graph[ref.__id__];
        component._id = N.identifier(seed + ':' + component.__type__);
        g.graph[component.__prefab.__id__].fileId = N.identifier(seed + ':component:' + component.__type__);
    }
    for (const ref of owner._children)
        identifyHudBranch(g, ref.__id__, path + '/' + g.graph[ref.__id__]._name);
}
function hud() {
    const g = edit('assets/prefabs/ui/HUD.prefab');
    const bar = comp(g,g.root,N.script('StatusBar'));
    const backing = child(g,g.root,'StatusPaper');
    if (backing !== undefined) g.graph[backing]._active = true;
    g.graph[g.root]._components = g.graph[g.root]._components.filter(r=>g.graph[r.__id__].__type__!=='cc.BlockInputEvents');
    bar.presentation = 'strip';
    const get = id => g.graph.findIndex(o=>o.__type__==='cc.Node' && o._name===id);
    const forget = new Set([get('help'),get('audio')]);
    g.graph[g.root]._children=g.graph[g.root]._children.filter(r=>!forget.has(r.__id__));
    let gear=get('settings');
    if (gear<0) {
        gear=get('restart');g.graph[gear]._name='settings';
        const act=comp(g,gear,N.script('ButtonAction'));act.actionId='settings';
        g.graph[act.caption.__id__]._string='设置';
        comp(g,gear,N.script('ButtonPresentation')).variant='quiet';
    }
    const backpack = child(g, g.root, 'supply-bag') ?? button(g,g.root,'supply-bag','物资背包',0,0,58,44,'quiet');
    bar.utilities=[backpack,get('map'),gear].map(N.ref);
    bar.icons=N.asset(atlas.uuid,'cc.SpriteAtlas');
    const [identity,day,supplies,health]=bar.sections.map(r=>r.__id__);
    for(const name of ['Brand','SaveState','DayTitle','SuppliesTitle','SuppliesHint','HealthTitle','CarryHint']){
        const n=get(name); if(n>=0) g.graph[n]._active=false;
    }
    for(const key of ['brand','save','suppliesHint','healthTitle','carryHint']) delete bar[key];
    hudArt.crest(g,identity);
    glyph(g,identity,'SaveGlyph','saved',16,-11,14,'ccba9e');
    const sun = child(g,day,'StatusGlyph');
    if (sun !== undefined) g.graph[sun]._active = false;
    glyph(g,supplies,'StatusGlyph','supplies',0,0,28,'d7b78f');
    glyph(g,health,'StatusGlyph','health',0,0,28,'ee9c9b');
    for(const property of ['day','supplies','health']){
        const l=g.graph[bar[property].__id__];
        Object.assign(l,{_fontSize:23,_lineHeight:30,_isBold:true,_overflow:2,_horizontalAlign:0,
            _enableOutline:true,_outlineColor:N.color('221c2a',220),_outlineWidth:2});
        comp(g,l.node.__id__,'cc.UITransform')._anchorPoint={__type__:'cc.Vec2',x:0,y:.5};
    }
    hudArt.roundLabel(g,bar);
    hudArt.navigation(g,bar);
    identifyHudBranch(g,backpack,'backpack');
    identifyHudBranch(g,g.graph[bar.round.__id__].node.__id__,'round');
    fs.writeFileSync(g.file, JSON.stringify(g.graph,null,2)+'\n');
}
function modal(file,name,key,w,h) {
    const g=new N.Graph(file,name);g.root=g.node(name,null);
    g.component(g.root,N.script('GameView'),{key});
    const back=g.shape('DismissBackdrop',0,0,1440,900,'201923',149);
    g.component(back,'cc.BlockInputEvents');
    const panel=g.node('Panel',g.root,0,0,w,h);
    g.component(panel,'cc.Graphics',N.cleanComponent(N.graphicTemplate));
    g.component(panel,N.script('PaperPanel'),{fill:N.color('2a2432',250),line:N.color('a48a76'),
        innerLine:N.color('705d68',150),corner:9,lineWidth:1.2});
    g.component(panel,'cc.BlockInputEvents');
    const close=button(g,panel,'modal-close','关闭',w/2-42,h/2-40,44,40,'quiet');
    if (key === 'settings' || key === 'battle-pile') {
        g.graph[close]._lpos = N.vec(w/2-46,h/2-46);
        const style = comp(g,close,N.script('ButtonPresentation'));
        style.variant = 'secondary';
        const ring = g.graph[style.focusRing.__id__].node.__id__;
        for (const [node,width,height] of [[close,84,84],[style.surface.__id__,54,50],[ring,60,56]]) {
            Object.assign(comp(g,node,'cc.UITransform')._contentSize,{width,height});
        }
    }
    g.component(g.root,N.script('ModalPanel'),{backdrop:N.ref(back),closeAction:'modal-close',closeOnBackdrop:true,closeOnEscape:true});
    g.component(g.root,N.script('ButtonFocusGroup'),{modal:true,buttons:[],initialButton:N.ref(close)});
    return {g,panel};
}
function settings() {
    const {g,panel}=modal(settingsFile,'SettingsPopup','settings',500,250);
    glyph(g,panel,'SettingsSeal','settings',0,66,37,'d6b88b');
    button(g,panel,'audio','声音开',-118,-32,80,70);
    button(g,panel,'help','帮助',0,-32,80,70);
    button(g,panel,'restart','重新开始',118,-32,80,70,'danger');
    hudArt.tablet(g,panel,true);
    g.save();
}
function piles() {
    const {g,panel}=modal(pilesFile,'BattlePilePopup','battle-pile',1008,650);
    const title=label(g,panel,'PileTitle','抽牌堆',0,264,650,52,34,'f4e6d4',true);
    const hint=label(g,panel,'PileHint','',0,218,800,35,18,'cdbcc9');
    const holders=[-295,0,295].map((x,i)=>g.node('PileCard'+i,panel,x,4,224,340));
    const page=label(g,panel,'PilePage','',0,-256,134,42,18,'e0c6a3');
    const prev=button(g,panel,'pile-prev','上一页',-108,-256);
    const next=button(g,panel,'pile-next','下一页',108,-256);
    g.component(panel,N.script('BattlePilePanel'),{cardPrefab:N.asset(N.uuid('assets/prefabs/cards/SelectableCard.prefab'),'cc.Prefab'),
        holders:holders.map(N.ref), title:N.ref(title.label),hint:N.ref(hint.label),pageLabel:N.ref(page.label),
        previous:actionRef(g,prev),next:actionRef(g,next),emptyBag:N.ref(hudArt.emptyBag(g,panel)),
        closeButton:N.ref(child(g,panel,'modal-close'))});
    hudArt.tablet(g,panel);
    g.save();
}
function stacks() {
    const g=edit('assets/prefabs/screens/BattleScreen.prefab');
    for(const [name,id,caption] of [['drawPile','draw-pile','查看抽牌堆'],['discardPile','discard-pile','查看弃牌堆']]){
        const base=child(g,g.root,name);
        const old=child(g,base,name+'-text1'); if(old!==undefined)g.graph[old]._active=true;
        const n=child(g,base,id) ?? button(g,base,id,caption,0,0,72,106,'quiet');
        const presentation=comp(g,n,N.script('ButtonPresentation'));
        const surface=presentation.surface.__id__;
        const focus=g.graph[presentation.focusRing.__id__].node.__id__;
        Object.assign(comp(g,n,'cc.UITransform')._contentSize,{width:156,height:166});
        Object.assign(comp(g,surface,'cc.UITransform')._contentSize,{width:124,height:126});
        Object.assign(comp(g,focus,'cc.UITransform')._contentSize,{width:154,height:158});
        g.graph[surface]._lpos=g.graph[focus]._lpos=N.vec(0,0);
        comp(g,surface,'cc.Graphics')._enabled=true;
        presentation.transparentSurface=true;
    }
    for (const [node, symbol, x, y, tint] of [
        ['CriticalWarning', 'warning', 0, 0, 'ee9c9b'],
    ]) {
        const owner = g.graph.findIndex(o => o.__type__ === 'cc.Node' && o._name === node);
        glyph(g, owner, 'StatIcon', symbol, x, y, 24, tint);
        if (node === 'CriticalWarning') comp(g, owner, 'cc.Label')._enabled = false;
    }
    const intent = g.graph.findIndex(o => o.__type__ === 'cc.Node' && o._name === 'battle-text0');
    glyph(g, intent, 'AttackGlyph', 'attack', -29, 0, 26, 'f1b786');
    glyph(g, intent, 'PrepareGlyph', 'clock', 0, 0, 22, 'dbc39e');
    hudArt.battle(g);
    fs.writeFileSync(g.file, JSON.stringify(g.graph,null,2)+'\n');
}
function bind() {
    const g=new N.Graph(sceneFile,'TheEnd'),director=g.graph.find(o=>o.__type__===N.script('GameDirector'));
    const info=g.graph.find(o=>Array.isArray(o.nestedPrefabInstanceRoots));
    director.controlIcons=N.asset(atlas.uuid,'cc.SpriteAtlas');
    for(const [file,name] of [[settingsFile,'SettingsPopup'],[pilesFile,'BattlePilePopup']]){
        if(director.popupRoots.some(r=>g.graph[g.graph[r.__id__]._prefab?.__id__]?.asset?.__uuid__===N.uuid(file)))continue;
        g.root=director.popupRoot.__id__;
        const n=g.linked(file,name,0,0);
        const instance=g.graph[g.graph[g.graph[n]._prefab.__id__].instance.__id__];
        instance.propertyOverrides.map(r=>g.graph[r.__id__]).find(p=>p.propertyPath[0]==='_active').value=false;
        director.popupRoots.push(N.ref(n));info.nestedPrefabInstanceRoots.push(N.ref(n));
    }
    fs.writeFileSync(path.join(N.root,sceneFile),JSON.stringify(g.graph,null,2)+'\n');
}
if (require.main === module) {
    settings(); piles();
    for(const file of [settingsFile,pilesFile])N.ensureMeta(file,'prefab');
    hud(); stacks(); bind();
}
module.exports = { hud, piles, stacks };
