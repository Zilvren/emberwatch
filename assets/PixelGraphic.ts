import { _decorator, Color, Component, Enum, Graphics, Node, UITransform, Vec2, Vec4 } from 'cc';
import { EDITOR } from 'cc/env';
const { ccclass, property, executeInEditMode, requireComponent }=_decorator;
export enum PixelShape { Rectangle, Ellipse, Polygon, Polyline, Tiles }

/** A serialized, inspector-editable graphic widget. It never creates child UI nodes. */
@ccclass('PixelGraphic')
@executeInEditMode
@requireComponent(Graphics)
export class PixelGraphic extends Component {
    @property({type:Enum(PixelShape)}) shape=PixelShape.Rectangle;
    @property(Color) fill=new Color(48,42,49,255);
    @property(Color) outline=new Color(102,83,79,255);
    @property outlineWidth=0;
    @property({type:[Vec2]}) points:Vec2[]=[];
    @property({type:[Vec4]}) tiles:Vec4[]=[];
    @property({type:[Color]}) palette:Color[]=[];
    @property({type:[Number]}) tileColors:number[]=[];
    private signature='';
    onLoad():void {this.redraw();}
    onEnable():void {this.node.on(Node.EventType.SIZE_CHANGED,this.redraw,this);this.redraw();}
    onDisable():void {this.node.off(Node.EventType.SIZE_CHANGED,this.redraw,this);}
    update():void {
        if(!EDITOR)return;
        const signature=JSON.stringify([this.shape,this.fill,this.outline,this.outlineWidth,this.points,this.tiles,this.palette,this.tileColors]);
        if(signature!==this.signature){this.signature=signature;this.redraw();}
    }
    redraw():void {
        const g=this.getComponent(Graphics),size=this.getComponent(UITransform)?.contentSize;if(!g||!size)return;
        g.clear();g.fillColor=this.fill;g.strokeColor=this.outline;g.lineWidth=this.outlineWidth;
        if(this.shape===PixelShape.Rectangle){g.rect(-size.width/2,-size.height/2,size.width,size.height);g.fill();if(this.outlineWidth){g.rect(-size.width/2+1,-size.height/2+1,size.width-2,size.height-2);g.stroke();}}
        else if(this.shape===PixelShape.Ellipse){g.ellipse(0,0,size.width/2,size.height/2);g.fill();}
        else if(this.shape===PixelShape.Polygon||this.shape===PixelShape.Polyline){
            this.points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));
            if(this.shape===PixelShape.Polygon){g.close();g.fill();}else g.stroke();
        }else for(let color=0;color<this.palette.length;color++){
            g.fillColor=this.palette[color];this.tiles.forEach((r,i)=>{if(this.tileColors[i]===color)g.rect(r.x,r.y,r.z,r.w);});g.fill();
        }
    }
}
