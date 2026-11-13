import { _decorator, Color, Component, Label } from 'cc';
import { PixelGraphic } from './PixelGraphic';
const {ccclass,property,requireComponent}=_decorator;
@ccclass('UIValue')
@requireComponent(Label)
export class UIValue extends Component {
    @property key='';
    @property format='{value}';
    @property(Color) normalColor=new Color(234,213,180,255);
    @property(Color) alertColor=new Color(204,121,92,255);
    @property(PixelGraphic) plate:PixelGraphic|null=null;
    @property(Color) normalFill=new Color(53,64,57,255);
    @property(Color) alertFill=new Color(84,47,49,255);
    setAlert(value:boolean):void {this.getComponent(Label)!.color=value?this.alertColor:this.normalColor;if(this.plate){this.plate.fill=value?this.alertFill:this.normalFill;this.plate.redraw();}}
    setValue(value:unknown):void {const label=this.getComponent(Label)!;const text=this.format.replace(/\{value\}/g,String(value??''));if(label.string!==text)label.string=text;}
}
