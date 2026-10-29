import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {handleCloudApi} from '../server/cloud-handler.mjs';
import {createHttpsFetcher} from '../server/https-fetch.mjs';
import {onRequest} from '../cloud-functions/api/[[path]].js';

test('deployed route accepts the exact public browser origin behind an internal gateway URL',async()=>{
 for(const path of ['nearby','store']){
  const request=new Request('http://gateway.internal/api/'+path,{method:'POST',headers:{Origin:'https://food.example.com'},body:'{}'});
  // Invalid input is reached only after the Origin gate accepts the request.
  assert.equal((await onRequest({request,clientIp:'origin-route-'+path})).status,400);
 }
});

test('public-origin browser requests reach merchant and store providers through the cloud adapter',async()=>{
 for(const [path,body,data] of [['nearby',{lat:31.23,lng:121.47},{records:{store_promotion_dto:[]},session_id:'cursor'}],['store',{shopId:'SHOP12345'},{title:'shop',link:{taobao_scheme_url:'https://m.duanqu.com/test'}}]]){
  let calls=0;const request=new Request('http://gateway.internal/api/'+path,{method:'POST',headers:{Origin:'https://food.example.com'},body:JSON.stringify(body)});
  const response=await handleCloudApi({request,clientIp:'origin-ok-'+path,env:{JUTUIKE_API_KEY:'test-secret'}},async()=>{calls++;return new Response(JSON.stringify({code:1,data}));},{publicOrigin:'https://food.example.com'});
  assert.equal(response.status,200);assert.equal(calls,1);
 }
});

test('production origin check rejects foreign, null, suffix and spoofed forwarded origins before body access',async()=>{
 for(const origin of ['https://evil.test','null','https://food.example.com.evil.test','http://food.example.com','http://gateway.internal']){
  const request={url:'http://gateway.internal/api/nearby',method:'POST',headers:new Headers({origin,host:'food.example.com','x-forwarded-host':'food.example.com','x-forwarded-proto':'https'}),text(){throw new Error('must reject before reading');}};
  assert.equal((await onRequest({request})).status,403);
 }
});

test('cloud adapter preserves one-use POST bodies, origin checks and secret isolation',async()=>{
 let reads=0,calls=0;
 const request={url:'https://eat.test/api/nearby',method:'POST',headers:new Headers({origin:'https://eat.test'}),async text(){assert.equal(++reads,1);return JSON.stringify({lat:31.23,lng:121.47});}};
 const context={request,env:{JUTUIKE_API_KEY:'test-secret'},clientIp:'cloud-body-test'};
 const response=await handleCloudApi(context,async(url,options)=>{
  calls++;assert.equal(new URLSearchParams(options.body).get('apikey'),'test-secret');
  return new Response(JSON.stringify({code:1,data:{records:{store_promotion_dto:[{shop_id:'SHOP12345',title:'真实格式'}]},session_id:'fresh-cursor'}}));
 });
 assert.equal(response.status,200);const text=await response.text();assert.equal(JSON.parse(text).items.length,1);assert.ok(!text.includes('test-secret'));assert.equal(calls,1);
 request.headers.set('origin','https://evil.test');assert.equal((await handleCloudApi(context,()=>{throw Error('must not fetch');})).status,403);
});

test('cloud client IP keeps independent visitors out of a shared rate-limit bucket',async()=>{
 const request=()=>new Request('https://eat.test/api/nearby',{method:'POST',body:'{}'});
 for(let i=0;i<35;i++)assert.equal((await handleCloudApi({request:request(),clientIp:'cloud-rate-A'})).status,400);
 assert.equal((await handleCloudApi({request:request(),clientIp:'cloud-rate-A'})).status,429);
 assert.equal((await handleCloudApi({request:request(),clientIp:'cloud-rate-B'})).status,400);
});

test('HTTPS transport preserves forms, HTTP failure status, chunks and cancellation',async()=>{
 const signal=new AbortController().signal;let sent;
 const fetcher=createHttpsFetcher((url,options,callback)=>{
  assert.equal(url,'https://api.jutuike.com/ele/store_list');assert.equal(options.family,4);assert.equal(options.signal,signal);
  const req=new EventEmitter();req.end=body=>{sent=body;queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=503;res.headers={'content-type':'application/json'};callback(res);res.emit('data',Buffer.from('{"ok":'));res.emit('data',Buffer.from('false}'));res.emit('end');});};return req;
 });
 const response=await fetcher('https://api.jutuike.com/ele/store_list',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'page_size=20',signal});
 assert.equal(sent,'page_size=20');assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false});
});

test('HTTPS transport rejects connection and incomplete-body failures without retry',async()=>{
 for(const phase of ['connection','body']){
  let attempts=0;
  const fetcher=createHttpsFetcher((url,options,callback)=>{attempts++;const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{if(phase==='connection')req.emit('error',new Error('offline'));else{const res=new EventEmitter();callback(res);res.emit('aborted');}});return req;});
  await assert.rejects(fetcher('https://api.jutuike.com/ele/store_list',{body:''}));assert.equal(attempts,1);
 }
});
