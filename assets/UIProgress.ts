import { _decorator, Color, Component, Node, UITransform, Vec3 } from 'cc';
import { PixelGraphic } from './PixelGraphic';
const {ccclass,property}=_decorator;
@ccclass('UIProgress')
export class UIProgress extends Component {
    @property key='';@property(UITransform) track:UITransform|null=null;@property(UITransform) fill:UITransform|null=null;
    @property({type:[Node]}) ticks:Node[]=[];
    @property(Color) filledColor=new Color(141,154,121,255);
    @property(Color) emptyColor=new Color(102,83,79,255);
    setRatio(value:number):void {
        this.ticks.forEach((node,i)=>{const graphic=node.getComponent(PixelGraphic);if(graphic){graphic.fill=i<this.ticks.length*value?this.filledColor:this.emptyColor;graphic.redraw();}});
        if(!this.track||!this.fill)return;const ratio=Math.max(0,Math.min(1,value));const w=this.track.width*ratio;
        this.fill.node.active=ratio>0;if(ratio<=0)return;
        this.fill.setContentSize(w,this.fill.height);const p=this.track.node.position;this.fill.node.setPosition(new Vec3(p.x-this.track.width/2+w/2,p.y,p.z));this.fill.getComponent(PixelGraphic)?.redraw();
    }
}
