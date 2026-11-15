import { _decorator, Component, Label } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { ENTRY_TIER_IDS, ENTRY_TIERS, EntryTierId } from '../../core/content/EntryTiers';
import { ButtonAction } from './ButtonAction';
const { ccclass, property } = _decorator;

@ccclass('EntrySelection')
export class EntrySelection extends Component {
    @property({ type: [ButtonAction] }) choices: ButtonAction[] = [];
    @property(ButtonAction) confirm: ButtonAction | null = null;
    @property(Label) summary: Label | null = null;
    @property(Label) detail: Label | null = null;
    refresh(game: GameReadModel, selection: EntryTierId): void {
        this.choices.forEach((button, index) => {
            const tier = ENTRY_TIERS[ENTRY_TIER_IDS[index]];
            button.actionId = 'entry-tier-' + tier.id;
            button.setText(`${tier.name}\n入场 ${tier.cost} 物资\n每回合 ${tier.stamina} 体力`);
            button.setEnabled(game.supplies >= tier.cost);
            button.setVariant(tier.id === selection ? 'primary' : 'secondary');
        });
        const tier = ENTRY_TIERS[selection];
        if (this.summary) this.summary.string = `避难所物资 ${game.supplies} · 物资与战斗体力独立`;
        if (this.detail)
            this.detail.string = `${tier.name}档：入场只扣一次 ${tier.cost} 物资，余下 ${Math.max(0, game.supplies - tier.cost)}。\n每回合体力重置为 ${tier.stamina}，未用部分不累积。`;
        this.confirm?.setText(`支付 ${tier.cost} 物资 · 出发`);
        this.confirm?.setEnabled(game.supplies >= tier.cost);
    }
}
