import { Color, Graphics, Label, Node, Sprite, SpriteAtlas, UITransform } from 'cc';
import { entryTier } from '../../core/content/EntryTiers';
import { ButtonAction } from './ButtonAction';
import { ButtonPresentation } from './ButtonPresentation';

const symbols: Record<string, string> = {
    settings: 'settings', help: 'help', 'rules-help': 'info', restart: 'restart',
    map: 'map', bag: 'cards', 'supply-bag': 'bag', 'recipe-open': 'craft', 'rest-synthesis': 'craft',
    'camp-keeper': 'keeper', 'camp-bench': 'heal', 'camp-warehouse': 'warehouse', 'camp-fire': 'fire',
    'camp-depart': 'open', 'camp-find-keeper': 'keeper', 'camp-deck': 'cards', 'camp-repair': 'heal',
    'camp-stock': 'inventory', 'camp-stock-next': 'next', 'camp-stock-back': 'back', 'camp-redeem': 'coins',
    'camp-prev': 'prev', 'camp-next': 'next', 'entry-confirm': 'check', 'journal-start': 'go',
    'modal-cancel': 'back', 'modal-close': 'close', 'modal-confirm': 'check',
    'map-enter': 'go', 'rest-done': 'go', 'shelter-done': 'go',
    'rest-cash': 'drop', 'rest-bag': 'cards', 'reward-confirm': 'check',
    'discover-confirm': 'check', 'resolve-choice-confirm': 'check',
    'draw-pile': 'draw', 'discard-pile': 'discard', 'pile-prev': 'prev', 'pile-next': 'next',
    'bag-prev': 'prev', 'bag-next': 'next', 'bag-reader-close': 'back', 'bag-details': 'detail',
    'bag-filter-all': 'inventory', 'bag-filter-deck': 'cards', 'bag-filter-found': 'gift',
    'bag-filter-overflow': 'bag', 'bag-filter-supplies': 'bag', 'bag-mode': 'bookmark', 'bag-sort': 'sort',
    'recipe-prev': 'prev', 'recipe-next': 'next', 'recipe-category': 'filter', 'recipe-sort': 'sort',
    'recipe-craft': 'craft', 'recipe-undo': 'undo', 'discard-supply': 'drop',
};

function symbolFor(action: ButtonAction, caption: string): string | undefined {
    const id = action.actionId;
    if (id === 'audio') return /关闭|声音关|已静音/.test(caption) ? 'muted' : 'sound';
    if (id === 'shelter-repair') return caption.indexOf('兑换') >= 0 ? 'coins' : 'heal';
    if (id === 'rewards-done') return caption === '取消出牌' ? 'back' : /略过|放弃/.test(caption) ? 'skip' : 'next';
    if (id === 'claim-supplies') return caption === '上一页' ? 'prev' : 'supplies';
    if (id === 'reward-bag') return caption === '下一页' ? 'next' : 'bag';
    if (id === 'recipe-filter') return action.payload === 'ready' ? 'check' : action.payload === 'partial' ? 'clock' : 'filter';
    if (id.startsWith('claim-card-')) return 'check';
    if (id.startsWith('toggle-')) return /移出/.test(caption) ? 'remove' : 'add';
    if (id.startsWith('discard-') && id !== 'discard-pile') return 'drop';
    return symbols[id];
}

interface ControlVisual {
    icon: Sprite;
    painted: boolean;
    shadow?: UITransform;
    number: Label;
    surface: Node;
    energy?: { icon: Sprite; number: Label };
}
/** The native Button still owns its hit area, keyboard focus and semantic caption.
 * Names of cards, map locations, tier choices and recipes remain content. */
export class PlayerControls {
    private readonly visuals = new WeakMap<ButtonAction, ControlVisual>();
    private readonly tip: Node;
    private readonly tipText: Label;
    private readonly tipPaper: Graphics;
    private tipOwner: ButtonAction | null = null;
    private windowWidth = 1440;
    private windowHeight = 900;

    constructor(private readonly root: Node, private readonly atlas: SpriteAtlas) {
        this.tip = this.child(root, 'ControlHint');
        this.tipPaper = this.tip.addComponent(Graphics);
        this.tipText = this.child(this.tip, 'HintText').addComponent(Label);
        this.tipText.fontFamily = 'Microsoft YaHei';
        this.tipText.fontSize = 17;
        this.tipText.lineHeight = 22;
        this.tipText.color = new Color(249, 235, 212);
        this.tipText.overflow = Label.Overflow.SHRINK;
        this.tipText.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.tipText.verticalAlign = Label.VerticalAlign.CENTER;
        this.tip.active = false;
    }

    private child(parent: Node, name: string): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        parent.addChild(node);
        node.addComponent(UITransform);
        return node;
    }
    private number(parent: Node, name: string): Label {
        const result = this.child(parent, name).addComponent(Label);
        result.fontFamily = 'Microsoft YaHei';
        result.fontSize = 19;
        result.lineHeight = 24;
        result.horizontalAlign = Label.HorizontalAlign.CENTER;
        result.verticalAlign = Label.VerticalAlign.CENTER;
        result.overflow = Label.Overflow.SHRINK;
        return result;
    }

    refresh(): void {
        if (this.tipOwner && !this.tipOwner.node.activeInHierarchy)
            this.hide(this.tipOwner);
        for (const action of this.root.getComponentsInChildren(ButtonAction)) {
            if (!action.node.activeInHierarchy || !action.caption) continue;
            const caption = action.caption.string;
            const tier = action.actionId.startsWith('entry-tier-') ? entryTier(action.actionId.slice(11)) : undefined;
            const key = tier ? 'supplies' : symbolFor(action, caption);
            let visual = this.visuals.get(action);
            if (!key) {
                if (visual) {
                    action.caption.enabled = true;
                    visual.icon.node.active = visual.number.node.active = false;
                }
                continue;
            }
            if (!visual) {
                const style = action.getComponent(ButtonPresentation);
                const surface = style?.surface ?? action.node;
                const icon = style?.paintedIcon ?? this.child(surface, 'ControlGlyph').addComponent(Sprite);
                icon.sizeMode = Sprite.SizeMode.CUSTOM;
                const number = this.number(surface, 'ControlQuantity');
                const shadow = surface.getChildByName('GlyphShadow')?.getComponent(UITransform) ?? undefined;
                visual = {surface, icon, number, painted: !!style?.paintedIcon, shadow};
                if (visual.painted) {
                    number.enableOutline = true;
                    number.outlineWidth = 2;
                    number.outlineColor = new Color(60, 48, 66);
                }
                this.visuals.set(action, visual);
                action.node.on(Node.EventType.MOUSE_ENTER, () => this.hint(action), this);
                action.node.on(Node.EventType.MOUSE_LEAVE, () => this.hide(action), this);
                action.node.on(Node.EventType.TOUCH_START, () => this.hide(action), this);
                action.node.on('control-key-focus', (on: boolean) => on ? this.hint(action) : this.hide(action), this);
            }
            const {surface, icon, number} = visual;
            action.caption.enabled = false;
            icon.node.active = true;
            if (!visual.painted) {
                const frame = this.atlas.getSpriteFrame('ic-' + key);
                if (icon.spriteFrame !== frame) icon.spriteFrame = frame;
                icon.color = action.caption.color;
            }
            if (tier) {
                if (!visual.energy) {
                    const glyph = this.child(surface, 'EnergyGlyph').addComponent(Sprite);
                    glyph.sizeMode = Sprite.SizeMode.CUSTOM;
                    glyph.spriteFrame = this.atlas.getSpriteFrame('ic-energy');
                    visual.energy = { icon: glyph, number: this.number(surface, 'EnergyQuantity') };
                }
                const energy = visual.energy;
                const place = (symbol: Sprite, amount: Label, y: number, value: number) => {
                    symbol.node.setPosition(-17, y);
                    symbol.node.getComponent(UITransform)!.setContentSize(25, 25);
                    symbol.color = action.caption!.color;
                    amount.node.active = true;
                    amount.node.setPosition(15, y);
                    amount.node.getComponent(UITransform)!.setContentSize(32, 29);
                    amount.string = String(value);
                    amount.color = action.caption!.color;
                };
                place(icon, number, 16, tier.cost);
                place(energy.icon, energy.number, -16, tier.stamina);
                continue;
            }
            const quantity = ['bag', 'camp-deck', 'camp-repair', 'camp-redeem', 'entry-confirm', 'shelter-repair'].indexOf(action.actionId) >= 0
                ? caption.match(/\d+/)?.[0] ?? '' : '';
            const size = surface.getComponent(UITransform)!;
            const pile = action.actionId === 'draw-pile' || action.actionId === 'discard-pile';
            // The illustrated covers carry the pile symbol. Keep the native caption for hover and focus.
            icon.node.active = !pile;
            const width = pile ? size.width : Math.min(size.width, quantity ? 94 : 57);
            if (surface !== action.node && size.width !== width) {
                size.width = width;
                const style = action.getComponent(ButtonPresentation);
                style?.panel?.redraw();
                const ring = style?.focusRing;
                if (ring) { ring.node.getComponent(UITransform)!.width = width + 8; ring.redraw(); }
            }
            const side = visual.painted
                ? Math.min(43, size.height - 2, width - 4)
                : Math.min(pile ? 26 : 31, Math.max(16, size.height - 11), width - 6);
            icon.node.getComponent(UITransform)!.setContentSize(side, side);
            icon.node.setPosition(quantity ? -Math.min(17, width * .2) : 0, pile ? 3 : 0);
            if (visual.shadow) {
                visual.shadow.setContentSize(side + 2, side + 2);
                visual.shadow.node.setPosition(icon.node.position.x, icon.node.position.y - 2);
            }
            number.node.active = !!quantity;
            if (quantity) {
                number.string = quantity;
                number.color = action.caption.color;
                number.node.getComponent(UITransform)!.setContentSize(Math.max(24, width * .45), size.height - 4);
                number.node.setPosition(width * .19, 0);
            }
        }
        if (this.tipOwner && this.tip.active) this.hint(this.tipOwner);
    }

    fitWindow(width: number, height: number): void {
        this.windowWidth = width;
        this.windowHeight = height;
        if (this.tipOwner && this.tip.active) this.hint(this.tipOwner);
    }

    private hint(action: ButtonAction): void {
        const visual = this.visuals.get(action), caption = action.caption?.string;
        if (!visual || !caption || !action.node.activeInHierarchy) return;
        this.tipOwner = action;
        const label = caption.replace(/\s*\n\s*/g, ' · ');
        const width = Math.min(450, Math.max(70, Array.from(label).length * 17 + 26));
        const size = this.root.getComponent(UITransform)!;
        const base = size.convertToNodeSpaceAR(visual.surface.worldPosition);
        const scale = visual.surface.worldScale.y / this.root.worldScale.y;
        const clearance = Math.max(41, visual.surface.getComponent(UITransform)!.height / 2 + 22) * scale;
        const limit = Math.max(0, (this.windowWidth - width * scale) / 2 - 5);
        this.tip.setScale(scale, scale, 1);
        this.tip.setPosition(
            Math.max(-limit, Math.min(limit, base.x)),
            base.y > this.windowHeight / 2 - clearance - 16 * scale ? base.y - clearance : base.y + clearance, 0);
        this.tip.getComponent(UITransform)!.setContentSize(width, 32);
        this.tipText.node.getComponent(UITransform)!.setContentSize(width - 14, 31);
        this.tipText.string = label;
        this.tipPaper.clear();
        this.tipPaper.fillColor = new Color(35, 28, 42, 248);
        this.tipPaper.strokeColor = new Color(173, 139, 111);
        this.tipPaper.lineWidth = 1;
        this.tipPaper.roundRect(-width / 2, -16, width, 32, 5);
        this.tipPaper.fill();
        this.tipPaper.stroke();
        this.tip.active = true;
    }
    private hide(action: ButtonAction): void {
        if (this.tipOwner !== action) return;
        this.tipOwner = null;
        this.tip.active = false;
    }
}
