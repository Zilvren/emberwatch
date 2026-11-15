const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cli=process.env.PLAYWRIGHT_CLI??'C:/Users/Knock/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/@playwright/cli/playwright-cli.js';
const code='async(page)=>{'+fs.readFileSync(path.join(__dirname,'browser-card-design.js.txt'),'utf8')+'}';
const result=spawnSync(process.execPath,[cli,'-s=carddesign','run-code',code],{cwd:root,encoding:'utf8'});process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');if(result.error)throw result.error;
process.exit(/^### Error/m.test(result.stdout??'')||!/^### Result/m.test(result.stdout??'')?1:result.status??1);
