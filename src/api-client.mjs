const cancelled=()=>Object.assign(new Error('Cancelled'),{name:'AbortError'});
export function pause(ms,signal){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(cancelled());
  const abort=()=>{clearTimeout(timer);reject(cancelled());};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
  signal?.addEventListener('abort',abort,{once:true});
 });
}
export async function requestApi(path,body,signal,{fetcher=fetch,wait=pause,timeoutMs=20000,retry=true}={}){
 for(let attempt=0;attempt<2;attempt++){
  if(signal?.aborted)throw cancelled();
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,timeoutMs);
  let failure;
  try{
   const r=await fetcher('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   let d;try{d=await r.json();}catch{throw Object.assign(new Error('服务暂时未响应，请稍后重试'),{retryable:r.status>=500||r.ok});}
   if(!r.ok)throw Object.assign(new Error(d.error||'连接失败，请重试'),{code:d.code,retryable:typeof d.retryable==='boolean'?d.retryable:r.status>=500,retryAfterMs:Number(d.retryAfterMs)||0});
   if(path==='nearby'&&(!Array.isArray(d.items)||!Number.isInteger(d.page)))throw Object.assign(new Error('商家数据未完整返回，请重试'),{retryable:true});
   return d;
  }catch(e){
   if(signal?.aborted)throw cancelled();
   failure=e;
   if(e.name==='AbortError'||e instanceof TypeError)failure=Object.assign(new Error(e.name==='AbortError'?'连接超时，请重试':'网络暂时连接不上，请重试'),{retryable:true});
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  // One retry for short transient failures; never loop on quota, auth, or minute limits.
  if(!retry||attempt||!failure.retryable||failure.retryAfterMs>2000)throw failure;
  await wait(Math.max(900,failure.retryAfterMs||0),signal);
 }
}
