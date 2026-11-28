import { _decorator, Color, Component, Label, Node } from 'cc';
import { CAMP_SKILLS, trainingBlocked } from '../../core/content/GateCamp';
import type { GameReadModel } from '../../core/GameReadModel';
import { ButtonAction } from './ButtonAction';
import { ShapeGraphic } from '../primitives/ShapeGraphic';
import { place, roomBody } from './CampRoomLayout';
const { ccclass, property } = _decorator;

@ccclass('CampSkillTree')
export class CampSkillTree extends Component {
    @property({ type: [ButtonAction] }) nodes: ButtonAction[] = [];
    @property(Node) chart: Node = null!;
    @property({ type: [ShapeGraphic] }) routes: ShapeGraphic[] = [];
    @property(Node) note: Node = null!;
    @property(Label) fee: Label = null!;
    @property(Label) effect: Label = null!;
    @property(ButtonAction) learn: ButtonAction = null!;

    render(game: GameReadModel, selected: string | null): void {
        const learned = game.campSkills ?? [];
        const skill = CAMP_SKILLS.find(node => node.id === selected);
        const { body } = roomBody(this.node, false);
        const noteWidth = Math.min(318, Math.max(212, body.width * .30));
        // A tall sheet has room in its upper right margin, above all three seals.
        const useMargin = body.height > body.width * 1.5;
        const reserved = skill && !useMargin ? noteWidth + 18 : 0;
        const mapWidth = body.width - reserved;
        place(this.chart, -reserved / 2, body.y);
        const turn = body.height > body.width * 1.04;
        this.chart.angle = turn ? 90 : 0;
        const scale = turn ? Math.min(mapWidth / 540, body.height / 810)
            : Math.min(mapWidth / 810, body.height / 540);
        this.chart.setScale(scale, scale, 1);
        const sealScale = Math.min(1.45, Math.max(1, .93 / scale));
        for (const button of this.nodes) {
            button.node.angle = -this.chart.angle;
            button.node.setScale(sealScale, sealScale, 1);
            const node = CAMP_SKILLS.find(item => item.id === button.payload)!;
            const known = learned.indexOf(node.id) >= 0, locked = !!node.requires && learned.indexOf(node.requires) < 0;
            const surface = button.node.getChildByName('ButtonSurface')!;
            button.setText(node.name);
            surface.getChildByName('Selected')!.active = node.id === selected;
            surface.getChildByName('Learned')!.active = known;
            const route = this.routes.find(line => line.node.name === node.id);
            if (route) {
                route.outline = new Color().fromHEX(known ? '#ffe2a4' : locked ? '#a9987e' : '#e8b96e');
                route.redraw();
            }
        }
        this.note.active = !!skill;
        this.learn.payload = skill?.id ?? '';
        if (!skill) return;
        this.fee.string = `耗费 ${skill.cost} 物资`;
        this.effect.string = skill.effect;
        const reason = trainingBlocked(skill, learned, game.supplies);
        this.learn.setText(reason || '学习');
        this.learn.setEnabled(!reason);

        const inner = noteWidth - 36;
        const charsPerLine = Math.max(1, Math.floor(inner / this.effect.fontSize));
        const copyHeight = this.effect.lineHeight * Math.ceil(skill.effect.length / charsPerLine) + 8;
        const noteHeight = 115 + copyHeight;
        const noteY = useMargin ? body.y + (body.height - noteHeight) / 2 : body.y;
        place(this.note, (body.width - noteWidth) / 2, noteY, noteWidth, noteHeight);
        place(this.fee.node, 0, noteHeight / 2 - 26, inner, 33);
        place(this.effect.node, 0, noteHeight / 2 - 48 - copyHeight / 2, inner, copyHeight);
        place(this.learn.node, 0, (50 - noteHeight) / 2 + 10);
    }
}
