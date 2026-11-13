import { _decorator, Animation, AnimationClip, Component } from 'cc';
const {ccclass,property,requireComponent}=_decorator;
@ccclass('EffectPresentation')
@requireComponent(Animation)
export class EffectPresentation extends Component {
    @property(AnimationClip) clip:AnimationClip|null=null;
    onLoad():void {this.getComponent(Animation)!.on(Animation.EventType.FINISHED,this.complete,this);}
    onEnable():void {if(this.clip){const a=this.getComponent(Animation)!;if(!a.getState(this.clip.name))a.addClip(this.clip);a.play(this.clip.name);}}
    onDestroy():void {this.getComponent(Animation)?.off(Animation.EventType.FINISHED,this.complete,this);}
    private complete():void {this.node.destroy();}
}
