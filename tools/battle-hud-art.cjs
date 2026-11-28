// Explicit authoring for the native HUD prefabs. All artwork is bound as SpriteFrames.
const N = require('./native-assets.cjs');
const { move } = require('./ui-authoring.cjs');
const child = (g, parent, name) => g.graph[parent]._children.find(r => g.graph[r.__id__]._name === name)?.__id__;
const component = (g, node, type) => g.graph[node]._components.map(r => g.graph[r.__id__]).find(c => c.__type__ === type);
const named = (g, name) => g.graph.findIndex(o => o.__type__ === 'cc.Node' && o._name === name);
const node = (g, parent, name) => child(g, parent, name) ?? g.node(name, parent, 0, 0, 1, 1);
function place(g, id, x, y, width, height) {
    g.graph[id]._lpos = N.vec(x,y);
    Object.assign(component(g,id,'cc.UITransform')._contentSize, {width,height});
}
function face(g, id, size, tint = 'fff1dc') {
    Object.assign(component(g,id,'cc.Label'), {
        _fontSize:size, _lineHeight:size + 3, _horizontalAlign:1, _verticalAlign:1,
        _isBold:true, _color:N.color(tint), _enableWrapText:false, _enableOutline:true,
        _outlineWidth:2, _outlineColor:N.color('201521'), _overflow:2,
    });
}
function sprite(g, parent, name, art, x, y, w, h) {
    const added = child(g,parent,name) === undefined;
    const id = node(g,parent,name);
    place(g,id,x,y,w,h);
    const current = component(g,id,'cc.Sprite') ?? g.graph[g.component(id,'cc.Sprite',N.cleanComponent(N.spriteTemplate))];
    Object.assign(current, {
        _type:0, _sizeMode:0, _color:N.color('ffffff'), _customMaterial:null,
        _spriteFrame:N.asset(N.uuid('assets/ashen-labyrinth/interface/' + art + '.png') + '@f9941','cc.SpriteFrame'),
    });
    if (added) {
        const owner = g.graph[id], key = g.file + ':art:' + art + ':' + name;
        owner._id = N.identifier(key);
        g.graph[owner._prefab.__id__].fileId = N.identifier(key + ':node');
        for (const ref of owner._components) {
            const c = g.graph[ref.__id__];
            c._id = N.identifier(key + ':' + c.__type__);
            g.graph[c.__prefab.__id__].fileId = N.identifier(key + ':component:' + c.__type__);
        }
    }
    return id;
}
function iconRelief(g, parent, name, art, side) {
    const face = sprite(g,parent,name,art,0,0,side,side);
    const shadow = sprite(g,parent,'GlyphShadow',art,0,-2,side+2,side+2);
    component(g,shadow,'cc.Sprite')._color = N.color('372f46',175);
    before(g,parent,shadow,face);
    return face;
}
function polygon(g, parent, name, points, tint) {
    const id = node(g,parent,name);
    if (!component(g,id,'cc.Graphics')) g.component(id,'cc.Graphics',N.cleanComponent(N.graphicTemplate));
    const shape = component(g,id,N.script('ShapeGraphic')) ?? g.graph[g.component(id,N.script('ShapeGraphic'))];
    Object.assign(shape, {shape:2, fill:N.color(tint), outlineWidth:0,
        points:points.map(([x,y]) => ({__type__:'cc.Vec2',x,y})), tiles:[], palette:[], tileColors:[]});
    return id;
}
function bevel(w,h,cut) {
    return [[-w+cut,-h],[w-cut,-h],[w,-h+cut],[w,h-cut],[w-cut,h],[-w+cut,h],[-w,h-cut],[-w,-h+cut]];
}
function before(g, parent, decoration, content) {
    const children = g.graph[parent]._children.filter(r => r.__id__ !== decoration);
    children.splice(children.findIndex(r => r.__id__ === content), 0, N.ref(decoration));
    g.graph[parent]._children = children;
}
function crest(g, identity) {
    iconRelief(g,identity,'StatusGlyph','citadel-crest',62);
}
function navigation(g, bar) {
    const backing = g.graph[bar.paper.__id__].node.__id__;
    for (const type of ['cc.Graphics',N.script('PaperPanel')]) component(g,backing,type)._enabled=false;
    const lintel = sprite(g,backing,'CarvedLintel','nav-lintel',0,0,1430,70);
    const relief = component(g,lintel,'cc.Sprite');
    Object.assign(relief,{_type:1,_color:N.color('ffffff',204)});
    bar.lintel = N.ref(g.graph.indexOf(relief));
    iconRelief(g,bar.sections[2].__id__,'StatusGlyph','nav-stores',30);
    for (const [id,art] of [['bag','nav-deck'],['supply-bag','nav-satchel'],['map','nav-map'],
        ['recipe-open','nav-recipes'],['settings','nav-settings']]) {
        const style = component(g,named(g,id),N.script('ButtonPresentation'));
        const icon = iconRelief(g,style.surface.__id__,'ControlGlyph',art,40);
        style.paintedIcon = N.ref(g.graph.indexOf(component(g,icon,'cc.Sprite')));
        style.transparentSurface = true;
        style.variant = 'quiet';
    }
}
function tablet(g, panel, settings = false) {
    const size = component(g,panel,'cc.UITransform')._contentSize;
    const id = sprite(g,panel,'InsetTablet','field-tablet',0,0,size.width,size.height);
    const art = component(g,id,'cc.Sprite');
    art._type = 1;
    component(g,panel,N.script('PaperPanel')).artwork = N.ref(g.graph.indexOf(art));
    g.graph[panel]._children = [N.ref(id), ...g.graph[panel]._children.filter(r=>r.__id__!==id)];
    if (settings) sprite(g,panel,'SettingsSeal','nav-settings',0,66,44,44);
}
function roundLabel(g, bar) {
    let id = child(g,g.root,'BattleRound');
    if (id === undefined) id = g.label('BattleRound','第 1 回合',0,0,132,40,23,'ecd8b5').node;
    face(g,id,23,'ecd8b5');
    g.graph[id]._active = false;
    bar.round = N.ref(g.graph.indexOf(component(g,id,'cc.Label')));
    for (const [name,x] of [['RoundRuleLeft',-74],['RoundRuleRight',74]]) {
        const line = polygon(g,id,name,[[-18,0],[0,1.4],[18,0],[0,-1.4]],'d9bfa9');
        place(g,line,x,0,36,3);
    }
}
function emptyBag(g, panel) {
    const group = node(g,panel,'EmptySupplyBag');
    place(g,group,0,0,500,282);
    g.graph[group]._active = false;
    for (const [name,y] of [['BagUpperSeam',123],['BagLowerSeam',-130]]) {
        const rule = polygon(g,group,name,[[-230,0],[-96,1],[0,2.4],[96,1],[230,0],[0,-1]],'7c6558');
        place(g,rule,0,y,460,5);
    }
    sprite(g,group,'SatchelIllustration','supply-satchel',0,0,242,242);
    return group;
}
function healthBar(g, parent, prefix, label, x, y, width) {
    const t = named(g,prefix+'Track'), f = named(g,prefix+'Fill');
    const frame = polygon(g,parent,prefix+'Bezel',bevel(width/2+3,14,5),'b6a1a1');
    const recess = polygon(g,parent,prefix+'Recess',bevel(width/2+1,12,4),'655368');
    place(g,frame,x,y,width+8,32);
    place(g,recess,x,y,width+4,28);
    place(g,t,x,y,width,20);
    place(g,f,x,y,width,20);
    Object.assign(component(g,t,N.script('ShapeGraphic')),{fill:N.color('554251'),outlineWidth:0});
    Object.assign(component(g,f,N.script('ShapeGraphic')),{fill:N.color('b66b74'),outlineWidth:0});
    before(g,parent,frame,t);
    before(g,parent,recess,t);
    move(g,label,parent);
    place(g,label,x,y,width-8,30);
    face(g,label,19);
    const value = component(g,label,N.script('UIValue'));
    value.normalColor=N.color('fff1dc'); value.alertColor=N.color('fff3c7');
    const heart = child(g,label,'StatIcon');
    if (heart !== undefined) g.graph[heart]._active=false;
}
function armor(g, player) {
    const shield = node(g,player,'ArmorShield');
    place(g,shield,-95,0,55,62);
    const faceplate = sprite(g,shield,'PaintedShield','guard-shield',0,0,55,65);
    const digits = named(g,'battle-text4');
    move(g,digits,shield);
    before(g,shield,faceplate,digits);
    place(g,digits,0,3,43,36);
    face(g,digits,27,'ffffff');
    const icon = child(g,digits,'StatIcon');
    if (icon !== undefined) g.graph[icon]._active=false;
}
function paintedPile(g, name, art) {
    const pile = named(g,name), stack = child(g,pile,'CanvasDeck');
    const side = name === 'drawPile' ? 1 : -1;
    place(g,pile,-654*side,-368,110,132);
    place(g,stack,0,8,76,100);
    const rear = sprite(g,stack,'RearLeaf',art,-6*side,5,60,88);
    const middle = sprite(g,stack,'MiddleLeaf',art,-3*side,2.5,61,90);
    const front = sprite(g,stack,'Painted'+(side===1 ? 'Draw' : 'Discard')+'Cover',art,side,0,62,91);
    for (const [id,angle,tint] of [[rear,-2,'afa7ad'],[middle,-4.5,'d7cfd0'],[front,-7,'ffffff']]) {
        const radians = angle * side * Math.PI / 180;
        g.graph[id]._euler = N.vec(0,0,angle*side);
        g.graph[id]._lrot = {__type__:'cc.Quat',x:0,y:0,z:Math.sin(radians/2),w:Math.cos(radians/2)};
        component(g,id,'cc.Sprite')._color=N.color(tint);
    }
    g.graph[stack]._children=[N.ref(rear),N.ref(middle),N.ref(front)];
    Object.assign(component(g,stack,N.script('DeckStackGraphic')), {
        painted:N.ref(g.graph.indexOf(component(g,front,'cc.Sprite'))),middleLeaf:N.ref(middle),rearLeaf:N.ref(rear),
    });
    const counter = child(g,pile,name+'-text0');
    place(g,counter,-3*side,-24,46,26);
    face(g,counter,22);
    const title = child(g,pile,name+'-text1');
    place(g,title,0,-53,80,24);
    face(g,title,17);
    g.graph[title]._active=true;
}
function paintedIntent(g) {
    const intent = named(g,'EnemyIntent');
    for (const owner of [intent,child(g,intent,'IntentDetail')])
        for (const type of ['cc.Graphics',N.script('PaperPanel')]) component(g,owner,type)._enabled=false;
    Object.assign(component(g,intent,'cc.UITransform')._contentSize, {width:90,height:48});
    const amount = child(g,intent,'battle-text0');
    place(g,amount,35,0,45,42);
    face(g,amount,27,'ffd6ae');
    Object.assign(component(g,amount,'cc.Label'), {_horizontalAlign:0,_string:'1'});
    const value = component(g,amount,N.script('UIValue'));
    value.normalColor = N.color('f5e4ce');
    value.alertColor = N.color('ffd6ae');
    sprite(g,amount,'AttackGlyph','intent-attack',-49,0,42,42);
    sprite(g,amount,'PrepareGlyph','intent-prepare',-47,0,42,42);
    sprite(g,amount,'DelayGlyph','intent-delay',-47,0,38,38);
}
function battle(g) {
    paintedIntent(g);
    for (const key of ['battle-text9','battle-text10']) {
        const old = named(g,key);
        g.graph[old]._active=false;
        component(g,old,'cc.Label')._string='';
    }
    const gauge = named(g,'StaminaGauge');
    place(g,gauge,-610,-222,109,109);
    for (const type of ['cc.Graphics',N.script('ShapeGraphic')]) component(g,gauge,type)._enabled=false;
    for (const title of ['StaminaTitle','StaminaHint']) g.graph[child(g,gauge,title)]._active=false;
    const digits = child(g,gauge,'StaminaValue');
    const seal = sprite(g,gauge,'StaminaSeal','stamina-seal',0,0,109,109);
    before(g,gauge,seal,digits);
    place(g,digits,0,0,79,42);
    face(g,digits,31);
    const player = node(g,g.root,'PlayerVitals');
    place(g,player,-580,-124,158,78);
    for(const name of ['healthBezel','healthRecess','healthTrack','healthFill','ArmorShield','battle-text3','CriticalWarning']) {
        const id = named(g,name);
        if(id>=0 && g.graph[id]._parent.__id__!==player) move(g,id,player);
    }
    healthBar(g,player,'health',named(g,'battle-text3'),0,0,158);
    place(g,named(g,'CriticalWarning'),32,40,130,28);
    const enemy = named(g,'EnemyVitals');
    place(g,enemy,580,-124,158,78);
    healthBar(g,enemy,'enemy',named(g,'battle-text5'),0,0,158);
    const name = named(g,'banner-text1');
    place(g,name,0,31,177,31);
    face(g,name,20);
    armor(g,player);
    paintedPile(g,'drawPile','draw-gate');
    paintedPile(g,'discardPile','discard-descent');
    const end = named(g,'end-turn'), style = component(g,end,N.script('ButtonPresentation'));
    place(g,end,592,-226,190,64);
    const surface = style.surface.__id__;
    place(g,surface,0,0,190,64);
    place(g,g.graph[style.focusRing.__id__].node.__id__,0,0,198,72);
    const caption = g.graph[style.caption.__id__];
    const relief = sprite(g,surface,'TurnPlaque','turn-plaque',0,0,190,64);
    before(g,surface,relief,caption.node.__id__);
    style.paintedSurface = N.ref(g.graph.indexOf(component(g,relief,'cc.Sprite')));
    style.transparentSurface = true;
    place(g,caption.node.__id__,0,0,145,44);
    Object.assign(caption,{_string:'结束回合', _fontSize:24,_lineHeight:30,_enableWrapText:false,
        _color:N.color('382b3b'),_isBold:true,_enableOutline:false});
}
module.exports = {crest,navigation,tablet,roundLabel,emptyBag,battle};
