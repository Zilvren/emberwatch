"""Painted three-quarter Spine performance on the survivor's existing full-body rig."""
import argparse
import copy
import hashlib
import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import PchipInterpolator

from quarter_skin import (
    ROOT, CHARACTER, PROJECT, SCALE, ORIGIN, MountedSkin, build_skin,
    RIGHT_ELBOW, RIGHT_WRIST, RIGHT_KNUCKLE, LEFT_ELBOW, LEFT_WRIST,
    glove_contact, release_hand, rotation, world,
)


from three_quarter_body import (
    MAG as BODY_SCALE, OFFSET as BODY_OFFSET, RIGHT_SHOULDER, LEFT_SHOULDER, RIGHT_CHEEK_PAD, RIGHT_REST_ANGLE,
    NEAR_HIP, NEAR_KNEE, NEAR_ANKLE,
    FAR_HIP, FAR_KNEE, FAR_ANKLE, NEAR_TOE, FAR_TOE, pin,
)
from turnaround_surfaces import face_vertices


R3 = CHARACTER / "spine"
END = 1.20
RELEASE = .44
TOUCH = .385
DEPARTED = 1.12
THINK = 3.20
RELEASE_WRIST_ANGLE = -9
T = np.array([0,.06,.135,.215,.290,.345,TOUCH,RELEASE,.485,.550,.65,.76,.89,1.055,END])
# Measured in the canvas of the three-quarter drawing. +x is forward, +y is down.
LANDMARKS = {
    "hips":(509,767), "chest":(507,560), "head":(506,260),
    "near-sleeve":RIGHT_SHOULDER, "near-bracer":RIGHT_ELBOW, "near-hand":RIGHT_WRIST,
    "cast-sleeve":LEFT_SHOULDER, "cast-bracer":LEFT_ELBOW, "cast-palm":LEFT_WRIST,
    "near-hip":NEAR_HIP, "near-knee":NEAR_KNEE, "near-ankle":NEAR_ANKLE,
    "far-hip":FAR_HIP, "far-knee":FAR_KNEE, "far-ankle":FAR_ANKLE,
    "right-knuckle":RIGHT_KNUCKLE,
}
CARDS = {
    "lantern":dict(center=(735,521), stroke=(73,-7), width=65, height=93, angle=13),
    "guard":dict(center=(835,416), stroke=(73,-10), width=67, height=95, angle=0),
    "repel":dict(center=(912,300), stroke=(70,-9), width=62, height=88, angle=-15),
}
SLOT_BONES = [
    ("q-far-leg-art","far-thigh"), ("q-near-leg-art","near-thigh"),
    ("q-near-under-sleeve","q-right-upper-ink"),
    ("q-tunic-art","hips"), ("q-left-upper-art","q-left-upper-ink"),
    ("q-mantle-art","mantle"), ("q-satchel-art","ration-bag"), ("q-case-art","card-case"),
    ("q-near-upper-art","q-right-upper-ink"), ("q-near-mantle-art","mantle"),
    ("q-face-art","head"), ("q-head-art","scarf"),
    *((f"float-{n}",f"float-{n}") for n in CARDS), ("q-left-wrap","cast-bracer"),
    ("q-near-arm-art","near-bracer"),
    ("q-left-cup","cast-palm"),
    ("q-near-knuckles-art","near-hand"), ("q-near-fist-art","near-hand"),
]
NEW_BONES = [
    ("q-right-chest","chest"),("q-left-chest","chest"),("q-left-cuff","cast-bracer"),
    ("q-left-upper-ink","cast-sleeve"),("q-right-upper-ink","near-sleeve"),("q-right-cuff","near-bracer"),
    ("right-knuckle","near-hand"),("right-cheek-pad","near-hand"),*((f"contact-{n}","near-hand") for n in CARDS),
    ("rear-toe","near-boot"),*((f"float-{n}","root") for n in CARDS),
]


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save(path, data):
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


def length(vec):
    return float(np.linalg.norm(vec))


def angle(vec):
    return math.degrees(math.atan2(float(vec[1]),float(vec[0])))


def blend(a,b,weight):
    return (1-weight)*np.array(a)+weight*np.array(b)


def smooth(t):
    t=float(np.clip(t,0,1))
    return t*t*(3-2*t)


def target_heading(start,end):
    return angle(world(end)-world(start))


class Frame:
    def __init__(self, xy, heading=0, scale=(1,1)):
        self.p=np.array(xy,dtype=float)
        self.angle=heading
        self.scale=np.array(scale,dtype=float)
        self.m=rotation(heading)*self.scale
        self.inverse=np.diag(1/self.scale)@rotation(-heading)

    def local(self,p):
        return self.inverse@(p-self.p)

    def point(self,p):
        return self.p+self.m@np.asarray(p)


def artpoint(stage):
    return ORIGIN+np.asarray(stage)*[1/SCALE,-1/SCALE]


def path(values):
    return PchipInterpolator(T,np.array(values,dtype=float),axis=0)


class Performance:
    def __init__(self, skeleton):
        self.data=skeleton
        self.bones={b["name"]:b for b in skeleton["bones"]}
        self.motion={
            "hipX":path([0,-.2,-1.2,-2.8,-2.2,-.5,1.4,4.0,4.7,4.1,2,.1,-.6,0,0]),
            "hipY":path([0,.05,.2,.65,.8,.7,.55,.3,.25,.45,.35,.18,.1,0,0]),
            "lean":path([0,-1,-3,-9,-8,-2,8,20,23,20,11,3,-1,0,0]),
            "yaw":path([0,-.3,-1.8,-6,-6,-2,4,13,15,12,6,1,-1.5,0,0]),
            "nod":path([0,.15,.65,1.4,1.1,.6,.1,-1.1,-1.3,-.8,-.2,.3,.2,0,0]),
            "cloth":path([0,0,-.5,-2,-5,-5,-3,0,6,10,8,2,-2,-1,0]),
            "hand":path([RIGHT_REST_ANGLE,RIGHT_REST_ANGLE,143,143,99,53,26,RELEASE_WRIST_ANGLE,
                         -22,-19,14,68,130,RIGHT_REST_ANGLE,RIGHT_REST_ANGLE]),
            "roll":path([1,1,.99,.97,.96,.98,1,1,1,.985,.96,.96,.99,1,1]),
            "give":path([0,.08,.28,.65,.92,1,1,1,1,1,.88,.57,.24,0,0]),
        }
        self.glove=release_hand()

    def paper(self,name,t):
        c=CARDS[name]
        center=np.array(c["center"],dtype=float); roll=c["angle"]
        stroke=np.array(c["stroke"])
        if t<TOUCH:return center,roll,1.,1.
        # A coupled push gives the card its velocity. The derivative at the end
        # of the stroke and the first velocity in free flight are identical.
        s=min(1.,(t-TOUCH)/(RELEASE-TOUCH))
        center+=stroke*s*s
        roll-=4*s*s
        if t<=RELEASE:return center,roll,1.,1.
        dt=t-RELEASE
        travel=5*(-math.expm1(-dt/5))
        center+=2*stroke/(RELEASE-TOUCH)*travel+[0,185*dt*dt]
        roll-=8/(RELEASE-TOUCH)*travel
        sy=1-.35*smooth(dt/.62)
        bank=math.radians(54)*math.sin(math.pi*min(dt/.64,1))
        return center,roll,sy*math.cos(bank),sy

    def edge(self,name,t):
        c=CARDS[name]
        center,rotation_angle,_,_=self.paper(name,t)
        return world(center)+rotation(rotation_angle)@[-c["width"]*SCALE/2-.06,.12*c["height"]*SCALE]

    def brushing_wrist(self,name,t):
        hand_angle=float(self.motion["hand"](t))
        _,paper_angle,_,_=self.paper(name,t)
        pad=glove_contact(self.glove,hand_angle-paper_angle)
        return artpoint(self.edge(name,t)-rotation(hand_angle)@pad)

    def wrist_curve(self, name):
        first=self.brushing_wrist(name,TOUCH)
        last=self.brushing_wrist(name,RELEASE)
        follow=np.array((6,-1) if name=="repel" else (27,-5))
        via=np.array([RIGHT_WRIST,RIGHT_WRIST,(RIGHT_WRIST[0]-15,RIGHT_WRIST[1]+24),(RIGHT_WRIST[0]-20,RIGHT_WRIST[1]+73),
                      first*.36+np.array((484,399))*.64,first+[-50,-24],first,last,
                      last+follow,last+[-11,-17],last*.48+np.array((492,377))*.52,
                      (525,395),(RIGHT_WRIST[0]-8,RIGHT_WRIST[1]+46),RIGHT_WRIST,RIGHT_WRIST],dtype=float)
        return path(via)

    def right_elbow(self,shoulder,wrist,release,name):
        # Project the same two physical segments throughout the roll, with one
        # continuous elbow pole. Switching sides of the chord snaps the elbow.
        upper_max=self.bones["near-sleeve"]["length"]/SCALE
        fore_max=self.bones["near-bracer"]["length"]/SCALE
        start=np.asarray(LANDMARKS["near-sleeve"])
        elbow=np.asarray(RIGHT_ELBOW);hand=np.asarray(RIGHT_WRIST)
        span=length(wrist-shoulder)
        rest=length(hand-start)
        exposed=smooth((span-rest)/(upper_max+fore_max-22-rest))
        u=float(blend(length(elbow-start),.986*upper_max,exposed))
        v=float(blend(length(hand-elbow),.986*fore_max,exposed))
        if span>=u+v:raise ValueError("Move the card inside the real arm span")
        axis=(wrist-shoulder)/span
        normal=np.array((-axis[1],axis[0]))
        along=(span*span+u*u-v*v)/(2*span)
        # As the elbow comes forward, part of its bend is in depth. This
        # preserves a clear lane above the supporting arm without lengthening
        # either physical segment or lifting a foot.
        forward_roll={"lantern":54,"guard":48,"repel":43}[name]
        projected_bend=math.sqrt(max(0,u*u-along*along))*math.cos(math.radians(forward_roll)*release)
        return shoulder+axis*along+normal*projected_bend

    def pose(self,t,name="guard",idle=False):
        v={k:(float(c(0)) if idle else float(c(t))) for k,c in self.motion.items()}
        if idle:
            phase=2*math.pi*t/THINK
            v["hipX"]=.25*math.sin(phase)
            v["hipY"]=-.12*(1-math.cos(phase))
            v["lean"]=2.3*math.sin(phase)
            v["yaw"]=1.6*math.sin(phase)
            v["nod"]=-.65*(1-math.cos(phase))
            v["cloth"]=1.2*math.sin(phase)
        yaw=math.radians(v["yaw"])
        old_hips=np.array(LANDMARKS["hips"],dtype=float)
        hips=old_hips+[v["hipX"],v["hipY"]]
        def bodily(point,z=0,amount=1):
            x,y=point
            height=np.clip((760-y)/402,0,1)
            turn=height*amount
            dx=(x-508)*(math.cos(yaw*turn)-1)+math.sin(yaw*turn)*z
            return np.array((x+v["hipX"]+v["lean"]*height+dx,
                             y+v["hipY"]-4*math.sin(yaw)*turn+(x-508)*.055*math.sin(yaw)*turn))
        target={}
        def anchor(n,p,heading,sc=(1,1)):
            target[n]=Frame(world(p),heading,sc)
        anchor("root",ORIGIN,0)
        anchor("PoseRoot",ORIGIN,0)
        anchor("hips",hips,90-v["lean"]*.085)
        chest=bodily(LANDMARKS["chest"],34)
        anchor("chest",chest,90-v["lean"]*.17)
        head_p=bodily(LANDMARKS["head"],28)
        head_angle=90-v["lean"]*.10+v["nod"]
        anchor("head",head_p,head_angle)
        for n,p,z in [("q-right-chest",(370,421),91),("q-left-chest",(647,410),-76)]:
            anchor(n,bodily(p,z),90-v["lean"]*.16)
        hem=np.array([v["cloth"],v["cloth"]*.41])
        for n,p,z,f in [("mantle",(387,359),83,0),("mantle-tip",(327,518),75,.40),
                        ("coat-skirt",(498,662),28,.10),("coat-skirt-tip",(400,967),18,1.25),
                        ("back-flap",(365,688),-30,.43),("back-flap-tip",(284,1156),-32,1.46)]:
            anchor(n,bodily(p,z)+hem*f,90-v["lean"]*.05+v["cloth"]*.15*f)
        anchor("scarf",bodily((518,278),65),head_angle*.6+(90-v["lean"]*.15)*.4)
        anchor("ration-bag",bodily((365,676),58)+hem*.37,90+v["cloth"]*.29)
        anchor("card-case",bodily((628,650),38),90-v["lean"]*.07)
        for side in ("near","far"):
            thigh,shin,boot=(side+s for s in ("-thigh","-shin","-boot"))
            h=bodily(LANDMARKS[side+"-hip"],54 if side=="near" else -62,.45)
            ankle=np.array(LANDMARKS[side+"-ankle"],dtype=float)
            pivot=np.asarray(NEAR_TOE if side=="near" else FAR_TOE)
            hworld,aworld=world(h),world(ankle)
            old_ankle=np.array(LANDMARKS[side+"-ankle"])
            old_knee=np.array(LANDMARKS[side+"-knee"])
            leg2=self.bones[shin]["length"]
            # Pick the front-facing knee using the exact shin length of the
            # native IK chain. The target is common to the artwork and the engine.
            raw=world(old_knee)-world(old_ankle)
            knee0=world(old_ankle)+raw*(leg2/length(raw))
            l1=length(knee0-world(LANDMARKS[side+"-hip"]))
            delta=aworld-hworld
            span=length(delta)
            chord=(l1*l1-leg2*leg2+span*span)/(2*span)
            along=delta/span
            perp=np.array((-along[1],along[0]))
            neutral=world(old_ankle)-world(LANDMARKS[side+"-hip"])
            pole=1 if np.dot(knee0-world(LANDMARKS[side+"-hip"]),[-neutral[1],neutral[0]])>=0 else -1
            k=hworld+along*chord+pole*perp*math.sqrt(max(.001,l1*l1-chord*chord))
            anchor(thigh,h,angle(k-hworld));target[shin]=Frame(k,angle(aworld-k))
            anchor(boot,ankle,0)
            anchor(side+"-plant",ankle,0)
            if side=="near":anchor("rear-toe",pivot,0)

        # The right knuckles and the jaw rotate together. Bending the elbow
        # gives the upper sleeve a small independent follow-through.
        def with_head(point):
            offset=rotation(90-head_angle)@(np.array(point)-np.array(LANDMARKS["head"]))
            return head_p+offset
        right_s=bodily(LANDMARKS["near-sleeve"],105)
        at=0 if idle else t
        carry=1-smooth((at-.06)/.24)
        if at>.76:carry=smooth((at-.76)/.295)
        held_w=with_head(LANDMARKS["near-hand"])
        right_w=self.brushing_wrist(name,at) if TOUCH<=at<=RELEASE else self.wrists[name](at)
        right_w=right_w+(held_w-np.asarray(LANDMARKS["near-hand"]))*carry
        right_e=self.right_elbow(right_s,right_w,v["give"],name)
        anchor("near-sleeve",right_s,target_heading(right_s,right_e))
        anchor("near-bracer",right_e,target_heading(right_e,right_w))
        anchor("q-right-cuff",right_w,target_heading(right_e,right_w))
        anchor("q-right-upper-ink",right_s,target_heading(right_s,right_e),
               (length(world(right_e)-world(right_s))/63.57,.89))
        # Both views belong to one wrist. Turn briefly edge-on between them,
        # without two translucent sets of fingertips over the chest.
        across=1-.32*math.exp(-((at-.249)/.038)**2)-.29*math.exp(-((at-.814)/.042)**2)
        anchor("near-hand",right_w,v["hand"]+(head_angle-90)*carry,(v["roll"],v["roll"]*across))

        left_s=bodily(LANDMARKS["cast-sleeve"],-84)
        left_e=bodily(LANDMARKS["cast-bracer"],-19)+np.array((-23,44))*v["give"]
        supported=np.asarray(LEFT_WRIST)+right_e-np.asarray(RIGHT_ELBOW)
        left_w=blend(supported,bodily(pin(478,643),30),v["give"])
        fore=target_heading(left_e,left_w)
        anchor("cast-sleeve",left_s,target_heading(left_s,left_e))
        anchor("cast-bracer",left_e,fore)
        anchor("q-left-cuff",left_w,fore)
        shoulder_length=length(world(left_e)-world(left_s))
        anchor("q-left-upper-ink",left_s,target_heading(left_s,left_e),(shoulder_length/63.57,.83))
        anchor("cast-palm",left_w,164+34*v["give"])

        for n,c in CARDS.items():
            center,roll,sx,sy=self.paper(n,t if n==name and not idle else 0)
            anchor("float-"+n,center,roll,(sx,sy))
        return self.resolve(target)

    def resolve(self,target):
        world_frames={}
        data={"rotate":{},"translate":{},"scale":{}}
        identity=Frame((0,0))
        for b in self.bones.values():
            n=b["name"];p=world_frames.get(b.get("parent"),identity)
            inheritance=b.get("transform","normal")
            if n in target:
                f=target[n]
                shift=p.local(f.p)-[b.get("x",0.),b.get("y",0.)]
                relative=f.angle-(0 if inheritance=="onlyTranslation" else p.angle)-b.get("rotation",0.)
                s=f.scale if inheritance=="onlyTranslation" else f.scale/p.scale
                data["rotate"][n]=relative
                data["translate"][n]=shift
                if np.max(abs(s-1))>.00001 or n.startswith("float-") or n in ("near-hand","q-right-upper-ink","q-left-upper-ink"):
                    data["scale"][n]=s
            else:
                own=b.get("rotation",0.)
                pos=p.point([b.get("x",0.),b.get("y",0.)])
                f=Frame(pos,own if inheritance=="onlyTranslation" else own+p.angle,
                        (1,1) if inheritance=="onlyTranslation" else p.scale)
            world_frames[n]=f
        return world_frames,data

    def initialize(self):
        self.wrists={k:self.wrist_curve(k) for k in CARDS}


def native_keys(times, values, tolerance, field):
    values=np.asarray(values,dtype=float)
    if values.ndim==1:values=values[:,None]
    if field=="rotate":
        values=np.rad2deg(np.unwrap(np.deg2rad(values),axis=0))
        values-=360*np.floor((values[0]+180)/360)
    keep={0,len(times)-1}
    def simplify(first,last):
        if last-first<=1:return
        weights=(times[first+1:last]-times[first])/(times[last]-times[first])
        line=values[first]+weights[:,None]*(values[last]-values[first])
        error=np.max(abs(values[first+1:last]-line),axis=1)
        k=int(np.argmax(error))
        if error[k]>tolerance:
            middle=k+first+1;keep.add(middle)
            simplify(first,middle);simplify(middle,last)
    simplify(0,len(times)-1)
    if np.max(abs(values-values[0]))<.00005:keep={0}
    def rounded(v):return round(float(v),5)
    result=[]
    for i in sorted(keep):
        frame={"time":rounded(times[i])}
        if field=="rotate":frame["angle"]=rounded(values[i,0])
        else:frame.update(x=rounded(values[i,0]),y=rounded(values[i,1]))
        result.append(frame)
    return result


def attachment(t, name):
    return {"time":t,"name":name}


def create_action(perf,doc,skin,name,idle,empty=False):
    end=THINK if idle else END
    knots={0,end}
    if not idle:knots.update(T)
    ts=np.asarray(sorted(knots|{min(end,i/60) for i in range(math.ceil(end*60)+1)}))
    frames=[perf.pose(t,name,idle)[1] for t in ts]
    bones={}
    for kind,tol in [("rotate",.09),("translate",.08),("scale",.0025)]:
        names=set(n for frame in frames for n in frame[kind])
        for n in sorted(names):
            vals=[s[kind].get(n,(1,1)) for s in frames]
            default=1 if kind=="scale" else 0
            if np.max(abs(np.array(vals)-default))>.00004:
                bones.setdefault(n,{})[kind]=native_keys(ts,vals,tol,kind)
    # Keep the eye/knuckle lock at exactly the same time landmarks as the body.
    slots={}
    for slot in doc["slots"]:
        n=slot["name"]
        active=skin.active.get(n)
        if n.startswith("float-"):active="paper-back"
        if active is not None or slot.get("attachment") is not None or n.startswith("q-") or n.startswith("float-"):
            slots[n]={"attachment":[attachment(0,active)]}
    if empty:slots["float-"+name]={"attachment":[attachment(0,None)]}
    if idle:
        slots["q-near-fist-art"]={"attachment":[attachment(0,None)]}
        slots["q-near-upper-art"]["color"]=[{"time":0,"color":"ffffff00"}]
    if not idle:
        # The upper arm stays connected behind the mantle. Its matching front
        # surface emerges from the sleeve opening when the elbow travels out.
        slots["q-near-upper-art"]["color"]=[{"time":t,"color":color} for t,color in [
            (0,"ffffff00"),(.13,"ffffff00"),(.21,"ffffff57"),(.29,"ffffffff"),
            (.70,"ffffffff"),(.81,"ffffff8f"),(.94,"ffffff00")]]
        slots["q-near-knuckles-art"]["attachment"] += [
            attachment(.249,None),attachment(.814,"quarter-cheek-hand")]
        slots["q-near-fist-art"]["attachment"]=[
            attachment(0,None),attachment(.249,"quarter-flick-palm"),attachment(.814,None)]
        selected=slots["float-"+name]["attachment"]
        selected.append(attachment(DEPARTED,None))
    result={"bones":bones,"slots":slots}
    # The near and far hips face different directions in the three-quarter pose.
    for side in ("near","far"):
        p0,p1,p2=(perf.bind[n].p for n in [side+"-thigh",side+"-shin",side+"-boot"])
        u=p1-p0;v=p2-p1
        positive=bool(u[0]*v[1]-u[1]*v[0]>0)
        result.setdefault("ik",{})[side+"-plant"]=[{"time":0,"mix":1,"bendPositive":positive}]
    if not idle:
        result["events"]=[{"time":RELEASE,"name":"release","string":name}]
        turns=[(0,0),(.172,0),(.223,.18),(.277,.76),(.315,1),(.72,1),(.79,.72),(.85,.2),(.885,0)]
        def correction(factor,time):
            if abs(factor)<.00001:return {"time":time}
            return {"time":time,"vertices":(factor*skin.palm_delta).round(4).tolist()}
        result["deform"]={"default":{
            "q-near-knuckles-art":{"quarter-cheek-hand":[correction(k,t) for t,k in turns]},
            "q-near-fist-art":{"quarter-flick-palm":[correction(k-1,t) for t,k in turns]},
        }}
    return result


def deal_animation(rest):
    # The fan starts at the leading edge of the character's chest. All other
    # bones and drawn parts start in the thinking pose.
    deal=copy.deepcopy(rest)
    for tracks in deal["bones"].values():
        for channel,keys in tracks.items():
            tracks[channel]=keys[:1]
    source=world((674,447))
    for order,(card,spec) in enumerate(CARDS.items()):
        target=world(spec["center"])
        delay=order*.035
        tracks=deal["bones"].setdefault("float-"+card,{})
        tracks["translate"]=[
            {"time":0,"x":round(source[0],5),"y":round(source[1],5)},
            {"time":.05+delay,"x":round(source[0],5),"y":round(source[1],5),
             "curve":.2,"c2":.01,"c3":.22,"c4":1},
            {"time":.47+delay,"x":round(target[0],5),"y":round(target[1],5)},
        ]
        tracks["scale"]=[
            {"time":0,"x":.035,"y":.045},
            {"time":.05+delay,"x":.035,"y":.045,"curve":.24,"c2":.02,"c3":.21,"c4":1},
            {"time":.34+delay,"x":1.035,"y":1.035},{"time":.47+delay,"x":1,"y":1},
        ]
        tracks["rotate"]=[{"time":0,"angle":-2},{"time":.47+delay,"angle":spec["angle"]}]
    return deal


def paper_back(original):
    raw=original.convert("RGBA")
    w,h=raw.size
    paper=raw.crop((round(w*.41),round(h*.06),round(w*.84),round(h*.17))).resize((w,h),Image.Resampling.BICUBIC)
    # The common back in the art brief has two offset pale doorways. Both are
    # printed on the same continuous paper surface, including during flight.
    mul=3
    paper=paper.resize((w*mul,h*mul),Image.Resampling.BICUBIC)
    ink=ImageDraw.Draw(paper,"RGBA")
    def stroke(points,color,width):
        ink.line([(round(x*w*mul),round(y*h*mul)) for x,y in points],fill=color,width=round(width*w*mul),joint="curve")
    stroke([(.08,.06),(.92,.06),(.92,.94),(.08,.94),(.08,.06)],(130,103,99,255),.025)
    for x,y,col in [(.32,.57,(147,119,110,255)),(.44,.63,(245,219,185,255))]:
        stroke([(x,y),(x,y-.23),(x+.23,y-.23),(x+.23,y)],col,.039)
    back=paper.resize((w,h),Image.Resampling.LANCZOS)
    back.putalpha(raw.getchannel("A"))
    return back


def prepare(out, review):
    base=read(R3/"runtime/survivor.json")
    original=read(R3/"export-report.json")
    if hashlib.sha256((R3/"survivor.spine").read_bytes()).hexdigest()!=original["projectSha256"]:
        raise ValueError("Export the current editable R3 project before rebinding its artwork.")
    doc=copy.deepcopy(base)
    doc["skeleton"]={"spine":"3.8.75","images":"./parts/"}
    glove=release_hand()
    for n,parent in NEW_BONES:
        bone={"name":n,"parent":parent}
        if n.startswith("contact-"):
            pad=glove_contact(glove,RELEASE_WRIST_ANGLE-CARDS[n[8:]]["angle"]+4)
            bone.update(x=round(pad[0],5),y=round(pad[1],5))
        if n in ("right-knuckle","right-cheek-pad"):
            peg=RIGHT_KNUCKLE if n=="right-knuckle" else RIGHT_CHEEK_PAD
            knuckle=rotation(-RIGHT_REST_ANGLE)@(world(peg)-world(RIGHT_WRIST))
            bone.update(x=round(knuckle[0],5),y=round(knuckle[1],5))
        doc["bones"].append(bone)
    for n,b in SLOT_BONES:doc["slots"].append({"name":n,"bone":b})
    # Each new clip carries its chosen card on its own release event.
    # Keep the payload of the original R3 attack intact.
    doc["events"].setdefault("release",{})
    perf=Performance(doc);perf.initialize();perf.bind=perf.pose(0)[0]
    folder=out/"parts";folder.mkdir(parents=True,exist_ok=True)
    originals=sorted((R3/"parts").glob("*.png"))
    for file in originals:shutil.copyfile(file,folder/file.name)
    skin=MountedSkin(doc,perf.bind,folder)
    build_skin(skin,review)
    back=paper_back(Image.open(folder/"card.png"))
    back.save(folder/"paper-back.png",optimize=True)
    for n,c in CARDS.items():
        slot="float-"+n
        skin.ats[slot]={"paper-back":{"width":back.width,"height":back.height,
            "scaleX":round(c["width"]*SCALE/back.width,6),"scaleY":round(c["height"]*SCALE/back.height,6)}}
    doc["animations"]["think"]=create_action(perf,doc,skin,"guard",True)
    doc["animations"]["fan-in"]=deal_animation(doc["animations"]["think"])
    for n in CARDS:
        doc["animations"][n+"-flick"]=create_action(perf,doc,skin,n,False)
        doc["animations"]["think-without-"+n]=create_action(perf,doc,skin,n,True,True)
        doc["animations"]["spent-"+n]={"slots":{"float-"+n:{"attachment":[attachment(0,None)]}}}
    save(out/"survivor-flick.authoring.json",doc)
    reuse={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in originals}
    regions={"cheek":[(507,599),(641,595),(720,633),(746,683),(709,754),(650,796),(580,776),(496,714),(474,654)],
             "mouth":[(731,743),(770,734),(827,734),(867,746),(861,766),(822,778),(769,778),(729,761)],
             "eye":[(622,547),(649,531),(712,531),(757,546),(760,567),(718,583),(663,577)]}
    face_regions={region:[perf.bind["head"].local(world(face_vertices(x,y))).round(4).tolist() for x,y in outline]
                  for region,outline in regions.items()}
    save(out/"source-reuse.json",{"originalProjectSha256":original["projectSha256"],"originalBones":len(base["bones"]),
          "originalParts":reuse,"originalClips":sorted(base["animations"]),"quarterAttachments":skin.stats,
          "headLocalContactRegions":face_regions,
          "referenceHashes":{p.relative_to(CHARACTER).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in [
              CHARACTER/"turnaround-golden-master.png",CHARACTER/"turnaround-golden.png",CHARACTER/"head-turnaround.png",
              PROJECT/"reference/head-three-quarter.png", PROJECT/"reference/body-think-three-quarter.png",
              PROJECT/"reference/body-cloth-underpaint.png", PROJECT/"reference/right-cheek-support.png",
              PROJECT/"reference/right-wrist-release.png"]},
          "activeOldArt":["cast-sleeve"],"flickHand":"anatomical right",
          "bodyRegistration":{"scale":BODY_SCALE,"offset":BODY_OFFSET.round(5).tolist(),
              "nearToe":NEAR_TOE,"farToe":FAR_TOE,"upperPlate":"registered to posed master at 262 shared landmarks"},
          "gestureReference":"right-cheek-support.png for cheek support; right-wrist-release.png for the R3-referenced dorsal right hand with visible thumb",
          "forearms":"independently cut from body-think-three-quarter.png; painted clean upper body from body-cloth-underpaint.png",
          "head":"one three-quarter painting with a fixed cheek/jaw correction; all vertices follow the head bone",
          "cameraYaw":33,"headYaw":33,"cardBack":"paper-back"})
    print(json.dumps({"output":str(out),"bones":len(doc["bones"]),"parts":len(list(folder.glob("*.png"))),"actions":list(CARDS)}))


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,default=PROJECT)
    args=parser.parse_args()
    scratch=ROOT/"temp/pose-redo";scratch.mkdir(parents=True,exist_ok=True)
    args.output.mkdir(parents=True,exist_ok=True)
    if (args.output/"survivor-flick.spine").exists():
        raise SystemExit("This folder already has an editable project. Use a new output folder.")
    prepare(args.output,scratch)

