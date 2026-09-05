import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,sep,extname } from 'node:path';
const root=resolve('.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.md':'text/plain; charset=utf-8','.svg':'image/svg+xml'};
const allowed=p=>['index.html','styles.css','manifest.json','service-worker.js','README.md','USER_MANUAL.md','API_CORE.md'].includes(p)||p.startsWith('src/')||p.startsWith('assets/');
export const server=createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
    const full=resolve(root,path);
    if(!full.startsWith(root+sep)||!allowed(path)||!types[extname(path)]||path.split('/').some(part=>part.startsWith('.'))){res.writeHead(404);res.end('Not found');return;}
    const data=await readFile(full);
    res.writeHead(200,{'Content-Type':types[extname(path)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('PWA disponible en http://127.0.0.1:'+server.address().port));
