import { _decorator, Animation, AnimationClip, Component, Node, Sprite } from 'cc';
const {ccclass,property,requireComponent}=_decorator;
@ccclass('ActorPresentation')
@requireComponent(Animation)
export class ActorPresentation extends Component {
    @property(Sprite) artwork:Sprite|null=null;
    @property(Node) impactAnchor:Node|null=null;
    @property(AnimationClip) idle:AnimationClip|null=null;
    @property(AnimationClip) attack:AnimationClip|null=null;
    @property(AnimationClip) hurt:AnimationClip|null=null;
    @property(AnimationClip) prepare:AnimationClip|null=null;
    @property(AnimationClip) armedIdle:AnimationClip|null=null;
    @property(AnimationClip) armedAttack:AnimationClip|null=null;
    @property(AnimationClip) armedHurt:AnimationClip|null=null;
    private armed=false;private playingAction=false;
    private impact:(()=>void)|null=null;private complete:(()=>void)|null=null;
    onLoad():void {this.getComponent(Animation)!.on(Animation.EventType.FINISHED,this.finished,this);}
    onEnable():void {this.playingAction=false;this.impact=null;this.complete=null;this.playIdle();}
    onDestroy():void {this.getComponent(Animation)?.off(Animation.EventType.FINISHED,this.finished,this);}
    setArmed(value:boolean):void {if(this.armed!==value){this.armed=value;if(!this.playingAction)this.playIdle();}}
    private clip(kind:'idle'|'attack'|'hurt'|'prepare'):AnimationClip|null {return this.armed?(kind==='idle'?this.armedIdle:kind==='attack'?this.armedAttack:kind==='hurt'?this.armedHurt:null)??this[kind]:this[kind];}
    private playIdle():void {const clip=this.clip('idle');if(clip){this.play(clip);if(typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches)this.getComponent(Animation)!.stop();}}
    private play(clip:AnimationClip):void {const animation=this.getComponent(Animation)!;if(!animation.getState(clip.name))animation.addClip(clip);animation.play(clip.name);animation.getState(clip.name)?.sample();}
    playAction(kind:'attack'|'hurt'|'prepare',reduced=false,impact?:()=>void,complete?:()=>void):void {const clip=this.clip(kind);if(!clip||reduced){impact?.();complete?.();return;}this.impact=impact??null;this.complete=complete??null;this.playingAction=true;this.play(clip);}
    private finished():void {if(this.playingAction){this.playingAction=false;this.notifyImpact();const done=this.complete;this.complete=null;this.playIdle();done?.();}}
    notifyImpact():void {const hit=this.impact;this.impact=null;hit?.();}
    get pose():string {return this.artwork?.spriteFrame?.name??'';}
}
