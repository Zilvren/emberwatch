import { _decorator, Color, Component, JsonAsset, Label, Node, Sprite, SpriteAtlas, UITransform } from 'cc';
import { PaperPanel } from '../primitives/PaperPanel';
import { ShapeGraphic } from '../primitives/ShapeGraphic';
import { ButtonAction } from './ButtonAction';
import { ButtonPresentation } from './ButtonPresentation';
import { UIProgress } from './UIProgress';
import { defaultStatus, StatusBarInput, statusBarView } from './StatusBarModel';
import { statusBarLayout } from './StatusBarLayout';
const { ccclass, property } = _decorator;

@ccclass('StatusBar')
export class StatusBar extends Component {
    @property presentation: 'strip' | 'floating' = 'strip';
    @property(JsonAsset) theme: JsonAsset | null = null;
    @property(SpriteAtlas) icons: SpriteAtlas | null = null;
    @property(PaperPanel) paper: PaperPanel | null = null;
    @property(Sprite) lintel: Sprite | null = null;
    @property({ type: [Node] }) sections: Node[] = [];
    @property({ type: [Node] }) utilities: Node[] = [];
    @property(Label) day: Label | null = null;
    @property(Label) round: Label | null = null;
    @property(Label) supplies: Label | null = null;
    @property(Label) health: Label | null = null;
    @property(Node) bag: Node | null = null;
    @property(UIProgress) healthMeter: UIProgress | null = null;
    @property(ButtonAction) rulesNotice: ButtonAction | null = null;
    @property(Node) recipeButton: Node | null = null;
    private input = { ...defaultStatus };
    private values = statusBarView(this.input);
    private geometry = statusBarLayout(1440);
    private width = -1;
    private signature = '';

    onEnable(): void {
        this.width = -1;
        this.signature = '';
        this.node.on(Node.EventType.SIZE_CHANGED, this.layout, this);
        this.render(this.input);
    }
    onDisable(): void { this.node.off(Node.EventType.SIZE_CHANGED, this.layout, this); }

    render(input: Readonly<StatusBarInput>): void {
        const signature = JSON.stringify(input);
        if (signature === this.signature) return;
        this.signature = signature;
        this.input = { ...input };
        const data = this.values = statusBarView(input);
        if (this.recipeButton && this.recipeButton.active !== !!input.recipesVisible) {
            this.recipeButton.active = !!input.recipesVisible;
            this.width = -1;
        }
        const healthSection = this.sections[3];
        if (healthSection && healthSection.active !== (input.healthVisible !== false)) {
            healthSection.active = input.healthVisible !== false;
            this.width = -1;
        }
        this.layout();
        if (this.day) this.day.string = data.day;
        if (this.round) {
            this.round.string = data.round;
            this.round.node.active = !!data.round;
        }
        if (this.supplies) this.supplies.string = data.supplies;
        if (this.health) {
            this.health.string = data.health;
            this.health.color = new Color().fromHEX(data.healthTone === 'danger' ? '#ff9991' : '#f5e6db');
        }
        const saved = this.sections[0]?.getChildByName('SaveGlyph')?.getComponent(Sprite);
        if (saved && this.icons) {
            saved.spriteFrame = this.icons.getSpriteFrame('ic-' + data.saveSymbol);
            saved.color = new Color().fromHEX(data.saveTone === 'danger' ? '#ff9991' : '#cfb897');
        }
        this.bag?.getComponent(ButtonAction)?.setText(data.bag);
        if (this.rulesNotice) {
            this.rulesNotice.node.active = !!data.rulesNotice;
            this.rulesNotice.setText(data.rulesNotice);
        }
        for (const node of [this.bag, ...this.utilities, this.recipeButton, this.rulesNotice?.node]) {
            const action = node?.getComponent(ButtonAction);
            if (action && action.enabled !== input.actionsEnabled) action.setEnabled(input.actionsEnabled);
        }
        if (this.healthMeter) {
            this.healthMeter.filledColor = new Color().fromHEX('#dc9395');
            this.healthMeter.emptyColor = new Color().fromHEX('#54444d');
            this.healthMeter.setRatio(data.healthRatio);
        }
    }
    private layout(): void {
        const ui = this.node.getComponent(UITransform);
        if (!ui || ui.width === this.width) return;
        this.width = ui.width;
        const grid = this.geometry = statusBarLayout(this.width, this.presentation, !!this.recipeButton?.active, this.input.healthVisible !== false);
        ui.height = grid.height;
        this.paper?.getComponent(UITransform)?.setContentSize(grid.width, grid.height);
        if (this.lintel) this.lintel.getComponent(UITransform)?.setContentSize(grid.width - 10, grid.height - 6);
        else this.paper?.redraw();
        const numbers = [null, this.day, this.supplies, this.health];
        this.sections.forEach((section, i) => {
            const slot = grid.sections[i];
            if (!slot.width) return;
            section.setPosition(slot.x, slot.y);
            section.getComponent(UITransform)?.setContentSize(slot.width, slot.height);
            const left = -slot.width / 2;
            const glyph = section.getChildByName('StatusGlyph');
            glyph?.setPosition(i === 0 ? 0 : left + 15, i === 3 ? 3 : 0);
            if (i === 0 && glyph) {
                const side = Math.min(62, slot.width);
                glyph.getComponent(UITransform)?.setContentSize(side, side);
                section.getChildByName('SaveGlyph')?.setPosition(side / 2 - 1, -17);
            }
            const shadow = section.getChildByName('GlyphShadow');
            if (glyph && shadow) {
                const side = glyph.getComponent(UITransform)!.width;
                shadow.setPosition(glyph.position.x, glyph.position.y - 2);
                shadow.getComponent(UITransform)?.setContentSize(side + 2, side + 2);
            }
            const label = numbers[i];
            if (label) {
                const inset = i === 1 ? 0 : 32;
                label.node.setPosition(left + inset, i === 3 ? 4 : 0);
                label.getComponent(UITransform)?.setContentSize(Math.max(24, slot.width - inset), 36);
            }
        });
        if (this.round) {
            const slot = grid.round;
            this.round.node.setPosition(slot.x, slot.y);
            this.round.getComponent(UITransform)?.setContentSize(Math.min(132, slot.width), slot.height);
            for (const rule of this.round.node.children) rule.active = slot.width >= 160;
        }
        const healthWidth = Math.max(34, grid.sections[3].width - 40);
        const meter = this.healthMeter;
        if (meter) {
            meter.node.setPosition(10, -16);
            meter.getComponent(UITransform)?.setContentSize(healthWidth, 3);
            const each = (healthWidth - 2 * (meter.ticks.length - 1)) / meter.ticks.length;
            meter.ticks.forEach((tick, i) => {
                tick.setPosition(-healthWidth / 2 + each / 2 + i * (each + 2), 0);
                tick.getComponent(UITransform)?.setContentSize(each, 3);
                tick.getComponent(ShapeGraphic)?.redraw();
            });
        }
        this.bag?.setPosition(0, 0);
        this.bag?.getComponent(ButtonPresentation)?.resize(grid.sections[4].width, grid.sections[4].height);
        const controls = this.utilities.slice();
        if (this.recipeButton?.active) controls.splice(controls.length - 1, 0, this.recipeButton);
        controls.forEach((node, i) => {
            const slot = grid.utilities[i];
            node.setPosition(slot.x, slot.y);
            node.getComponent(ButtonPresentation)?.resize(slot.width, slot.height);
        });
    }
    inspect(): object { return { ...this.geometry, values: this.values, input: { ...this.input } }; }
}
