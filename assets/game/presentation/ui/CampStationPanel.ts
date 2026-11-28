import { _decorator, Component, Label } from 'cc';
import type { CampDetail } from './CampViewModel';
import { ButtonAction } from './ButtonAction';
const { ccclass, property } = _decorator;

@ccclass('CampStationPanel')
export class CampStationPanel extends Component {
    @property(Label) context: Label | null = null;
    @property(Label) title: Label | null = null;
    @property(Label) body: Label | null = null;
    @property(ButtonAction) primary: ButtonAction | null = null;
    @property(ButtonAction) secondary: ButtonAction | null = null;
    @property(ButtonAction) sound: ButtonAction | null = null;

    render(detail: CampDetail, fireMuted?: boolean): void {
        if (this.context) this.context.string = detail.context;
        if (this.title) this.title.string = detail.title;
        if (this.body) this.body.string = detail.body;
        this.show(this.primary, detail.primary ?? detail.secondary);
        this.show(this.secondary, detail.primary ? detail.secondary : undefined);
        if (this.sound) {
            this.sound.node.active = fireMuted !== undefined;
            this.sound.setText(fireMuted ? '声音关闭' : '声音开启');
        }
    }

    private show(button: ButtonAction | null, action: CampDetail['primary']): void {
        if (!button) return;
        button.node.active = !!action;
        if (!action) return;
        button.actionId = action.id;
        button.payload = action.payload ?? '';
        button.setText(action.caption);
        button.setEnabled(action.enabled !== false);
    }
}
