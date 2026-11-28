// Angles are local offsets. Stage translations use the original bestiary's Spine authoring helpers.
const gestures = {
    'stymphalian-bird': {
        cycle: 1.72, breath: 6, idle: {'near-wing':[8,.02],'far-wing':[-8,-.07],primaries:[-5,-.16],head:[-1.5,-.12],tail:[4,-.14],'near-talon':[3,-.22]},
        ready: .55, readyRot: {'near-wing':15,'far-wing':-13,primaries:-11,breast:-3,'near-talon':-14,tail:9},
        attack: .76, contact: .36, recoil: .32, drop: 3, travel: [-24,-6],
        strike: {breast:7,'near-wing':-23,'far-wing':20,primaries:14,'near-talon':-34,'far-talon':-27,neck:7,tail:-9},
        hurt: {neck:-9,breast:-4,'near-wing':17,'far-wing':-14,primaries:-13,'near-talon':12},
        fall: {breast:14,neck:17,head:7,'near-wing':-36,'far-wing':29,primaries:15,'near-talon':-21,tail:-13},
        sink: 69, rest: 1.12, weight: 'breast',
    },
    cyclops: {
        cycle: 2.58, breath: 1.6, idle: {head:[1.4,-.08],'near-shoulder':[.8,.05],'far-arm':[1.1,-.1],apron:[1.6,-.21]},
        ready: .88, readyRot: {torso:-3,head:4,'near-shoulder':-13,'near-arm':-28,'pounding-fist':9,'far-fist':8},
        attack: 1.03, contact: .60, recoil: .41, drop: 4, travel: [-15,-6],
        strike: {torso:5,head:5,'near-shoulder':9,'near-arm':16,'pounding-fist':-10,'far-shoulder':-9,apron:6},
        hurt: {torso:-4,head:-10,'near-shoulder':9,'pounding-fist':-6,apron:4},
        fall: {torso:7,head:24,'near-shoulder':-13,'near-arm':12,'pounding-fist':8,'far-arm':8,'near-leg':21,'near-foot':-23,'far-leg':-13,apron:12},
        sink: 43, rest: 1.24, weight: 'torso',
    },
    minotaur: {
        cycle: 2.15, breath: 1.6, idle: {head:[2,-.08],'near-shoulder':[1.3,.07],'far-arm':[1.3,-.08],kilt:[1.8,-.2]},
        ready: .89, readyRot: {chest:4,head:17,'near-shoulder':-10,'near-arm':-6,'far-arm':13,kilt:-6},
        attack: .99, contact: .52, recoil: .40, drop: 6, travel: [-29,2],
        strike: {chest:8,head:12,'near-shoulder':-14,'near-arm':-8,'far-arm':17,'near-leg':10,'near-hoof':-12,'far-leg':-10,'far-hoof':12,kilt:-9},
        hurt: {chest:-4,head:-12,'near-arm':9,'far-arm':-11,kilt:7},
        fall: {chest:12,head:18,'near-shoulder':-8,'near-arm':12,'far-arm':-12,'near-leg':20,'near-hoof':-28,'far-leg':-21,'far-hoof':24,kilt:-9},
        sink: 48, rest: 1.27, weight: 'chest',
    },
    hydra: {
        cycle: 2.65, breath: .35, idle: {'low-neck':[3.2,.02],'low-head':[-3,-.08],'mid-neck':[-2.8,.32],'mid-throat':[2.6,.20],'mid-head':[2,.13],'high-neck':[2.3,.55],'high-throat':[-3,.44],'high-head':[2,.36]},
        ready: .76, readyRot: {'low-neck':-8,'mid-neck':-7,'high-neck':-5,'low-head':8,'mid-throat':7,'high-throat':5},
        attack: 1.14, contact: .64, recoil: .40, drop: 0, travel: [-2,0],
        strike: {'low-neck':13,'low-head':-9,'mid-neck':15,'mid-throat':-9,'mid-head':-6,'high-neck':-4,'high-throat':6,'high-head':-7},
        // Two heads feint in succession. The middle throat extends on the single damage cue.
        attackAngles: {'low-neck':[0,14,5,0,-3,0],'low-head':[0,-9,0,-3,2,0],
            'high-neck':[0,-5,11,2,-2,0],'high-head':[0,3,-8,2,3,0]},
        hurt: {'low-neck':-13,'low-head':8,'mid-neck':-8,'mid-head':7,'high-neck':-7,'high-head':8},
        fall: {'low-neck':22,'low-head':15,'mid-neck':28,'mid-throat':14,'mid-head':12,'high-neck':31,'high-throat':16,'high-head':15},
        sink: 2, rest: 1.38, weight: 'coils',
    },
};

function tideClips({ idle, gesture, movement }) {
    const times = [0,.23,.48,.68,.79,1.18];
    const attack = movement(times, {
        vortex:[0,3,5,-5,-3,0], 'near-lip':[0,5,7,-8,-4,0],
        crest:[0,6,9,-14,-9,0], 'foam-ribbon':[0,-4,-8,11,6,0],
    }, {
        'shard-high':[[0,0],[6,5],[15,13],[-20,23],[-11,9],[0,0]],
        'shard-mid':[[0,0],[7,7],[20,17],[-23,12],[-13,6],[0,0]],
        'shard-low':[[0,0],[3,4],[13,12],[-12,7],[-5,3],[0,0]],
    }, {hollow:[[1,1],[.82,.93],[.65,.77],[1.14,1.07],[1.09,1.03],[1,1]]});
    attack.events=[{time:.68,name:'impact'}];
    return {contact:.68,animations:{
        idle:idle(2.6,1,{vortex:[1.5,0],crest:[2,-.19],'near-lip':[-2,-.1],'foam-ribbon':[2.4,-.21]},
            {'shard-high':[[1.4,0],[3.3,.1]],'shard-mid':[[1.2,.12],[2.8,.32]],'shard-low':[[.6,.1],[1.8,.18]]}),
        prepare:movement([0,.33,.69,.92],{crest:[0,3,7,0],'near-lip':[0,3,6,0]},
            {vortex:[[0,0],[0,-3],[0,-8],[0,0]],'shard-mid':[[0,0],[7,6],[13,11],[0,0]]},
            {hollow:[[1,1],[.89,.94],[.68,.78],[1,1]]}),
        attack, hurt:gesture(.42,[0,.19,.45,.75,1],[0,1,.6,-.12,0],{vortex:-5,crest:8,'near-lip':-6,'foam-ribbon':6}),
        death:movement([0,.23,.68,1.07,1.28],{vortex:[0,1,-4,-6,-6],crest:[0,-5,5,12,12],'near-lip':[0,3,-5,-9,-9]},
            {vortex:[[0,0],[0,-5],[0,-30],[0,-53],[0,-53]],'shard-high':[[0,0],[3,4],[6,-53],[7,-82],[7,-82]],
             'shard-mid':[[0,0],[5,2],[11,-36],[12,-57],[12,-57]],'shard-low':[[0,0],[2,1],[4,-22],[4,-37],[4,-37]],
             'foam-ribbon':[[0,0],[0,-2],[0,-14],[0,-35],[0,-35]]},
            {vortex:[[1,1],[1.04,.94],[.87,.56],[.65,.27],[.65,.27]],hollow:[[1,1],[.92,.93],[.72,.66],[.45,.5],[.45,.5]],
             'foam-ribbon':[[1,1],[1,.97],[.92,.68],[.75,.40],[.75,.40]]}),
    }};
}
function rockClips({ idle, gesture, movement }) {
    const times=[0,.29,.49,.62,.71,.88,1.22];
    const attack=movement(times,{'left-rock':[0,4,6,-11,-10,-5,0],'right-rock':[0,-3,-5,9,8,4,0]},
        {'left-rock':[[0,0],[-3,0],[-5,0],[11,0],[10,0],[6,0],[0,0]],
         'right-rock':[[0,0],[3,0],[5,0],[-11,0],[-10,0],[-6,0],[0,0]],
         'splinter-heavy':[[0,0],[-1,1],[2,4],[1,14],[-3,22],[-6,8],[0,0]],
         'splinter-light':[[0,0],[2,0],[2,2],[-5,11],[-7,17],[-9,6],[0,0]]});
    attack.events=[{time:.62,name:'impact'}];
    return {contact:.62,animations:{
        idle:idle(2.85,1,{'left-rock':[.8,.04],'right-rock':[-.5,.14],'splinter-light':[4,.22]},
            {'splinter-heavy':[[0],[1.7,.08]],'splinter-light':[[.5,.1],[2.5,.22]]}),
        prepare:gesture(.91,[0,.26,.61,.86,1],[0,.55,1,.93,0],{'left-rock':5.5,'right-rock':-4.5},
            {'left-rock':[-5,0],'right-rock':[5,0],'splinter-heavy':[2,5]}),
        attack,hurt:gesture(.46,[0,.18,.41,.73,1],[0,1,.6,-.11,0],{'left-rock':-2.5,'right-rock':2.2,'left-facet':3,'right-facet':-3}),
        death:movement([0,.22,.56,.94,1.32],{'left-rock':[0,-2,5,14,14],'right-rock':[0,1,-5,-11,-11]},
            {'left-rock':[[0,0],[-2,0],[-6,-8],[-13,-25],[-13,-25]],
             'right-rock':[[0,0],[1,0],[6,-7],[12,-20],[12,-20]],
             'splinter-heavy':[[0,0],[0,4],[0,-19],[-2,-48],[-2,-48]],
             'splinter-light':[[0,0],[0,2],[0,-13],[3,-31],[3,-31]]}),
    }};
}
function mythicClips(rig, tracks) {
    if(rig.id==='charybdis')return tideClips(tracks);
    if(rig.id==='symplegades')return rockClips(tracks);
    const {idle, gesture, movement}=tracks;
    const g = gestures[rig.id], w = g.weight, times = [0, g.contact * .48, g.contact * .74, g.contact, g.contact + .07, g.attack];
    const strength = [0,-.53,-.69,1,.84,0];
    const angles = Object.fromEntries(Object.entries(g.strike).map(([part, angle]) =>
        [part, strength.map(amount => angle * amount)]));
    const stride = [[0,0],[5,-g.drop],[8,-g.drop],g.travel,[g.travel[0] * .82, g.travel[1] * .62],[0,0]];
    const fall = gesture(g.rest,[0,.12,.56,.80,1],[0,-.08,.83,1,1],g.fall,{[w]:[4,-g.sink]});
    const attack = movement(times, { ...angles, ...g.attackAngles }, { [w]: stride });
    attack.events = [{time:g.contact,name:'impact'}];
    return {contact:g.contact,animations:{
        idle:idle(g.cycle,1,g.idle,{[w]:[[0],[g.breath]]}),
        prepare:gesture(g.ready,[0,.25,.58,.83,1],[0,.6,1,.88,0],g.readyRot,{[w]:[3,-g.drop]}),
        attack, hurt:gesture(g.recoil,[0,.21,.49,.76,1],[0,1,.62,-.09,0],g.hurt,{[w]:[9,2]}),
        death:fall,
    }};
}
module.exports = { mythicClips };
