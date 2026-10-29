import https from 'node:https';

// Use Node's HTTPS transport over IPv4. The edge fetch route intermittently
// returned 502/504, while this transport passed continuous production paging.
// Do not replay a cursor automatically: the provider advances it per request.
export function createHttpsFetcher(requestImpl=https.request){
 return (target,options)=>new Promise((resolve,reject)=>{
  const req=requestImpl(target,{method:options.method,headers:options.headers,family:4,signal:options.signal},res=>{
   const chunks=[];let bytes=0;
   res.on('data',chunk=>{
    bytes+=chunk.length;
    if(bytes>2*1024*1024){res.destroy(new Error('Response too large'));return;}
    chunks.push(chunk);
   });
   res.on('end',()=>{
    try{resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers}));}
    catch(error){reject(error);}
   });
   res.on('error',reject);
   res.on('aborted',()=>reject(new Error('Incomplete response')));
  });
  req.on('error',reject);
  req.end(options.body);
 });
}
export const httpsFetch=createHttpsFetcher();
