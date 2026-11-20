const {test}=require('node:test'), assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'), load=require('../tools/load-ts.cjs').createLoader();
const {inspect,dependencyViolation}=require('../tools/check-architecture.cjs');
const {namedBindings,GAME_PHASES,POPUP_KEYS,popupKey}=load(path.join(root,'assets/game/presentation/ui/ViewBindings.ts'));
test('runtime module dependencies obey domain/application/adapter direction without cycles',()=>assert.deepEqual(inspect().failures,[]));
test('the gate rejects engine leaks, concrete persistence dependencies and UI rule mutation paths',()=>{
 const file=p=>path.join(root,'assets/game',p);
 assert.ok(dependencyViolation(file('core/x.ts'),file('presentation/x.ts')));
 assert.ok(dependencyViolation(file('application/x.ts'),file('infrastructure/x.ts')));
 assert.ok(dependencyViolation(file('presentation/ui/x.ts'),file('core/SurvivalGame.ts')));
 assert.equal(dependencyViolation(file('infrastructure/x.ts'),file('application/RunPersistence.ts')),'');
});
test('screen and popup order can change; missing, duplicate and unknown identities fail explicitly',()=>{
 for(const keys of [GAME_PHASES,POPUP_KEYS]) {
  const entries=keys.map(key=>({key,value:{key}})).reverse();const binding=namedBindings(keys,entries,'测试');
  for(const key of keys)assert.equal(binding[key].key,key);
  assert.throws(()=>namedBindings(keys,entries.slice(1),'测试'),/缺少/);
  assert.throws(()=>namedBindings(keys,[...entries,entries[0]],'测试'),/重复/);
  assert.throws(()=>namedBindings(keys,[...entries,{key:'typo',value:{}}],'测试'),/未知/);
 }
 assert.equal(popupKey('bag'),'inventory');assert.equal(popupKey('repair'),'confirmation');assert.equal(popupKey(null),null);
});
test('domain context and read-model permissions are enforced by TypeScript',()=>{
 const {ts}=require('../tools/load-ts.cjs');
 const program=ts.createProgram([path.join(__dirname,'domain-contexts.types.ts')],{noEmit:true,target:ts.ScriptTarget.ES2015,module:ts.ModuleKind.CommonJS,skipLibCheck:true,types:[]});
 const diagnostics=ts.getPreEmitDiagnostics(program);assert.deepEqual(diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
});
