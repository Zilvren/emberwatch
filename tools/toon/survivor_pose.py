"""Anatomical right-hand finger flick. All targets and both arm chains live in 3D."""
from dataclasses import dataclass
import math

import numpy as np
from scipy.interpolate import PchipInterpolator
from scipy.spatial.transform import Rotation as R

from pathlib import Path
from model_surface import point,world
from portrait_model import head_position


def unit(v):
    return v/max(np.linalg.norm(v),1e-8)


def basis(axis, lateral):
    y = unit(np.array(axis,dtype=float)); x = np.asarray(lateral,dtype=float)
    x = unit(x-y*np.dot(x,y))
    return R.from_matrix(np.stack([x,y,np.cross(x,y)],axis=1))


def mixrot(a,b,t):
    return a * R.from_rotvec((a.inv()*b).as_rotvec()*np.clip(t,0,1))


def easing(a,b,t):
    s = np.clip((t-a)/(b-a),0,1)
    return s*s*(3-2*s)


def track(t, times, values):
    return PchipInterpolator(times,values,axis=0)(np.clip(t,times[0],times[-1]))


@dataclass
class Frame:
    p: np.ndarray
    r: R


ID = R.identity()
DIGITS = ('Little','Ring','Middle','Index','Thumb')
CARD_NAMES = ('Lantern','Guard','Repel')
CONTACT = .44
DURATION = 1.20
THINK = 3.4
CARD_POINTS = [point(565,423,198),point(642,402,222),point(719,416,202)]
CARD_ROTS = [R.from_euler('zyx',[13,-15,4],degrees=True),R.from_euler('zyx',[1,0,3],degrees=True),R.from_euler('zyx',[-12,16,5],degrees=True)]
with np.load(Path(__file__).parent/'reference/hand-topology.npz') as source:
    HAND_SOURCE={key:source[key] for key in source.files}
RIGHT_IDLE=basis([.42,.88,-.18],[-.66,.1,-.75])
RIGHT_FLICK=basis([.86,.14,.49],[-.15,.98,.02])
LEFT_IDLE=basis([-.85,.43,.08],[-.43,-.85,.08])


def hand(side, rotation, wrist, load=0., snap=0., bind=False):
    # X points towards the right thumb in the scanned hand. Mirror around X for the left;
    # both palms flex towards local positive Z.
    frames = {side+'Hand':Frame(wrist,rotation)}
    right = side=='R'
    mirror=np.array([1 if right else -1,1,1]);sign=mirror[0]
    for j,digit in enumerate(DIGITS):
        chart=HAND_SOURCE['joints'][j]*mirror;segments=np.diff(chart,axis=0);lengths=np.linalg.norm(segments,axis=1)
        pivot=wrist+rotation.apply(chart[0])
        if bind:dirs=segments
        elif digit=='Thumb':
            dirs=np.array([[.53,.76,.36],[.27,.92,.24],[-.15,.95,.13]])
            if right:
                dirs+=load*np.array([[-.05,0,.06],[-.12,-.02,.09],[-.13,-.05,.08]])
            dirs*=mirror
        else:
            angles=np.array(([59,105,139] if right else [24,52,81]),float)+(2-j)*4
            if right and digit=='Index':
                angles=np.array([33,76,115])*(1-load)+np.array([40,88,121])*load
                angles = angles*(1-snap)+np.array([-4,4,11])*snap
            if right and digit=='Middle': angles += 9*load
            dirs = [[sign*(j-1.4)*.045,math.cos(math.radians(a)),math.sin(math.radians(a))] for a in angles]
        for k,(length,direction) in enumerate(zip(lengths,dirs)):
            axis = rotation.apply(unit(np.asarray(direction)))
            local = basis(axis,rotation.apply([1.,0,0]))
            frames[f'{side}{digit}{k+1}'] = Frame(pivot,local)
            pivot = pivot+axis*length
        frames[side+digit+'Tip'] = Frame(pivot,local)
    return frames


def bind_pose():
    frames={'Pelvis':Frame(world([0,408,0]),ID),'Chest':Frame(world([0,351,0]),ID),
            'Head':Frame(world([0,156,-4]),ID),'MantleHem':Frame(world([-46,432,0]),ID)}
    for s,side in [('R',-1),('L',1)]:
        frames.update(leg(s,side,0.,0.,True))
        shoulder=world([side*87,211,0]);elbow=shoulder+unit(world([side*112,333,6])-shoulder)*202
        wrist=elbow+unit(world([side*142,440,14])-elbow)*186
        lateral=unit(world([side*10,0,0])-world([0,0,0]));upper=basis(elbow-shoulder,lateral);fore=basis(wrist-elbow,lateral)
        handrot=basis(wrist-elbow,np.array([-.61,.1,.78]))
        frames[s+'Upper']=Frame(shoulder,upper);frames[s+'Fore']=Frame(elbow,fore);frames[s+'Bend']=Frame(elbow,mixrot(upper,fore,.5));frames.update(hand(s,handrot,wrist,bind=True))
    return frames


def leg(s,side,breath,reach,bind=False):
    hip=world([side*48,435,-4]);knee=world([side*57,690,1]);ankle=world([side*58,842,2])
    if bind:return {s+'Thigh':Frame(hip,ID),s+'Shin':Frame(knee,ID),s+'Foot':Frame(ankle,ID)}
    start=hip+[-2.0+1.6*reach,-4.0+.30*breath-1.8*reach,1.1*reach]
    end=ankle+[side*6,0,-side*13];ab=knee-hip;bc=ankle-knee;axis=unit(end-start);distance=np.linalg.norm(end-start)
    along=(ab@ab-bc@bc+distance*distance)/(2*distance);pole=np.array([side*.19,0,1.]);pole=unit(pole-axis*(pole@axis))
    bent=start+axis*along+pole*np.sqrt(max(0,ab@ab-along*along))
    def direction(a,b):
        a,b=unit(a),unit(b);cross=np.cross(a,b);return R.from_rotvec(unit(cross)*math.atan2(np.linalg.norm(cross),a@b))
    return {s+'Thigh':Frame(start,direction(ab,bent-start)),s+'Shin':Frame(bent,direction(bc,end-bent)),s+'Foot':Frame(end,R.from_euler('y',side*4,degrees=True))}


def arm(side, shoulder, wrist, hand_rot, load=0., snap=0.):
    right = side=='R'
    upper,lower = (202.,186.) if right else (201.,187.)
    axis = unit(wrist-shoulder)
    distance = np.clip(np.linalg.norm(wrist-shoulder),abs(upper-lower)+1,upper+lower-.15)
    wrist = shoulder+axis*distance
    pole = np.array([-.44,-1.0,.63] if right else [.61,-.95,.64])
    pole = unit(pole-axis*(pole@axis))
    along = (upper**2-lower**2+distance**2)/(2*distance)
    elbow = shoulder+axis*along+pole*np.sqrt(max(0,upper**2-along**2))
    # The elbow's bend plane transports sleeve twist continuously throughout the throw.
    lateral = unit(np.cross(axis,pole)); lateral *= 1 if right else -1
    upper_frame=basis(elbow-shoulder,lateral);fore_frame=basis(wrist-elbow,lateral)
    frames = {side+'Upper':Frame(shoulder,upper_frame),side+'Fore':Frame(elbow,fore_frame),side+'Bend':Frame(elbow,mixrot(upper_frame,fore_frame,.5))}
    frames.update(hand(side,hand_rot,wrist,load,snap))
    return frames


def standing_pose(rest,t):
    breath=math.sin(2*math.pi*t/THINK);rotate=R.from_euler('zx',[.33*breath,.34*breath],degrees=True);anchor=rest['Chest'].p
    return {name:f if name in ('Pelvis','MantleHem') or name[1:] in ('Thigh','Shin','Foot') else Frame(anchor+rotate.apply(f.p-anchor)+[0,1.6*breath,0],rotate*f.r) for name,f in rest.items()}


def card_pose(t,index,phase,selected):
    pos = CARD_POINTS[index].copy(); rotation = CARD_ROTS[index]; scale = 1.
    if phase=='stand':
        scale=.001;pos=point(505,1650,-35)
    elif phase=='think':
        angle = 2*math.pi*t/THINK
        pos += [1.5*(math.sin(angle+.8*index)-math.sin(.8*index)),3.5*(math.sin(angle+.7*index)-math.sin(.7*index)),2*math.sin(angle)]
        rotation *= R.from_euler('y',2*math.sin(angle),degrees=True)
    elif phase=='fan':
        u=easing(index*.045,.48+index*.045,t)
        pos = point(625,438,187)*(1-u)+pos*u
        rotation = mixrot(R.from_euler('y',73,degrees=True),rotation,u); scale = .025+.975*u
    elif index==selected:
        if t<=CONTACT:
            lift=easing(.10,.32,t); pos += np.array([0,31,27])*lift
        elif t<.82:
            f=t-CONTACT; pos += [1940*f-540*f*f,31+210*f-510*f*f,27+530*f]
            rotation *= R.from_euler('zyx',[-330*f,455*f,45*f],degrees=True)
            scale=1-easing(.705,.791,t)
        else:
            u=easing(.89,1.12,t);scale=u;pos+=np.array([-10,-19,-8])*(1-u)
    return Frame(pos,rotation),max(.001,scale)


def actor_pose(t=0.,phase='think',selected=0):
    breath = math.sin(2*math.pi*t/THINK) if phase=='think' else 0.
    reach = 0.; counter=0.
    if phase=='flick':
        reach=float(track(t,[0,.11,.33,.47,.58,.84,1.2],[0,-.07,.65,1,.72,.18,0]));counter=easing(.03,.12,t)*(1-easing(.13,.29,t))
    torso=R.from_euler('yxz',[7.5*reach,1.0*reach+.32*breath,-1.9*reach],degrees=True)
    base=world([0,351,0]);chest=base+[1.1*breath+6*reach,2.8*breath,2*reach]
    def attached(p):return chest+torso.apply(p-base)
    head=torso*R.from_euler('yxz',[-3+4*reach,6.5+.55*breath-4.5*reach,-2.4+2.1*reach],degrees=True)
    neck=world([0,156,-4]);frames={'Pelvis':Frame(world([0,408,0]),ID),'Chest':Frame(chest,torso),
            'Head':Frame(attached(neck),head),'MantleHem':Frame(world([-46,432,0]),R.from_euler('zx',[-1.4*breath+2*reach,.7*breath],degrees=True))}
    sr=attached(world([-87,211,0])); sl=attached(world([87,211,0]))
    right_rot=torso*RIGHT_IDLE; left_rot=torso*LEFT_IDLE
    chin=frames['Head'].p+head.apply(head_position(-50,501,145)-neck)+[0,-4.2,4]
    wr=chin-hand('R',right_rot,np.zeros(3))['RIndex2'].p
    elbow=arm('R',sr,wr,right_rot)['RFore'].p
    bicep=.79*elbow+.21*sr
    wl=bicep+[0,-22,-49]-hand('L',left_rot,np.zeros(3))['LMiddle2'].p
    load=0.; snap=0.
    if phase=='flick':
        turn=float(track(t,[0,.12,.31,.40,.49,.63,.78,1.2],[0,.045,.79,1,1,.91,.48,0]))
        right_rot=mixrot(right_rot,RIGHT_FLICK,turn)
        load=easing(.14,.36,t)*(1-easing(.419,.455,t));snap=easing(.407,CONTACT,t)*(1-easing(.52,.78,t))
        card,_=card_pose(CONTACT,selected,'flick',selected)
        # Hit the near face at its lower left, including the fingertip's full 3D offset.
        hit=card.p+card.r.apply([-26,-17,2.3]); fingertip=hand('R',RIGHT_FLICK,np.zeros(3),0,1)['RIndexTip'].p
        goal=hit-fingertip
        w0=wr.copy()
        wr=track(t,[0,.115,.26,.365,.407,CONTACT,.505,.60,.80,1.065,1.2],
                 [w0,w0+[-8,7,7],w0*.51+goal*.49+[0,-17,14],goal+[-15,-6,2],goal+[-6,-3,1],goal,
                  goal+[21,4,7],goal+[7,-7,11],w0*.49+goal*.51+[0,-25,15],w0+[-2,-3,2],w0])
        clear=easing(.045,.24,t)*(1-easing(.85,1.195,t))
        wl += np.array([13,-19,0])*clear+[-3*reach,-1.8*reach,4*reach]
    frames.update(arm('R',sr,wr,right_rot,load,snap));frames.update(arm('L',sl,wl,left_rot))
    for s,side in [('R',-1),('L',1)]:frames.update(leg(s,side,breath,reach))
    return frames


def hierarchy():
    parents={'Pelvis':None,'Chest':'Pelvis','Head':'Chest','MantleHem':'Pelvis'}
    for side in ('R','L'):
        parents.update({side+'Thigh':'Pelvis',side+'Shin':side+'Thigh',side+'Foot':side+'Shin'})
        parents.update({side+'Upper':'Chest',side+'Fore':side+'Upper',side+'Bend':side+'Upper',side+'Hand':side+'Fore'})
        for finger in DIGITS:
            prior=side+'Hand'
            for suffix in ('1','2','3','Tip'):
                name=side+finger+suffix;parents[name]=prior;prior=name
    return parents
