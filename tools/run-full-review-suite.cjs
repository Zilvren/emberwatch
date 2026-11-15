// Uses a dedicated QA browser session; leaves user browser profiles untouched.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scripts = [
    'browser-review-round3', 'browser-first-battle', 'browser-route-a', 'browser-route-b',
    'browser-session-save', 'browser-accessibility', 'browser-input-check',
    'browser-coherence-check', 'browser-page-overlays',
];
const report = {project:'The end',date:new Date().toISOString(),session:'fullreview',passed:false,checks:{}};
for (const script of scripts) {
    const result = spawnSync(process.execPath, ['tools/run-browser.cjs', 'tools/'+script+'.js.txt'], {
        cwd: root, env: {...process.env, PLAYWRIGHT_SESSION:'fullreview'}, encoding:'utf8', maxBuffer:8*1024*1024,
    });
    fs.writeFileSync(path.join(root,'temp','full-review-'+script+'.log'), (result.stdout??'')+(result.stderr??''));
    const line = (result.stdout??'').match(/### Result\r?\n([^\r\n]+)/)?.[1];
    let parsed;
    try { parsed = line ? JSON.parse(line) : null; } catch { parsed=null; }
    if (parsed) { const {trace,...summary}=parsed; report.checks[script]=summary; }
    const ok = result.status===0 && parsed && parsed.passed!==false;
    console.log(script+': '+(ok?'PASS':'FAIL'));
    if (!ok) {
        report.failedScript=script;
        fs.writeFileSync(path.join(root,'output/playwright/full-review-browser.json'),JSON.stringify(report,null,2)+'\n');
        console.error((result.stdout??'').slice(0,1500));
        process.exit(1);
    }
}
report.passed=true;
fs.writeFileSync(path.join(root,'output/playwright/full-review-browser.json'),JSON.stringify(report,null,2)+'\n');
console.log('All '+scripts.length+' browser checks passed.');
