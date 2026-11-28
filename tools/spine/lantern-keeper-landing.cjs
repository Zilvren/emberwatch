const { poseMatrices } = require('./rig-authoring.cjs');

// The same painted meshes stay on the actor. The controls below are registered
// to the standing canvas, with positive Y up in the exported Spine skeleton.
const legs = [
    { thigh:'FrontThigh', shin:'FrontShin', cap:'FrontKneecap', foot:'FrontFoot', hip:[595,815], knee:[648,1058], ankle:[666,1365] },
    { thigh:'RearThigh', shin:'RearShin', cap:'RearKneecap', foot:'RearFoot', hip:[412,814], knee:[365,1120], ankle:[320,1365] },
];
const contact = .60, duration = 1.02;
// Stand, release, bend, descend, reach, floor, absorb, settle, hold.
const beats = [0,.075,.23,.39,.51,contact,.71,.92,duration];
const rad = Math.PI / 180;
const round = n => Math.round(n*10000)/10000;
const add = (a,b) => [a[0]+b[0],a[1]+b[1]];
const sub = (a,b) => [a[0]-b[0],a[1]-b[1]];
const angle = ([x,y]) => Math.atan2(y,x)/rad;
const wrap = degrees => ((degrees+540)%360)-180;
function rotate([x,y],degrees) {
    const c=Math.cos(degrees*rad), s=Math.sin(degrees*rad);
    return [c*x-s*y,s*x+c*y];
}
// Only used to register cloth to the held pose at authoring time. Spine's
// native IK constraints below solve the live chains in Animate mode and Pink.
function bendChain(hip,ankle,thigh,shin,bendPositive=false) {
    const axis=sub(ankle,hip), distance=Math.hypot(...axis);
    const a=Math.hypot(...thigh), b=Math.hypot(...shin);
    const d=Math.min(a+b,Math.max(Math.abs(a-b),distance));
    const along=(a*a-b*b+d*d)/(2*d);
    const side=Math.sqrt(Math.max(0,a*a-along*along))*(bendPositive?-1:1);
    const knee=[(along*axis[0]-side*axis[1])/distance,(along*axis[1]+side*axis[0])/distance];
    return [wrap(angle(knee)-angle(thigh)),wrap(angle(sub(axis,knee))-angle(shin))];
}
const rightShoulder=[449,373], rightElbow=[360,619], rightWrist=[372,809];

// As in Spineboy, each ground control sits outside the hip hierarchy. The
// oriented IK bones drive the existing painting-space bones via Match offsets.
function groundRig({bones,bone,world,toWorld}) {
    const ik=[],transform=[];
    const activeIk={},activeTransform={};
    const bind=name=>[world.get(name).x,world.get(name).y];
    let order=0;
    function match(name,art,driver,pivot,heading,mix=1,move=true) {
        const [x,y]=rotate(sub(bind(art),pivot),-heading);
        transform.push({name,order:order++,bones:[art],target:driver,rotation:-heading,x,y,
            rotateMix:0,translateMix:0,scaleMix:0,shearMix:0});
        activeTransform[name]=[{time:0,rotateMix:mix,translateMix:move?1:0,scaleMix:0,shearMix:0}];
    }
    function chain(prefix,parent,target,a,b,c,upperArt,lowerArt,bendPositive) {
        const upper=prefix+'UpperIK', lower=prefix+'LowerIK', name=prefix+'IK';
        const ab=sub(b,a),bc=sub(c,b), h1=angle(ab), h2=angle(bc);
        bone(upper,parent,...a,h1);
        bones.at(-1).length=Math.hypot(...ab);
        bone(lower,upper,...b);
        Object.assign(bones.at(-1),{x:Math.hypot(...ab),y:0,rotation:wrap(h2-h1),length:Math.hypot(...bc)});
        ik.push({name,order:order++,bones:[upper,lower],target,bendPositive,stretch:false,mix:0});
        activeIk[name]=[{time:0,mix:1,bendPositive}];
        match(upperArt+'Follow',upperArt,upper,a,h1);
        match(lowerArt+'Follow',lowerArt,lower,b,h2);
    }
    for (const leg of legs) {
        const prefix=leg.thigh.slice(0,-5), target=prefix+'AnkleTarget';
        const hip=toWorld(leg.hip), joint=toWorld(leg.knee), ankle=toWorld(leg.ankle);
        bone(target,leg.foot,...ankle);
        chain(prefix+'Leg','Hips',target,hip,joint,ankle,leg.thigh,leg.shin,false);
        match(leg.cap+'Volume',leg.cap,leg.thigh,hip,0,.5,false);
    }
    bone('RightShoulderControl','Chest',...toWorld(rightShoulder));
    bone('RightHandTarget','PoseRoot',...toWorld(rightWrist));
    chain('RightArm','RightShoulderControl','RightHandTarget',toWorld(rightShoulder),toWorld(rightElbow),
        toWorld(rightWrist),'RestArm','RestElbow',true);
    match('RightPalmDirection','RightWrist','RightHandTarget',toWorld(rightWrist),0,1,false);
    return {ik,transform,activeIk,activeTransform};
}

function bootSole(part,image,toWorld) {
    const [left,top] = part.sourceRect;
    const ankle = toWorld(legs[1].ankle);
    const outline=[];
    for (let y=Math.max(0,legs[1].ankle[1]-top);y<image.height;y++) {
        let first=image.width, last=-1;
        for (let x=0;x<image.width;x++) if (image.data[4*(y*image.width+x)+3]>=160) {
            first=Math.min(first,x); last=x;
        }
        if (last>=first) for (const x of [first,last]) outline.push(sub(toWorld([left+x,top+y]),ankle));
    }
    return turn => Math.min(...outline.map(p=>rotate(p,turn)[1]));
}

function kneel({bones,world,toWorld,backedSlots,rearLeg,rearImage,driven}) {
    const bind=name=>[world.get(name).x,world.get(name).y];
    const parents=new Map(bones.map(b=>[b.name,b.parent]));
    const localBind=name=>sub(bind(name),bind(parents.get(name)));
    const sole=bootSole(rearLeg,rearImage,toWorld);
    const rearAnkle=toWorld(legs[1].ankle), rearFloor=rearAnkle[1]+sole(0);
    const channels={}, heldPose={};
    for (const [step,time] of beats.entries()) {
        const at = values => values[step];
        const pose = new Map([['PoseRoot',{pos:bind('PoseRoot'),turn:0}]]);
        function setBone(name,offset,turn) {
            const parent=pose.get(parents.get(name));
            const pos=add(parent.pos,rotate(add(localBind(name),offset),parent.turn));
            pose.set(name,{pos,turn:parent.turn+turn});
            if (time===duration) heldPose[name]={x:round(offset[0]),y:round(offset[1]),rotate:round(wrap(turn))};
            if (driven.has(name)) return;
            const channel=channels[name]??={translate:[],rotate:[]};
            channel.translate.push({time,x:round(offset[0]),y:round(offset[1])});
            channel.rotate.push({time,angle:round(wrap(turn))});
        }
        function worldBone(name,pos,turn) {
            const parent=pose.get(parents.get(name));
            setBone(name,sub(rotate(sub(pos,parent.pos),-parent.turn),localBind(name)),turn-parent.turn);
        }
        function turnTo(name,turn,offset=[0,0]) {
            setBone(name,offset,turn-pose.get(parents.get(name)).turn);
        }

        const hips=[at([4,4,-4,-27,-51,-70,-70,-70,-70]),at([193,193,176,140,111,89,89,89,89])];
        worldBone('Hips',hips,at([0,0,-3,-8,-12,-15,-15,-15,-15]));
        turnTo('Chest',at([0,1,-7,-21,-35,-45,-50,-44,-44]),[at([0,0,-1,-2,-5,-11,-12,-11,-11]),at([0,0,-1,-3,-6,-8,-11,-7,-7])]);
        turnTo('Head',at([0,-1,-6,-12,-18,-22,-29,-24,-24]));

        turnTo('CoatHem',at([0,0,-3,-10,-18,-23,-26,-23,-23]),
            [at([0,0,-1,-4,-8,-12,-12,-12,-12]),at([0,0,1,5,9,13,14,12,12])]);
        const flap=bind('CoatFlap');
        worldBone('CoatFlap',[at([flap[0],flap[0],25,3,-35,-75,-82,-80,-80]),
            at([flap[1],flap[1],179,155,132,115,110,115,115])],at([0,0,2,6,13,20,23,18,18]));
        worldBone('LiningHem',[at([-38,-38,-47,-65,-94,-144,-155,-152,-152]),
            at([114,114,113,106,96,85,81,83,83])],at([0,0,-2,-5,-9,-12,-15,-12,-12]));
        turnTo('CloakFront',pose.get('Chest').turn+at([0,0,0,2,3,5,3,0,0]));
        const fold=bind('CloakFold');
        worldBone('CloakFold',[at([fold[0],fold[0],-42,-52,-62,-70,-76,-69,-69]),
            at([fold[1],fold[1],243,211,173,150,142,145,145])],at([0,0,-2,-9,-18,-25,-29,-24,-24]));
        turnTo('CloakBack',pose.get('CloakFront').turn);
        worldBone('CloakBackMid',[at([-47,-47,-54,-76,-103,-124,-135,-129,-129]),at([200,200,189,165,129,101,89,91,91])],
            at([0,0,-3,-12,-22,-32,-39,-34,-34]));
        worldBone('CloakHem',[at([-80,-80,-86,-108,-149,-184,-205,-197,-197]),at([111,111,106,86,64,49,30,27,27])],
            at([0,0,-2,-13,-28,-40,-44,-32,-32]));

        // The caster's anatomical left arm withdraws along the far side.
        turnTo('CastArm',at([0,0,-14,-41,-72,-103,-108,-102,-102]));
        turnTo('CastElbow',at([0,0,16,47,79,97,101,97,97]));
        turnTo('Wrist',at([0,0,10,43,101,156,161,158,158]));

        // Block the shoulder and the target as separate controls. The hand
        // target stops at contact while the shoulder absorbs the weight.
        const wrist0=bind('RightWrist');
        const wrist=[at([wrist0[0],wrist0[0],-43,-41,-39,-42,-42,-42,-42]),
                     at([wrist0[1],wrist0[1],169,113,62,23,23,23,23])];
        const socket0=toWorld(rightShoulder), hinge0=toWorld(rightElbow);
        const socket=[at([socket0[0],socket0[0],-28,-35,-43,-46,-46,-46,-46]),
            at([socket0[1],socket0[1],294,237,181,149,143,148,148])];
        const gripAngle=at([0,0,4,7,5,3,3,3,3]);
        worldBone('RightShoulderControl',socket,pose.get('Chest').turn);
        worldBone('RightHandTarget',wrist,gripAngle);
        if (time===duration) {
            const ab=sub(hinge0,socket0),bc=sub(wrist0,hinge0);
            const [upper,lower]=bendChain(socket,wrist,ab,bc,true);
            const elbow=add(socket,rotate(ab,upper));
            worldBone('RestArm',add(socket,rotate(sub(bind('RestArm'),socket0),upper)),upper);
            worldBone('RestElbow',add(elbow,rotate(sub(bind('RestElbow'),hinge0),lower)),lower);
            worldBone('RightWrist',wrist,gripAngle);
        }

        for (const leg of legs) {
            const rear=leg===legs[1], ankle0=toWorld(leg.ankle);
            const turn=rear?at([0,0,-8,-37,-76,-99,-99,-99,-99]):0;
            const ankle=rear ? [at([rearAnkle[0],rearAnkle[0],-65,-99,-153,-195,-195,-195,-195]),
                rearFloor-sole(turn)+at([0,0,3,12,9,0,0,0,0])]
                : ankle0;
            worldBone(leg.foot,add(ankle,rotate(sub(bind(leg.foot),ankle0),turn)),turn);
            if (time===duration) {
                const hip=add(hips,rotate(localBind(leg.thigh),pose.get('Hips').turn));
                const [upper,lower]=bendChain(hip,ankle,localBind(leg.shin),sub(ankle0,bind(leg.shin)));
                turnTo(leg.thigh,upper);
                turnTo(leg.shin,lower);
                turnTo(leg.cap,upper+wrap(lower-upper)*.5);
            }
        }
    }
    for (const [name,track] of Object.entries(channels)) {
        if (track.translate.every(k=>!k.x&&!k.y)) delete track.translate;
        if (track.rotate.every(k=>!k.angle)) delete track.rotate;
        if (!track.translate && !track.rotate) delete channels[name];
        for(const keys of Object.values(track)) {
            // Ease out of the release and into the supports. Between the
            // descending poses keep the velocity flowing across the breakdown.
            for (const i of [1,4,5,6]) if (keys[i]) Object.assign(keys[i],
                i===1?{curve:.4,c2:.04,c3:.72,c4:.56}:
                i===4?{curve:.28,c2:.52,c3:.72,c4:1}:{curve:.33,c2:0,c3:.67,c4:1});
            while (keys.length>2 && ['angle','x','y'].every(f=>keys.at(-3)[f]===keys.at(-2)[f]&&keys.at(-2)[f]===keys.at(-1)[f]))
                keys.splice(-2,1);
        }
    }
    const grip=(closedX,closedY,angle)=>({
        scale:[{time:0,x:1,y:1},{time:.11,x:1,y:1},{time:.24,x:1.03,y:.66},{time:.39,x:closedX,y:closedY}],
        rotate:[{time:0,angle:0},{time:.11,angle:0},{time:.39,angle}],
    });
    channels.RightFingers=grip(1.12,.16,-7);
    channels.RightThumb=grip(.83,.27,-18);
    const slots=Object.fromEntries(backedSlots.map(name=>[name,{attachment:[{time:0,name:name+'-backed'}]}]));
    slots['mantle-reverse']={attachment:[{time:0,name:'mantle-reverse'}],
        color:[{time:0,color:'c6bac900'},{time:.08,color:'c6bac900'},{time:.25,color:'c6bac9ff'}]};
    slots.card={color:[{time:0,color:'ffffffff'},{time:.075,color:'ffffff00'}],attachment:[{time:.08,name:null}]};
    return { clip:{bones:channels,slots}, heldMatrices:poseMatrices({bones},heldPose) };
}

// The front thigh, folded rear leg and knuckles stay on their own joints.
// A strip has two registered outlines: standing and kneeling. Its one UV
// chart stays fixed while a Spine deform key corrects the foreshortening.
function skinProfiles({bones,world,clip,heldMatrices,slots,attachments,profiles,makeMesh,toWorld,influence}) {
    const deform={};
    function insertAfter(after,name,bone,mesh) {
        slots.splice(slots.findIndex(s=>s.name===after)+1,0,{name,bone});
        attachments[name]={[name]:mesh};
        clip.slots[name]={attachment:[{time:0,name}]};
    }
    for(const id of ['raised-trousers','folded-leg']) {
        const front=id==='raised-trousers', leg=front?'front-leg':'rear-leg';
        const {strip,image}=profiles[id], part={id:leg,...profiles[leg]};
        const offsets=[];
        const mesh=makeMesh(id,image,8,3*(strip.length-1),(u,v)=>{
            const row=v*(strip.length-1), i=Math.min(strip.length-2,Math.floor(row)), f=row-i;
            function crossSection(view) {
                const a=strip[i][view], b=strip[i+1][view];
                const corner=k=>a[k]+f*(b[k]-a[k]);
                return [corner(0)+u*(corner(2)-corner(0)),corner(1)+u*(corner(3)-corner(1))];
            }
            const start=toWorld(crossSection(0)), target=crossSection(1);
            const end=[96+(target[0]-1473)*.8,2+(994-target[1])*.8];
            const [left,bottom,w,h]=part.bounds;
            const weights=influence(part,(start[0]-left)/w,1-(start[1]-bottom)/h,true);
            // Pin the bottom of the raised trouser to the original boot cuff.
            // Each local offset is solved against the bone's held matrix.
            const correction=front?Math.min(1,(1-v)/.13):Math.min(1,v/.13);
            for (const [index,x,y] of weights) {
                const [a,b,c,d,ox,oy]=heldMatrices[bones[index].name], dx=end[0]-ox,dy=end[1]-oy;
                offsets.push(round(((d*dx-c*dy)/(a*d-b*c)-x)*correction),
                    round(((a*dy-b*dx)/(a*d-b*c)-y)*correction));
            }
            return [weights.length,...weights.flat()];
        });
        if(front) {
            const lower=attachments[leg][leg+'-backed'];
            const [,top,,h]=part.sourceRect;
            const triangles=[];
            for(let i=0;i<lower.triangles.length;i+=3) {
                const tri=lower.triangles.slice(i,i+3);
                if(top+h*tri.reduce((sum,k)=>sum+lower.uvs[2*k+1],0)/3>=1203) triangles.push(...tri);
            }
            lower.triangles=triangles;
            insertAfter(leg,id,'FrontThigh',mesh);
        } else {
            attachments[leg][id]=mesh;
            clip.slots[leg]={attachment:[{time:0,name:id}]};
        }
        deform[front?id:leg]={[id]:[{time:0},{time:.12,curve:.36,c2:.05,c3:.67,c4:.98},{time:contact,vertices:offsets}]};
    }
    clip.deform={default:deform};
    const id='closed-glove', {rect:[left,top,w,h],image}=profiles[id];
    const mesh=makeMesh(id,image,4,4,(u,v)=>[1,world.get('RightWrist').index,
        round((left+u*w-1292)*.60),round((956-top-v*h)*.60),1]);
    insertAfter('rest-arm',id,'RightWrist',mesh);
    clip.slots[id].color=[{time:0,color:'ffffff00'},{time:.20,color:'ffffff00'},{time:.38,color:'f6f1eeff'}];
    function depthOrder(time,moves) {
        const setup=slots.map(s=>s.name), order=setup.slice();
        for (const [anchor,names] of moves) {
            for (const name of names) order.splice(order.indexOf(name),1);
            order.splice(order.indexOf(anchor),0,...names);
        }
        const moved=new Set(moves.flatMap(([,names])=>names));
        return {time,offsets:setup.filter(n=>moved.has(n)).map(slot=>({slot,offset:order.indexOf(slot)-setup.indexOf(slot)}))};
    }
    const tuck=['coat',['cast-hand','cast-fingers']];
    clip.drawOrder=[depthOrder(.09,[tuck]),depthOrder(.36,[tuck,['cloak-lining',['front-leg','raised-trousers']]])];
}
module.exports={legs,kneel,groundRig,skinProfiles,contact,duration};
