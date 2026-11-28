import { _decorator, Component, Label } from 'cc';
import { CAMP_SKILLS, trainingBlocked } from '../../core/content/GateCamp';
import type { GameReadModel } from '../../core/GameReadModel';
import { ButtonAction } from './ButtonAction';
const { ccclass, property } = _decorator;

@ccclass('CampSkillTree')
export class CampSkillTree extends Component {
    @property({ type: [ButtonAction] }) nodes: ButtonAction[] = [];
    @property(Label) balance: Label | null = null;
    @property(Label) nameLabel: Label | null = null;
    @property(Label) effect: Label | null = null;
    @property(Label) requirement: Label | null = null;
    @property(ButtonAction) learn: ButtonAction | null = null;

    render(game: GameReadModel, selected: string): void {
        const learned = game.campSkills ?? [];
        const skill = CAMP_SKILLS.find(node => node.id === selected) ?? CAMP_SKILLS[0];
        for (const button of this.nodes) {
            const node = CAMP_SKILLS.find(item => item.id === button.payload)!;
            const status = learned.indexOf(node.id) >= 0 ? '已学会' :
                node.requires && learned.indexOf(node.requires) < 0 ? '尚未解锁' : `${node.cost} 物资`;
            button.setText(node.name + '\n' + status);
            button.setVariant(node.id === skill.id ? 'primary' : 'secondary');
        }
        if (this.balance) this.balance.string = `持有 ${game.supplies} 物资`;
        if (this.nameLabel) this.nameLabel.string = skill.name;
        if (this.effect) this.effect.string = skill.effect;
        if (this.requirement) this.requirement.string = skill.requires
            ? `前置 · ${CAMP_SKILLS.find(node => node.id === skill.requires)!.name}　 /　${skill.cost} 物资`
            : `入门技能　 /　${skill.cost} 物资`;
        if (this.learn) {
            const reason = trainingBlocked(skill, learned, game.supplies);
            this.learn.payload = skill.id;
            this.learn.setText(reason || `花 ${skill.cost} 物资学习`);
            this.learn.setEnabled(!reason);
        }
    }
}
