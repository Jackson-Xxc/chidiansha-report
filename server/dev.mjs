import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {handleCloudApi} from './cloud-handler.mjs';
try{process.loadEnvFile('.env.local')}catch{}
const production=process.argv.includes('--production');
const vite=production?null:await(await import('vite')).createServer({server:{middlewareMode:true},appType:'spa'});
const root=path.resolve('dist');const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/')){let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413);res.end();return;}chunks.push(chunk);}const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(req.method==='GET'||req.method==='HEAD'?{}:{body:Buffer.concat(chunks)})});const response=await handleCloudApi({request,env:process.env,clientIp:req.socket.remoteAddress});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 if(vite)return vite.middlewares(req,res);
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);res.end();return;}
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()||/\/(?:edge-functions|cloud-functions)(?:\/|$)/.test(pathname)){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});server.listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.log('Today Eat ready on http://127.0.0.1:'+(process.env.PORT||8787)));
