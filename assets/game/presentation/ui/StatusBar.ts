import { _decorator, Color, Component, JsonAsset, Label, Node, UITransform } from 'cc';
import { PaperPanel } from '../primitives/PaperPanel';
import { ShapeGraphic } from '../primitives/ShapeGraphic';
import { ButtonAction } from './ButtonAction';
import { ButtonPresentation } from './ButtonPresentation';
import { UIProgress } from './UIProgress';
import { defaultStatus, StatusBarInput, statusBarView, StatusTone } from './StatusBarModel';
import { statusBarLayout } from './StatusBarLayout';
const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('StatusBar')
@executeInEditMode
export class StatusBar extends Component {
    @property presentation: 'strip' | 'floating' = 'strip';
    @property(JsonAsset) theme: JsonAsset | null = null;
    @property(PaperPanel) paper: PaperPanel | null = null;
    @property({ type: [Node] }) sections: Node[] = [];
    @property({ type: [Node] }) utilities: Node[] = [];
    @property(Label) brand: Label | null = null;
    @property(Label) save: Label | null = null;
    @property(Label) day: Label | null = null;
    @property(Label) supplies: Label | null = null;
    @property(Label) suppliesHint: Label | null = null;
    @property(Label) armorTitle: Label | null = null;
    @property(Label) armor: Label | null = null;
    @property(Label) carryHint: Label | null = null;
    @property(Node) bag: Node | null = null;
    @property(UIProgress) armorMeter: UIProgress | null = null;
    @property(ButtonAction) rulesNotice: ButtonAction | null = null;
    @property(Node) recipeButton: Node | null = null;
    private input: StatusBarInput = { ...defaultStatus };
    private viewModel = statusBarView(this.input);
    private geometry = statusBarLayout(1440);
    private lastWidth = -1;
    private lastPresentation = '';
    private signature = '';
    onEnable(): void {
        this.lastWidth = -1;
        this.node.on(Node.EventType.SIZE_CHANGED, this.layout, this);
        this.layout();
        this.signature = '';
        this.render(this.input);
    }
    onDisable(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this.layout, this);
    }
    render(input: Readonly<StatusBarInput>): void {
        const signature = JSON.stringify(input);
        if (signature === this.signature) return;
        this.signature = signature;
        this.input = { ...input };
        if (this.recipeButton && this.recipeButton.active !== !!input.recipesVisible) {
            this.recipeButton.active = !!input.recipesVisible;
            this.lastWidth = -1;
            this.layout();
        }
        const model = (this.viewModel = statusBarView(input));
        this.text(this.save, model.save, model.saveTone);
        this.text(this.day, model.day);
        this.text(this.supplies, model.supplies, model.suppliesTone);
        this.text(this.suppliesHint, model.suppliesHint, model.suppliesTone, true);
        this.text(this.armorTitle, model.armorTitle, model.armorTone, true);
        this.text(this.armor, model.armor, model.armorTone);
        this.text(this.carryHint, model.carryHint, model.carryTone, true);
        this.bag?.getComponent(ButtonAction)?.setText(model.bag);
        if (this.rulesNotice) {
            this.rulesNotice.node.active = !!model.rulesNotice;
            this.rulesNotice.setText(model.rulesNotice);
            this.rulesNotice.setEnabled(model.actionsEnabled);
        }
        for (const node of [this.bag, ...this.utilities, this.recipeButton]) {
            const action = node?.getComponent(ButtonAction);
            if (!action) continue;
            if (action.actionId === 'audio') action.setText(model.audio);
            if (action.enabled !== model.actionsEnabled) action.setEnabled(model.actionsEnabled);
        }
        if (this.armorMeter) {
            this.armorMeter.filledColor = this.tint(
                model.armorTone,
                model.armorTone === 'normal' ? 'olive' : 'ink'
            );
            this.armorMeter.emptyColor = this.tint('normal', 'paperShade');
            this.armorMeter.setRatio(model.armorRatio);
        }
    }
    private tint(tone: StatusTone, base = 'ink'): Color {
        const colors = this.theme?.json.colors;
        const hex =
            tone === 'danger'
                ? colors?.danger
                : tone === 'warning'
                  ? this.theme?.json.hud?.warning
                  : colors?.[base];
        return new Color().fromHEX(hex ?? '#454238');
    }
    private text(
        label: Label | null,
        value: string,
        tone: StatusTone = 'normal',
        muted = false
    ): void {
        if (!label) return;
        if (label.string !== value) label.string = value;
        label.color = this.tint(tone, muted ? 'muted' : 'ink');
    }
    private layout(): void {
        const ui = this.getComponent(UITransform);
        if (!ui || (ui.width === this.lastWidth && this.presentation === this.lastPresentation))
            return;
        this.lastWidth = ui.width;
        this.lastPresentation = this.presentation;
        const recipesVisible = !!this.recipeButton?.active;
        const geometry = (this.geometry = statusBarLayout(
            ui.width,
            this.presentation,
            recipesVisible
        ));
        if (ui.height !== geometry.height) ui.height = geometry.height;
        const surface = this.paper?.getComponent(UITransform);
        surface?.setContentSize(geometry.width, geometry.height);
        this.paper?.redraw();
        this.sections.forEach((node, index) => {
            const slot = geometry.sections[index];
            node.setPosition(slot.x, slot.y);
            node.getComponent(UITransform)?.setContentSize(slot.width, slot.height);
            for (const child of node.children) {
                if (child === this.bag || child === this.armorMeter?.node) continue;
                child
                    .getComponent(UITransform)
                    ?.setContentSize(slot.width, child.getComponent(UITransform)!.height);
                child.setPosition(-slot.width / 2, child.position.y);
            }
        });
        const carry = geometry.sections[4];
        this.bag?.setPosition(0, 5);
        this.bag?.getComponent(ButtonPresentation)?.resize(Math.min(224, carry.width), 40);
        const utilities = recipesVisible ? [...this.utilities, this.recipeButton!] : this.utilities;
        utilities.forEach((node, index) => {
            const slot = geometry.utilities[index];
            node.setPosition(slot.x, slot.y);
            node.getComponent(ButtonPresentation)?.resize(slot.width, slot.height);
        });
        const meter = this.armorMeter,
            gaugeWidth = geometry.sections[3].width;
        if (meter) {
            meter.node.setPosition(0, -24);
            meter.getComponent(UITransform)?.setContentSize(gaugeWidth, 4);
            const width = (gaugeWidth - 3 * (meter.ticks.length - 1)) / meter.ticks.length;
            meter.ticks.forEach((tick, index) => {
                tick.setPosition(-gaugeWidth / 2 + width / 2 + index * (width + 3), 0);
                tick.getComponent(UITransform)?.setContentSize(width, 4);
                tick.getComponent(ShapeGraphic)?.redraw();
            });
        }
    }
    inspect(): object {
        return { ...this.geometry, values: { ...this.viewModel }, input: { ...this.input } };
    }
}
