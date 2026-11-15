const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.wasm':'application/wasm','.ttf':'font/ttf'};
function servePreview({directory,port,label}){
 const root=path.resolve(directory);
 return http.createServer((request,response)=>{
  if(request.method!=='GET'&&request.method!=='HEAD'){response.writeHead(405).end();return;}
  let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400).end();return;}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
  const stream=fs.createReadStream(file);
  request.on('aborted',()=>stream.destroy());
  response.on('close',()=>stream.destroy());
  stream.on('error',()=>{if(!response.headersSent)response.writeHead(404);response.end();});
  stream.on('open',()=>{if(response.destroyed){stream.destroy();return;}response.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'});if(request.method==='HEAD'){stream.destroy();response.end();}else stream.pipe(response);});
 }).listen(port,'127.0.0.1',()=>console.log(`${label}: http://127.0.0.1:${port}/`));
}
module.exports={servePreview};
