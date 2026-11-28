import {
    _decorator,
    Animation,
    AnimationClip,
    Color,
    Component,
    instantiate,
    JsonAsset,
    Label,
    Mask,
    Node,
    Prefab,
    ScrollView,
    Sprite,
    SpriteAtlas,
    SpriteFrame,
    UITransform,
} from 'cc';
import { CARD, CardDefinition, CardKind, titleColor } from '../../core/content/CardCatalog';
import { PaperPanel } from '../primitives/PaperPanel';
import { SupplyCardFace } from './SupplyCardFace';
import { CardDisplayModel, type CardViewOptions, cardReferenceViewModel, cardViewModel } from './CardViewModel';
import type { CardDesignReference } from './CardDesignReference';
const { ccclass, property } = _decorator;
@ccclass('CardPresentation')
export class CardPresentation extends Component {
    @property(Label) costLabel: Label | null = null;
    @property(Label) costUnitLabel: Label | null = null;
    @property(Node) costBadge: Node | null = null;
    @property({ type: [Label] }) keywordLabels: Label[] = [];
    @property({ type: [Node] }) keywordPlates: Node[] = [];
    @property(Label) titleLabel: Label | null = null;
    @property(Label) descriptionLabel: Label | null = null;
    @property(Label) effectLabel: Label | null = null;
    @property(Label) typeLabel: Label | null = null;
    @property(Label) statusLabel: Label | null = null;
    @property(Label) weightLabel: Label | null = null;
    @property(Sprite) artwork: Sprite | null = null;
    @property(SpriteAtlas) labyrinthArt: SpriteAtlas | null = null;
    @property(JsonAsset) labyrinthTheme: JsonAsset | null = null;
    private fieldFace = false;
    @property(Node) disabledOverlay: Node | null = null;
    @property(Node) visualRoot: Node | null = null;
    @property(Node) selectionOutline: Node | null = null;
    @property(PaperPanel) panel: PaperPanel | null = null;
    @property(JsonAsset) theme: JsonAsset | null = null;
    @property(Node) frontContent: Node | null = null;
    @property(Prefab) supplyFacePrefab: Prefab | null = null;
    private supplyFace: SupplyCardFace | null = null;
    @property(Node) detailsViewport: Node | null = null;
    @property(Label) detailsLabel: Label | null = null;
    @property({
        tooltip: 'Battle hand: emphasize cost, title and effect; full metadata stays in readers.',
    })
    compact = false;
    @property({
        type: [SpriteFrame],
        tooltip: '基础攻击、基础躲避、菜刀、强化躲避、修复、重击、挥砍、现金',
    })
    illustrations: SpriteFrame[] = [];
    @property(AnimationClip) drawClip: AnimationClip | null = null;
    @property(AnimationClip) playClip: AnimationClip | null = null;
    @property(Color) normalText = new Color(105, 83, 77, 255);
    @property(Color) blockedText = new Color(144, 73, 62, 255);
    cardId = '';
    kind: CardKind = 'attack';
    private impact: (() => void) | null = null;
    private complete: (() => void) | null = null;
    private blocked = '';
    private hovered = false;
    private selected = false;
    private rageReady = false;
    private caption = '';
    expanded = false;
    onLoad(): void {
        this.getComponent(Animation)?.on(Animation.EventType.FINISHED, this.finished, this);
        if (this.detailsViewport && this.detailsLabel) {
            this.detailsViewport.getComponent(Mask) ?? this.detailsViewport.addComponent(Mask);
            const scroll =
                this.detailsViewport.getComponent(ScrollView) ??
                this.detailsViewport.addComponent(ScrollView);
            scroll.content = this.detailsLabel.node;
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.elastic = false;
            this.detailsLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
        }
        if (this.labyrinthArt && this.labyrinthTheme) this.layoutPaintedFace();
    }
    onDestroy(): void {
        this.getComponent(Animation)?.off(Animation.EventType.FINISHED, this.finished, this);
    }
    configure(
        kind: CardKind,
        blocked = '',
        caption = '点击 / 拖动',
        id = '',
        definitions: Readonly<Record<string, CardDefinition>> = CARD,
        costUnit = '物资',
        options: CardViewOptions = {}
    ): void {
        this.fieldFace = !!options.field;
        this.rageReady = !!options.rageReady;
        this.showModel(
            cardViewModel(definitions[kind], definitions, costUnit, options),
            blocked,
            caption,
            id
        );
    }
    configureReference(
        data: CardDesignReference,
        blocked = '',
        caption = '点击 / 拖动',
        id = ''
    ): void {
        this.fieldFace = false;
        this.rageReady = false;
        this.showModel(cardReferenceViewModel(data), blocked, caption, id);
    }
    private showModel(model: CardDisplayModel, blocked: string, caption: string, id: string): void {
        const material = this.labyrinthTheme?.json ?? this.theme?.json;
        const supply = model.supplyWeight !== undefined;
        if (supply && !this.supplyFace && this.supplyFacePrefab && this.visualRoot) {
            const node = instantiate(this.supplyFacePrefab);
            node.parent = this.visualRoot;
            const paper = this.panel!.getComponent(UITransform)!;
            const face = node.getComponent(UITransform)!;
            node.setScale(paper.width / face.width, paper.height / face.height, 1);
            this.supplyFace = node.getComponent(SupplyCardFace)!;
        }
        if (this.supplyFace) this.supplyFace.node.active = supply;
        const separateFace = !!this.supplyFace?.node.active;
        const footer = this.visualRoot?.getChildByName('FooterRule');
        if (footer) footer.active = !separateFace;
        if (this.titleLabel) this.titleLabel.node.active = !separateFace;
        if (this.statusLabel) this.statusLabel.node.active = !separateFace;
        this.kind = model.id;
        this.cardId = id;
        this.blocked = blocked;
        this.caption =
            model.longDescription && caption === '点击 / 拖动' ? '长按查看说明' : caption;
        this.setExpanded(false);
        if (this.detailsLabel) this.detailsLabel.string = model.fullDescription;
        if (this.costLabel) this.costLabel.string = model.cost;
        if (this.costUnitLabel) this.costUnitLabel.string = model.costUnit;
        if (this.costBadge) this.costBadge.active = model.showCost;
        if (this.titleLabel) {
            this.titleLabel.string = model.displayTitle;
            this.titleLabel.color = new Color().fromHEX(material?.colors.ink ?? '#454238');
        }
        if (this.typeLabel) {
            this.typeLabel.string = model.tag;
            this.typeLabel.color = new Color().fromHEX(
                material?.card.typeText ?? titleColor(model.accent)
            );
        }
        if (this.effectLabel) {
            this.effectLabel.string = model.effect;
            if (this.labyrinthTheme) this.effectLabel.color = new Color().fromHEX('#ead3b5');
        }
        if (this.descriptionLabel) {
            this.descriptionLabel.string = this.effectLabel
                ? model.description
                : model.effect + (model.description ? '\n' + model.description : '');
            this.descriptionLabel.overflow = Label.Overflow.SHRINK;
        }
        if (this.statusLabel) {
            this.statusLabel.string = blocked || this.caption;
            this.statusLabel.color = blocked ? this.blockedText : this.normalText;
        }
        if (this.weightLabel) this.weightLabel.string = model.weight;
        if (this.artwork)
            this.artwork.spriteFrame =
                this.labyrinthArt?.getSpriteFrame(model.artKey ?? model.id) ??
                this.labyrinthArt?.getSpriteFrame(model.art) ??
                this.illustrations[model.artIndex] ??
                this.illustrations[2];
        this.showKeywords(
            this.compact || this.labyrinthTheme
                ? model.keywords.filter(
                      (word) => word === '可作为合成材料' || word === '已有搭配 · 缺此材料' ||
                          word === '拳流派' || word === '本场临时' || word === '连击'
                  )
                : model.keywords
        );
        if (separateFace) this.supplyFace!.show(model, this.artwork?.spriteFrame ?? null, blocked);
        if (this.typeLabel) this.typeLabel.node.active = !separateFace && !this.compact;
        if (this.weightLabel) this.weightLabel.node.active = !this.compact && !!model.weight;
        if (this.disabledOverlay) this.disabledOverlay.active = !!blocked;
        this.applyAppearance();
    }
    private layoutPaintedFace(): void {
        const panel = this.panel, size = panel?.getComponent(UITransform);
        const palette = this.labyrinthTheme!.json.colors;
        if (!panel || !size) return;
        panel.metalTrim = true;
        panel.lineWidth = 1.2;
        panel.corner = 8;
        panel.innerLine = new Color().fromHEX('#62506a');
        const place = (node: Node | undefined, x: number, y: number, w: number, h: number) => {
            node?.setPosition(x, y, 0);
            node?.getComponent(UITransform)?.setContentSize(w, h);
        };
        const w = size.width, h = size.height;
        if (this.artwork) {
            this.artwork.sizeMode = Sprite.SizeMode.CUSTOM;
            place(this.artwork.node, 0, h * .107, w - 16, h * .414);
            place(this.disabledOverlay ?? undefined, 0, h * .107, w - 16, h * .414);
        }
        place(this.frontContent?.getChildByName('EffectRule') ?? undefined, 0, -h * .111, w - 22, 1);
        place(this.frontContent?.getChildByName('FooterRule') ?? undefined, 0, -h * .406, w - 22, 1);
        place(this.effectLabel?.node, 0, -h * .183, w - 23, h * .134);
        place(this.descriptionLabel?.node, 0, -h * .322, w - 24, h * .14);
        this.normalText = new Color().fromHEX(palette.muted);
        this.blockedText = new Color().fromHEX(palette.danger);
        for (const label of [this.descriptionLabel, this.detailsLabel, this.costUnitLabel, this.weightLabel])
            if (label) label.color = this.normalText;
        const cost = this.costBadge?.getComponent(PaperPanel) ?? this.costBadge?.getComponentInChildren(PaperPanel);
        if (cost && cost !== panel) {
            cost.fill = new Color().fromHEX('#19151f');
            cost.line = new Color().fromHEX('#8e7467');
            cost.corner = 6;
            cost.redraw();
        }
    }
    private showKeywords(keywords: string[]): void {
        const shown =
            keywords.length > 3 ? [keywords[0], keywords[1], `+${keywords.length - 2}`] : keywords;
        const size = this.visualRoot?.getComponent(UITransform)?.contentSize;
        const scale = size ? Math.min(size.width / 224, size.height / 340) : 1;
        const widths = shown.map((text) => Math.max(26, text.length * 11 + 12));
        const total =
            widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * 6;
        let left = -total / 2;
        this.keywordLabels.forEach((label, index) => {
            const plate = this.keywordPlates[index];
            if (plate) plate.active = index < shown.length;
            if (index >= shown.length) return;
            label.string = shown[index];
            if (plate) {
                plate.getComponent(UITransform)!.width = widths[index] * scale;
                plate.setPosition((left + widths[index] / 2) * scale, -24 * scale);
                label.node.getComponent(UITransform)!.width = (widths[index] - 6) * scale;
            }
            left += widths[index] + 6;
        });
    }
    setHovered(value: boolean): void {
        if (this.hovered !== value) {
            this.hovered = value;
            this.applyAppearance();
        }
    }
    setSelected(value: boolean): void {
        if (this.selected !== value) {
            this.selected = value;
            this.applyAppearance();
        }
    }
    setExpanded(value: boolean, expandedHint = '点击收起说明'): void {
        const changed = this.expanded !== value;
        this.expanded = value;
        const supply = !!this.supplyFace?.node.active;
        if (this.frontContent) this.frontContent.active = !supply && !value;
        if (this.detailsViewport) this.detailsViewport.active = !supply && value;
        if (changed && value && !supply && this.detailsLabel && this.detailsViewport) {
            this.detailsViewport.getComponent(ScrollView)?.stopAutoScroll();
            this.detailsLabel.node.setPosition(
                0,
                this.detailsViewport.getComponent(UITransform)!.height / 2
            );
        }
        if (this.statusLabel)
            this.statusLabel.string = this.blocked || (value ? expandedHint : this.caption);
        if (changed) this.node.emit('card-expanded', value);
    }
    inspect(): object {
        return {
            kind: this.kind,
            hovered: this.hovered,
            selected: this.selected,
            blocked: this.blocked,
            expanded: this.expanded,
            title: this.titleLabel?.string,
            cost: this.costLabel?.string,
            costUnit: this.costUnitLabel?.string,
            costVisible: this.costBadge?.active,
            keywords: this.keywordLabels
                .filter((label) => label.node.parent?.active)
                .map((label) => label.string),
            effect: this.effectLabel?.string,
            weight: this.supplyFace?.node.active ? this.supplyFace.weight.string : this.weightLabel?.string,
            illustration: this.artwork?.spriteFrame?.name,
            fullDescription: this.detailsLabel?.string,
            detailsHeight: this.detailsLabel?.node.getComponent(UITransform)?.height,
            detailY: this.detailsLabel?.node.position.y,
            visualY: this.visualRoot?.position.y,
            visualScale: this.visualRoot?.scale.x,
            readableFont: this.detailsLabel
                ? this.detailsLabel.actualFontSize * this.detailsLabel.node.worldScale.x
                : 0,
            titleFontSize: this.titleLabel?.actualFontSize,
            costFontSize: this.costLabel?.actualFontSize,
            effectFontSize: this.effectLabel?.actualFontSize,
            compact: this.compact,
        };
    }
    private applyAppearance(): void {
        const colors = (this.labyrinthTheme ?? this.theme)?.json.colors;
        if (this.panel) {
            if (this.labyrinthTheme) {
                this.panel.fill = new Color().fromHEX(this.selected && !this.blocked ? colors.paperSelected : colors.paper);
                this.panel.line = new Color().fromHEX(this.rageReady ? '#b44f45' : this.selected || this.hovered ? colors.ochre : colors.line);
                this.panel.fieldStock = false;
                this.panel.redraw();
            } else {
            this.panel.fill = new Color().fromHEX(
                this.selected && !this.blocked
                    ? this.fieldFace
                        ? '#C9DECA'
                        : (colors?.paperSelected ?? '#ece0ca')
                    : this.fieldFace
                      ? '#D8D3C0'
                      : (colors?.paper ?? '#f2eadb')
            );
            this.panel.line = new Color().fromHEX(
                this.rageReady
                    ? '#b44f45'
                    : this.blocked
                      ? (colors?.lineSoft ?? '#b3a68e')
                      : this.hovered
                      ? (colors?.ochre ?? '#bb9b6d')
                      : this.fieldFace
                        ? '#333941'
                        : (colors?.line ?? '#6f6757')
            );
            this.panel.fieldStock = this.fieldFace;
            this.panel.redraw();
            }
        }
        if (this.costLabel)
            this.costLabel.color = new Color().fromHEX(
                this.blocked ? (colors?.danger ?? '#9a6455') : (colors?.ink ?? '#454238')
            );
        if (this.selectionOutline) this.selectionOutline.active = !this.labyrinthTheme && this.selected && !this.blocked;
    }
    playDraw(reduced: boolean): void {
        if (!reduced && this.drawClip) this.play(this.drawClip);
    }
    playAction(impact: () => void, complete: () => void, reduced: boolean): void {
        if (reduced || !this.playClip) {
            impact();
            complete();
            return;
        }
        this.impact = impact;
        this.complete = complete;
        this.play(this.playClip);
    }
    private play(clip: AnimationClip): void {
        const a = this.getComponent(Animation) ?? this.addComponent(Animation);
        if (!a.getState(clip.name)) a.addClip(clip);
        a.play(clip.name);
    }
    notifyImpact(): void {
        const callback = this.impact;
        this.impact = null;
        callback?.();
    }
    private finished(): void {
        if (!this.complete) return;
        this.notifyImpact();
        const callback = this.complete;
        this.complete = null;
        callback();
    }
}
