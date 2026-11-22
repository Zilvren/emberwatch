"""Make the right-profile card flick rig from existing production artwork."""
from pathlib import Path
import json
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.interpolate import PchipInterpolator


ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "art-source/ashen-labyrinth/battle-survivor"
PROJECT = ART / "spine-flick"
ANCHOR = np.array((199, 919))
ELBOW = np.array((239, 280))
WRIST = np.array((246, 187))
ART_ELBOW = np.array((106, 61))
ART_WRIST = np.array((152, 202))
PALM_WRIST = np.array((333, 222))
INDEX_JOINT = np.array((378.5, 199.5))
INDEX_TIP = np.array((412, 198.5))
HAND_SCALE = 0.82
RELEASE = 0.44
END = 1.20

LOWERED_ARM = [
    (146,354), (154,344), (172,335), (189,328), (204,329), (211,344),
    (214,368), (212,387), (213,411), (218,438), (223,459), (225,479),
    (229,503), (229,527), (225,539), (214,548), (194,550), (183,543),
    (182,515), (181,485), (176,461), (171,441), (165,417), (160,405),
    (153,393), (146,381), (143,367),
]
UPPER_ARM = [
    (165,275), (185,263), (208,250), (225,242), (231,247), (238,256),
    (248,266), (269,270), (272,282), (268,296), (260,308), (243,310),
    (225,308), (209,303), (192,295), (178,287), (168,280),
]
SUPPORT = [
    (197,322), (201,307), (210,296), (221,303), (230,306), (244,301),
    (256,302), (269,301), (278,302), (287,316), (290,330), (282,344),
    (266,352), (251,351), (237,347), (220,344), (207,334),
]
PALM = [
    (324,210), (340,199), (357,189), (379,193), (383,200), (383,207),
    (389,210), (390,226), (376,237), (364,240), (350,239), (337,236), (331,229),
]
INDEX = [
    (370,192), (389,191), (414,193), (416,200), (411,207),
    (389,208), (377,204), (372,202),
]
BRACER = [
    (64,54), (96,45), (126,43), (143,46), (150,58), (146,75),
    (146,94), (149,115), (155,134), (160,145), (154,155), (157,168),
    (160,183), (167,195), (172,214), (166,224), (148,227), (139,215),
    (128,206), (113,202), (106,190), (103,174), (96,160), (91,145),
    (87,131), (80,114), (75,101), (70,87), (66,74), (59,63),
]

# Pixel coordinates in the right-profile base. Values are clockwise angles.
FOREARM_MOTION = [
    (0,0), (0.12,0), (0.22,15), (0.32,35), (0.40,40), (RELEASE,48),
    (0.51,62), (0.59,58), (0.73,38), (0.89,10), (1.02,0), (END,0),
]
HAND_MOTION = [
    (0,-88), (0.12,-88), (0.24,-54), (0.34,-26), (0.40,-16), (RELEASE,0),
    (0.52,22), (0.60,26), (0.73,-14), (0.89,-69), (1.02,-88), (END,-88),
]
INDEX_MOTION = [
    (0,105), (0.19,105), (0.31,77), (0.40,82), (RELEASE,0),
    (0.48,15), (0.55,67), (0.65,101), (1.02,105), (END,105),
]
CARD_CENTRES = {"lantern": (312,316), "guard": (395,213), "repel": (439,142)}


def rgba(path):
    with Image.open(path) as image:
        return image.convert("RGBA")


def matte(size, points, feather):
    grid = Image.new("L", (size[0] * 3, size[1] * 3))
    ImageDraw.Draw(grid).polygon([(3*x, 3*y) for x, y in points], fill=255)
    return grid.resize(size, Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(feather))


def part(image, points, feather):
    result = image.copy()
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint16)
    mask = np.asarray(matte(image.size, points, feather), dtype=np.uint16)
    result.putalpha(Image.fromarray(((alpha * mask + 127) // 255).astype(np.uint8)))
    return result


def rotation(degrees):
    angle = math.radians(float(degrees))
    return np.array(((math.cos(angle), -math.sin(angle)), (math.sin(angle), math.cos(angle))))


def angle(vector):
    return math.degrees(math.atan2(float(vector[1]), float(vector[0])))


def spine_position(pixels):
    return (np.asarray(pixels) - ANCHOR) * (1, -1)


def num(value):
    return round(float(value), 6)


class Skeleton:
    def __init__(self, images):
        self.images = images
        self.bones = []
        self.setup = {}
        self.slots = []
        self.attachments = {}

    def bone(self, name, position, degrees=0, parent=None, length=0):
        origin = spine_position(position)
        fields = {"name": name}
        if parent:
            parent_origin, parent_angle = self.setup[parent]
            x, y = rotation(-parent_angle) @ (origin - parent_origin)
            fields.update(parent=parent, x=num(x), y=num(y), rotation=num(degrees - parent_angle))
        if length:
            fields["length"] = num(length)
        self.bones.append(fields)
        self.setup[name] = origin, degrees

    def region(self, name, bone, image, pivot=(0, 0), position=(0, 0), clockwise=0, scale=1):
        alpha = image.getchannel("A")
        bounds = alpha.getbbox()
        if bounds is None:
            raise ValueError(f"Empty image for slot {name}")
        left, top, right, bottom = bounds
        center = np.array(((left + right) / 2, (top + bottom) / 2))
        origin, bone_angle = self.setup[bone]
        placed = np.asarray(position) + rotation(clockwise) @ ((center - pivot) * scale)
        x, y = rotation(-bone_angle) @ (spine_position(placed) - origin)
        region = image.crop(bounds)
        region.save(self.images / (name + ".png"), optimize=True)
        self.slots.append({"name": name, "bone": bone, "attachment": name})
        self.attachments[name] = {name: {
            "x": num(x), "y": num(y), "rotation": num(-clockwise - bone_angle),
            "scaleX": num(scale), "scaleY": num(scale), "width": region.width, "height": region.height,
        }}


def rotation_keys(times, value, slope):
    """Write cubic Hermite samples as editable Spine 3.8 Bezier keys."""
    times = sorted(set(times))
    for start, finish in zip(times[:], times[1:]):
        middle = (start + finish) / 2
        if abs(value(finish) - value(start)) < .0001 and abs(value(middle) - value(start)) > .015:
            times.append(middle)
    times.sort()
    result = [{"time": num(t), "angle": num(value(t))} for t in times]
    for key, t0, t1 in zip(result, times, times[1:]):
        delta = value(t1) - value(t0)
        if abs(delta) < .0001:
            continue
        third = (t1 - t0) / 3
        key.update(curve=1 / 3, c2=num(slope(t0) * third / delta),
                   c3=2 / 3, c4=num(1 - slope(t1) * third / delta))
    return result


def flick_tracks():
    forearm, wrist, index = (PchipInterpolator(*zip(*motion))
                             for motion in (FOREARM_MOTION, HAND_MOTION, INDEX_MOTION))
    forearm_rate, wrist_rate, index_rate = (curve.derivative() for curve in (forearm, wrist, index))
    return {
        "right-forearm": {"rotate": rotation_keys(forearm.x, lambda t: -forearm(t), lambda t: -forearm_rate(t))},
        "right-hand": {"rotate": rotation_keys([*forearm.x, *wrist.x],
                         lambda t: forearm(t) - wrist(t) - 88,
                         lambda t: forearm_rate(t) - wrist_rate(t))},
        "right-index": {"rotate": rotation_keys(index.x, lambda t: 105 - index(t), lambda t: -index_rate(t))},
        "guard-card": {
            "translate": [
                {"time": 0, "x": 0, "y": 0}, {"time": .26, "x": 0, "y": 0},
                {"time": RELEASE, "x": 0, "y": 8}, {"time": .69, "x": 130, "y": -13},
            ],
            "rotate": [{"time": 0, "angle": 0}, {"time": RELEASE, "angle": 0}, {"time": .69, "angle": 95}],
        },
    }


def prepare():
    images = PROJECT / "parts"
    PROJECT.mkdir()
    images.mkdir()
    profile = rgba(ART / "frames/source/profile.png")
    torso_pose = rgba(ART / "frames/cels/think.png")
    hand_pose = rgba(ART / "frames/cels/touch-middle.png")
    bracer = rgba(ART / "spine/parts/near-bracer.png")
    repaired = Image.composite(torso_pose, profile, matte(profile.size, LOWERED_ARM, 2.2))
    # Split at the neck so the original face can occlude the knuckles via draw order.
    body = repaired.copy()
    body.paste((0, 0, 0, 0), (0, 0, body.width, 153))
    head = profile.copy()
    head.paste((0, 0, 0, 0), (0, 153, head.width, head.height))

    rig = Skeleton(images)
    shoulder = np.array((192, 263))
    shoulder_angle = -angle(ELBOW - shoulder)
    forearm_angle = -angle(WRIST - ELBOW)
    hand_setup = HAND_MOTION[0][1]
    folded_index = hand_setup + INDEX_MOTION[0][1]
    index_position = WRIST + rotation(hand_setup) @ ((INDEX_JOINT - PALM_WRIST) * HAND_SCALE)
    tip_position = index_position + rotation(folded_index) @ ((INDEX_TIP - INDEX_JOINT) * HAND_SCALE)
    index_axis = -folded_index - angle(INDEX_TIP - INDEX_JOINT)

    rig.bone("root", ANCHOR)
    rig.bone("torso", (199, 360), parent="root", length=150)
    rig.bone("head", (198, 152), parent="torso", length=70)
    rig.bone("left-support", (266, 326), 169, "torso", 45)
    rig.bone("right-upper-arm", shoulder, shoulder_angle, "torso", np.linalg.norm(ELBOW - shoulder))
    rig.bone("right-forearm", ELBOW, forearm_angle, "right-upper-arm", np.linalg.norm(WRIST - ELBOW))
    rig.bone("right-hand", WRIST, -hand_setup - angle(INDEX_JOINT - PALM_WRIST), "right-forearm",
             np.linalg.norm(INDEX_JOINT - PALM_WRIST) * HAND_SCALE)
    rig.bone("right-index", index_position, index_axis, "right-hand",
             np.linalg.norm(INDEX_TIP - INDEX_JOINT) * HAND_SCALE)
    rig.bone("index-tip", tip_position, index_axis, "right-index")
    for name, center in CARD_CENTRES.items():
        rig.bone(name + "-card", center, parent="root")

    rig.region("torso", "torso", body)
    ratio = np.linalg.norm(WRIST - ELBOW) / np.linalg.norm(ART_WRIST - ART_ELBOW)
    rig.region("right-bracer", "right-forearm", part(bracer, BRACER, 1.25),
               ART_ELBOW, ELBOW, angle(WRIST - ELBOW) - angle(ART_WRIST - ART_ELBOW), ratio)
    rig.region("right-sleeve", "right-upper-arm", part(torso_pose, UPPER_ARM, 1.2))
    rig.region("right-index", "right-index", part(hand_pose, INDEX, .45),
               INDEX_JOINT, index_position, folded_index, HAND_SCALE)
    rig.region("right-palm", "right-hand", part(hand_pose, PALM, .6),
               PALM_WRIST, WRIST, hand_setup, HAND_SCALE)
    rig.region("left-hand-support", "left-support", part(torso_pose, SUPPORT, .8))
    rig.region("head", "head", head)

    props = rgba(ROOT / "assets/ashen-survivor-frames/survivor-props.png")
    for offset, (name, center) in enumerate(CARD_CENTRES.items()):
        x = 2 + offset * 100
        region = props.crop((x, 2, x + 96, 138)).resize((32, 45), Image.Resampling.LANCZOS)
        clockwise = {"lantern": -12, "repel": 10}.get(name, 0)
        rig.region(name, name + "-card", region, (16, 22.5), center, clockwise)

    payload = {
        "skeleton": {"spine": "3.8.75", "width": 576, "height": 944, "images": "./parts/"},
        "bones": rig.bones, "slots": rig.slots, "skins": [{"name": "default", "attachments": rig.attachments}],
        "events": {"release": {"string": "guard"}},
        "animations": {
            "think": {"slots": {"guard": {"attachment": [{"time": 0, "name": "guard"}]}}},
            "guard-flick": {"bones": flick_tracks(),
                "slots": {"guard": {"attachment": [{"time": 0, "name": "guard"}, {"time": .69, "name": None}]}},
                "events": [{"time": RELEASE, "name": "release"}]},
        },
    }
    out = PROJECT / "survivor-flick.authoring.json"
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"file": str(out), "bones": len(rig.bones), "slots": len(rig.slots)}))


if __name__ == "__main__":
    prepare()
