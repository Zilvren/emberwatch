// Inspector-visible click handlers. Keep existing prefab UUIDs and local fileIds.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),{scriptFile}=require('./runtime-scripts.cjs');
const {compressUUID}=require(path.join(process.env.APPDATA,'cocos-default/cocos-4.0.0-beta.1/dist/core/base/utils/uuid.js'));
const meta=JSON.parse(fs.readFileSync(path.join(root,scriptFile('ButtonAction')+'.meta'),'utf8'));
const type=compressUUID(meta.uuid,false);let count=0;
function visit(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory()){visit(file);continue;}if(!/\.(scene|prefab)$/.test(entry.name))continue;
 const graph=JSON.parse(fs.readFileSync(file,'utf8'));let dirty=false;
 for(const node of graph.filter(o=>o.__type__==='cc.Node'&&o._components)){
  const button=node._components.map(r=>graph[r.__id__]).find(o=>o.__type__==='cc.Button');
  const action=node._components.map(r=>graph[r.__id__]).find(o=>o.__type__===type);
  if(!button||!action)continue;
  button.clickEvents??=[];
  if(button.clickEvents.some(r=>graph[r.__id__].component==='ButtonAction'&&graph[r.__id__].handler==='activate'))continue;
  button.clickEvents.push({__id__:graph.length});graph.push({__type__:'cc.ClickEvent',target:{__id__:graph.indexOf(node)},component:'ButtonAction',_componentId:type,handler:'activate',customEventData:''});dirty=true;count++;
 }
 if(dirty)fs.writeFileSync(file,JSON.stringify(graph,null,2)+'\n');
}}
visit(path.join(root,'assets'));console.log('Bound '+count+' native buttons to ButtonAction.activate.');
