// Import display references; never replace the playable teaching catalog.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=JSON.parse(fs.readFileSync(path.join(root,'docs/sources/formal-system-overview.json'),'utf8'));
const sheet=source.sheets.find(s=>s.name==='战斗与卡牌');if(!sheet)throw Error('Missing card reference worksheet');
const art={basic_attack:'attack',basic_dodge:'dodge',heavy_hit:'heavy',cleaver:'knife',slash:'slash',enhanced_dodge:'evade',repair:'repair',rope:'rope',battery:'battery',cash:'cash'};
const cards=[];
for(let index=4;index<14;index++){
 const row=sheet.values[index],id=row[0];if(typeof id!=='string'||!art[id])throw Error('Unexpected card row '+(index+1));
 const keywords=[];if(row[2]==='基础牌')keywords.push('basic');if(row[2]==='武器牌')keywords.push('weapon');if(row[6]==='使用后消失')keywords.push('consumable');
 cards.push({id,name:row[1],type:row[2],combatEligibility:row[3]==='是'?'yes':row[3]==='否'?'no':'configurable',staminaCost:typeof row[4]==='number'?row[4]:null,weight:row[5],afterUse:row[6],combatText:row[7],utilityText:row[8],keywords,art:art[id],sourceRow:index+1});
}
const result={version:1,usage:'component-design-reference',source:{file:'docs/sources/formal-system-overview.xlsx',sha256:source.sha256,sheet:sheet.name,range:'A5:I14'},cards};
fs.writeFileSync(path.join(root,'assets/resources/ui/card-reference.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({referenceCards:cards.length,playableCatalogChanged:false}));
