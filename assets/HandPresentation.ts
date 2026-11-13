import { _decorator, Component, EventTouch, instantiate, Node, Prefab, Tween, tween, UITransform, UIOpacity, Vec2, Vec3 } from 'cc';
import { CardPresentation } from './CardPresentation';
import { Battle, SurvivalGame } from './SurvivalRules';
import { UIEvents } from './UIEvents';
const {ccclass,property}=_decorator;
@ccclass('HandPresentation')
export class HandPresentation extends Component {
    @property(Prefab) cardTemplate:Prefab|null=null;@property(Node) dragLayer:Node|null=null;
    @property spacing=10;@property fanCurve=7;@property fanAngle=2.2;@property hoverLift=48;@property hoverScale=1.08;
    private cards=new Map<string,CardPresentation>();private layoutKey='';private game:SurvivalGame|null=null;private selected='';private locked=false;private reduced=false;
    private battle:Battle|null=null;
    refresh(game:SurvivalGame,selected:string,locked:boolean,reduced:boolean):void {
        if(this.battle!==game.battle){for(const card of this.cards.values())card.node.destroy();this.cards.clear();this.layoutKey='';this.battle=game.battle;}
        this.game=game;this.selected=selected;this.locked=locked;this.reduced=reduced;const hand=game.battle?.hand??[];
        const ids=hand.map(c=>c.id),key=ids.join('|');
        for(const [id,card]of this.cards)if(ids.indexOf(id)<0){card.node.destroy();this.cards.delete(id);}
        hand.forEach((entry,i)=>{
            let card=this.cards.get(entry.id);if(!card){if(!this.cardTemplate)throw new Error('Hand card prefab is not assigned.');const node=instantiate(this.cardTemplate);node.active=true;this.node.addChild(node);card=node.getComponent(CardPresentation)!;card.cardId=entry.id;this.cards.set(entry.id,card);this.bindInput(card);card.playDraw(reduced);}
            card.configure(entry.kind,game.cardBlocked(entry),selected===entry.id?'选择敌人为目标':'点击 / 拖动',entry.id);
            if(key!==this.layoutKey){const size=card.node.getComponent(UITransform)!.contentSize,mid=(hand.length-1)/2;card.node.setParent(this.node);card.node.setPosition((i-mid)*(size.width+this.spacing),-Math.abs(i-mid)*this.fanCurve,0);card.node.angle=(mid-i)*this.fanAngle;}
        });this.layoutKey=key;
    }
    getCard(id:string):CardPresentation|null{return this.cards.get(id)??null;}
    entries():CardPresentation[]{return [...this.cards.values()];}
    setLocked(value:boolean):void {this.locked=value;}
    private bindInput(card:CardPresentation):void {
        const node=card.node,visual=node.getChildByName('Visual')!,home=visual.position.clone(),baseScale=visual.scale.clone();let down:Vec2|null=null,dragging=false,parent:Node|null=null,base=new Vec3(),baseAngle=0;
        const allowed=()=>!this.locked&&!!this.game&&this.game.phase==='battle';
        const restoreVisual=()=>{Tween.stopAllByTarget(visual);tween(visual).to(this.reduced?0:.16,{position:home,scale:baseScale},{easing:'quadOut'}).start();};
        const lift=()=>{if(!allowed())return;Tween.stopAllByTarget(visual);tween(visual).to(this.reduced?0:.125,{position:new Vec3(home.x,home.y+(this.reduced?0:this.hoverLift),home.z),scale:new Vec3(baseScale.x*this.hoverScale,baseScale.y*this.hoverScale,1)},{easing:'quadOut'}).start();};
        if(typeof matchMedia==='undefined'||matchMedia('(hover: hover) and (pointer: fine)').matches){node.on(Node.EventType.MOUSE_ENTER,lift);node.on(Node.EventType.MOUSE_LEAVE,()=>{if(!dragging&&this.selected!==card.cardId)restoreVisual();});}
        node.on(Node.EventType.TOUCH_START,(event:EventTouch)=>{if(!allowed())return;down=event.getUILocation();dragging=false;parent=node.parent;base=node.position.clone();baseAngle=node.angle;lift();});
        node.on(Node.EventType.TOUCH_MOVE,(event:EventTouch)=>{
            if(!down||!allowed()||!this.dragLayer)return;const point=event.getUILocation();if(Vec2.distance(point,down)>14)dragging=true;if(!dragging)return;
            if(node.parent!==this.dragLayer)node.setParent(this.dragLayer,true);
            const local=this.dragLayer.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(point.x,point.y,0));node.setPosition(local.x,local.y+52,0);node.angle=0;
        });
        node.on(Node.EventType.TOUCH_END,(event:EventTouch)=>{
            if(!down)return;down=null;if(!allowed())return;
            if(dragging){dragging=false;const p=event.getUILocation();let accepted=false;UIEvents.emit('card-drop',{id:card.cardId,point:p,accept:()=>{accepted=true;}});if(!accepted&&parent){node.setParent(parent);node.setPosition(base);node.angle=baseAngle;restoreVisual();}}
            else UIEvents.emit('action',{id:'card-select',payload:card.cardId});
        });
        node.on(Node.EventType.TOUCH_CANCEL,()=>{down=null;dragging=false;if(parent){node.setParent(parent);node.setPosition(base);node.angle=baseAngle;}restoreVisual();});
    }
}
