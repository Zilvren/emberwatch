// Reuse existing native Canvas scenarios, with separate QA storage and fresh evidence paths.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const profile = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'pink-cocos.project.json'), 'utf8')
);
const candidates = [];
if (process.env.PLAYWRIGHT_CLI) candidates.push(process.env.PLAYWRIGHT_CLI);
try {
    candidates.push(require.resolve('@playwright/cli/playwright-cli.js'));
} catch {}
const cache = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'npm-cache/_npx')
    : null;
if (!process.env.PLAYWRIGHT_CLI && cache && fs.existsSync(cache)) {
    for (const directory of fs.readdirSync(cache).sort())
        candidates.push(
            path.join(cache, directory, 'node_modules/@playwright/cli/playwright-cli.js')
        );
}
const cli = candidates.find((file) => fs.existsSync(file));
if (!cli)
    throw new Error(
        'Set PLAYWRIGHT_CLI to the installed @playwright/cli/playwright-cli.js, or install the CLI before native browser checks.'
    );
const session = process.env.PLAYWRIGHT_SESSION ?? profile.browser.qaSession;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? profile.browser.baseUrl;
const requestedOutput = process.env.PLAYWRIGHT_EVIDENCE_DIR ?? 'output/playwright/game-studios';
const output = require('./inspect.cjs').projectPath(root, requestedOutput);
const relativeOutput = path.relative(root, output).replaceAll(path.sep, '/');
if (!relativeOutput.startsWith('output/playwright/'))
    throw new Error('Browser evidence must stay under output/playwright/');
fs.mkdirSync(output, { recursive: true });
const defaultTasks = [
    'browser-review-round3',
    'browser-first-battle',
    'browser-route-a',
    'browser-route-b',
    'browser-session-save',
    'browser-accessibility',
    'browser-input-check',
    'browser-coherence-check',
    'browser-page-overlays',
    'browser-material-coherence',
    'browser-deck-map',
    'browser-stamina-system',
    'browser-hand-shelter',
    'browser-quality-fixes',
];
const tasks = process.env.PLAYWRIGHT_TASKS
    ? process.env.PLAYWRIGHT_TASKS.split(',').map((task) => task.trim())
    : defaultTasks;
if (!tasks.length || tasks.some((task) => !defaultTasks.includes(task)))
    throw new Error('Unknown browser scenario selector');
const report = {
    project: profile.project,
    date: new Date().toISOString(),
    session,
    cli,
    passed: false,
    checks: {},
};
const writeReport = () =>
    fs.writeFileSync(
        path.join(output, 'browser-report.json'),
        JSON.stringify(report, null, 2) + '\n'
    );
function run(args) {
    const result = spawnSync(process.execPath, [cli, `-s=${session}`, ...args], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        timeout: 180000,
    });
    if (result.error) throw result.error;
    return result;
}

const opened = run([
    'open',
    baseUrl + '?seed=17&save=off',
    '--config',
    path.join(root, profile.browser.config),
]);
fs.writeFileSync(path.join(output, 'open.log'), (opened.stdout ?? '') + (opened.stderr ?? ''));
if (opened.status !== 0 || /^### Error/m.test(opened.stdout ?? '')) {
    writeReport();
    console.error('QA browser failed to open; see ' + relativeOutput + '/open.log');
    process.exit(1);
}
const helper = fs.readFileSync(path.join(root, 'tools/browser-helper.js.txt'), 'utf8');
for (const task of tasks) {
    const scenario = fs.readFileSync(path.join(root, 'tools', task + '.js.txt'), 'utf8');
    // Only relocate artifact filenames; controls, assertions and game rules are unchanged.
    let body = (helper + '\n' + scenario).replaceAll('output/playwright/', relativeOutput + '/');
    if (['browser-stamina-system', 'browser-hand-shelter', 'browser-quality-fixes'].includes(task))
        body = body.replace(/\?seed=(\d+)(?!\d)(?![^'"`\s]*ruleset=)/g, '?ruleset=stamina-v1&seed=$1');
    else
        body = body.replaceAll(
            'http://127.0.0.1:7457/?',
            'http://127.0.0.1:7457/?ruleset=tutorial-v1&'
        );
    body = body.replaceAll(profile.browser.baseUrl, baseUrl);
    const code = `async (page) => { const runtimeErrors=[],consoleErrors=[]; const onError=e=>runtimeErrors.push(String(e)); const onConsole=m=>{if(m.type()==='error')consoleErrors.push(m.text());}; page.on('pageerror',onError); page.on('console',onConsole); try { const result=await(async()=>{${body}})(); return {...result,consoleErrors}; } finally { page.off('pageerror',onError); page.off('console',onConsole); } }`;
    const result = run(['run-code', code]);
    fs.writeFileSync(
        path.join(output, task + '.log'),
        (result.stdout ?? '') + (result.stderr ?? '')
    );
    const line = (result.stdout ?? '').match(/### Result\r?\n([^\r\n]+)/)?.[1];
    let parsed = null;
    try {
        parsed = line ? JSON.parse(line) : null;
    } catch {}
    const passed =
        result.status === 0 &&
        parsed &&
        parsed.passed !== false &&
        !parsed.runtimeErrors?.length &&
        !parsed.consoleErrors?.length &&
        !/^### Error/m.test(result.stdout ?? '');
    if (parsed) {
        const { trace, ...summary } = parsed;
        report.checks[task] = { ...summary, passed: !!passed };
    }
    console.log(`${task}: ${passed ? 'PASS' : 'FAIL'}`);
    if (!passed) {
        report.failedScript = task;
        writeReport();
        process.exit(1);
    }
    writeReport();
}
report.passed = true;
writeReport();
console.log(
    `All ${tasks.length} native browser checks passed; ${relativeOutput}/browser-report.json`
);
