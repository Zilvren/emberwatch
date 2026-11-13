import { _decorator, Button, Component, Label, UIOpacity } from 'cc';
import { UIEvents } from './UIEvents';
const {ccclass,property,requireComponent}=_decorator;
@ccclass('UIAction')
@requireComponent(Button)
export class UIAction extends Component {
    @property actionId='';
    @property payload='';
    @property(Label) caption:Label|null=null;
    @property disabledOpacity=150;
    private button!:Button;
    onLoad():void {this.button=this.getComponent(Button)!;this.node.on(Button.EventType.CLICK,this.activate,this);}
    onDestroy():void {this.node.off(Button.EventType.CLICK,this.activate,this);}
    private activate():void {if(this.button.interactable)UIEvents.emit('action',{id:this.actionId,payload:this.payload});}
    setEnabled(enabled:boolean):void {
        const button=this.button??this.getComponent(Button)!;button.interactable=enabled;
        const opacity=this.getComponent(UIOpacity)??this.addComponent(UIOpacity);opacity.opacity=enabled?255:this.disabledOpacity;
    }
    setText(value:string):void {if(this.caption&&this.caption.string!==value)this.caption.string=value;}
    get enabled():boolean{return this.getComponent(Button)?.interactable??false;}
}
