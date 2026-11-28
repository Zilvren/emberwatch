import { _decorator, Component, Node } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { UIValue } from './UIValue';
const { ccclass, property } = _decorator;

@ccclass('EnemyIntent')
export class EnemyIntent extends Component {
    @property(Node) attackGlyph!: Node;
    @property(Node) prepareGlyph!: Node;
    @property(Node) delayGlyph!: Node;
    @property(UIValue) amount!: UIValue;
    @property(UIValue) description!: UIValue;
    @property(Node) hint!: Node;

    onEnable(): void {
        this.node.on(Node.EventType.MOUSE_ENTER, this.showHint, this);
        this.node.on(Node.EventType.MOUSE_LEAVE, this.hideHint, this);
        this.node.on(Node.EventType.TOUCH_START, this.showHint, this);
        this.node.on(Node.EventType.TOUCH_END, this.hideHint, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.hideHint, this);
    }
    onDisable(): void {
        this.node.targetOff(this);
        this.hideHint();
    }
    private showHint(): void { this.hint.active = true; }
    private hideHint(): void { this.hint.active = false; }

    render(game: GameReadModel, canInspect: boolean): void {
        const battle = game.battle!;
        const delayed = battle.calm?.deferred === 'scheduled';
        const attacking = !delayed && battle.intent === 'attack';
        this.attackGlyph.active = attacking;
        this.prepareGlyph.active = !delayed && !attacking;
        this.delayGlyph.active = delayed;
        this.amount.setValue(delayed ? 1 : attacking ? game.incomingDamage : battle.strongAttack);
        this.amount.setAlert(attacking);
        const damage = Math.max(0, game.incomingDamage - battle.block);
        let detail: string;
        if (delayed) detail = '行动暂缓 · 你将获得一个额外回合';
        else if (!attacking) detail = `蓄势 · 下次攻击 ${battle.strongAttack}`;
        else if (!damage) detail = '已完全格挡';
        else if (damage >= game.health) detail = '结束回合将失守';
        else detail = `结束回合将受伤 ${damage}`;
        this.description.setValue(detail);
        this.enabled = canInspect;
    }
}
