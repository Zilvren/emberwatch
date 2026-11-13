import { _decorator, Component, Label, Node, Sprite, SpriteFrame } from 'cc';
import { CARD, CardKind, OwnedCard, SurvivalGame } from './SurvivalRules';
import { UIAction } from './UIAction';
const {ccclass,property}=_decorator;
const order:CardKind[]=['attack','dodge','knife','evade','repair','heavy','slash','cash'];
@ccclass('InventoryRowPresentation')
export class InventoryRowPresentation extends Component {
    @property(Label) nameLabel:Label|null=null;@property(Label) weightLabel:Label|null=null;@property(Label) statusLabel:Label|null=null;
    @property(Sprite) artwork:Sprite|null=null;@property(Node) cashGlyph:Node|null=null;
    @property({type:[SpriteFrame]}) illustrations:SpriteFrame[]=[];
    @property(UIAction) toggle:UIAction|null=null;@property(UIAction) discard:UIAction|null=null;
    refresh(card:OwnedCard|undefined,game:SurvivalGame):void {
        this.node.active=!!card;if(!card)return;
        if(this.nameLabel)this.nameLabel.string=CARD[card.kind].name;if(this.weightLabel)this.weightLabel.string=`重 ${CARD[card.kind].weight}`;
        if(this.statusLabel)this.statusLabel.string=card.zone==='overflow'?'暂存 / 不可战斗':card.kind==='cash'?'不进入抽牌':card.selected?'已入卡组':'携带 / 不抽取';
        if(this.artwork){this.artwork.node.active=card.kind!=='cash';this.artwork.spriteFrame=this.illustrations[order.indexOf(CARD[card.kind].art)]??this.illustrations[2];}
        if(this.cashGlyph)this.cashGlyph.active=card.kind==='cash';
        if(this.toggle){this.toggle.node.active=game.phase==='rest'&&card.kind!=='cash';this.toggle.actionId='toggle-'+card.id;this.toggle.setText(card.selected?'移出战斗':'加入战斗');this.toggle.setEnabled(card.zone==='base');}
        if(this.discard){this.discard.actionId='discard-'+card.id;this.discard.setEnabled((game.phase==='rest'||game.phase==='rewards')&&card.kind!=='attack'&&card.kind!=='dodge'&&(card.kind!=='cash'||game.phase==='rest'));}
    }
}
