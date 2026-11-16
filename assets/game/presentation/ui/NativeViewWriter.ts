import { Node } from 'cc';
import type { GameReadModel } from '../../core/GameReadModel';
import { UIValue } from './UIValue';
import { ButtonAction } from './ButtonAction';
import type { ButtonVariant } from './ButtonStyle';
export class NativeViewWriter {
    constructor(protected readonly game: GameReadModel) {}
    text(root: Node, values: Record<string, string | number>): void {
        for (const binding of root.getComponentsInChildren(UIValue)) {
            if (Object.prototype.hasOwnProperty.call(values, binding.key))
                binding.setValue(values[binding.key]);
            if (binding.key === 'battle/text3') binding.setAlert(this.game.critical);
            if (binding.key === 'battle/text0')
                binding.setAlert(this.game.battle?.intent === 'attack');
        }
    }
    button(
        root: Node,
        id: string,
        caption?: string,
        enabled?: boolean,
        variant?: ButtonVariant
    ): void {
        for (const action of root.getComponentsInChildren(ButtonAction))
            if (action.actionId === id) {
                if (caption !== undefined) action.setText(caption);
                if (enabled !== undefined) action.setEnabled(enabled);
                if (variant !== undefined) action.setVariant(variant);
            }
    }
}
