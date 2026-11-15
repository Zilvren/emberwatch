// Install only the six reviewed, self-contained adapters. Existing unrelated skills are never overwritten.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const profile = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'pink-cocos.project.json'), 'utf8')
);
const args = process.argv.slice(2);
const check = args.includes('--check');
const destIndex = args.indexOf('--dest');
if (args.some((arg) => arg.startsWith('--') && !['--check', '--dest'].includes(arg)))
    throw new Error('Use --check and/or --dest <skills-root>');
if (destIndex >= 0 && (!args[destIndex + 1] || args[destIndex + 1].startsWith('--')))
    throw new Error('Missing --dest value');
const destination = path.resolve(
    destIndex >= 0
        ? args[destIndex + 1]
        : path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'skills')
);
if (destination === path.parse(destination).root)
    throw new Error('Refusing a filesystem-root destination');

function files(directory, prefix = '') {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((entry) => {
            if (entry.isSymbolicLink()) throw new Error(`Refusing skill symlink: ${entry.name}`);
            const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
            return entry.isDirectory()
                ? files(path.join(directory, entry.name), relative)
                : [relative];
        });
}
function hash(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const plans = profile.skills.map((name) => {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid skill name: ${name}`);
    const source = path.join(__dirname, 'skills', name);
    const target = path.join(destination, name);
    for (const required of ['SKILL.md', 'SOURCE.md', 'LICENSE', 'agents/openai.yaml'])
        if (!fs.existsSync(path.join(source, required)))
            throw new Error(`Incomplete source skill: ${name}/${required}`);
    const sourceFiles = files(source);
    const exists = fs.existsSync(target);
    if (exists) {
        if (fs.lstatSync(target).isSymbolicLink())
            throw new Error(`Refusing existing symlink: ${target}`);
        const targetFiles = files(target);
        const identical =
            JSON.stringify(sourceFiles) === JSON.stringify(targetFiles) &&
            sourceFiles.every(
                (file) => hash(path.join(source, file)) === hash(path.join(target, file))
            );
        if (!identical)
            throw new Error(`Existing skill differs; inspect it before an update: ${target}`);
    } else if (check) throw new Error(`Skill not installed: ${target}`);
    return { name, source, target, sourceFiles, exists };
});

// All destinations are checked before any copy; rerunning with identical packages is a no-op.
if (!check) {
    fs.mkdirSync(destination, { recursive: true });
    for (const plan of plans)
        if (!plan.exists)
            fs.cpSync(plan.source, plan.target, {
                recursive: true,
                errorOnExist: true,
                force: false,
            });
}
const results = plans.map((plan) => {
    const verified = plan.sourceFiles.every(
        (file) => hash(path.join(plan.source, file)) === hash(path.join(plan.target, file))
    );
    if (!verified) throw new Error(`Installed skill verification failed: ${plan.name}`);
    return {
        name: plan.name,
        path: plan.target,
        status: check ? 'verified' : plan.exists ? 'unchanged' : 'installed',
        files: plan.sourceFiles.length,
        sha256: hash(path.join(plan.target, 'SKILL.md')),
    };
});
console.log(
    JSON.stringify({ destination, sourceCommit: profile.upstream.commit, skills: results }, null, 2)
);
