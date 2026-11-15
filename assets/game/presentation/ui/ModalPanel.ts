import {
    _decorator,
    Component,
    EventKeyboard,
    input,
    Input,
    KeyCode,
    Node,
    UITransform,
    Vec2,
} from 'cc';
import { ButtonFocusGroup } from './ButtonFocusGroup';
import { CommonPanel } from './CommonPanel';
import { dispatchAction } from './UIEvents';
const { ccclass, property } = _decorator;

/** Modal dismissal and keyboard scrolling. The caller decides what a close action means. */
@ccclass('ModalPanel')
export class ModalPanel extends Component {
    @property(Node) backdrop: Node | null = null;
    @property closeAction = 'modal-close';
    @property closeOnBackdrop = true;
    @property closeOnEscape = true;
    onEnable(): void {
        this.backdrop?.on(Node.EventType.TOUCH_END, this.backdropEnd, this);
        if (typeof document !== 'undefined')
            document.addEventListener('keydown', this.domKey, true);
        else input.on(Input.EventType.KEY_DOWN, this.nativeKey, this);
    }
    onDisable(): void {
        this.backdrop?.off(Node.EventType.TOUCH_END, this.backdropEnd, this);
        if (typeof document !== 'undefined')
            document.removeEventListener('keydown', this.domKey, true);
        else input.off(Input.EventType.KEY_DOWN, this.nativeKey, this);
    }
    private backdropEnd(): void {
        if (this.closeOnBackdrop) this.dismiss();
    }
    private dismiss(): void {
        if (this.getComponent(ButtonFocusGroup)?.isCurrent)
            dispatchAction(this.node, { id: this.closeAction, payload: '' });
    }
    private key(key: string): boolean {
        if (!this.getComponent(ButtonFocusGroup)?.isCurrent) return false;
        if (key === 'Escape') {
            if (this.closeOnEscape) this.dismiss();
            return true;
        }
        const panel = this.getComponent(CommonPanel),
            scroll = panel?.scroll;
        if (
            !scroll ||
            ['PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp'].indexOf(key) < 0
        )
            return false;
        const current = scroll.getScrollOffset().y,
            max = scroll.getMaxScrollOffset().y;
        const page = panel?.viewport?.getComponent(UITransform)?.height ?? 200;
        const next =
            key === 'Home'
                ? 0
                : key === 'End'
                  ? max
                  : current +
                    (key === 'PageDown'
                        ? page * 0.85
                        : key === 'PageUp'
                          ? -page * 0.85
                          : key === 'ArrowDown'
                            ? 32
                            : -32);
        scroll.stopAutoScroll();
        scroll.scrollToOffset(new Vec2(0, Math.max(0, Math.min(max, next))), 0);
        return true;
    }
    private domKey = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        if (
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            target?.matches('input,textarea,select,[contenteditable="true"]')
        )
            return;
        if (this.key(event.key)) {
            event.preventDefault();
            event.stopPropagation();
        }
    };
    private nativeKey(event: EventKeyboard): void {
        const keys: Record<number, string> = {
            [KeyCode.ESCAPE]: 'Escape',
            [KeyCode.PAGE_DOWN]: 'PageDown',
            [KeyCode.PAGE_UP]: 'PageUp',
            [KeyCode.HOME]: 'Home',
            [KeyCode.END]: 'End',
            [KeyCode.ARROW_DOWN]: 'ArrowDown',
            [KeyCode.ARROW_UP]: 'ArrowUp',
        };
        if (keys[event.keyCode]) this.key(keys[event.keyCode]);
    }
}
