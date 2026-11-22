const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {project,hash,json,PNG}=require('./bestiary-assets.cjs');
const {sourceDir,dir,originalHash}=require('./survivor-battle.cjs');
const sdk=path.join(process.env.APPDATA,'cocos-default','cocos-'+require(path.join(project,'.pink/settings.json'))['cocos.engine.version']);
const modules=process.env.SURVIVOR_NODE_MODULES||sdk;
const sharp=require(require.resolve('sharp',{paths:[modules]}));
const JSZip=require(require.resolve('jszip',{paths:[modules]}));
const sourceNames={
  head:'头与面部','hair-lock':'后发束',scarf:'围巾',hood:'兜帽',mantle:'肩披','coat-skirt':'前侧披布','back-flap':'后披片','tunic-lining':'侧面内襟',
  chest:'胸腹',hips:'腰带与骨盆',strap:'斜肩带','ration-bag':'布袋','card-case':'腰牌匣','near-sleeve':'近侧上臂','near-bracer':'近侧护臂','near-hand':'近侧手掌',
  'near-thigh':'近侧大腿','near-shin':'近侧小腿','near-boot':'近侧靴','far-thigh':'远侧大腿','far-shin':'远侧小腿','far-boot':'远侧靴',
  'cast-sleeve':'持牌侧上臂','cast-bracer':'持牌侧前臂','cast-palm':'左掌、无名指与小指','cast-index':'左手食指','cast-middle':'左手中指','cast-thumb':'左手拇指','card':'卡牌','inner-tunic':'衣身衬层','inner-skirt':'披布衬层',
  'hips-lining':'髋部衬层','near-trouser-lining':'裤腿衬层','knee-lining':'膝盖衬层','near-underarm':'袖根衬层',
};
async function partsSheet(parts){
  assert.deepEqual(parts.map(p=>p.name).sort(),Object.keys(sourceNames).sort());
  const columns=7,W=columns*160,H=Math.ceil(parts.length/columns)*214,tiles=[],texts=[];
  for(const [i,[name,title]] of Object.entries(sourceNames).entries()){
    const x=(i%columns)*160,y=Math.floor(i/columns)*214;
    const pic=await sharp(path.join(dir,'parts',name+'.png')).trim({threshold:4}).resize(135,153,{fit:'contain',background:{r:61,g:54,b:66,alpha:0}}).png().toBuffer();
    tiles.push({input:pic,left:x+12,top:y+6});
    texts.push('<path d="M'+(x+8)+' '+(y+209)+'h144" stroke="#5c535f"/><text x="'+(x+80)+'" y="'+(y+179)+'" font-size="17">'+title+'</text><text x="'+(x+80)+'" y="'+(y+199)+'" font-size="12" fill="#c8bbbd">'+name+'</text>');
  }
  tiles.push({input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'"><g text-anchor="middle" fill="#eee2d4" font-family="Microsoft YaHei,sans-serif">'+texts.join('')+'</g></svg>'),left:0,top:0});
  await sharp({create:{width:W,height:H,channels:3,background:'#443c49'}}).composite(tiles).png().toFile(path.join(dir,'parts-sheet.png'));
}
function parsed(file){return JSON.parse(fs.readFileSync(file));}
async function packageProject(){
  const qa=process.env.SURVIVOR_CAPTURE||path.join(project,'output/playwright/ashen-survivor');
  const reg=parsed(path.join(dir,'parts-register.json')),report=parsed(path.join(dir,'export-report.json'));
  const video=parsed(path.join(qa,'runtime-check.json')),media=parsed(process.env.SURVIVOR_MEDIA_CHECK||path.join(qa,'media-playback.json'));
  const artifact=path.join(sourceDir,'survivor-spine-3.8.75-r3.zip');
  assert.equal(hash(fs.readFileSync(path.join(sourceDir,'turnaround-golden-master.png'))),originalHash);
  assert.equal(reg.selectedSha256,originalHash);assert.equal(report.images,reg.parts.length);
  const runtime=parsed(path.join(dir,'runtime/survivor.json'));
  assert.deepEqual(runtime.animations.attack.events.map(e=>e.name),['release','impact']);
  for(const part of reg.parts){
    const file=path.join(dir,'parts',part.name+'.png'),buf=fs.readFileSync(file),im=PNG.sync.read(buf);
    assert.equal(hash(buf),part.sha256);
    assert.deepEqual([im.width,im.height],part.png);
    assert.ok(im.data.some((a,i)=>i%4===3&&a===255)&&im.data.some((a,i)=>i%4===3&&a===0),'Empty or opaque sheet: '+part.name);
  }
  const heroMeta=parsed(path.join(project,'assets/ashen-survivor/survivor.json.meta')),prefab='assets/prefabs/actors/AshenSurvivor.prefab',scene='assets/SurvivorSpineReview.scene';
  assert.equal(heroMeta.importer,'spine-data');assert.ok(heroMeta.imported);assert.equal(parsed(path.join(project,prefab)).find(k=>k.__type__==='sp.Skeleton')._skeletonData.__uuid__,heroMeta.uuid);
  for(const f of ['survivor.json','survivor.atlas',...report.atlasPages])assert.equal(hash(fs.readFileSync(path.join(dir,'runtime',f))),hash(fs.readFileSync(path.join(project,'assets/ashen-survivor',f))));
  await partsSheet(reg.parts);
  const hand=parsed(process.env.SURVIVOR_HAND_CHECK||path.join(qa,'after/hand-check.json'));
  assert.equal(hand.errors.length,0);assert.ok(hand.film?.captured>0&&hand.film?.encoded>45);
  const record={project:'The end',date:'2026-11-20',revision:3,character:'青年求生者',status:'已重作左手手型、袖口接合和拇指、食指及中指的出牌动作，手感待用户评审',
    selectedSource:{file:'../turnaround-golden-master.png',sha256:originalHash,view:'正交右侧面',registration:reg.crop},
    parts:{selected:reg.parts.filter(p=>p.visiblePixels>0).length,hidden:reg.parts.filter(p=>p.underlay).length,battle:reg.parts.filter(p=>p.battleOnly).length,total:reg.parts.length,reassembly:reg.setupAudit},
    export:report,events:runtime.animations.attack.events,native:{platform:'web-desktop',sdk:require(path.join(project,'.pink/settings.json'))['cocos.engine.version'],scene,prefab,build:'build/survivor-spine-review',importUuid:heroMeta.uuid,...video},
    media,leftHand:hand,workflow:['tools/spine/survivor-profile.cjs','tools/spine/survivor-surfaces.cjs','tools/spine/survivor-left-hand.cjs','tools/spine/survivor-battle.cjs','tools/spine/survivor-battle-motion.cjs','tools/spine/survivor-cocos.cjs','tools/spine/survivor-preview.cjs','tools/spine/survivor-hand-review.cjs','tools/spine/survivor-motion-check.cjs'],
    archive:'viking://~/resources/projects/the-end/designs/ashen-labyrinth-battle-survivor/animation'};
  json(path.join(dir,'verification.json'),record);
  const paths=['joint-underpaint.png','coat-underpaint.png','left-hand-poses.png','left-hand-release.png','left-elbow.png','turnaround-golden-master.png','head-turnaround.png'];
  for(const f of ['survivor.spine','survivor.authoring.json','profile-source.png','parts-register.json','export-report.json','verification.json','setup.png','parts-sheet.png','README.md','motion-review.md'])paths.push('spine/'+f);
  for(const part of reg.parts)paths.push('spine/parts/'+part.name+'.png');
  for(const f of ['survivor.json','survivor.atlas',...report.atlasPages])paths.push('spine/runtime/'+f);
  for(const f of ['battle-ready.png','motion-poses.png','survivor-motion.gif','survivor-motion.webm','left-hand-comparison.png','left-hand-motion-r3.gif'])paths.push('spine/preview/'+f);
  const zip=new JSZip();zip.file('README.md',fs.readFileSync(path.join(dir,'README.md')));
  for(const f of paths)zip.file(f,fs.readFileSync(path.join(sourceDir,f)),{compression:/\.(?:png|gif|webm)$/.test(f)?'STORE':'DEFLATE'});
  const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
  fs.writeFileSync(artifact,bytes);
  const reopened=await JSZip.loadAsync(fs.readFileSync(artifact),{checkCRC32:true});
  for(const f of paths)assert.equal(hash(await reopened.file(f).async('nodebuffer')),hash(fs.readFileSync(path.join(sourceDir,f))));
  const delivery={project:'The end',date:'2026-11-20',revision:3,zip:path.relative(project,artifact).split(path.sep).join('/'),bytes:bytes.length,sha256:hash(bytes),files:paths.length+1,zipReadback:true};
  json(path.join(dir,'delivery.json'),delivery);console.log(JSON.stringify(delivery));
}
packageProject().catch(e=>{console.error(e);process.exit(1);});
