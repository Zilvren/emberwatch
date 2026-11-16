const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let playwright;
const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright'];
if (process.env.USERPROFILE) candidates.push(path.join(process.env.USERPROFILE,
    '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
for (const candidate of candidates.filter(Boolean)) {
    try { playwright = require(candidate); break; } catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
}
if (!playwright) throw new Error('Install Playwright or set PLAYWRIGHT_MODULE to the bundled runtime package.');
const { chromium } = playwright;
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(file => fs.existsSync(file));
const scenarioName = process.env.CORE_LOOP_BROWSER_SCENARIO || 'browser-core-loop';
if (!/^browser-[a-z0-9-]+$/.test(scenarioName)) throw new Error('Invalid browser scenario name');
const relativeOutput = 'output/playwright/core-loop' + (scenarioName === 'browser-core-loop' ? '' : '/' + scenarioName);
const output = path.join(root, relativeOutput);
fs.mkdirSync(output, { recursive: true });
const report = {
    project: 'The end', date: new Date().toISOString(), passed: false,
    platform: 'Pink/Cocos web-desktop', viewports: ['1440x900', '1024x768'],
    scenario: scenarioName,
    preparation: scenarioName === 'browser-core-loop'
        ? 'Isolated browser context; completed-map and fatal-damage fixtures; real native buttons for departure, enemy turn, reading, repair and retry.'
        : 'Isolated browser context; native regression scenario with real mouse input.',
    runtimeErrors: [], consoleErrors: [],
};
(async () => {
    const browser = await chromium.launch({
        headless: true,
        ...(executable ? { executablePath: executable } : {}),
    });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        page.on('pageerror', error => report.runtimeErrors.push(String(error)));
        page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
        const helper = fs.readFileSync(path.join(__dirname, 'browser-helper.js.txt'), 'utf8');
        const scenario = fs.readFileSync(path.join(__dirname, scenarioName + '.js.txt'), 'utf8');
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const code = (helper + '\n' + scenario).replaceAll('output/playwright/', relativeOutput + '/');
        report.checks = await new AsyncFunction('page', 'runtimeErrors', code)(page, report.runtimeErrors);
        report.passed = report.checks?.passed !== false && !report.runtimeErrors.length && !report.consoleErrors.length;
    } catch (error) {
        report.error = String(error.stack || error);
    } finally {
        await browser.close();
        fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
    }
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
