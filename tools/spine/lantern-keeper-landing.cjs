// Author a discrete exposure sheet from the approved paintings. The game only
// loads the resulting atlas regions; the Python image tools run during authoring.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PNG, identifyParts, extractPart } = require('./bestiary-assets.cjs');
const duration = 1.02;

// Registered clean fabric for the three grounded drawings.
const coverWidth = 144,
    coverHeight = 210;
const coverOrigins = [
    [167, 769],
    [640, 773],
    [1146, 771],
];
function applyFarArmCover(sheet, atlas) {
    if (
        sheet.width !== 1536 ||
        sheet.height !== 1024 ||
        (atlas.width !== coverWidth * 3 && atlas.width !== coverWidth * 4) ||
        atlas.height !== coverHeight
    )
        throw Error('Unexpected landing artwork registration');
    coverOrigins.forEach(([left, top], i) =>
        PNG.bitblt(atlas, sheet, i * coverWidth, 0, coverWidth, coverHeight, left, top)
    );
}

// The two approach drawings use the same painted cuff and knuckles as first
// contact. Frame one and the three grounded drawings need no approach patch.
function applyRightArmApproach(sheet, approach) {
    if (
        sheet.width !== 1536 ||
        sheet.height !== 1024 ||
        approach.width !== 696 ||
        approach.height !== 270
    )
        throw Error('Unexpected right-arm approach registration');
    PNG.bitblt(approach, sheet, 0, 0, 348, 270, 601, 154);
    PNG.bitblt(approach, sheet, 348, 0, 348, 270, 1127, 207);
}

function addLanding({paint,cover,approach,parts,slots,attachments,images,spec}) {
    applyFarArmCover(paint,cover);
    applyRightArmApproach(paint,approach);
    const {cells,ids}=identifyParts(paint,3,2);
    const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'lantern-frames-'));
    const save=(file,image)=>fs.writeFileSync(path.join(scratch,file),PNG.sync.write(image));
    try {
        const keys=cells.map((cell,index)=>{
            const {image,sourceXYWH}=extractPart(paint,ids,cell);
            save('pose-'+index+'.png',image);
            return sourceXYWH.slice(0,2);
        });
        const standing=parts.filter(({id})=>id!=='card').map(({id,bounds})=>{
            save(id+'.png',images.get(id));
            return {id,bounds};
        });
        fs.writeFileSync(path.join(scratch,'inputs.json'),JSON.stringify({keys,standing,spec}));
        execFileSync(process.env.PYTHON || 'python',['-B',path.join(__dirname,'lantern-keeper-frames.py'),scratch],{stdio:'inherit'});
        const registration=JSON.parse(fs.readFileSync(path.join(scratch,'frames.json'),'utf8'));
        const body='landing-body', visibility={};
        for(const slot of slots) {
            if(slot.name==='card') {
                visibility.card={color:[{time:0,color:'ffffffff'},{time:.065,color:'ffffff00'}],
                    attachment:[{time:.07,name:null}]};
            } else visibility[slot.name]={attachment:[{time:0,name:null}]};
        }
        slots.push({name:body,bone:'PoseRoot'});
        attachments[body]={};
        const exposure=[];
        for(const {name,time,x,y,width,height} of registration.frames) {
            const file='landing-'+name, image=PNG.sync.read(fs.readFileSync(path.join(scratch,file+'.png')));
            images.set(file,image);
            attachments[body][name]={type:'region',path:file,x,y,width,height};
            exposure.push({time,name});
        }
        exposure.push({time:duration,name:exposure.at(-1).name});
        visibility[body]={attachment:exposure};
        return {clip:{slots:visibility},registration};
    } finally {
        fs.rmSync(scratch,{recursive:true,force:true});
    }
}
module.exports={addLanding,duration,applyFarArmCover,applyRightArmApproach};
