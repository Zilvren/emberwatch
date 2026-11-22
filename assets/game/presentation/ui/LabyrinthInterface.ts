import { Color, JsonAsset, Label, Node, SpriteFrame } from 'cc';
import { SceneAtmosphere } from '../effects/SceneAtmosphere';
import { DeckStackGraphic } from '../primitives/DeckStackGraphic';
import { FieldPanel } from '../primitives/FieldPanel';
import { GraphicShape, ShapeGraphic } from '../primitives/ShapeGraphic';
import { PaperPanel } from '../primitives/PaperPanel';
import { SceneShade } from '../primitives/SceneShade';
import { ButtonAction } from './ButtonAction';
import { ButtonPresentation } from './ButtonPresentation';
import { CommonPanel } from './CommonPanel';
import type { SceneBindings } from './GameView';
import { StatusBar } from './StatusBar';

export function installLabyrinthInterface(
    scene: SceneBindings,
    theme: JsonAsset,
    shelter: SpriteFrame | null,
    cardBack: SpriteFrame | null
): void {
    const palette = theme.json.colors;
    const color = (hex: string) => new Color().fromHEX(hex);
    const paint = (root: Node) => {
        for (const label of root.getComponentsInChildren(Label)) {
            label.color = color(palette.ink);
            label.outlineColor = new Color(27, 20, 31, 225);
        }
        for (const panel of root.getComponentsInChildren(PaperPanel)) {
            panel.fill = color(palette.paper);
            panel.line = color(palette.line);
            panel.innerLine = color(palette.lineSoft);
            panel.metalTrim = true;
            panel.corner = 8;
            panel.redraw();
        }
        for (const panel of root.getComponentsInChildren(FieldPanel)) {
            panel.fill = color(palette.paper);
            panel.line = color(palette.line);
            panel.accent = color(palette.ochre);
            panel.redraw();
        }
        for (const button of root.getComponentsInChildren(ButtonPresentation)) {
            button.theme = theme;
            button.setDarkSurface(true);
        }
        for (const panel of root.getComponentsInChildren(CommonPanel)) {
            panel.theme = theme;
            if (panel.title) panel.title.fontSize = 27;
        }
        for (const graph of root.getComponentsInChildren(ShapeGraphic)) {
            const name = graph.node.name;
            if (!/shade|backdrop|scrim|^plate$|^panel$|wash|meter|track|gauge/i.test(name)) continue;
            const opacity = graph.fill.a;
            graph.fill = color(/shade|backdrop|scrim|wash/i.test(name) ? '#1b1622' : palette.paper);
            graph.fill.a = opacity;
            if (graph.shape !== GraphicShape.Tiles) graph.redraw();
        }
        for (const stack of root.getComponentsInChildren(DeckStackGraphic))
            if (cardBack) stack.setPaintedBack(cardBack);
    };
    paint(scene.hud);
    for (const key of Object.keys(scene.screens)) {
        const screen = scene.screens[key];
        if (key !== 'camp') paint(screen);
        for (const shade of screen.getComponentsInChildren(SceneShade)) {
            shade.top = 0;
            shade.redraw();
        }
    }
    for (const key of Object.keys(scene.popups)) {
        if (key !== 'camp-station') paint(scene.popups[key]);
    }
    const status = scene.hud.getComponent(StatusBar);
    if (status) status.theme = theme;
    for (const key of Object.keys(scene.screens)) {
        const screen = scene.screens[key];
        if (screen === scene.screens.battle) continue;
        const atmosphere = screen.getComponentInChildren(SceneAtmosphere);
        if (atmosphere) atmosphere.labyrinthBackdrop = shelter;
    }
    for (const button of scene.screens.battle.getComponentsInChildren(ButtonAction))
        if (button.actionId === 'end-turn')
            button.node.getComponent(ButtonPresentation)?.resize(150, 60);
}
