import { _decorator, Animation, AnimationClip, Color, Component, Label, Node, Sprite, SpriteFrame } from 'cc';
import { CARD, CardKind } from './SurvivalRules';
const {ccclass,property}= _decorator;
const order:CardKind[]=['attack','dodge','knife','evade','repair','heavy','slash','cash'];
@ccclass('CardPresentation')
export class CardPresentation extends Component {
    @property(Label) costLabel:Label|null=null;
    @property(Label) titleLabel:Label|null=null;
    @property(Label) descriptionLabel:Label|null=null;
    @property(Label) statusLabel:Label|null=null;
    @property(Label) weightLabel:Label|null=null;
    @property(Sprite) artwork:Sprite|null=null;
    @property(Node) disabledOverlay:Node|null=null;
    @property({type:[SpriteFrame],tooltip:'基础攻击、基础躲避、菜刀、强化躲避、修复、重击、挥砍、现金'}) illustrations:SpriteFrame[]=[];
    @property(AnimationClip) drawClip:AnimationClip|null=null;
    @property(AnimationClip) playClip:AnimationClip|null=null;
    @property(Color) normalText=new Color(105,83,77,255);
    @property(Color) blockedText=new Color(144,73,62,255);
    cardId='';kind:CardKind='attack';private impact:(()=>void)|null=null;private complete:(()=>void)|null=null;
    onLoad():void {this.getComponent(Animation)?.on(Animation.EventType.FINISHED,this.finished,this);}
    onDestroy():void {this.getComponent(Animation)?.off(Animation.EventType.FINISHED,this.finished,this);}
    configure(kind:CardKind,blocked='',caption='点击 / 拖动',id=''):void {
        this.kind=kind;this.cardId=id;const data=CARD[kind];
        if(this.costLabel)this.costLabel.string=String(data.cost);if(this.titleLabel)this.titleLabel.string=data.name;
        const effect:Record<CardKind,string>={attack:'造成 2 点伤害',dodge:'获得 2 点格挡',knife:'下回合起\n每回合生成「挥砍」',evade:'获得 5 点格挡',repair:'恢复 3 点护甲\n护甲为 0 时禁用',heavy:'造成 5 点伤害',slash:'造成 4 点伤害',cash:'只能在休整时丢弃'};
        if(this.descriptionLabel)this.descriptionLabel.string=effect[kind];if(this.statusLabel){this.statusLabel.string=blocked||caption;this.statusLabel.color=blocked?this.blockedText:this.normalText;}
        if(this.weightLabel)this.weightLabel.string=kind==='slash'?'本场临时':`负重 ${data.weight}`;
        if(this.artwork)this.artwork.spriteFrame=this.illustrations[order.indexOf(kind)]??this.illustrations[2];
        if(this.disabledOverlay)this.disabledOverlay.active=!!blocked;
    }
    playDraw(reduced:boolean):void {if(!reduced&&this.drawClip)this.play(this.drawClip);}
    playAction(impact:()=>void,complete:()=>void,reduced:boolean):void {
        if(reduced||!this.playClip){impact();complete();return;}
        this.impact=impact;this.complete=complete;this.play(this.playClip);
    }
    private play(clip:AnimationClip):void {const a=this.getComponent(Animation)??this.addComponent(Animation);if(!a.getState(clip.name))a.addClip(clip);a.play(clip.name);}
    notifyImpact():void {const callback=this.impact;this.impact=null;callback?.();}
    private finished():void {if(!this.complete)return;this.notifyImpact();const callback=this.complete;this.complete=null;callback();}
}
