import { _decorator, Button, Component, Label, UIOpacity } from 'cc';
import { dispatchAction } from './UIEvents';
import { ButtonPresentation } from './ButtonPresentation';
import type { ButtonVariant } from './ButtonStyle';
const { ccclass, property, requireComponent } = _decorator;
@ccclass('ButtonAction')
@requireComponent(Button)
export class ButtonAction extends Component {
    @property actionId = '';
    @property payload = '';
    @property(Label) caption: Label | null = null;
    @property disabledOpacity = 150;
    private button!: Button;
    onLoad(): void {
        this.button = this.getComponent(Button)!;
    }
    activate(event?: unknown): void {
        const presentation = this.getComponent(ButtonPresentation);
        if (
            (this.button ?? this.getComponent(Button)!).interactable &&
            (!presentation || presentation.canActivate(event))
        )
            dispatchAction(this.node, { id: this.actionId, payload: this.payload });
    }
    setEnabled(enabled: boolean): void {
        const button = this.button ?? this.getComponent(Button)!;
        button.interactable = enabled;
        const opacity = this.getComponent(UIOpacity) ?? this.addComponent(UIOpacity);
        const presentation = this.getComponent(ButtonPresentation);
        opacity.opacity = presentation || enabled ? 255 : this.disabledOpacity;
        presentation?.refreshInteractable();
    }
    setVariant(variant: ButtonVariant): void {
        this.getComponent(ButtonPresentation)?.setVariant(variant);
    }
    setText(value: string): void {
        if (this.caption && this.caption.string !== value) this.caption.string = value;
    }
    get enabled(): boolean {
        return this.getComponent(Button)?.interactable ?? false;
    }
}
