// Add the new performance to the existing full-body Spine rig and its original drawings.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { body, bodyKeys, curve, keys, sampleTimes, rotate, nearestTurn } = require('./survivor-battle-motion.cjs');
const { geometry } = require('./survivor-motion-check.cjs');

const art = path.resolve(__dirname, '../../art-source/ashen-labyrinth/battle-survivor');
const original = path.join(art, 'spine');
const handSource = path.join(art, 'spine-flick');
const destination = path.join(art, 'spine-flick-left');
const release = .44;
const flightEnd = .94;
const finish = 1.2;
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rad = degree => degree * Math.PI / 180;
const deg = radians => radians * 180 / Math.PI;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
const blend = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const position = (frame, x, y) => add(frame.position, rotate(x, y, frame.angle));

const push = {
    hx: [0,0,.13,-3,.24,-5,.32,2,.397,10,release,12,.49,13,.61,9,.79,3,1.08,0,finish,0],
    hy: [0,0,.13,-2.8,.24,-7.5,.32,-8.5,.41,-5,release,-4.1,.55,-4.3,.76,-1.0,1.03,0,finish,0],
    hip: [0,0,.22,2.4,.30,2,.39,-3.4,release,-3.9,.51,-3,.72,-1,.99,0,finish,0],
    chest: [0,0,.22,1.2,.31,2.1,.39,-1.4,release,-5.6,.51,-6.4,.63,-4.0,.83,-1,1.08,0,finish,0],
    head: [0,0,.22,-.5,.35,-.8,release,2.1,.54,3.0,.72,1.2,1.04,0,finish,0],
    hood: [0,0,.31,1,.51,3,.67,-2.1,.92,0,finish,0],
    scarf: [0,0,.25,1,.5,2.8,.73,-1,.94,0,finish,0],
    hair: [0,0,.36,-.9,.49,2.7,.63,-1.3,.88,0,finish,0],
    mantle: [0,0,.28,-2,.43,-1,.55,4.3,.69,2.0,.87,-1,.99,0,finish,0],
    mantleEnd: [0,0,.31,-2.5,.46,-1.8,.59,6.5,.75,2.8,.94,-1.2,1.12,0,finish,0],
    skirt: [0,0,.29,1.3,.43,-1.9,.56,3.5,.74,1.2,.98,0,finish,0],
    skirtEnd: [0,0,.34,1.8,.46,-2,.62,5.5,.81,1.2,1.12,0,finish,0],
    tail: [0,0,.31,2.6,.46,-2.8,.63,5.0,.81,2,1.05,0,finish,0],
    tailEnd: [0,0,.36,2.7,.52,-1.8,.68,6.8,.87,2.4,1.13,0,finish,0],
    bag: [0,0,.29,2.5,.46,-.9,.58,-4,.78,1,.98,0,finish,0],
};
const stretch = [0,0,.095,0,.19,.19,.29,.65,.37,.84,.415,.90,release,1,.49,1.045,
    .55,1.01,.64,.83,.75,.49,.91,.09,1.065,0,finish,0];
const wristAim = [0,114,.10,109,.20,66,.29,30,.36,16,release,6,.50,-12,
    .59,-3,.73,27,.88,78,1.065,114,finish,114];
const flickOpen = [0,0,.34,0,.40,.16,release,1,.48,.69,.58,.15,.70,0,finish,0];
const heel = [0,0,.20,0,.30,2,.40,9,.47,12,.54,10,.70,3,.79,0,finish,0];
// The chest closes as the left hand leaves the elbow, then opens into the flick.
const shoulderYaw = [0,0,.13,11,.25,23,.33,15,.39,-3,release,-24,.51,-28,
    .61,-18,.72,-7,.88,2,1.045,0,finish,0];
const nearLength = {
    upper:[0,.90,.25,.92,.42,.865,.52,.87,.78,.89,1.02,.90,finish,.90],
    lower:[0,.85,.25,.89,.42,.815,.52,.83,.78,.86,1.05,.85,finish,.85],
};
const farLength = {
    upper:[0,.82,.19,.76,.29,.84,.38,.94,release,.995,.52,.98,.73,.87,1.03,.82,finish,.82],
    lower:[0,.84,.18,.75,.25,.72,.34,.86,release,.987,.52,.96,.72,.83,1.03,.84,finish,.84],
};
const cards = [
    { id:'lantern', x:112, y:252, turn:12, width:17, height:24 },
    { id:'guard', x:167, y:339, turn:0, width:23, height:32 },
    { id:'repel', x:199, y:385, turn:-10, width:17, height:24 },
];
const projectedSleeves = [
    { name:'right-upper', parent:'near-sleeve', image:'cast-sleeve' },
    { name:'right-wrap', parent:'near-bracer', image:'near-bracer' },
    { name:'left-upper', parent:'cast-sleeve', image:'cast-sleeve' },
    { name:'left-wrap', parent:'cast-bracer', image:'cast-bracer' },
];

function relationship(bone, parent, transforms, moves) {
    const offset = moves[bone.name] || [0, 0];
    return {
        position: position(parent, (bone.x || 0) + offset[0], (bone.y || 0) + offset[1]),
        angle: parent.angle + (bone.rotation || 0) + (transforms[bone.name] || 0),
    };
}

function chain(start, end, upperLength, lowerLength, bend) {
    const [x, y] = subtract(end, start);
    const radius = clamp(Math.hypot(x, y), Math.abs(upperLength - lowerLength) + .2, upperLength + lowerLength - .25);
    const elbow = bend * Math.acos(clamp((radius ** 2 - upperLength ** 2 - lowerLength ** 2)
        / (2 * upperLength * lowerLength), -1, 1));
    const upper = Math.atan2(y, x) - Math.atan2(lowerLength * Math.sin(elbow), upperLength + lowerLength * Math.cos(elbow));
    return { upper: deg(upper), lower: deg(upper + elbow) };
}

function addHandsAndCards(skeleton) {
    const skin = skeleton.skins.find(s => s.name === 'default').attachments;
    const closedCuff = skin['cast-sleeve']['cast-sleeve'];
    // The original upper sleeve covered the first part of the forearm.
    // Reach the elbow with the same wrapping texture while keeping its wrist peg.
    const wrapping = skin['near-bracer']['near-bracer'];
    const wrist = skeleton.bones.find(b => b.name === 'near-hand');
    const wristInImage = rotate(wrist.x - wrapping.x, -wrapping.y, -wrapping.rotation);
    const extension = 1.54;
    const [dx, dy] = rotate(0, wristInImage[1] * (1 - extension), wrapping.rotation);
    const wrappedBend = {
        ...wrapping, path:'near-bracer', x:wrapping.x + dx, y:wrapping.y + dy,
        scaleY:wrapping.scaleY * extension,
    };
    const nearSleeves = {
        'right-upper': { ...closedCuff, x:closedCuff.x + .8 },
        'right-wrap': wrappedBend,
    };
    // Scale the four drawings on child bones. Upper-to-elbow and elbow-to-wrist
    // distances can then be projected without scaling the hand or the joints.
    for (const layer of projectedSleeves) {
        const { name, parent, image } = layer;
        skeleton.bones.push({ name, parent });
        const index = skeleton.slots.findIndex(slot => slot.name === parent);
        skeleton.slots.splice(index + 1, 0, { name, bone:name });
        skin[name] = { [image]: { ...(nearSleeves[name] ?? skin[image][image]), path:image } };
    }
    const boot = skin['far-boot']['far-boot'];
    // Point on the underside of the toe in the original far-boot PNG.
    const bootPin = rotate((286 - boot.width / 2) * boot.scaleX, (boot.height / 2 - 217) * boot.scaleY, boot.rotation);
    skeleton.bones.push({ name:'rear-toe', parent:'far-boot', x:boot.x+bootPin[0], y:boot.y+bootPin[1] });
    const digits = ['cast-index', 'cast-index-tip', 'cast-index-nail', 'cast-middle', 'cast-middle-tip', 'cast-thumb'];
    const earlier = read(path.join(handSource, 'survivor-flick.authoring.json'));
    const imageScale = read(path.join(original, 'parts-register.json'));
    const units = imageScale.scale * imageScale.crop.density;
    const handSkin = earlier.skins[0].attachments;
    function region(slot, source) {
        const shape = handSkin[source][source];
        skin[slot] = { [source]: { ...shape, path:source, x:shape.x*units, y:shape.y*units,
            scaleX:shape.scaleX*units, scaleY:shape.scaleY*units } };
        return { name:slot, bone:slot };
    }
    // Use the existing right palm and one articulated right index. Their common
    // wrist peg sits just inside the end of the original forearm wrap.
    skeleton.bones.push({ name:'right-palm', parent:'near-hand', x:-3.4 });
    const rightIndex = earlier.bones.find(b => b.name === 'right-index');
    skeleton.bones.push({ ...rightIndex, parent:'right-palm', x:rightIndex.x*units, y:rightIndex.y*units,
        length:rightIndex.length*units });
    const nail = skeleton.bones.find(b => b.name === 'cast-index-nail');
    skeleton.bones.push({ name:'flick-tip',parent:nail.name,x:nail.length });
    skeleton.bones.push({ name:'right-knuckle',parent:'near-hand',x:15.8,y:.8 });
    const handSlot = skeleton.slots.findIndex(slot => slot.name === 'near-hand');
    skeleton.slots.splice(handSlot+1,0,region('right-index','right-index'),region('right-palm','right-palm'));
    for (const card of cards) {
        const {id, x, y, turn, width, height} = card;
        const bone = 'float-' + id;
        const asset = id === 'guard' ? 'card' : id;
        const [imageWidth, imageHeight] = id === 'guard' ? [170,256] : [32,45];
        skeleton.bones.push({ name:bone, parent:'root', x, y, rotation:turn });
        const slot = { name:bone, bone };
        if (id === 'lantern') {
            skeleton.slots.splice(skeleton.slots.findIndex(s => s.name === 'right-upper'),0,slot);
        } else skeleton.slots.push(slot);
        skin[bone] = { [asset]: { path:asset, width:imageWidth, height:imageHeight,
            scaleX:width/imageWidth, scaleY:height/imageHeight } };
    }
    return digits;
}

function stagePose(name, t) {
    const state = body('idle', name === 'think' ? t : 0);
    state.head -= 2.8;
    if (name === 'guard-flick') {
        for (const [property, amounts] of Object.entries(push)) state[property] += curve(amounts, t);
    }
    return state;
}

function handSilhouette(skeleton, frames, skin, outlines, slot) {
    const attachment = skin[slot][slot];
    const shape = outlines[slot][slot];
    if (!shape.mesh) return shape.pts.map(point => position(frames.get(slot), ...point));
    assert.notEqual(attachment.vertices.length,attachment.uvs.length,'Expected the R3 weighted hand mesh');
    const vertices = [];
    for (let i=0; i<attachment.vertices.length;) {
        const count = attachment.vertices[i++];
        let point = [0,0];
        for (let n=0; n<count; n++) {
            const frame = frames.get(skeleton.bones[attachment.vertices[i++]].name);
            const p = position(frame,attachment.vertices[i++],attachment.vertices[i++]);
            const weight = attachment.vertices[i++];
            point = add(point,p.map(value=>value*weight));
        }
        vertices.push(point);
    }
    return shape.pts.map(([a,b,c,wa,wb,wc]) =>
        [0,1].map(axis=>vertices[a/2][axis]*wa+vertices[b/2][axis]*wb+vertices[c/2][axis]*wc));
}

function poseSolver(skeleton, digits, outlines) {
    const zero = { position:[0,0], angle:0 };
    const bones = new Map(skeleton.bones.map(b => [b.name, b]));
    const setup = new Map();
    for (const b of skeleton.bones) setup.set(b.name, relationship(b, setup.get(b.parent) || zero, {}, {}));

    // The point below the chin comes from the original right-profile registration.
    const head = setup.get('head');
    const chin = rotate(...subtract([28.3, 369.6], head.position), -head.angle);
    const nearArm = ['near-sleeve', 'near-bracer', 'near-hand'].map(n => bones.get(n));
    const leftArm = ['cast-sleeve', 'cast-bracer', 'cast-palm'].map(n => bones.get(n));
    const folded = Object.fromEntries(digits.map(name =>
        [name, skeleton.animations.idle.bones[name].rotate[0].angle || 0]));
    const rightIndexChain = ['right-palm','right-index'];
    const skin = skeleton.skins[0].attachments;
    const rightOutline = (slot,frame,scale=[1,1]) =>
        Object.values(outlines[slot])[0].pts.map(([x,y])=>position(frame,x*scale[0],y*scale[1]));

    function edgeNear(points, crossAxis, crossValue, distance, low) {
        const close = points.filter(p=>Math.abs(p[crossAxis]-crossValue)<distance).map(p=>p[1-crossAxis]);
        return close.length ? (low ? Math.min(...close) : Math.max(...close)) : undefined;
    }

    function initial(name, t) {
        const state = stagePose(name, t);
        const moves = { hips:[state.hx,state.hy], 'near-plant':[state.nearX,state.nearY], 'far-plant':[state.farX,state.farY] };
        const turns = Object.fromEntries(Object.entries(bodyKeys).map(([b, key]) => [b, state[key]]));
        const frames = new Map();
        const yaw = name === 'guard-flick' ? curve(shoulderYaw,t) : 0;
        const shoulderDepth = 33*Math.sin(rad(yaw));
        for (const bone of skeleton.bones) {
            const parent = frames.get(bone.parent) || zero;
            if (bone.name === 'near-sleeve') moves[bone.name] = rotate(3+shoulderDepth,-1+shoulderDepth*.12,-parent.angle);
            if (bone.name === 'cast-sleeve') moves[bone.name] = rotate(2-shoulderDepth,1-shoulderDepth*.12,-parent.angle);
            frames.set(bone.name, relationship(bone, parent, turns, moves));
        }
        return { frames, turns, moves, yaw };
    }

    const toe = bones.get('rear-toe');
    const rearBoot = bones.get('far-boot');
    assert.equal(rearBoot.transform, 'onlyTranslation');
    const rearToeOffset = rotate(toe.x, toe.y, rearBoot.rotation);

    function setArm(frames, turns, moves, arm, lengths, target, aim, tipOffset) {
        const [upper, lower, palm] = arm;
        const shoulder = frames.get(upper.name).position;
        const [projectedUpper, projectedLower] = lengths;
        const upperLength = upper.length * projectedUpper;
        const lowerLength = lower.length * projectedLower;
        moves[lower.name] = [upperLength - upper.length, 0];
        moves[palm.name] = [lowerLength - lower.length, 0];
        let palmAngle = aim;
        let result;
        for (let attempt = 0; attempt < 10; attempt++) {
            result = chain(shoulder, subtract(target,tipOffset(palmAngle)), upperLength, lowerLength, 1);
            const bend = nearestTurn(palmAngle, result.lower) - result.lower;
            const correction = clamp(bend,-42,44) - bend;
            if (Math.abs(correction) < .08 || attempt === 9) break;
            palmAngle += correction * .82;
        }
        turns[upper.name] = nearestTurn(result.upper - frames.get(upper.parent).angle - upper.rotation, 0);
        turns[lower.name] = nearestTurn(result.lower - result.upper - lower.rotation, 0);
        turns[palm.name] = nearestTurn(palmAngle - result.lower - (palm.rotation || 0), 0);
        const elbow = position({ position:shoulder, angle:result.upper }, upperLength, 0);
        const wrist = position({ position:elbow, angle:result.lower }, lowerLength, 0);
        return { upper:{position:shoulder,angle:result.upper}, lower:{position:elbow,angle:result.lower},
            hand:{position:wrist,angle:palmAngle} };
    }

    return (name, t) => {
        const { frames, turns, moves, yaw } = initial(name, t);
        const flick = name === 'guard-flick';
        const roll = flick ? -curve(heel,t) : 0;
        // Rotate the ankle about the existing toe contact point while the heel lifts.
        moves['far-plant'] = add(moves['far-plant'], subtract(rearToeOffset, rotate(...rearToeOffset,roll)));
        // The original boot inherits translation only. Its world heading is
        // independent of the animated shin, so there is no shin correction.
        turns['far-boot'] = roll;
        const opening = flick ? curve(flickOpen,t) : 0;
        Object.assign(turns,folded);
        for (const joint of ['cast-index','cast-index-tip','cast-index-nail']) turns[joint] *= 1-opening;
        turns['cast-middle'] -= 25*opening;
        turns['cast-thumb'] -= 33*opening;
        turns['right-index'] = 0;
        const reach = flick ? clamp(curve(stretch,t),0,1) : 0;
        function rightHandFrames(hand) {
            const result = new Map();
            for (const name of rightIndexChain) {
                hand = relationship(bones.get(name),hand,turns,{});
                result.set(name,hand);
            }
            return result;
        }
        const face = position(frames.get('head'), ...chin);
        const target = add(face,[2,-2.1]);
        const at = flick ? t : 0;
        const near = [curve(nearLength.upper,at),curve(nearLength.lower,at)];
        const far = [curve(farLength.upper,at),curve(farLength.lower,at)];
        const scales = {
            'right-upper':[near[0],1+(.94-near[0])*.21],
            'right-wrap':[near[1],1+(.98-near[1])*.25],
            'left-upper':[far[0],.88],
            'left-wrap':[far[1],.93],
        };
        const knuckle = handAngle => rotate(15.8,.8,handAngle);
        let right = setArm(frames,turns,moves,nearArm,near,target,110,knuckle);
        const headProfile = rightOutline('head',frames.get('head'));
        for (let pass=0; pass<2; pass++) {
            const handFrames = rightHandFrames(right.hand);
            const hand = ['right-palm','right-index'].flatMap(slot=>rightOutline(slot,handFrames.get(slot)));
            const shift = Math.max(0,...hand.map(p=>(edgeNear(headProfile,1,p[1],1.6,false)??-Infinity)+1.25-p[0]));
            if (shift < .06) break;
            target[0] += shift;
            right = setArm(frames,turns,moves,nearArm,near,target,110,knuckle);
        }
        const sleeve = rightOutline('right-upper',right.upper,scales['right-upper'])
            .concat(rightOutline('right-wrap',right.lower,scales['right-wrap']));
        const elbowX = right.lower.position[0] - 1.5;
        const underside = edgeNear(sleeve,0,elbowX,4.8,true) ?? (right.lower.position[1]-10);
        const rightFrames = rightHandFrames(right.hand);
        const foreground = sleeve.concat(['right-palm','right-index'].flatMap(slot=>rightOutline(slot,rightFrames.get(slot))));
        const leftFrames = new Map([['cast-palm',zero]]);
        for (const name of [...digits,'flick-tip']) {
            const b = bones.get(name);
            leftFrames.set(name,relationship(b,leftFrames.get(b.parent),turns,{}));
        }
        const leftOutline = ['cast-palm','cast-index','cast-middle','cast-thumb']
            .flatMap(slot=>handSilhouette(skeleton,leftFrames,skin,outlines,slot));

        // Leave the supporting position below the right elbow before rising past it.
        const support = [elbowX,underside-.25];
        const outside = [Math.max(...foreground.map(p=>p[0]))+26,underside-4];
        const departure = [cards[1].x-cards[1].width/2-.85,cards[1].y+2.4];
        const leftTarget = blend(blend(support,outside,reach),blend(outside,departure,reach),reach);
        if (flick && t>release) {
            const follow = curve([release,0,.49,1,.56,.77,.76,.07,1.04,0,finish,0],t);
            leftTarget[0] += 8*follow;
            leftTarget[1] -= 10*follow;
        }
        function leftContact(angle) {
            const points = leftOutline.map(p=>rotate(...p,angle));
            const top = points.reduce((top,p)=>p[1]>top[1]?p:top,points[0]);
            return blend(top,rotate(...leftFrames.get('flick-tip').position,angle),clamp(reach*1.68,0,1));
        }
        const leftAim = flick ? curve(wristAim,t) : 114;
        let left = setArm(frames,turns,moves,leftArm,far,leftTarget,leftAim,leftContact);
        for (let pass=0; pass<3; pass++) {
            const hand = leftOutline.map(p=>position(left.hand,...p));
            const shift = Math.max(0,...hand.map(p=>p[1]-(edgeNear(foreground,0,p[0],2,true)??Infinity)+.45));
            if (shift < .05) break;
            leftTarget[1] -= shift;
            left = setArm(frames,turns,moves,leftArm,far,leftTarget,leftAim,leftContact);
        }
        return { turns, moves, scales, frames, yaw };
    };
}

function torsoDeform(skeleton, solve) {
    const skin = skeleton.skins[0].attachments;
    const times = [...new Set([.06,.17,.36,.46,.56,.83,...shoulderYaw.filter((_value,index)=>index%2===0)])]
        .sort((a,b)=>a-b);
    const poses = times.map(t=>solve('guard-flick',t));
    const cloth = {};
    for (const slot of ['mantle']) {
        const mesh = skin[slot][slot];
        assert.equal(mesh.type,'mesh');
        assert.notEqual(mesh.vertices.length,mesh.uvs.length);
        const groups = [];
        for (let i=0;i<mesh.vertices.length;) {
            const count = mesh.vertices[i++];
            const influences = [];
            for(let n=0;n<count;n++,i+=4) influences.push(mesh.vertices.slice(i,i+4));
            groups.push(influences);
        }
        const timeline=poses.map(({frames,yaw},index)=>{
            const chest=frames.get('chest').position;
            const collar=frames.get('head').position[1]-2;
            const sine=Math.sin(rad(yaw)), cosine=Math.cos(rad(yaw));
            const offsets=[];
            for(const group of groups){
                let point=[0,0];
                for(const [bone,x,y,weight] of group){
                    const world=position(frames.get(skeleton.bones[bone].name),x,y);
                    point=add(point,world.map(value=>value*weight));
                }
                const side=point[0]-chest[0];
                const roundness=Math.max(0,1-(side/68)**2)**2;
                const backSeam=clamp((side+44)/20,0,1);
                const strength=backSeam*clamp((point[1]-chest[1]+14)/48,0,1)*clamp((collar-point[1])/42,0,1);
                // Project the curved chest and cape around the vertical body axis.
                // Each weighted influence receives the same world-space correction.
                const dx=strength*(side*(cosine-1)+35*roundness*sine);
                const dy=strength*side*sine*.078;
                for(const [bone] of group){
                    offsets.push(...rotate(dx,dy,-frames.get(skeleton.bones[bone].name).angle)
                        .map(value=>Math.round(value*1000)/1000));
                }
            }
            return Math.abs(yaw)<.001 ? {time:times[index]} : {time:times[index],vertices:offsets};
        });
        cloth[slot]={[slot]:timeline};
    }
    return { default:cloth };
}

function newClips(skeleton, digits) {
    const skin = skeleton.skins[0].attachments;
    const contacts = ['head','right-upper','right-wrap','right-palm','right-index',
        'cast-palm','cast-index','cast-middle','cast-thumb'];
    const outlines = geometry(destination,{skins:[{attachments:Object.fromEntries(contacts.map(n=>[n,skin[n]]))}]});
    const solve = poseSolver(skeleton, digits,outlines);
    for (const [name, duration] of [['think',2.56], ['guard-flick',finish]]) {
        const essential = name === 'guard-flick' ? [.075,.14,.255,.29,.39,release,.47,.82,.94,flightEnd,1.065] : [.64,1.28,1.92];
        const times = sampleTimes(duration, essential);
        const states = times.map(t => solve(name, t));
        const tracks = {};
        for (const bone of Object.keys(states[0].turns)) {
            let last = states[0].turns[bone];
            const values = states.map(s => last = nearestTurn(s.turns[bone], last));
            tracks[bone] = { rotate:keys(times,values,.11,essential,'rotate') };
        }
        for (const bone of Object.keys(states[0].moves)) {
            (tracks[bone] ??= {}).translate = keys(times,states.map(s => s.moves[bone]),.065,essential,'translate');
        }
        for (const bone of Object.keys(states[0].scales)) {
            (tracks[bone] ??= {}).scale = keys(times,states.map(s => s.scales[bone]),.002,essential,'translate');
        }
        const slots = structuredClone(skeleton.animations.idle.slots);
        slots['near-hand'] = { attachment:[{time:0,name:null}] };
        slots['right-palm'] = { attachment:[{time:0,name:'right-palm'}] };
        slots['right-index'] = { attachment:[{time:0,name:'right-index'}] };
        for (const layer of projectedSleeves) {
            slots[layer.parent] = { attachment:[{time:0,name:null}] };
            slots[layer.name] = { attachment:[{time:0,name:layer.image}] };
        }
        slots['near-underarm'] = { attachment:[{time:0,name:null}] };
        for (const {id} of cards) {
            slots['float-'+id] = { attachment:[{time:0,name:id === 'guard' ? 'card' : id}] };
        }
        const animation = { bones:tracks, slots };
        if (name === 'guard-flick') {
            animation.deform = torsoDeform(skeleton,solve);
            tracks['float-guard'] = {
                translate:[{time:0,x:0,y:0},{time:.25,x:0,y:0},{time:release,x:0,y:2.4},
                    {time:.48,x:22,y:5},{time:.55,x:79,y:8},{time:.63,x:151,y:4},
                    {time:.73,x:240,y:-7},{time:.84,x:336,y:-24},{time:flightEnd,x:435,y:-49}],
                rotate:[{time:0,angle:0},{time:release,angle:0},{time:.53,angle:25},
                    {time:.68,angle:78},{time:flightEnd,angle:151}],
                scale:[{time:0,x:1,y:1},{time:release,x:1,y:1},{time:.502,x:.16,y:.96},
                    {time:.566,x:.86,y:.89},{time:.67,x:.11,y:.80},
                    {time:.758,x:.73,y:.72},{time:.86,x:.12,y:.63},{time:flightEnd,x:.42,y:.57}],
            };
            slots['float-guard'].attachment.push({time:flightEnd,name:null});
            animation.events = [{time:release,name:'release'}];
        }
        skeleton.animations[name] = animation;
    }
    const empty = structuredClone(skeleton.animations.think);
    empty.slots['float-guard'].attachment = [{time:0,name:null}];
    skeleton.animations['think-empty'] = empty;
}

function prepare() {
    const originalReport = read(path.join(original,'export-report.json'));
    const originalProject = path.join(original,'survivor.spine');
    const originalRuntime = path.join(original,'runtime/survivor.json');
    assert.equal(sha(originalProject), originalReport.projectSha256, 'Export the current edited .spine first.');
    assert.equal(sha(originalRuntime), originalReport.runtimeSha256);
    const skeleton = read(originalRuntime);
    assert.equal(skeleton.skeleton.spine,'3.8.75');
    skeleton.skeleton.images='./parts/';
    delete skeleton.skeleton.audio;
    delete skeleton.skeleton.hash;
    const digits = addHandsAndCards(skeleton);
    const output = path.join(destination,'parts');
    fs.mkdirSync(destination);
    fs.mkdirSync(output);
    const assets = fs.readdirSync(path.join(original,'parts')).filter(n => n.endsWith('.png')).sort();
    for (const file of assets) fs.copyFileSync(path.join(original,'parts',file),path.join(output,file));
    for (const file of ['lantern.png','repel.png']) {
        fs.copyFileSync(path.join(art,'spine-flick/parts',file),path.join(output,file));
    }
    for (const file of ['right-palm.png','right-index.png']) {
        fs.copyFileSync(path.join(handSource,'parts',file),path.join(output,file));
    }
    newClips(skeleton,digits);
    const audit = { originalProjectSha256:originalReport.projectSha256,
        originalBones:originalReport.bones, reusedImages: assets.map(file => ({file,sha256:sha(path.join(original,'parts',file))})),
        auxiliaryCards:['lantern.png','repel.png'], bones:skeleton.bones.length, slots:skeleton.slots.length,
        existingRightHand:['right-palm.png','right-index.png'],
        newClips:['think','guard-flick','think-empty'] };
    fs.writeFileSync(path.join(destination,'survivor-flick.authoring.json'),JSON.stringify(skeleton,null,2)+'\n');
    fs.writeFileSync(path.join(destination,'source-reuse.json'),JSON.stringify(audit,null,2)+'\n');
    console.log(JSON.stringify({ bones:audit.bones, slots:audit.slots, originalTextures:assets.length,
        animatedBoneTracks:Object.keys(skeleton.animations['guard-flick'].bones).length }));
}

if (require.main === module) prepare();
