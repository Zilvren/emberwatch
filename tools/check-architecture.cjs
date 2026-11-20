const fs = require('node:fs'), path = require('node:path');
const {ts} = require('./load-ts.cjs');
const root = path.resolve(__dirname, '..');
function walk(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : e.name.endsWith('.ts') ? [path.join(dir,e.name)] : []); }
function layer(file) { return file.replaceAll('\\','/').split('/assets/game/')[1]?.split('/')[0]; }
function dependencyViolation(from, to) {
    const a = layer(from), b = layer(to);
    if (a === 'core' && b !== 'core') return 'core only depends on core';
    if (a === 'application' && !['application','core'].includes(b)) return 'application depends on ports and core, not concrete adapters';
    if (a === 'presentation' && to.replaceAll('\\','/').endsWith('/core/SurvivalGame.ts')) return 'presentation reads GameReadModel and sends commands';
    if (a === 'presentation' && b === 'infrastructure' && !from.replaceAll('\\','/').endsWith('/presentation/GameDirector.ts')) return 'only the composition root constructs infrastructure';
    return '';
}
function inspect(project = root) {
    const files = walk(path.join(project,'assets/game')), edges = new Map(), failures = [];
    for (const file of files) {
        const source = fs.readFileSync(file,'utf8');
        const output = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
        const runtime = ts.createSourceFile(file+'.js', output, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
        const dependencies=[];
        const scan = node => {
            if (ts.isCallExpression(node) && node.expression.getText(runtime)==='require' && node.arguments.length===1 && ts.isStringLiteral(node.arguments[0])) dependencies.push(node.arguments[0].text);
            ts.forEachChild(node,scan);
        }; scan(runtime);
        const targets=[];
        for (const request of dependencies) {
            if (!request.startsWith('.')) {
                if (['core','application'].includes(layer(file))) failures.push(path.relative(project,file)+': engine/external runtime import '+request);
                continue;
            }
            const target=path.resolve(path.dirname(file),request+'.ts'); targets.push(target);
            const violation=dependencyViolation(file,target);
            if (violation) failures.push(path.relative(project,file)+': '+violation+' ('+request+')');
        }
        edges.set(file,targets);
    }
    const visited=new Set(), stack=[];
    function visit(file) {
        if(stack.includes(file)) { failures.push('runtime cycle: '+[...stack.slice(stack.indexOf(file)),file].map(f=>path.relative(project,f)).join(' → ')); return; }
        if(visited.has(file))return;stack.push(file);for(const next of edges.get(file)??[])visit(next);stack.pop();visited.add(file);
    }
    files.forEach(visit);
    return {files:files.length, runtimeEdges:[...edges.values()].reduce((n,e)=>n+e.length,0), failures};
}
if(require.main===module) { const report=inspect(); console.log(JSON.stringify(report,null,2)); if(report.failures.length)process.exitCode=1; }
module.exports={inspect,dependencyViolation};
