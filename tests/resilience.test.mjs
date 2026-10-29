import test from 'node:test';
import assert from 'node:assert/strict';
import {createNearbyCache,CACHE_KEY,sameLocation} from '../src/nearby-cache.mjs';
import {requestApi,pause} from '../src/api-client.mjs';
const memory=()=>{const data=new Map();return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const search={location:{lat:31.23,lng:121.47,coordinate:'wgs84',name:'当前位置'}};
const item={id:'jtk-SHOP12345',shopId:'SHOP12345',name:'示例商家',kind:'delivery'};
const info={page:3,hasMore:true,sessionId:'one-use-cursor',provider:'jutuike'};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('session reopening restores choices but never replays a persisted upstream cursor',()=>{const storage=memory(),cache=createNearbyCache(storage);cache.put(search,[item],info);assert.equal(cache.get(search).info.sessionId,'one-use-cursor');assert.ok(!storage.getItem(CACHE_KEY).includes('one-use-cursor'));const reopened=createNearbyCache(storage);assert.equal(reopened.get(search).items[0].name,item.name);assert.equal(reopened.get(search).info.hasMore,false);assert.equal(reopened.get(search).info.sessionId,'');});
test('expired results and legacy map data are not restored',()=>{const storage=memory(),cache=createNearbyCache(storage);cache.put(search,[item],info,Date.now()-31*60000);assert.equal(createNearbyCache(storage).last(),null);storage.setItem(CACHE_KEY,JSON.stringify({version:1,last:search,entries:[{search,items:[{id:'map-id',kind:'place'}],savedAt:Date.now(),info}]}));assert.equal(createNearbyCache(storage).get(search),null);});
test('small GPS drift reuses location; changed location starts independent search',()=>{assert.equal(sameLocation(search.location,{...search.location,lat:31.2302}),true);assert.equal(sameLocation(search.location,{...search.location,lat:31.24}),false);});
test('bounded session storage and clear remove coordinates',()=>{const storage=memory(),cache=createNearbyCache(storage);for(let n=0;n<6;n++)cache.put({location:{...search.location,lat:31+n}},[item],info);assert.equal(JSON.parse(storage.getItem(CACHE_KEY)).entries.length,4);cache.clear();assert.equal(storage.getItem(CACHE_KEY),null);assert.equal(cache.last(),null);});
test('unavailable storage retains choices in page memory',()=>{const cache=createNearbyCache({getItem(){throw Error();},setItem(){throw Error();}});assert.equal(cache.put(search,[item],info),false);assert.equal(cache.get(search).items.length,1);});
test('cursor requests never retry after ambiguous network failure',async()=>{let calls=0;await assert.rejects(requestApi('nearby',{sessionId:'cursor'},undefined,{retry:false,fetcher:async()=>{calls++;throw new TypeError('offline');},wait:async()=>{throw Error('must not wait');}}));assert.equal(calls,1);});
test('general transient retry remains bounded and abortable',async()=>{let calls=0;const data=await requestApi('store',{},undefined,{fetcher:async()=>++calls===1?new Response('bad',{status:502}):response({url:'https://m.duanqu.com'}),wait:async()=>{}});assert.equal(calls,2);assert.ok(data.url);const c=new AbortController();await assert.rejects(requestApi('store',{},c.signal,{fetcher:async()=>{throw new TypeError();},wait:async(ms,signal)=>{c.abort();return pause(ms,signal);}}),{name:'AbortError'});});

test('500 candidates survive reopening without retaining the consumed cursor',()=>{
 const storage=memory(),cache=createNearbyCache(storage);
 const items=Array.from({length:500},(_,i)=>({...item,shopId:'SHOP'+i,id:'jtk-SHOP'+i}));
 cache.put(search,items,{...info,page:25});
 const reopened=createNearbyCache(storage).get(search);
 assert.equal(reopened.items.length,500);assert.equal(reopened.info.sessionId,'');assert.equal(reopened.info.hasMore,false);
});
