// Times are seconds; each bone channel is relative to the illustrated setup pose.
const turn = (...keys) => keys.map(([time, angle]) => ({ time, angle }));
const move = (...keys) => keys.map(([time, x, y]) => ({ time, x, y }));
const cardTimings = {
    attack: { duration: .66, contact: .42 },
    prepare: { duration: .58, contact: .28 },
};
const paperFragments = [
    { name: 'paper-chip-left', position: [-6, 2], size: [7, 5], drift: [-17, -4], turn: -90 },
    { name: 'paper-chip-high', position: [-1, 5], size: [5, 7], drift: [-5, 14], turn: 75 },
    { name: 'paper-chip-right', position: [5, 0], size: [8, 6], drift: [18, 5], turn: 110 },
    { name: 'paper-chip-low', position: [1, -5], size: [6, 5], drift: [8, -17], turn: -75 },
];

function phrase(times, angles) {
    return { rotate: turn(...angles.map((angle, index) => [times[index], angle])) };
}

function crushCard({ contact, duration }) {
    const caught = contact * .53;
    const crush = contact - .035;
    const bones = {
        CastOrigin: {
            translate: move([0,0,0],[caught,-5,-53],[crush,-9,-64],[contact,-9,-64],[duration,0,0]),
            rotate: turn([0,0],[caught,13],[crush,39],[contact,39],[duration,0]),
            scale: move([0,1,1],[caught,.94,.94],[crush,.54,.48],[contact,.54,.48],[duration,1,1]),
        },
        PaperFoldLeft: {
            translate: move([0,0,0],[caught,0,0],[crush,5,4],[contact,5,4],[duration,0,0]),
            rotate: turn([0,0],[caught,0],[crush,28],[contact,28],[duration,0]),
        },
        PaperFoldRight: {
            translate: move([0,0,0],[caught,0,0],[crush,-6,-5],[contact,-6,-5],[duration,0,0]),
            rotate: turn([0,0],[caught,0],[crush,-34],[contact,-34],[duration,0]),
        },
    };
    const slots = { card: { attachment: [{ time: 0, name: 'card' }, { time: contact, name: null }] } };
    for (const { name, drift: [x,y], turn: spin } of paperFragments) {
        const fade = contact + .18;
        bones[name] = {
            translate: move([contact,0,0],[contact + .075,x * .7,y * .8],[fade,x,y - 7]),
            rotate: turn([contact,0],[fade,spin]),
            scale: move([contact,1,1],[fade,.55,.55]),
        };
        slots[name] = {
            attachment: [{ time: contact, name }, { time: fade, name: null }],
            color: [{ time: contact, color: 'ffffffff' }, { time: contact + .055, color: 'ffffffee' }, { time: fade, color: 'ffffff00' }],
        };
    }
    return { bones, slots, events: [{ time: contact, name: 'impact' }] };
}

function motions() {
    const breath = [0, .55, 1.25, 1.85, 2.5];
    const cast = [0, .11, .23, .34, .42, .51, .6, .66];
    const guard = [0, .09, .20, .28, .58];
    const recoil = [0, .055, .145, .245, .38];
    const attackPaper = crushCard(cardTimings.attack);
    const guardPaper = crushCard(cardTimings.prepare);
    const relaxed = { translate: move([0,0,0]), rotate: turn([0,0]) };
    const openPalm = {
        GripThumb: relaxed,
        GripFingers: { ...relaxed, scale: move([0,1,1]) },
        PaperFoldLeft: relaxed,
        PaperFoldRight: relaxed,
    };
    return {
        idle: {
            bones: {
                ...openPalm,
                Hips: { translate: move([0,0,0],[.55,-.5,-.75],[1.25,0,1.25],[1.85,.45,.5],[2.5,0,0]) },
                Chest: phrase(breath, [0,.6,-1.1,-.4,0]),
                Head: phrase(breath, [0,-.8,1.55,.8,0]),
                CloakFront: phrase(breath, [0,.45,-.65,-.4,0]),
                CloakFold: phrase(breath, [0,-.7,1.3,.55,0]),
                CloakBackMid: phrase([0,.72,1.49,2.02,2.5], [0,-1.2,1.4,.8,0]),
                CloakHem: phrase([0,.88,1.66,2.18,2.5], [0,-1.4,2.1,1.2,0]),
                CastArm: phrase(breath, [0,1.2,-1.4,-.35,0]),
                CastElbow: phrase(breath, [0,-1.8,2,1.2,0]),
                Wrist: phrase(breath, [0,2.8,-2.4,-1.2,0]),
                CastOrigin: {
                    ...phrase(breath, [0,3,5,-2,0]),
                    translate: move([0,0,0],[.55,-.8,2.8],[1.25,.4,4],[1.85,.8,-1],[2.5,0,0]),
                    scale: move([0,1,1]),
                },
                CoatHem: phrase(breath, [0,.65,-1,-.4,0]),
            },
        },
        attack: {
            ...attackPaper,
            bones: {
                ...attackPaper.bones,
                Hips: { translate: move([0,0,0],[.11,-1,-1],[.23,-2,-3],[.34,-3,-4],[.42,2,-5],[.51,1,-2],[.6,0,-.5],[.66,0,0]) },
                Chest: phrase(cast, [0,1,3,5,-5,-2,0,0]),
                Head: phrase(cast, [0,-1,-4,-7,-2,0,1,0]),
                CastArm: phrase(cast, [0,1,-6,-12,-17,-10,-2,0]),
                CastElbow: phrase(cast, [0,2,12,20,24,13,4,0]),
                Wrist: phrase(cast, [0,-3,4,7,12,6,-1,0]),
                RestArm: phrase(cast, [0,1,3,5,-3,-2,0,0]),
                CloakFront: phrase(cast, [0,.4,1,2,-1.5,-2,.5,0]),
                CloakFold: phrase(cast, [0,-.4,-.6,-1,1,2,.7,0]),
                CoatHem: phrase(cast, [0,-.4,-1,-2,1,.5,0,0]),
                CloakBackMid: phrase(cast, [0,.5,.7,1.2,-1.5,-2.5,-.5,0]),
                CloakHem: phrase(cast, [0,.3,.5,.8,.4,-1,-.7,0]),
            },
        },
        prepare: {
            ...guardPaper,
            bones: {
                ...guardPaper.bones,
                Hips: { translate: move([0,0,0],[.09,-1,-2],[.20,-3,-4],[.28,-4,-5],[.58,0,0]) },
                Chest: phrase(guard, [0,1,2.5,4,0]), Head: phrase(guard,[0,-1,-4,-5,0]),
                CloakFront: phrase(guard,[0,-.7,-1.5,-2,0]), CloakFold: phrase(guard,[0,.8,1.4,2,0]),
                CastArm: phrase(guard,[0,-3,-9,-14,0]), CastElbow: phrase(guard,[0,5,17,24,0]),
                Wrist: phrase(guard,[0,2,7,13,0]), CloakBackMid: phrase(guard,[0,.5,1.5,2.5,0]),
                CloakHem: phrase(guard,[0,0,1.5,3,0]),
            },
        },
        hurt: {
            bones: {
                ...openPalm,
                CastOrigin: { ...relaxed, scale: move([0,1,1]) },
                Hips: { translate: move([0,0,0],[.055,-14,-9],[.145,-9,-8],[.245,1,-2],[.38,0,0]) },
                Chest: phrase(recoil,[0,8,5,-1.5,0]), Head: phrase(recoil,[0,5,-3,1,0]),
                RestArm: phrase(recoil,[0,-4,-2.5,.7,0]),
                CastArm: phrase(recoil,[0,-13,-9,3,0]), CastElbow: phrase(recoil,[0,15,9,-3,0]),
                CloakFront: phrase(recoil,[0,-3.5,-6,2,0]), CloakFold: phrase(recoil,[0,3,5,-1,0]),
                CloakBackMid: phrase(recoil,[0,3,6,-2,0]), CloakHem: phrase(recoil,[0,-2,2,3,0]),
            },
        },
    };
}
module.exports = { motions, cardTimings, paperFragments };
