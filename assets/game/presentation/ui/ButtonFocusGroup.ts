import {
    _decorator,
    Button,
    Component,
    EventHandler,
    EventKeyboard,
    input,
    Input,
    KeyCode,
    Node,
    ScrollView,
    UITransform,
    Vec2,
} from 'cc';
import { BUTTON_FOCUS_REQUEST, ButtonFocusRequest, ButtonPresentation } from './ButtonPresentation';
const { ccclass, property } = _decorator;
const activeGroups = new WeakMap<Node, ButtonFocusGroup>();

/** Keyboard focus is scoped to the game root, with a web adapter that ignores HTML editors. */
@ccclass('ButtonFocusGroup')
export class ButtonFocusGroup extends Component {
    @property({ type: [Node] }) buttons: Node[] = [];
    @property modal = false;
    @property(Node) initialButton: Node | null = null;
    private focused: ButtonPresentation | null = null;
    private keyboardFocus = false;
    private previous: ButtonFocusGroup | null = null;
    private held = new Set<number>();
    private shift = false;
    onEnable(): void {
        this.node.on(BUTTON_FOCUS_REQUEST, this.pointerFocus, this);
        if (this.modal && this.node.scene) {
            this.previous = activeGroups.get(this.node.scene) ?? this.parentGroup();
            this.previous?.focused?.setKeyboardFocus(false);
            this.previous?.clearHeld();
            activeGroups.set(this.node.scene, this);
            const first = this.initialButton?.getComponent(ButtonPresentation) ?? this.list()[0];
            if (first) this.setFocus(first);
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('keydown', this.domDown, true);
            document.addEventListener('keyup', this.domUp, true);
            window.addEventListener('blur', this.clearHeld);
        } else {
            input.on(Input.EventType.KEY_DOWN, this.nativeDown, this);
            input.on(Input.EventType.KEY_UP, this.nativeUp, this);
        }
    }
    onDisable(): void {
        this.node.off(BUTTON_FOCUS_REQUEST, this.pointerFocus, this);
        this.clearHeld();
        this.focused?.setKeyboardFocus(false);
        this.focused = null;
        if (typeof document !== 'undefined') {
            document.removeEventListener('keydown', this.domDown, true);
            document.removeEventListener('keyup', this.domUp, true);
            window.removeEventListener('blur', this.clearHeld);
        } else {
            input.off(Input.EventType.KEY_DOWN, this.nativeDown, this);
            input.off(Input.EventType.KEY_UP, this.nativeUp, this);
        }
        const scene = this.node.scene;
        if (scene && activeGroups.get(scene) === this) {
            let previous = this.previous;
            while (previous && !previous.enabledInHierarchy) previous = previous.previous;
            if (previous) {
                activeGroups.set(scene, previous);
                if (previous.keyboardFocus && previous.focused?.node.activeInHierarchy && previous.focused.interactable)
                    previous.focused.setKeyboardFocus(true);
            } else activeGroups.delete(scene);
        }
        this.previous = null;
    }
    private parentGroup(): ButtonFocusGroup | null {
        let parent = this.node.parent;
        while (parent) {
            const group = parent.getComponent(ButtonFocusGroup);
            if (group?.enabledInHierarchy) return group;
            parent = parent.parent;
        }
        return null;
    }
    private list(): ButtonPresentation[] {
        return (
            this.buttons.length
                ? this.buttons.map((node) => node.getComponent(ButtonPresentation)!)
                : this.node.getComponentsInChildren(ButtonPresentation)
        ).filter(
            (button) =>
                button?.node.activeInHierarchy &&
                button.interactable &&
                !button.previewState &&
                this.ownsButton(button.node)
        );
    }
    private ownsButton(node: Node): boolean {
        let owner: Node | null = node;
        while (owner) {
            const group = owner.getComponent(ButtonFocusGroup);
            if (group?.enabledInHierarchy) return group === this;
            owner = owner.parent;
        }
        return false;
    }
    get isCurrent(): boolean {
        return this.ownsKeys();
    }
    private ownsKeys(): boolean {
        const scene = this.node.scene;
        if (!scene || !this.enabledInHierarchy) return false;
        const owner = activeGroups.get(scene);
        if (!owner || !owner.enabledInHierarchy) activeGroups.set(scene, this);
        return activeGroups.get(scene) === this;
    }
    private pointerFocus(event: ButtonFocusRequest): void {
        event.propagationStopped = true;
        if (this.node.scene) activeGroups.set(this.node.scene, this);
        this.focused?.setKeyboardFocus(false);
        this.keyboardFocus = false;
        this.focused = event.button;
        this.clearHeld();
    }
    private setFocus(button: ButtonPresentation): void {
        this.keyboardFocus = true;
        this.focused?.setKeyboardFocus(false);
        this.focused = button;
        button.setKeyboardFocus(true);
        if (this.modal) this.reveal(button.node);
    }
    private reveal(node: Node): void {
        for (let parent = node.parent; parent && parent !== this.node; parent = parent.parent) {
            const scroll = parent.getComponent(ScrollView);
            if (!scroll?.content || !scroll.vertical) continue;
            const content = scroll.content.getComponent(UITransform)!;
            const center = content.convertToNodeSpaceAR(node.worldPosition);
            const halfHeight = (node.getComponent(UITransform)?.height ?? 0) / 2;
            const top = content.height * (1 - content.anchorY) - center.y - halfHeight;
            const height = parent.getComponent(UITransform)!.height;
            const offset = scroll.getScrollOffset();
            const target = Math.min(top, Math.max(top + halfHeight * 2 - height, offset.y));
            if (target !== offset.y) {
                scroll.stopAutoScroll();
                scroll.scrollToOffset(
                    new Vec2(
                        offset.x,
                        Math.max(0, Math.min(scroll.getMaxScrollOffset().y, target))
                    ),
                    0
                );
            }
            return;
        }
    }
    private keyDown(code: number, shift: boolean): void {
        if (!this.ownsKeys() || this.held.has(code)) return;
        if (code === KeyCode.TAB) {
            const buttons = this.list();
            if (!buttons.length) return;
            const index = buttons.indexOf(this.focused!),
                next =
                    index < 0
                        ? shift
                            ? buttons.length - 1
                            : 0
                        : (index + (shift ? buttons.length - 1 : 1)) % buttons.length;
            this.setFocus(buttons[next]);
            return;
        }
        if (!this.focused?.interactable || !this.focused.node.activeInHierarchy) return;
        if (code === KeyCode.ENTER || code === KeyCode.SPACE) {
            this.held.add(code);
            if (code === KeyCode.ENTER) this.activate();
            else this.focused.setKeyboardPressed(true);
        }
    }
    private keyUp(code: number): void {
        if (!this.held.delete(code)) return;
        this.focused?.setKeyboardPressed(false);
        if (code === KeyCode.SPACE && this.ownsKeys()) this.activate();
    }
    private activate(): void {
        const focus = this.focused,
            button = focus?.getComponent(Button);
        if (!focus?.node.activeInHierarchy || !focus.canActivate() || !button) return;
        EventHandler.emitEvents(button.clickEvents, button);
        focus.node.emit(Button.EventType.CLICK, button);
    }
    private acceptsDom(event: KeyboardEvent): boolean {
        const target = event.target as HTMLElement | null;
        return (
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            !target?.matches('input,textarea,select,[contenteditable="true"]') &&
            (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ')
        );
    }
    private domDown = (event: KeyboardEvent) => {
        if (!this.acceptsDom(event) || !this.ownsKeys()) return;
        event.preventDefault();
        event.stopPropagation();
        this.keyDown(
            event.key === 'Tab'
                ? KeyCode.TAB
                : event.key === 'Enter'
                  ? KeyCode.ENTER
                  : KeyCode.SPACE,
            event.shiftKey
        );
    };
    private domUp = (event: KeyboardEvent) => {
        if (!this.acceptsDom(event) || !this.ownsKeys()) return;
        event.preventDefault();
        event.stopPropagation();
        this.keyUp(
            event.key === 'Tab'
                ? KeyCode.TAB
                : event.key === 'Enter'
                  ? KeyCode.ENTER
                  : KeyCode.SPACE
        );
    };
    private nativeDown(event: EventKeyboard): void {
        if (event.keyCode === KeyCode.SHIFT_LEFT || event.keyCode === KeyCode.SHIFT_RIGHT)
            this.shift = true;
        this.keyDown(event.keyCode, this.shift);
    }
    private nativeUp(event: EventKeyboard): void {
        this.keyUp(event.keyCode);
        if (event.keyCode === KeyCode.SHIFT_LEFT || event.keyCode === KeyCode.SHIFT_RIGHT)
            this.shift = false;
    }
    private clearHeld = () => {
        this.held.clear();
        this.focused?.setKeyboardPressed(false);
    };
    inspect(): object {
        return {
            focused: this.focused?.node.name,
            order: this.list().map((button) => button.node.name),
        };
    }
}
