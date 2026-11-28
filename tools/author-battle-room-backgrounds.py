"""Export the opaque room paintings for Pink. Run explicitly after changing a source PNG."""
import json
import uuid
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source/ashen-labyrinth/battle-bestiary/backgrounds/rooms'
DEST = ROOT / 'assets/resources/art/battle-rooms'


def export_room(source, image_import_version):
    target = DEST / (source.stem + '.jpg')
    with Image.open(source) as painting:
        if 'A' in painting.getbands() and painting.getchannel('A').getextrema()[0] != 255:
            raise ValueError(f'{source.name} must cover the entire frame')
        painting.convert('RGB').save(target, quality=92, subsampling=0, optimize=True)

    # Select the SpriteFrame importer on first creation. Pink fills in its texture and frame subassets.
    meta = Path(str(target) + '.meta')
    if not meta.exists():
        meta.write_text(json.dumps({
            'ver': image_import_version, 'importer': 'image', 'imported': False,
            'uuid': str(uuid.uuid4()), 'files': [], 'subMetas': {},
            'userData': {'type': 'sprite-frame', 'hasAlpha': False, 'fixAlphaTransparencyArtifacts': False},
        }, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    DEST.mkdir(parents=True, exist_ok=True)
    original = ROOT / 'assets/ashen-labyrinth/sunken-lamp-court.png.meta'
    version = json.loads(original.read_text(encoding='utf-8'))['ver']
    for source in sorted(SOURCE.glob('*.png')):
        export_room(source, version)
