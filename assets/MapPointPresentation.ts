import { _decorator, Color, Component, Label } from 'cc';
import { SurvivalGame, NodeKind, Route } from './SurvivalRules';
import { UIAction } from './UIAction';
import { PixelGraphic } from './PixelGraphic';
const {ccclass,property}=_decorator;
@ccclass('MapPointPresentation')
export class MapPointPresentation extends Component {
    @property nodeKind='fixed';@property branch='';
    @property(Label) marker:Label|null=null;@property(Label) status:Label|null=null;@property(PixelGraphic) plate:PixelGraphic|null=null;
    @property(UIAction) action:UIAction|null=null;
    @property(Color) availableFill=new Color(121,81,57,255);@property(Color) visitedFill=new Color(66,75,59,255);@property(Color) lockedFill=new Color(60,51,55,255);
    @property(Color) availableOutline=new Color(239,181,111,255);@property(Color) normalOutline=new Color(102,83,79,255);
    refresh(game:SurvivalGame):void {
        const kind=this.nodeKind as NodeKind,branch=this.branch as Route|'';
        this.node.active=kind==='fixed'||game.fixedDone;
        const available=game.currentNode===kind&&(!branch||game.route===branch),visited=game.visited.indexOf(kind)>=0&&(!branch||game.route===branch),excluded=branch&&game.route&&game.route!==branch;
        if(this.marker)this.marker.string=visited?'✓':available?'▶':'◆';
        if(this.status)this.status.string=visited?'已完成':available?'点击进入':excluded?'另一条路线':kind==='rest'?'恢复 / 整理 / 丢弃现金':'待探索';
        if(this.plate){this.plate.fill=visited?this.visitedFill:available?this.availableFill:this.lockedFill;this.plate.outline=available?this.availableOutline:this.normalOutline;this.plate.redraw();}
        this.action?.setEnabled(available);
    }
}
