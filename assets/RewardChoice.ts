import { _decorator, Component, Node } from 'cc';
import { CARD, CardKind, SurvivalGame } from './SurvivalRules';
import { CardPresentation } from './CardPresentation';
import { UIAction } from './UIAction';
const {ccclass,property}=_decorator;
@ccclass('RewardChoice')
export class RewardChoice extends Component {
    @property(Node) cardRoot:Node|null=null;
    @property(UIAction) claim:UIAction|null=null;
    refresh(kind:CardKind|undefined,index:number,game:SurvivalGame):void {
        this.node.active=!!kind;if(!kind)return;
        const taken=!!game.rewards?.cardTaken,blocked=game.rewardCardBlocked(kind);
        this.cardRoot?.getComponent(CardPresentation)?.configure(kind,taken?'奖励已处理':blocked,'');
        if(this.claim){this.claim.actionId='claim-card-'+index;this.claim.setText(taken?'卡牌已领取':game.baseWeight+CARD[kind].weight>30?'领取 · 暂存':'选择这张卡');this.claim.setEnabled(!taken&&!blocked);}
    }
}
