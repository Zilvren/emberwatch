const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.SPINE_EVIDENCE_DIR??path.join(root,'output/playwright/spine08'));
fs.mkdirSync(directory,{recursive:true});
const cli=process.env.PLAYWRIGHT_CLI;
if(!cli||!fs.existsSync(cli))throw Error('Set PLAYWRIGHT_CLI to the installed playwright-cli.js.');
const session=process.env.PLAYWRIGHT_SESSION??'the-end-spine08';
const label=process.argv[3]??'main';
function run(args){const r=spawnSync(process.execPath,[cli,'-s='+session,...args],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});if(r.error)throw r.error;if(r.status!==0||/^### Error/m.test(r.stdout))throw Error(r.stdout+'\n'+r.stderr);return r.stdout;}
const relative=path.relative(root,directory).replaceAll('\\','/')+'/';
const helper=fs.readFileSync(path.join(root,'tools/browser-helper.js.txt'),'utf8').replaceAll('output/playwright/',relative);
const body=fs.readFileSync(path.join(__dirname,process.argv[2]??'browser-main.js.txt'),'utf8').replaceAll('output/playwright/spine08/',relative).replaceAll('http://127.0.0.1:7467/',process.env.PLAYWRIGHT_BASE_URL??'http://127.0.0.1:7467/');
run(['video-start',path.join(directory,label+'-gameplay.webm')]);
let response='';
try{
 response=run(['run-code','async (page) => { const runtimeErrors=[]; const onError=e=>runtimeErrors.push(String(e)); page.on("pageerror",onError); try { '+helper+'\n'+body+'\n } finally { page.off("pageerror",onError); } }']);
 fs.writeFileSync(path.join(directory,label+'.log'),response);
 const match=response.match(/### Result\r?\n([^\r\n]+)/);
 if(!match)throw Error(response);
 const data=JSON.parse(match[1]);
 fs.writeFileSync(path.join(directory,label+'-report.json'),JSON.stringify(data,null,2)+'\n');
 const {samples,...summary}=data;console.log(JSON.stringify({...summary,sampleCount:samples?.length}));
 if(!data.passed||data.runtimeErrors?.length)process.exitCode=1;
}catch(error){fs.writeFileSync(path.join(directory,label+'-failed.log'),String(error));console.error(String(error));process.exitCode=1;}
finally{console.log(run(['video-stop']));}
