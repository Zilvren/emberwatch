import {
    _decorator,
    Button,
    Color,
    Component,
    Event,
    EventTouch,
    JsonAsset,
    Label,
    Node,
    Tween,
    tween,
    UITransform,
    Vec3,
} from 'cc';
import { PaperPanel } from '../primitives/PaperPanel';
import { buttonColors, buttonState, ButtonState, ButtonVariant } from './ButtonStyle';
const { ccclass, property, requireComponent } = _decorator;
export const BUTTON_FOCUS_REQUEST = 'button-focus-request';
export class ButtonFocusRequest extends Event {
    constructor(readonly button: ButtonPresentation) {
        super(BUTTON_FOCUS_REQUEST, true);
    }
}

/** Button appearance and pointer feedback. Command dispatch stays in ButtonAction. */
@ccclass('ButtonPresentation')
@requireComponent(Button)
export class ButtonPresentation extends Component {
    @property(JsonAsset) theme: JsonAsset | null = null;
    @property(Node) surface: Node | null = null;
    @property(PaperPanel) panel: PaperPanel | null = null;
    @property(PaperPanel) focusRing: PaperPanel | null = null;
    @property(Label) caption: Label | null = null;
    @property variant: ButtonVariant = 'secondary';
    @property previewState = '';
    @property darkSurface = false;
    private hovered = false;
    private down = false;
    private inside = false;
    private keyboardFocus = false;
    private keyDown = false;
    private enabledBefore = true;
    private home = new Vec3();
    private baseScale = new Vec3(1, 1, 1);
    private reduced = false;
    private motionQuery: MediaQueryList | null = null;
    private captionOutline = false;
    onLoad(): void {
        this.getComponent(Button)!.transition = Button.Transition.NONE;
        this.captionOutline = this.caption?.enableOutline ?? false;
        if (this.surface) {
            this.home = this.surface.position.clone();
            this.baseScale = this.surface.scale.clone();
        }
        this.motionQuery =
            typeof matchMedia === 'undefined'
                ? null
                : matchMedia('(prefers-reduced-motion: reduce)');
        this.reduced = this.motionQuery?.matches ?? false;
    }
    onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this.pointerDown, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.pointerMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.pointerUp, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.pointerCancel, this);
        if (
            typeof matchMedia === 'undefined' ||
            matchMedia('(hover: hover) and (pointer: fine)').matches
        ) {
            this.node.on(Node.EventType.MOUSE_ENTER, this.pointerEnter, this);
            this.node.on(Node.EventType.MOUSE_LEAVE, this.pointerLeave, this);
        }
        this.motionQuery?.addEventListener('change', this.motionChanged);
        this.refreshInteractable();
    }
    onDisable(): void {
        this.node.targetOff(this);
        this.motionQuery?.removeEventListener('change', this.motionChanged);
        this.hovered = this.down = this.inside = this.keyDown = this.keyboardFocus = false;
        if (this.surface?.isValid) {
            Tween.stopAllByTarget(this.surface);
            this.surface.setPosition(this.home);
            this.surface.setScale(this.baseScale);
        }
    }
    private motionChanged = (event: MediaQueryListEvent) => {
        this.reduced = event.matches;
        this.render(true);
    };
    resize(width: number, height: number): void {
        this.getComponent(UITransform)?.setContentSize(width, height);
        this.surface?.getComponent(UITransform)?.setContentSize(width, height);
        this.focusRing?.getComponent(UITransform)?.setContentSize(width + 8, height + 8);
        this.caption
            ?.getComponent(UITransform)
            ?.setContentSize(width - (width <= 64 ? 8 : 32), height - 10);
        this.panel?.redraw();
        this.focusRing?.redraw();
    }
    get interactable(): boolean {
        return this.enabledInHierarchy && !!this.getComponent(Button)?.interactable;
    }
    get state(): ButtonState {
        if (this.previewState) return this.previewState as ButtonState;
        return buttonState({
            enabled: this.interactable,
            down: this.down || this.keyDown,
            inside: this.inside || this.keyDown,
            hovered: this.hovered,
            keyboardFocus: this.keyboardFocus,
        });
    }
    refreshInteractable(): void {
        this.enabledBefore = this.interactable;
        if (!this.interactable) this.hovered = this.down = this.inside = this.keyDown = false;
        this.render(true);
    }
    update(): void {
        if (this.enabledBefore !== this.interactable) this.refreshInteractable();
    }
    setVariant(value: ButtonVariant): void {
        this.variant = value;
        this.render(true);
    }
    setDarkSurface(value: boolean): void {
        this.darkSurface = value;
        this.render(true);
    }
    setKeyboardFocus(value: boolean): void {
        if (this.keyboardFocus === value && !this.keyDown) return;
        this.keyboardFocus = value;
        this.keyDown = false;
        this.render(true);
    }
    setKeyboardPressed(value: boolean): void {
        if (this.keyDown === value) return;
        this.keyDown = value;
        this.render(true);
    }
    canActivate(event?: unknown): boolean {
        if (!this.interactable || this.previewState) return false;
        return !(event instanceof EventTouch) || this.contains(event);
    }
    private contains(event: EventTouch): boolean {
        return this.node.getComponent(UITransform)!.hitTest(event.getLocation(), event.windowId);
    }
    private pointerDown(): void {
        if (!this.interactable || this.previewState) return;
        this.node.dispatchEvent(new ButtonFocusRequest(this));
        this.down = this.inside = true;
        this.render();
    }
    private pointerMove(event: EventTouch): void {
        if (!this.down) return;
        const inside = this.contains(event);
        if (inside !== this.inside) {
            this.inside = inside;
            this.render();
        }
    }
    private pointerUp(): void {
        this.down = false;
        this.render();
    }
    private pointerCancel(): void {
        this.down = this.inside = false;
        this.render();
    }
    private pointerEnter(): void {
        if (!this.interactable || this.previewState) return;
        this.hovered = true;
        this.render();
    }
    private pointerLeave(): void {
        this.hovered = false;
        this.render();
    }
    private render(instant = false): void {
        if (!this.theme || !this.panel) return;
        const state = this.state,
            style = this.theme.json.button,
            palette = buttonColors(this.theme.json, this.variant, state, this.darkSurface);
        this.panel.fill = new Color().fromHEX(palette.fill);
        this.panel.fill.a = palette.fillAlpha;
        this.panel.line = new Color().fromHEX(palette.line);
        this.panel.innerLine.a = this.panel.metalTrim && palette.fillAlpha ? 105 : 0;
        this.panel.redraw();
        if (this.caption) {
            this.caption.color = new Color().fromHEX(palette.text);
            // A scene outline helps transparent HUD labels, but muddies ink on a solid button.
            this.caption.enableOutline = this.captionOutline && palette.fillAlpha === 0;
        }
        if (this.focusRing) {
            this.focusRing.line = new Color().fromHEX(
                this.darkSurface ? style.darkFocusLine : style.focusLine
            );
            this.focusRing.redraw();
            this.focusRing.node.active =
                (this.interactable && this.keyboardFocus) || this.previewState === 'focus';
        }
        if (!this.surface) return;
        const pressed = state === 'pressed' && !this.reduced && !this.keyDown;
        Tween.stopAllByTarget(this.surface);
        const position = new Vec3(
            this.home.x,
            this.home.y - (pressed ? style.pressOffset : 0),
            this.home.z
        );
        const scale = new Vec3(
            this.baseScale.x * (pressed ? style.pressScale : 1),
            this.baseScale.y * (pressed ? style.pressScale : 1),
            this.baseScale.z
        );
        if (instant || this.reduced || this.previewState) {
            this.surface.setPosition(position);
            this.surface.setScale(scale);
        } else
            tween(this.surface)
                .to(style.pressDuration, { position, scale }, { easing: 'quadOut' })
                .start();
    }
    inspect(): object {
        return {
            variant: this.variant,
            state: this.state,
            enabled: this.interactable,
            focused: this.keyboardFocus,
            y: this.surface?.position.y,
            scale: this.surface?.scale.x,
            caption: this.caption?.string,
            color: this.caption?.color.toHEX(),
            preview: this.previewState,
            darkSurface: this.darkSurface,
        };
    }
}
