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

    render(detail: CampDetail): void {
        if (this.context) this.context.string = detail.context;
        if (this.title) this.title.string = detail.title;
        if (this.body) this.body.string = detail.body;
        this.show(this.primary, detail.primary ?? detail.secondary);
        this.show(this.secondary, detail.primary ? detail.secondary : undefined);
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
