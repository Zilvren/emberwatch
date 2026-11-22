const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = path.resolve(__dirname, '../art-source/ashen-labyrinth/battle-survivor/spine');
const runtime = JSON.parse(fs.readFileSync(path.join(base, 'runtime/survivor.json')));
const animations = runtime.animations;
const skins = runtime.skins[0].attachments;
const bone = name => runtime.bones.find(b => b.name === name);

test('the cropped trouser and sleeve cuffs do not determine the knee or elbow pivots', () => {
    for (const [top, bottom] of [['near-thigh', 'near-shin'], ['far-thigh', 'far-shin'], ['near-sleeve', 'near-bracer']]) {
        const ratio = bone(top).length / bone(bottom).length;
        assert.ok(ratio > .86 && ratio < 1.16, top + ' does not match the registered joint location');
    }
    assert.equal(skins['near-sleeve']['near-sleeve'].type, 'mesh');
    assert.equal(skins['near-thigh']['near-full'].type, 'mesh');
    assert.equal(animations.attack.slots['near-thigh'].attachment[0].name, 'near-full');
});

test('the airborne card can finish independently and the next card is drawn at the beginning of a stroke', () => {
    const fire = animations.attack, overlay = animations['card-flight'];
    const release = fire.events.find(e => e.name === 'release').time;
    const impact = fire.events.find(e => e.name === 'impact').time;
    assert.ok(impact > release);
    assert.equal(fire.slots['held-card'].attachment.filter(k => k.name === 'card').length, 1);
    assert.ok(fire.slots['held-card'].attachment.find(k => k.name === 'card').time < .05);
    assert.equal(fire.slots['held-card'].attachment.at(-1).name ?? null, null);
    for (const type of ['translate', 'rotate']) {
        const main = fire.bones['flight-card'][type], aux = overlay.bones['flight-card'][type];
        assert.equal(main.length, aux.length);
        main.forEach((key,i) => {
            assert.ok(Math.abs(key.time-release-(aux[i].time??0)) < .002);
            for (const field of ['x','y','angle']) if (field in key) assert.ok(Math.abs(key[field]-(aux[i][field]??0)) < .02);
        });
    }
    assert.ok(!overlay.events?.length);
    assert.equal(animations['carry-card'].slots['held-card'].attachment[0].name, 'card');
});

test('the actual exported fall retains ground-contact mesh corrections', () => {
    const corrective=animations.death.deform.default;
    for (const name of ['back-flap','inner-skirt','hips-lining','ration-bag']) {
        assert.equal(skins[name][name].type,'mesh');
        assert.ok(corrective[name][name].some(frame=>frame.vertices?.some(value=>Math.abs(value)>.1)));
    }
});

test('the left hand grips both faces of the card and opens its fingers on bones', () => {
    const order=runtime.slots.map(s=>s.name),card=order.indexOf('held-card');
    assert.ok(order.indexOf('cast-index')<card && card<order.indexOf('cast-thumb'));
    assert.ok(order.indexOf('cast-sleeve') < order.indexOf('cast-bracer'));
    assert.equal(bone('cast-index-tip').parent,'cast-index');
    assert.equal(bone('cast-index-nail').parent,'cast-index-tip');
    assert.equal(bone('cast-middle-tip').parent,'cast-middle');
    assert.equal(bone('cast-thumb').parent,'cast-palm');
    const span=bone('cast-palm').length/bone('near-hand').length;
    assert.ok(span>.84 && span<1.05, 'The wrist-to-pinch span should be close to the other hand.');
    assert.equal(skins['cast-middle']['cast-middle'].type,'mesh');
    assert.equal(skins['cast-index']['cast-index'].type,'mesh');
    const fire=animations.attack;
    for(const slot of ['cast-palm','cast-thumb','cast-index','cast-middle']){
        assert.deepEqual(fire.slots[slot].attachment.map(k=>k.name),[slot]);
    }
    const curl=(name,t)=>{
        const keys=fire.bones[name].rotate;
        let i=0;while(i+1<keys.length&&(keys[i+1].time??0)<=t)i++;
        const a=keys[i],b=keys[i+1];if(!b)return a.angle??0;
        const f=(t-(a.time??0))/((b.time??0)-(a.time??0));
        return (a.angle??0)+((b.angle??0)-(a.angle??0))*f;
    };
    assert.ok(curl('cast-index-tip',.49)-curl('cast-index-tip',.355)>22);
    assert.ok(curl('cast-index-nail',.49)-curl('cast-index-nail',.355)>12);
    assert.ok(curl('cast-middle-tip',.50)-curl('cast-middle-tip',.355)>65);
    assert.ok(curl('cast-thumb',.392)-curl('cast-thumb',.355)<-8);
    for(const n of ['cast-thumb','cast-index','cast-index-tip','cast-index-nail','cast-middle','cast-middle-tip'])
        assert.ok(animations['carry-card'].bones[n].rotate.length);
});
