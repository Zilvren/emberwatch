// Times are seconds; each bone channel is relative to the illustrated setup pose.
const turn = (...keys) => keys.map(([time, angle]) => ({ time, angle }));
const move = (...keys) => keys.map(([time, x, y]) => ({ time, x, y }));

function phrase(times, angles) {
    return { rotate: turn(...angles.map((angle, index) => [times[index], angle])) };
}

function motions() {
    const breath = [0, .55, 1.25, 1.85, 2.5];
    const cast = [0, .12, .17, .23, .29, .43, .55, .66];
    const guard = [0, .075, .16, .28, .58];
    const recoil = [0, .055, .145, .245, .38];
    return {
        idle: {
            bones: {
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
                },
                CoatHem: phrase(breath, [0,.65,-1,-.4,0]),
            },
        },
        attack: {
            bones: {
                Hips: { translate: move([0,0,0],[.12,-4,-4],[.17,-5,-5],[.23,9,-2],[.29,12,-1],[.43,6,-3],[.55,1,-1],[.66,0,0]) },
                Chest: phrase(cast, [0,5,7,-9,-10,-4,1,0]),
                Head: phrase(cast, [0,-5,-7,7,7,4,-.5,0]),
                CastArm: phrase(cast, [0,-23,-30,51,55,35,9,0]),
                CastElbow: phrase(cast, [0,31,45,-81,-89,-55,-12,0]),
                Wrist: phrase(cast, [0,16,21,-25,-30,-10,5,0]),
                RestArm: phrase(cast, [0,6,8,-8,-13,-6,1,0]),
                CloakFront: phrase(cast, [0,1.8,3,-1,-3.5,-4.5,1,0]),
                CloakFold: phrase(cast, [0,-1,-1.5,1.5,4,6,-1,0]),
                CoatHem: phrase(cast, [0,-2,-3,1,-4,-7,2,0]),
                CloakBackMid: phrase(cast, [0,1.5,2.4,-3,-6,-8,1.5,0]),
                CloakHem: phrase(cast, [0,.8,1.6,3,-2,-7,-2.5,0]),
            },
            slots: { card: { attachment: [{time:0,name:'card'},{time:.23,name:null}] } },
            events: [{time:.23,name:'release'},{time:.47,name:'impact'}],
        },
        prepare: {
            bones: {
                Hips: { translate: move([0,0,0],[.075,-2,-3],[.16,-4,-7],[.28,-3,-5],[.58,0,0]) },
                Chest: phrase(guard, [0,3,7,5,0]), Head: phrase(guard,[0,-3,-6,-4,0]),
                CloakFront: phrase(guard,[0,-2,-4.5,-2.5,0]), CloakFold: phrase(guard,[0,2,4,3,0]),
                CastArm: phrase(guard,[0,-9,-32,-23,0]), CastElbow: phrase(guard,[0,13,42,30,0]),
                Wrist: phrase(guard,[0,5,18,9,0]), CloakBackMid: phrase(guard,[0,1,3,4,0]),
                CloakHem: phrase(guard,[0,0,1.5,3,0]),
            },
            slots: { card: { attachment: [{time:0,name:'card'},{time:.13,name:null}] } },
            events: [{time:.13,name:'release'},{time:.16,name:'impact'}],
        },
        hurt: {
            bones: {
                Hips: { translate: move([0,0,0],[.055,-14,-9],[.145,-9,-8],[.245,1,-2],[.38,0,0]) },
                Chest: phrase(recoil,[0,18,12,-3,0]), Head: phrase(recoil,[0,9,-6,2,0]),
                CastArm: phrase(recoil,[0,-27,-18,5,0]), CastElbow: phrase(recoil,[0,29,17,-5,0]),
                CloakFront: phrase(recoil,[0,-3.5,-6,2,0]), CloakFold: phrase(recoil,[0,3,5,-1,0]),
                CloakBackMid: phrase(recoil,[0,3,6,-2,0]), CloakHem: phrase(recoil,[0,-2,2,3,0]),
            },
        },
    };
}
module.exports = { motions };
