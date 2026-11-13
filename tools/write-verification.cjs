const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const must=(value,message)=>{if(!value)throw new Error(message);};
const result=p=>{const line=read(p).split(/\r?\n/).find(line=>line.trim().startsWith('{'));return JSON.parse(line);};
const browser={routeA:result('temp/browser-route-a.log'),routeB:result('temp/browser-route-b.log'),accessibility:result('temp/browser-accessibility.log'),input:result('temp/browser-input-check.log')};
for(const [name,value] of Object.entries(browser)){must(value.passed,`${name} did not pass`);must(!value.runtimeErrors.length,`${name} has runtime errors`);}
must(browser.routeA.final.phase==='day2'&&browser.routeB.final.phase==='day2','Both routes must reach day two');
must(browser.routeA.second.weaponDemonstrated&&browser.routeA.dragCancelled,'Weapon or drag checks missing');
must(browser.routeB.failureRetry&&browser.routeB.shortfallConfirmed,'Failure or repair checks missing');
must(browser.input.rapidAttackSingleApply&&browser.input.dragSurvivesToastExpiry,'Input stability checks missing');
const tap=read('output/rules-tests.tap'),passed=Number(tap.match(/^# pass (\d+)/m)?.[1]),failed=Number(tap.match(/^# fail (\d+)/m)?.[1]);
must(passed===32&&failed===0,'Expected all 32 rule tests to pass');
const unitNames=[...tap.matchAll(/^ok \d+ - (.+)$/gm)].map(m=>m[1].trim());
const build=JSON.parse(read('temp/game-build-v2.log'));must(build.result.code===200&&build.result.data.code===0,'MCP build did not succeed');
const mcp=JSON.parse(read('output/game-mcp.json'));must(mcp.connected&&mcp.sceneOpen.code===200&&mcp.gameNode.code===200,'MCP scene checks failed');
must(mcp.gameNode.data.components.some(c=>c.type==='SurvivalView'),'Game controller is not attached');
const consoleLog=read('output/browser-console.txt');must(/Errors: 0, Warnings: 0/.test(consoleLog),'Browser console is not clean');
const config=JSON.parse(read('.pink/settings.json'));const engine=path.join(process.env.APPDATA,'cocos-default',`cocos-${config['cocos.engine.version']}`);
const typecheck=spawnSync(process.execPath,[path.join(engine,'node_modules/typescript/bin/tsc'),'-p',path.join(root,'tsconfig.json'),'--noEmit','--pretty','false'],{encoding:'utf8',cwd:root});
must(typecheck.status===0,typecheck.stdout+typecheck.stderr);fs.writeFileSync(path.join(root,'output/typecheck.txt'),'TypeScript project check passed (skipLibCheck=true).\n');
const ffprobe=require(path.join(engine,'node_modules/@ffprobe-installer/ffprobe')).path;
const probe=spawnSync(ffprobe,['-v','error','-show_entries','format=duration:stream=codec_name,width,height','-of','json',path.join(root,'output/playwright/emberwatch-gameplay-preview.webm')],{encoding:'utf8'});
must(probe.status===0,'Preview recording cannot be decoded');const video=JSON.parse(probe.stdout);must(Number(video.format.duration)>30&&Number(video.format.duration)<36,'Unexpected preview recording duration');
const sourceFiles=fs.readdirSync(path.join(root,'assets')).filter(f=>f.endsWith('.ts')).map(f=>'assets/'+f).concat(['assets/TheEnd.scene','build-config.json'],fs.readdirSync(path.join(root,'assets/resources/art')).filter(f=>f.endsWith('.png')).map(f=>'assets/resources/art/'+f));
const buildTime=fs.statSync(path.join(root,'temp/game-build-v2.log')).mtimeMs;
const sources=sourceFiles.map(file=>{const full=path.join(root,file);must(fs.statSync(full).mtimeMs<=buildTime,`Source changed after build: ${file}`);return {file,sha256:crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')};});
const coverage=[
 ['第1天强制进入教学图、固定开局','fixed day-one loadout'],
 ['固定搜刮费用和奖励','fixed scavenging pays immediately'],
 ['超重卡牌、溢出上限、自动转入','spending frees weight and promotes overflow'],
 ['两条路线','complete route A'],
 ['固定敌人意图','enemy intent is attack, prepare'],
 ['第一场可仅用基础牌完成','enemy one can be defeated using only basic cards'],
 ['功能牌、武器、下一回合生成挥砍','knife equips once'],
 ['奖励独立领取、放弃、截取与整卡','card-first claiming changes available supply capacity'],
 ['零物资不中断战斗，奖励可以救援','battle remains active at zero supplies'],
 ['护甲归零与实际伤害判定','fully blocking at zero survives'],
 ['休整、现金、卡组调整','critical survivors cannot heal at rest'],
 ['战斗结束合并永久卡组并重新洗牌','consecutive battles rebuild the whole permanent deck'],
 ['失败完整重置，不进入次日、不扣日耗','skipping all rewards at zero fails only after node settlement'],
 ['成功自动返家，溢出卡失效','return waits for map'],
 ['修复成本、风险确认、日耗最后执行','risk warning allows confirmed repair'],
 ['第2天日志结束原型','complete route B'],
 ['固定种子与重新随机','fixed seeds reproduce random rewards'],
 ['普通卡重复持有、武器槽唯一','one weapon slot rejects a second knife']
].map(([requirement,test])=>{const match=unitNames.find(n=>n.includes(test));must(match,'Missing evidence for '+requirement);return {requirement,status:'verified',ruleTest:match,evidence:'output/rules-tests.tap'};});
const report={clientDate:'2026-11-13',testedAtUtc:new Date().toISOString(),platform:'Desktop Chromium / Pink COCOS 4.0.0-beta.1',scope:'Complete one-day tutorial prototype from the supplied specification',typecheck:{passed:true,skipLibCheck:true},rules:{passed,failed,tests:unitNames},mcp:{tools:mcp.toolCount,scene:mcp.sceneOpen.data.assetName,controller:'SurvivalView',buildCode:build.result.data.code},browser,console:{errors:0,warnings:0},coverage,visualAssets:8,video:{file:'output/playwright/emberwatch-gameplay-preview.webm',...video},sources,knownInterpretation:'Free deck selection is retained; the boss functional-card opening guarantee applies when a functional card is included in the selected deck.'};
fs.writeFileSync(path.join(root,'output/game-verification.json'),JSON.stringify(report,null,2)+'\n');
for(const [name,value] of Object.entries(browser))fs.writeFileSync(path.join(root,`output/browser-${name}.json`),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({rules:passed,browserChecks:Object.keys(browser),coverage:coverage.length,videoSeconds:Number(video.format.duration),sourceFiles:sources.length,report:'output/game-verification.json'},null,2));
