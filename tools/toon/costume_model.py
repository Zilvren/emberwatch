"""Construct the survivor's garments and equipment around the full turnaround."""
import cv2
import numpy as np
from scipy.ndimage import distance_transform_edt

from gltf import Geometry
from model_surface import Atlas, CostumePaint, SCALE,TURN,bound, loft, norm, patch, smooth, world,rgb_sample


def build_costume(bones):
    paint=CostumePaint();atlas=Atlas(2560,2560)
    clothing=Geometry();equipment=Geometry();legs=Geometry()
    def purple(a):
        r,g,b=a.transpose(2,0,1);return (b-g>8)&(b-r>-18)&(g<116)&(r<146)
    def linen(a):
        r,g,b=a.transpose(2,0,1);return (r-g>9)&(r-g<40)&(b-g<13)&(r-b<39)&(r>73)
    paint.register('indigo',[(151,190,276,455),(682,183,176,510),(1147,194,270,500)],purple)
    paint.register('scarf',[(204,155,184,64),(695,148,145,74),(1190,149,187,87)],linen)
    chest=bound(bones,'Chest');hip=bound(bones,'Pelvis')
    def bodyweights(p,u,v):
        s=float(smooth((426-p[1])/105));return [(bones['Chest'],s),(bones['Pelvis'],1-s)]
    def mantleweights(p,u,v):
        s=float(.17*smooth((abs(p[0])-73)/48)*smooth((p[1]-199)/56));side='RUpper' if p[0]<0 else 'LUpper'
        return [(bones['Chest'],1-s),(bones[side],s)]
    def skirtweights(p,u,v):
        s=float(.64*smooth((p[1]-427)/187)*smooth((-p[0]+3)/72));return [(bones['Pelvis'],1-s),(bones['MantleHem'],s)]
    def cloth(name,shade=1):
        return lambda p,u,v:(paint.material(name,p,u,v)*(.42 if name=='scarf' else .74)+paint.fabric('scarf' if name=='scarf' else 'wool',u,v,2.0)*(.58 if name=='scarf' else .26))*shade
    def sw(rect,shade=1):return lambda p,u,v:paint.swatch(rect,u,v)*shade
    def rings(rows):return [(y,x,z,0,0) for y,x,z in rows]
    def add(geo,surface,color,weights,mesh=(58,21),tex=(344,152)):
        patch(geo,atlas,surface,color,weights,mesh=mesh,tex=tex)

    # Under the mantle the torso and the linen undershirt continue over the shoulders.
    def jacket(a,v,y,rx,rz,cx,cz):
        dent=(2.1*np.sin(7*a+y*.016)+1.6*np.cos(12*a-y*.024))*np.sin(np.pi*v)
        return y,rx+dent,rz+dent*.8,cx,cz+2*np.cos(a)*np.sin(np.pi*v)
    add(clothing,loft(rings([(178,37,26),(188,61,37),(206,88,47),(230,97,52),(263,91,55),(299,83,50),(340,77,44),(370,78,46),(398,83,51)]),jacket),cloth('indigo',.96),bodyweights,tex=(430,214))

    # Two superposed skirts. The overwrap opens towards the card case and falls towards the bag.
    def inner(a,v,y,rx,rz,cx,cz):
        pleat=2.5*np.cos(9*a+v*1.8)+1.6*np.cos(15*a-v)
        return y+v*v*(-66+68*np.maximum(0,np.sin(a))**.8+9*np.sin(3*a)),(rx+pleat*v)*.88,(rz+pleat*v)*.85,cx,cz
    add(clothing,loft(rings([(370,77,45),(402,83,49),(470,91,55),(539,94,59),(607,93,57),(614,93,57),(613,91,55)]),inner),lambda p,u,v:paint.fabric('linen',u,v,2)*[.83,.83,.85],hip,tex=(350,216))
    def outer(u,v):
        a=-3.17+6.43*u+.23*v*np.sin(u*np.pi)+.19*v
        # An overlapping diagonal edge runs from the left hip to the high front hem.
        pleat=(4.6*np.sin(7*a+1.3*v)+2.6*np.sin(13*a-v))*v
        tip=79*np.exp(-((np.arctan2(np.sin(a+1.47),np.cos(a+1.47)))/.32)**2)
        hem=553-65*np.sin(a)-12*np.cos(a)+tip+19*np.sin(2*a-.65)+6*np.cos(7*a)+30*np.maximum(0,np.cos(a))*(.76-.48*np.sin(a))
        y=371+(hem-371)*v+6*(1-u)*v
        rx=82+26*smooth(v)+pleat;rz=49+17*smooth(v)+pleat*.70
        return np.stack([rx*np.sin(a)-4*v,y,rz*np.cos(a)-4*v],axis=-1)
    add(clothing,outer,cloth('indigo'),skirtweights,mesh=(83,35),tex=(578,304))
    def hem_surface(f,lower=True,depth=2.6):
        def face(u,v):
            edge=f(u,np.ones_like(u) if lower else np.zeros_like(u));toward=norm(np.stack([edge[...,0],np.zeros_like(u),edge[...,2]],axis=-1))
            return edge-v[...,None]*depth*toward+np.stack([0*v,1.4*np.sin(v*np.pi),0*v],axis=-1)
        return face
    add(clothing,hem_surface(outer),sw((201,289,40,12),.68),skirtweights,mesh=(76,4),tex=(260,18))

    def mantle(u,v):
        a=(u-.5)*2*np.pi
        points=[0,.19,.44,.69,1];rx=np.interp(v,points,[45,85,111,128,141]);rz=np.interp(v,points,[38,48,59,67,74])
        hem=286-28*np.sin(a)+13*np.cos(2*a+.4)-10*np.cos(a)+13*np.maximum(0,-np.sin(a))**3
        shoulder=np.interp(v,points,[175,188,208,232,259]);y=shoulder+(hem-259)*v**1.7
        fold=(3*np.sin(7*a+1.4*v)+2.3*np.sin(11*a-1.8*v))*smooth(v)
        return np.stack([(rx+fold)*np.sin(a),y,(rz+fold)*np.cos(a)-4],axis=-1)
    add(clothing,mantle,cloth('indigo',1.035),mantleweights,mesh=(83,32),tex=(612,246))
    # The inside of the mantle is visible between the raised forearm and the ribs.
    def lining(u,v):
        p=mantle(u,.48+.52*(1-v));p[...,[0,2]]*=.969;p[...,1]+=.8;return p
    add(clothing,lining,sw((214,267,28,30),.62),mantleweights,mesh=(72,11),tex=(225,52))
    add(clothing,hem_surface(mantle,depth=3.6),sw((205,276,30,10),.79),mantleweights,mesh=(82,5),tex=(260,18))
    # Fit both faces of the shoulder strap against the already modelled torso and outer mantle.
    # Its path is underneath the hood and scarf, which are dressed afterwards.
    local=((np.asarray(clothing.positions)+[8,0,0])@TURN)/[SCALE,-SCALE,SCALE]+[0,923,0]
    tri=local[np.asarray(clothing.faces)];projected=np.int32(np.rint((tri[:,:,:2]+[165,-135])*2));distance=tri[:,:,2].mean(axis=1)
    envelopes=[]
    for axis in [1,-1]:
        depth=np.full((680,660),-999,dtype=np.float32)
        for i in np.argsort(distance*axis):cv2.fillConvexPoly(depth,projected[i],float(distance[i]))
        yy,xx=distance_transform_edt(depth==-999,return_distances=False,return_indices=True);envelopes.append(cv2.GaussianBlur(depth[yy,xx],(0,0),2.2))

    # The scarf crosses diagonally under the chin and opens into a hood at the back.
    def scarf(u,v):
        a=(u-.5)*2*np.pi;front=(1+np.cos(a))*.5;rear=1-front
        ytop=151+22*front**2+5*np.sin(a-.2);bottom=186+21*front**3+16*rear-5*np.sin(a+.15)
        y=ytop+(bottom-ytop)*v
        t=np.clip(v+.114*np.sin(a+.65)+.062*np.sin(2*a-.5),0,1)
        softfold=2.4*np.sin(11.4*t+1.2*np.sin(a)) + 1.9*np.sin(17*t+2.3*a)
        rx=np.interp(v,[0,.12,.30,.69,.90,1],[38,49,54,64,70,64])+softfold
        rz=np.interp(v,[0,.12,.30,.69,.90,1],[32,40,43,47,52,50])+softfold
        return np.stack([rx*np.sin(a),y,rz*np.cos(a)-6-rear*4],axis=-1)
    add(clothing,scarf,cloth('scarf',1.055),chest,mesh=(83,38),tex=(512,175))
    add(clothing,hem_surface(scarf,False,4),sw((282,183,30,8),.75),chest,mesh=(72,5),tex=(180,18))
    def hood(a,v,y,rx,rz,cx,cz):
        return y+17*np.cos(a)*np.sin(np.pi*v),rx,rz,cx,cz
    add(clothing,loft([(176,26,12,0,-36),(188,58,23,0,-42),(211,65,27,0,-46),(231,55,24,0,-51),(249,35,14,0,-52),(259,5,4,0,-52)],hood),sw((1250,201,68,35),.94),chest,mesh=(46,22),tex=(256,121))

    for side in (-1,1):
        x=side*55
        s='R' if side<0 else 'L'
        def legweight(p,u,v):
            y=p[1]
            if y<712:
                mix=float(smooth((y-656)/56));return [(bones[s+'Thigh'],1-mix),(bones[s+'Shin'],mix)]
            mix=float(smooth((y-825)/32));return [(bones[s+'Shin'],1-mix),(bones[s+'Foot'],mix)]
        def pants(a,v,y,rx,rz,cx,cz):
            ripple=2.9*np.sin(6*a+2.4*v)+1.5*np.sin(11*a-4*v);f=smooth((v-.1)/.28)
            return y+3.1*np.sin(2*a+.8)*np.sin(v*3*np.pi),rx+ripple*f,rz+ripple*f,cx+side*4*v,cz
        positions=[(401,34,38,x*.68,-2),(451,43,42,x*.79,-4),(497,42,42,x*.9,-7),(552,36,40,x,-9),(606,37,35,x-2,-7),(652,40,32,x-1,-3),(677,40,31,x,-2),(691,32,28,x,0),(699,35,30,x,1),(715,27,25,x,1),(723,23,21,x,0)]
        trouser_charts=[[(487,219,285),(551,216,285),(638,209,282),(677,208,280),(703,221,276),(721,223,274)],[(480,729,804),(559,724,827),(640,727,825),(672,725,835),(703,725,810),(721,739,816)],[(487,1197,1253),(566,1185,1263),(643,1184,1261),(677,1180,1266),(707,1190,1252),(721,1196,1251)]]
        if side>0:trouser_charts[0]=[(y,600-r,600-l) for y,l,r in trouser_charts[0]]
        add(legs,loft(positions,pants),lambda p,u,v:paint.volume_paint(p,u,trouser_charts)*.95,legweight,mesh=(43,28),tex=(284,224))
        def calf(a,v,y,rx,rz,cx,cz):
            wraps=.7+smoothing_wrap(v*6.3+a/(2*np.pi));return y,rx+wraps,rz+wraps,cx,cz
        add(legs,loft([(708,26,24,x+side*3,0),(723,29,26,x+side*3,1),(741,28,26,x+side*3,1),(764,25,24,x+side*3,2),(802,21,20,x+side*3,2),(840,19,17,x+side*3,2)],calf),sw((236 if side<0 else 349,726,18,110),1.04),legweight,mesh=(42,42),tex=(236,175))
        def boot(a,v,y,rx,rz,cx,cz):
            toe=smooth((y-864)/47)*np.maximum(0,np.cos(a));return y,rx,rz+toe*7,cx+side*toe*5,cz
        bootrows=[(831,22,20,-2),(836,27,23,-1),(847,25,24,-1),(857,22,21,0),(870,21,23,3),(880,21,30,7),(890,23,37,13),(899,25,47,19),(908,25,53,20),(914,24,54,20)]
        bootcharts=[[(832,227,273),(846,226,272),(861,228,269),(875,224,270),(890,221,272),(901,216,274),(916,215,273)],[(832,738,790),(847,736,795),(859,737,797),(872,739,809),(885,739,825),(897,735,857),(915,735,869)],[(831,1198,1243),(852,1194,1243),(875,1196,1242),(902,1188,1246),(916,1186,1249)]]
        if side>0:bootcharts[0]=[(y,615-r,615-l) for y,l,r in bootcharts[0]]
        add(legs,loft([(y,rx,rz,x+side*3,z) for y,rx,rz,z in bootrows],boot),lambda p,u,v:.89*paint.volume_paint(p,u,bootcharts)+.11*paint.fabric('leather',u,v),legweight,mesh=(46,24),tex=(310,192))
        add(legs,loft([(910,25,53,x+side*3,21),(914,26,55,x+side*3,21),(919,26,55,x+side*3,21),(922,24,53,x+side*3,21),(922,1,.5,x+side*3,21)],boot),sw((239,908,29,8),.80),legweight,mesh=(48,9),tex=(193,32))

    # Curve each belt to the volume of the torso. The small return at its rim gives it substance in profile.
    hide=lambda p,u,v:paint.fabric('leather',u,v,3.1)*(.94+.06*np.sin(v*np.pi))[...,None]
    edge=lambda p,u,v:paint.fabric('leather',u,v)*.72
    brass=lambda p,u,v:np.broadcast_to(np.array([145,115,85.]),p.shape)*( .89+.18*np.sin(v*np.pi))[...,None]
    def belt(u,v,lower=False):
        a=(u-.5)*2*np.pi;offset=14*np.sin(a+.15) if lower else 2*np.sin(a+.55)
        yy=(380+offset if lower else 350+offset)+(16 if lower else 18)*v
        radius=2.2*np.sin(np.pi*v);rx=(84 if lower else 80)+radius;rz=(53 if lower else 48)+radius
        return np.stack([rx*np.sin(a),yy,rz*np.cos(a)],axis=-1)
    for low in (False,True):
        surface=lambda u,v,low=low:belt(u,v,low)
        add(equipment,surface,hide,bodyweights,mesh=(75,7),tex=(332,35));add(equipment,hem_surface(surface,depth=2.4),edge,bodyweights,mesh=(63,3),tex=(160,12))
    def strap(u,v,back=False):
        x=(62-150*v**.93);y=185+241*v
        rx=np.interp(y,[185,214,267,316,359,426],[75,116,136,87,81,90]);rz=np.interp(y,[185,214,267,316,359,426],[47,60,69,53,49,58])
        x+= (u-.5)*18.2;y+=(u-.5)*8.4
        z=rgb_sample(envelopes[int(back)],(x+165)*2,(y-135)*2)+(1.35+.65*np.sin(u*np.pi))*(-1 if back else 1)
        return np.stack([x,y,z],axis=-1)
    for rev in (False,True):
        add(equipment,lambda u,v,rev=rev:strap(u,v,rev),lambda p,u,v:paint.fabric('leather',u,v)*(.77+.28*smooth(u/.10)*smooth((1-u)/.10))[...,None],bodyweights,mesh=(10,76),tex=(69,350))
    # The actual card wallet and satchel sit outside the corresponding belt, to either side of the torso.
    def bag(a,v,y,rx,rz,cx,cz):
        pleat=1.5*np.sin(6*a+v*2)+.8*np.sin(11*a-v*2);return y,rx+pleat,rz+pleat,cx+3*np.sin(v*3.4),cz
    bagcharts=[[(404,224,238),(419,207,236),(438,193,237),(465,187,237),(490,189,229),(503,195,219)],[(405,715,742),(427,700,764),(451,689,769),(474,685,766),(495,695,759),(505,706,747)],[(404,1388,1401),(433,1384,1416),(475,1382,1421),(499,1389,1411)]]
    add(equipment,loft([(402,6,5,-85,17),(412,13,10,-89,17),(432,25,16,-95,15),(461,30,23,-98,12),(486,27,22,-99,11),(501,21,16,-99,11),(506,5,4,-98,12)],bag),lambda p,u,v:.85*paint.volume_paint(p,u,bagcharts)+.15*paint.fabric('leather',u,v),hip,mesh=(44,24),tex=(298,191))
    def block(cx,y,cz,width,height,depth,angle,material):
        # Eight bevel rings around a rounded rectangular leather cross-section.
        def surface(u,v):
            a=(u-.5)*2*np.pi;rr=np.interp(v,[0,.025,.065,.90,.98,1],[.12,.91,1,1,.9,.12]);s=np.sin(a);c=np.cos(a)
            x=np.sign(s)*np.abs(s)**.27*width*.5*rr;z=np.sign(c)*np.abs(c)**.38*depth*.5*rr
            return np.stack([cx+x*np.cos(angle)+z*np.sin(angle),y+v*height,cz+z*np.cos(angle)-x*np.sin(angle)],axis=-1)
        add(equipment,surface,material,hip,mesh=(39,16),tex=(154,94))
    def stock(p,u,v):
        a=(u-.5)*2*np.pi;x=358+14*np.sin(a);y=364+np.clip(v,0,1)*23
        return rgb_sample(paint.sheet,x*2,y*2)
    block(62,359,47,34,32,9,.30,stock)
    wallet=[[(376,333,380),(385,333,381),(415,333,381),(435,334,380),(439,335,379)],[(376,823,850),(393,823,854),(435,827,855)],[(375,1194,1226),(433,1196,1228)]]
    block(62,376,49,48,65,23,.30,lambda p,u,v:.86*paint.volume_paint(p,u,wallet)+.14*paint.fabric('leather',u,v))
    block(62,377,58,47,15,6,.30,lambda p,u,v:paint.fabric('leather',u,v)*.94)
    # Two compact rectangular fittings on the diagonal strap. Their holes remain open.
    for t in [.115,.847]:
        xy=strap(np.array([[.5]]),np.array([[t]]))[0,0];a=np.array([.91,.39,0]);b=np.array([-.37,.89,0]);n=np.array([0,0,1]);xy[2]+=2.2
        def keeper(u,v,center=xy):
            ang=(u-.5)*2*np.pi;cross=(v-.5)*2*np.pi;s=np.sin(ang);c=np.cos(ang)
            width=11+1.5*np.cos(cross);height=6+1.5*np.cos(cross)
            return center+((np.sign(s)*np.abs(s)**.32*width)[...,None]*a+(np.sign(c)*np.abs(c)**.32*height)[...,None]*b+1.3*np.sin(cross)[...,None]*n)
        add(equipment,keeper,brass,bodyweights,mesh=(32,10),tex=(90,18))
    return [('WovenCostume',clothing),('TravelEquipment',equipment),('BootsAndTrousers',legs)],atlas.canvas


def smoothing_wrap(t):
    x=t%1;return 1.2*np.exp(-((x-.76)/.20)**2)-.65*np.exp(-((x-.97)/.12)**2)
