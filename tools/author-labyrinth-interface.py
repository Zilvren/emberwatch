"""Slice the painted illustration sheets for both Cocos and the card editor."""
import json
import plistlib
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-source/ashen-labyrinth/interface"
DEST = ROOT / "assets/ashen-labyrinth/interface"
SHEETS = {
    "foundations": "lab_press lab_step lab_anchor lab_screen lab_cell lab_open lab_bypass lab_probe lab_damper",
    "calibration": "lab_pulse lab_test_hit lab_crust lab_loop_box lab_reading lab_relief lab_valve lab_calibration lab_bracelet",
    "defer": "lab_vent lab_opening lab_steady lab_clip lab_return_shield knife repair cash slash",
}
ALIASES = {
    "attack": "lab_press", "dodge": "lab_step", "heavy": "lab_anchor", "evade": "lab_screen",
    "follow_up": "lab_opening", "shield_push": "lab_return_shield",
    "scrap_shiv": "lab_test_hit", "rummage": "lab_open",
}


def images():
    n, w, h = 0, 184, 132
    step_x, step_y = w + 4, h + 4
    atlas = Image.new("RGB", (step_x * 6, step_y * 5), "#252230")
    rects = {}
    for sheet, ids in SHEETS.items():
        with Image.open(SOURCE / f"cards-{sheet}.png") as source:
            for i, card in enumerate(ids.split()):
                left, top = i % 3 * source.width / 3, i // 3 * source.height / 3
                tile = source.crop((round(left + 2), round(top + 2),
                                    round(left + source.width / 3 - 2), round(top + source.height / 3 - 2)))
                x, y = n % 6 * step_x + 2, n // 6 * step_y + 2
                atlas.paste(ImageOps.fit(tile, (w, h), Image.Resampling.LANCZOS), (x, y))
                rects[card] = [x, y, w, h]
                n += 1
    atlas.save(DEST / "illustrations.png", optimize=True)
    for name, parent in ALIASES.items():
        rects[name] = rects[parent]
    coordinates = {name: {
        "frame": f"{{{{{x},{y}}},{{{width},{height}}}}}", "offset": "{0,0}", "rotated": False,
        "sourceSize": f"{{{width},{height}}}",
    } for name, (x, y, width, height) in rects.items()}
    with (DEST / "illustrations.plist").open("wb") as handle:
        plistlib.dump({"frames": coordinates, "metadata": {
            "format": 2, "textureFileName": "illustrations.png",
            "size": f"{{{atlas.width},{atlas.height}}}",
        }}, handle, sort_keys=False)
    (DEST / "illustrations.json").write_text(json.dumps({
        "width": atlas.width, "height": atlas.height, "cards": rects,
    }, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    DEST.mkdir(parents=True, exist_ok=True)
    images()
    with Image.open(SOURCE / "two-doors-back.png") as source:
        back = source.convert("RGBA").crop((20, 26, source.width - 20, source.height - 26))
        back.resize((170, 256), Image.Resampling.LANCZOS).save(DEST / "card-back.png", optimize=True)
    with Image.open(SOURCE / "labyrinth-shelter.png") as source:
        ImageOps.fit(source.convert("RGB"), (1440, 900), Image.Resampling.LANCZOS).save(
            DEST / "shelter.jpg", quality=92, optimize=True)
