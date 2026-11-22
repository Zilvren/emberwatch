const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
function packParts(rig,runtime,working,spine){
 const dir=fs.mkdtempSync(path.join(working,rig.actor+'-pack-')),input=path.join(dir,'input'),output=path.join(dir,'output');fs.mkdirSync(input);fs.mkdirSync(output);
 for(const p of rig.parts)fs.copyFileSync(path.join(rig.partFolder,p.name+'.png'),path.join(input,p.name+'.png'));
 const settings={pot:true,paddingX:4,paddingY:4,edgePadding:true,duplicatePadding:true,rotation:false,minWidth:16,minHeight:16,maxWidth:1024,maxHeight:1024,square:false,stripWhitespaceX:false,stripWhitespaceY:false,alphaThreshold:0,filterMin:'Linear',filterMag:'Linear',wrapX:'ClampToEdge',wrapY:'ClampToEdge',format:'RGBA8888',alias:false,outputFormat:'png',ignoreBlankImages:false,fast:false,debug:false,silent:false,combineSubdirectories:false,flattenPaths:true,premultiplyAlpha:false,useIndexes:false,bleed:true,scale:[1],scaleSuffix:[''],atlasExtension:'.atlas'};
 const file=path.join(dir,'pack.json');fs.writeFileSync(file,JSON.stringify(settings));
 const result=spawnSync(spine,['-i',input,'-o',output,'-n',rig.actor+'-parts','-p',file],{encoding:'utf8',timeout:120000,windowsHide:true,maxBuffer:8*1024*1024});fs.writeFileSync(path.join(dir,'pack.log'),result.stdout+'\n'+result.stderr);if(result.status!==0)throw Error('Part atlas packing failed '+rig.actor);
 let atlas=fs.readFileSync(path.join(output,rig.actor+'-parts.atlas'),'utf8');
 const publish=(file,bytes)=>{const tmp=path.join(dir,path.basename(file)+'.publish');fs.writeFileSync(tmp,bytes);for(let attempt=0;;attempt++){try{fs.renameSync(tmp,file);return;}catch(e){if(attempt>=8)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,150);}}};
 for(const name of fs.readdirSync(output).filter(f=>f.endsWith('.png')))publish(path.join(runtime,name),fs.readFileSync(path.join(output,name)));
 publish(path.join(runtime,rig.actor+'.atlas'),atlas);
 return {pages:fs.readdirSync(output).filter(f=>f.endsWith('.png')),partCount:rig.parts.length};
}
module.exports={packParts};
