const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'output/playwright/spine08-binding-fix');fs.mkdirSync(out,{recursive:true});
for(const actor of ['survivor','wanderer','brute']){
 const dir=path.join(root,'art-source/spine08/parts',actor),m=JSON.parse(fs.readFileSync(path.join(dir,'parts.json'))),w=1090,h=Math.ceil(m.parts.length/5)*190+95;
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#e5e1d6"/><text x="24" y="36" font-family="Microsoft YaHei,sans-serif" font-size="23" fill="#363b31">${actor} · ${m.parts.length} 张独立部件 PNG</text><text x="24" y="62" font-family="Microsoft YaHei,sans-serif" font-size="13" fill="#62685c">实际源文件；原画提取与关节补绘分别记录</text>`;
 for(const [i,p]of m.parts.entries()){
  const x=20+i%5*210,y=80+Math.floor(i/5)*190,png=fs.readFileSync(path.join(dir,p.name+'.png')).toString('base64');
  svg+=`<rect x="${x}" y="${y}" width="200" height="180" rx="5" fill="#f7f4eb" stroke="#c7c3b7"/><image x="${x+8}" y="${y+8}" width="184" height="133" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${png}"/><text x="${x+9}" y="${y+158}" font-family="Microsoft YaHei,sans-serif" font-size="13" fill="#363b31">${p.name}.png</text><text x="${x+9}" y="${y+174}" font-family="Microsoft YaHei,sans-serif" font-size="10" fill="#62685c">${p.mode?'遮挡/关节补绘':'原画提取'} · ${p.bone}</text>`;
 }
 fs.writeFileSync(path.join(out,actor+'-parts.svg'),svg+'</svg>');
}
console.log('Three source-file overviews written.');
