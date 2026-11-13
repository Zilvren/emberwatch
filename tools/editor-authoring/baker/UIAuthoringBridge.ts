import { _decorator, Animation, AnimationClip, animation, Button, CCObjectFlags, Color, Component, instantiate, Label, Node, Sprite, UITransform, UIOpacity, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { SurvivalView } from './SurvivalView';
import { SurvivalGame, CardKind } from './SurvivalRules';
import { PixelUI } from './PixelUI';
import { PixelGraphic } from './PixelGraphic';
import { UIAction } from './UIAction';
import { UIValue } from './UIValue';
import { UIAuthoringScope } from './UIAuthoringScope';
import { CardPresentation } from './CardPresentation';
import { ActorPresentation } from './ActorPresentation';
import { cardFace } from './BattleCard';
const {ccclass,property,executeInEditMode}=_decorator;
type Legacy=any;
@ccclass('UIAuthoringBridge')
@executeInEditMode
export class UIAuthoringBridge extends Component {
    @property status='waiting';
    @property manifestJSON='';
    @property clipsJSON='';
    private source!:Legacy;
    private library!:Node;
    private clips:Record<string,string>={};
    onLoad():void {if(EDITOR)void this.bake().catch(error=>{this.status='ERROR: '+String(error);console.error('[UIAuthoring]',error);});}
    private async bake():Promise<void> {
        this.source=this.node.parent!.getChildByName('GameRoot')!.getComponent(SurvivalView) as Legacy;
        for(let i=0;i<1000&&!this.source.ready;i++)await new Promise(r=>setTimeout(r,20));
        if(!this.source.ready)throw new Error('Source presentation did not load its native atlas frames.');
        this.library=this.container('Library',this.node);UIAuthoringScope.enabled=true;this.instrument();
        for(const phase of ['journal','map','battle','rewards','rest','shelter','day2','failure'])this.capture(phase);
        this.capturePopup('bag');this.capturePopup('help');this.capturePopup('log');this.capturePopup('restart');
        this.templates();this.makeAnimationAssets();
        const manifest:any={pages:{},templates:[],clips:Object.keys(this.clips)};
        for(const root of this.library.children){
            const labels=root.getComponentsInChildren(UIValue).map(v=>({key:v.key,text:v.getComponent(Label)!.string,node:v.node.name,position:v.node.worldPosition}));
            const buttons=root.getComponentsInChildren(UIAction).map(b=>({id:b.actionId,node:b.node.name}));
            manifest.pages[root.name]={labels,buttons,nodes:this.count(root)};
        }
        this.manifestJSON=JSON.stringify(manifest);this.clipsJSON=JSON.stringify(this.clips);this.status='ready';
        UIAuthoringScope.enabled=false;
    }
    private count(root:Node):number {return 1+root.children.reduce((n,c)=>n+this.count(c),0);}
    private container(name:string,parent:Node):Node {const n=new Node(name);n.layer=this.node.layer;parent.addChild(n);n.addComponent(UITransform).setContentSize(1440,900);return n;}
    private makeAction(node:Node,id:string):UIAction {
        node.name=id;const button=node.getComponent(Button)??node.addComponent(Button);button.transition=Button.Transition.SCALE;button.zoomScale=1.02;button.duration=.1;
        const action=node.getComponent(UIAction)??node.addComponent(UIAction);action.actionId=id;action.caption=node.getChildByName('Caption')?.getComponent(Label)??null;return action;
    }
    private instrument():void {
        const source=this.source;
        for(const method of ['header','journal','map','battle','rewards','rest','shelter','bag','modal','banner','deckPile']){
            const original=source[method].bind(source);
            source[method]=(...args:any[])=>{
                const scope=method==='deckPile'?(args[3]==='抽牌堆'?'drawPile':'discardPile'):method;
                const restore=UIAuthoringScope.begin(scope),start=source.stage.children.length;
                try{const result=original(...args);if(method==='header'||method==='modal'||method==='deckPile'){
                    const children=source.stage.children.slice(start),group=this.container(method==='header'?'HUD':method==='modal'?'Popup':scope,source.stage);
                    for(const child of children)child.setParent(group,true);
                }return result;}finally{restore();}
            };
        }
        const button=source.button.bind(source);source.button=(id:string,...args:any[])=>this.makeAction(button(id,...args),id).node;
        const hit=source.hit.bind(source);source.hit=(id:string,...args:any[])=>this.makeAction(hit(id,...args),id).node;
    }
    private fixture(phase:string):SurvivalGame {
        const g=new SurvivalGame(17);g.phase=phase as any;
        if(phase==='map'){g.fixedDone=true;g.route=null;g.visited=['fixed'];}
        if(phase==='battle'){
            g.phase='map';g.fixedDone=true;g.route='A';g.pathIndex=3;g.enterNode();g.armor=0;g.critical=true;
            g.battle!.weapon={id:'preview-knife',kind:'knife',temporary:false};g.battle!.equippedTurn=0;g.battle!.turn=2;
        }
        if(phase==='rewards')g.rewards={source:'enemy1',supplies:3,cards:['attack','dodge','knife'],supplyTaken:false,cardTaken:false};
        if(phase==='shelter'||phase==='day2'){
            g.day=phase==='day2'?2:1;g.armor=7;g.supplies=10;g.settlement={returnedSupplies:10,returnedCards:10,lostOverflow:[],wasCritical:false,repairCost:1,repaired:false,repairSpent:0,dailySpent:0,dailyShortfall:0};
        }
        if(phase==='failure')g.failureReason='感染临界时再次受到实际伤害。';
        return g;
    }
    private capture(phase:string):void {
        const s=this.source;s.game=this.fixture(phase);s.overlay=null;s.selectedCard=phase==='battle'?s.game.battle.hand[0].id:'';s.toast='';s.reduce=true;s.lastPhase=phase;
        s.render(false);
        const page:Node=s.stage;page.name=phase;page.setParent(this.library,true);page.setPosition(0,0,0);page._objFlags&=~CCObjectFlags.DontSave;
        const header=page.getChildByName('HUD');if(header){if(!this.library.getChildByName('HUD')){header.setParent(this.library,true);header.setPosition(0,0,0);}else header.destroy();}
        this.freeze(page);page.active=false;s.stage=this.container('Temporary stage',s.node);s.stage._objFlags|=CCObjectFlags.DontSave;
    }
    private capturePopup(kind:string):void {
        const s=this.source;s.game=this.fixture('rest');s.overlay=kind;s.discardId=s.game.cards[4].id;s.toast='';s.reduce=true;s.render(false);
        const popup=s.stage.getChildByName('Popup')!;popup.name=kind==='restart'?'confirm':kind;popup.setParent(this.library,true);popup.setPosition(0,0,0);this.freeze(popup);popup.active=false;s.overlay=null;
    }
    private freeze(root:Node):void {
        root._objFlags&=~CCObjectFlags.DontSave;root.setScale(1,1,1);
        const opacity=root.getComponent(UIOpacity);if(opacity)opacity.opacity=255;
        for(const child of root.children)this.freeze(child);
    }
    private templates():void {
        const source=this.source,art=source.art;
        for(const [name,w,h,usage] of [['HandCard',156,242,'hand'],['RewardCard',236,345,'reward']] as [string,number,number,string][]){
            const host=this.container('Temporary card host',this.node),root=cardFace(new PixelUI(host),art,'attack',0,0,w,h,'不可用');root.name=name;root.setParent(this.library);root.setPosition(0,0,0);
            const visual=new Node('Visual');visual.layer=root.layer;visual.addComponent(UITransform).setContentSize(w,h);for(const c of [...root.children])c.setParent(visual);root.addChild(visual);visual.addComponent(UIOpacity);
            const presenter=root.addComponent(CardPresentation);const values=root.getComponentsInChildren(UIValue);
            const label=(index:number)=>values.find(v=>v.key===`card/text${index}`)!.getComponent(Label)!;
            presenter.costLabel=label(0);presenter.titleLabel=label(1);presenter.descriptionLabel=label(2);presenter.statusLabel=label(3);presenter.weightLabel=label(4);presenter.artwork=root.getComponentInChildren(Sprite);
            presenter.costLabel.node.name='CostLabel';presenter.titleLabel.node.name='NameLabel';presenter.descriptionLabel.node.name='DescriptionLabel';presenter.statusLabel.node.name='StatusLabel';presenter.weightLabel.node.name='WeightLabel';
            presenter.disabledOverlay=visual.children[visual.children.length-1];presenter.disabledOverlay!.name='DisabledOverlay';presenter.disabledOverlay!.active=false;
            presenter.illustrations=(['attack','dodge','knife','evade','repair','heavy','slash','cash'] as CardKind[]).map(kind=>art.card(kind,usage==='hand'?(156-18)/(242*.44):(236-18)/(345*.44)));
            root.addComponent(Animation);presenter.configure('attack');this.freeze(root);root.active=false;host.destroy();
        }
        for(const [name,sheet]of [['PlayerActor','survivor-unarmed'],['WandererActor','wanderer'],['BruteActor','brute']]){
            const root=new Node(name);root.layer=this.node.layer;this.library.addChild(root);root.addComponent(UITransform).setContentSize(400,420);
            const image=new Node('Visual');image.layer=root.layer;root.addChild(image);image.setPosition(0,189,0);image.addComponent(UITransform);const sprite=image.addComponent(Sprite);sprite.spriteFrame=art.pose(sheet,0);sprite.sizeMode=Sprite.SizeMode.RAW;image.setScale(420/sprite.spriteFrame!.rect.height,420/sprite.spriteFrame!.rect.height,1);
            root.addComponent(Animation);root.addComponent(ActorPresentation).artwork=sprite;root.active=false;
        }
        const text=this.container('FloatingText',this.library);text.getComponent(UITransform)!.setContentSize(320,65);const visual=new Node('Visual');visual.layer=text.layer;text.addChild(visual);visual.addComponent(UITransform).setContentSize(320,65);const label=visual.addComponent(Label);label.string='−2';label.fontFamily='Microsoft YaHei';label.fontSize=35;label.lineHeight=49;label.isBold=true;label.color=new Color(223,130,105,255);label.horizontalAlign=Label.HorizontalAlign.CENTER;label.verticalAlign=Label.VerticalAlign.CENTER;visual.addComponent(UIOpacity);text.addComponent(Animation);text.active=false;
    }
    private makeAnimationAssets():void {
        const art=this.source.art;
        for(const [prefix,sheet]of [['PlayerUnarmed','survivor-unarmed'],['PlayerArmed','survivor'],['Wanderer','wanderer'],['Brute','brute']])for(const kind of ['Idle','Attack','Hurt']){
            const clip=new AnimationClip();clip.name=prefix+kind;clip.duration=kind==='Idle'?2:kind==='Attack'?.44:.3;clip.wrapMode=kind==='Idle'?AnimationClip.WrapMode.Loop:AnimationClip.WrapMode.Normal;
            const object=new animation.ObjectTrack<Sprite['spriteFrame']>();object.path=new animation.TrackPath().toHierarchy('Visual').toComponent(Sprite).toProperty('spriteFrame');
            object.channel.curve.assignSorted([[0,art.pose(sheet,kind==='Idle'?0:kind==='Attack'?1:2)],[clip.duration,art.pose(sheet,0)]]);clip.addTrack(object);
            const movement=new animation.VectorTrack();movement.componentsCount=3;movement.path=new animation.TrackPath().toHierarchy('Visual').toProperty('position');const channels=movement.channels();
            channels[0].curve.assignSorted([[0,{value:0}],[kind==='Attack'?.125:clip.duration/2,{value:kind==='Attack'?(prefix.startsWith('Player')?46:-60):kind==='Hurt'?12:0}],[clip.duration,{value:0}]]);
            channels[1].curve.assignSorted([[0,{value:189}],[clip.duration/2,{value:kind==='Idle'?190.3:189}],[clip.duration,{value:189}]]);channels[2].curve.assignSorted([[0,{value:0}],[clip.duration,{value:0}]]);clip.addTrack(movement);
            if(kind==='Attack')clip.events=[{frame:.15,func:'notifyImpact',params:[]}];this.serializeClip(clip);
        }
        for(const kind of ['CardDraw','CardPlay','FloatUp','EffectFade','ScreenReveal']){
            const clip=new AnimationClip();clip.name=kind;clip.duration=kind==='CardPlay'?.44:kind==='FloatUp'?.48:kind==='ScreenReveal'?.2:.26;
            const opacity=new animation.RealTrack();opacity.path=new animation.TrackPath().toHierarchy('Visual').toComponent(UIOpacity).toProperty('opacity');
            opacity.channel.curve.assignSorted(kind==='CardDraw'?[[0,{value:0}],[.16,{value:255}]]:kind==='ScreenReveal'?[[0,{value:165}],[.2,{value:0}]]:kind==='CardPlay'?[[0,{value:255}],[.18,{value:0}],[.44,{value:0}]]:[[0,{value:255}],[clip.duration,{value:0}]]);clip.addTrack(opacity);
            if(kind==='FloatUp'){const track=new animation.VectorTrack();track.componentsCount=3;track.path=new animation.TrackPath().toHierarchy('Visual').toProperty('position');track.channels()[1].curve.assignSorted([[0,{value:0}],[.48,{value:36}]]);clip.addTrack(track);}
            if(kind==='CardPlay')clip.events=[{frame:.15,func:'notifyImpact',params:[]}];this.serializeClip(clip);
        }
    }
    private serializeClip(clip:AnimationClip):void {
        const serializer=(globalThis as any).EditorExtends?.serialize;if(typeof serializer!=='function')throw new Error('Editor serializer is unavailable.');this.clips[clip.name]=serializer(clip);
    }
}
