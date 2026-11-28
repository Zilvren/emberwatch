import { _decorator, Component, Label } from 'cc';
import { keeperDialogue } from './CampViewModel';
import { ButtonAction } from './ButtonAction';
const { ccclass, property } = _decorator;

@ccclass('CampStationPanel')
export class CampStationPanel extends Component {
    @property(Label) body: Label = null!;
    @property(ButtonAction) primary: ButtonAction = null!;

    render(topic: number): void {
        const dialogue = keeperDialogue(topic);
        this.body.string = dialogue.line;
        this.primary.setText(dialogue.next);
    }
}
