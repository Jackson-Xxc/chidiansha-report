import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {createNearbyCache} from '../src/nearby-cache.mjs';
const bundle=(await build({entryPoints:['src/main.jsx'],bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'})).outputFiles[0].text;
const search={location:{lat:31.23,lng:121.47,coordinate:'wgs84',name:'当前位置'}};
const merchant=(id='cached')=>({id:'jtk-SHOP'+id,shopId:'SHOP'+id,name:id==='cached'?'上次保存的小店':`新商家 ${id}`,kind:'delivery',category:'chinese',platform:'淘宝闪购'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async check=>{for(let n=0;n<100;n++){if(check())return;await sleep(30);}assert.fail('UI state did not arrive');};
async function mount({location=search.location,respond=(body,count,path)=>path==='store'?{url:'https://m.duanqu.com/?test=1',qr:'https://union.elemecdn.com/qr.png'}:path==='activity'?{url:'https://dpurl.cn/test'}:{items:[merchant('new')],page:body.page,hasMore:false,sessionId:'next',provider:'jutuike'},seed=true,geolocate=null,secure=true}={}){
 const errors=[];const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://eat.test/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,calls=[],geoCalls=[];
 w.addEventListener('error',e=>errors.push(e.message));
 w.matchMedia=()=>({matches:true,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 Object.defineProperty(w,'isSecureContext',{value:secure});Object.defineProperty(w.navigator,'geolocation',{value:{getCurrentPosition(resolve,reject,options){geoCalls.push(options);if(geolocate)return geolocate(resolve,reject,options);setTimeout(()=>resolve({coords:{latitude:location.lat,longitude:location.lng,accuracy:30}}),5);}}});
 if(seed)createNearbyCache(w.sessionStorage).put(search,[merchant()],{page:1,hasMore:false,provider:'jutuike'});
 w.localStorage.setItem('chidiansha-nearby-v1',JSON.stringify({legacy:'高德数据'}));
 w.localStorage.setItem('chidiansha-favorites',JSON.stringify([{id:'old',name:'旧地图门店',kind:'place'},{id:'idea-chinese-0',name:'旧灵感选择',kind:'idea'}]));
 w.fetch=async(url,options={})=>{const path=url.split('/').at(-1),body=JSON.parse(options.body);calls.push({path,...body});const r=await respond(body,calls.length,path);return r instanceof Response?r:new Response(JSON.stringify(r));};
 w.eval(bundle);await until(()=>w.document.querySelector('.decision-workspace'));return{dom,w,calls,geoCalls,errors,button:text=>[...w.document.querySelectorAll('button')].find(x=>x.textContent.trim()===text)};
}
test('fresh homepage automatically locates then loads nearby merchants without an ideas mode',async()=>{
 const app=await mount({seed:false});try{
  await until(()=>app.w.document.body.textContent.includes('新商家 new'));
  assert.equal(app.geoCalls.length,1);assert.equal(app.calls.length,1);assert.equal(app.calls[0].path,'nearby');assert.equal(app.calls[0].lat,search.location.lat);
  assert.equal(app.w.localStorage.getItem('chidiansha-nearby-v1'),null);
  assert.ok(!/灵感|旧地图门店/.test(app.w.document.body.textContent));assert.equal(app.w.document.querySelector('[aria-label="浏览模式"]'),null);
  assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
});

test('session reopens choices instantly and a small GPS drift does not refetch',async()=>{const app=await mount({location:{...search.location,lat:31.2302}});try{await sleep(250);assert.match(app.w.document.body.textContent,/上次保存的小店/);assert.equal(app.calls.length,0);assert.deepEqual(app.errors,[]);}finally{app.dom.window.close();}});
test('new location fetches independent cursor pages; filter changes do not call upstream',async()=>{const app=await mount({location:{...search.location,lat:31.24}});try{await until(()=>app.calls.length===1&&app.w.document.body.textContent.includes('新商家 new'));assert.equal(app.calls[0].lat,31.24);const category=[...app.w.document.querySelectorAll('.category')].find(x=>x.textContent.includes('喝'));(category||app.w.document.querySelectorAll('.category')[2]).click();await sleep(180);assert.equal(app.calls.length,1);assert.deepEqual(app.errors,[]);}finally{app.dom.window.close();}});
test('failed refresh retains visible choices and can be explicitly restarted at page one',async()=>{let ok=false;const app=await mount({respond:body=>ok?{items:[merchant('fresh')],page:1,hasMore:false}:new Response(JSON.stringify({error:'平台暂不可用',retryable:false}),{status:502})});try{app.button('刷新商家').click();await until(()=>app.w.document.querySelector('.error-state'));assert.equal(app.calls.length,1);assert.match(app.w.document.querySelector('.food-grid').textContent,/上次保存的小店/);ok=true;app.button('重新连接').click();await until(()=>app.w.document.body.textContent.includes('新商家 fresh'));assert.equal(app.calls[1].page,1);}finally{app.dom.window.close();}});
test('random result prepares only its own entry, preserves favorites and blacklist',async()=>{const app=await mount();try{app.w.document.querySelector('.mobile-random').click();await until(()=>app.w.document.querySelector('.result-modal a.primary'));const result=app.w.document.querySelector('.result-modal');assert.equal(result.querySelector('a.primary').href,'https://m.duanqu.com/?test=1');assert.ok(!/佣金|聚推客|推广链接|扫码|在手机上查看门店/.test(result.textContent));assert.equal(result.querySelector('.platform-qr'),null);assert.ok(!result.textContent.includes('人均'));assert.equal(app.calls[0].path,'store');app.button('先收藏').click();await sleep(50);assert.equal(JSON.parse(app.w.localStorage.getItem('chidiansha-favorites'))[0].kind,'delivery');app.button('不合胃口，拉黑这个选择').click();await sleep(50);assert.equal(app.w.document.querySelector('.mobile-random').disabled,true);assert.deepEqual(app.errors,[]);}finally{app.dom.window.close();}});
test('denied first-visit location shows a retry, never requests merchants or invents results',async()=>{
 let allow=false;const app=await mount({seed:false,geolocate:(ok,fail)=>allow?ok({coords:{latitude:31.23,longitude:121.47,accuracy:30}}):fail({code:1})});try{
  await until(()=>app.w.document.body.textContent.includes('权限被拒绝'));
  assert.equal(app.geoCalls.length,1);assert.equal(app.calls.length,0);assert.equal(app.w.document.querySelector('.mobile-random').disabled,true);
  assert.ok(!app.w.document.body.textContent.includes('灵感'));assert.equal(app.w.document.querySelectorAll('.food-card').length,0);
  allow=true;app.button('重试定位').click();await until(()=>app.w.document.body.textContent.includes('新商家 new'));
  assert.equal(app.geoCalls.length,2);assert.equal(app.calls.length,1);assert.ok(!app.w.document.body.textContent.includes('权限被拒绝'));assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
});

test('insecure first visit explains HTTPS and does not attempt geolocation or nearby lookup',async()=>{
 const app=await mount({seed:false,secure:false});try{
  await until(()=>app.w.document.body.textContent.includes('HTTPS'));
  assert.equal(app.geoCalls.length,0);assert.equal(app.calls.length,0);assert.ok(app.button('重试定位'));assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
});

test('earlier pages remain usable while next page loads; every cursor is passed once',async()=>{let release;const app=await mount({seed:false,respond:async(body,count,path)=>{if(path==='store')return{url:'https://m.duanqu.com/test'};if(body.page===2)await new Promise(resolve=>release=resolve);return{items:[merchant('page'+body.page)],page:body.page,sessionId:'cursor-'+body.page,hasMore:body.page<2};}});try{await until(()=>app.calls.length===2&&release);assert.equal(app.calls[1].sessionId,'cursor-1');assert.equal(app.w.document.querySelector('.mobile-random').disabled,false);app.w.document.querySelector('.mobile-random').click();await until(()=>app.w.document.querySelector('.result-modal'));assert.match(app.w.document.querySelector('.result-modal').textContent,/新商家 page1/);release();await until(()=>app.w.document.body.textContent.includes('新商家 page2'));assert.deepEqual(app.errors,[]);}finally{release?.();app.dom.window.close();}});

test('browser Back closes a merchant dialog before leaving the current page',async()=>{
 const app=await mount();try{
  app.w.history.replaceState({page:'previous'},'', '/previous');
  app.w.history.pushState({page:'home'},'', '/');
  app.w.document.querySelector('.food-name').click();
  await until(()=>app.w.document.querySelector('dialog')&&app.w.history.state?.chidianshaModal);
  app.w.history.back();
  await until(()=>!app.w.document.querySelector('dialog'));
  assert.equal(app.w.location.pathname,'/');
  assert.equal(app.w.history.state.page,'home');
  app.w.history.back();await until(()=>app.w.location.pathname==='/previous');
  assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
});

test('closing and reopening dialogs does not accumulate extra Back steps',async()=>{
 const app=await mount();try{
  for(let i=0;i<3;i++){
   app.w.document.querySelector('.food-name').click();
   await until(()=>app.w.document.querySelector('dialog')&&app.w.history.state?.chidianshaModal);
   app.w.document.querySelector('dialog [aria-label="关闭"]').click();
   await until(()=>!app.w.document.querySelector('dialog')&&!app.w.history.state?.chidianshaModal);
  }
  assert.equal(app.w.history.length,2);
  app.w.document.querySelector('.food-name').click();
  await until(()=>app.w.history.state?.chidianshaModal);
  app.w.history.back();await until(()=>!app.w.document.querySelector('dialog'));
  assert.equal(app.w.document.body.style.overflow,'');
  assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
});

test('Back dismisses only the top sharing dialog, then the merchant',async()=>{
 const app=await mount();try{
  app.w.document.querySelector('.food-name').click();
  await until(()=>app.w.document.querySelector('.result-modal')&&app.w.history.state?.chidianshaModal);
  app.button('分享给饭搭子').click();
  await until(()=>app.w.document.querySelectorAll('dialog').length===2);
  app.w.history.back();
  await until(()=>app.w.document.querySelectorAll('dialog').length===1&&app.w.history.state?.chidianshaModal);
  assert.ok(app.w.document.querySelector('.result-modal'));
  assert.equal(app.w.document.body.style.overflow,'hidden');
  app.w.history.back();await until(()=>!app.w.document.querySelector('dialog'));
  assert.equal(app.w.location.pathname,'/');assert.equal(app.w.document.body.style.overflow,'');
  assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
});

test('settings replacement and reroll both keep a single active dialog history step',async()=>{
 const app=await mount();try{
  app.button('设置').click();await until(()=>app.w.history.state?.chidianshaModal);
  app.button('管理黑名单（0）').click();await until(()=>app.w.document.querySelector('dialog')?.textContent.includes('黑名单 · 不再随机遇见'));
  app.w.history.back();await until(()=>!app.w.document.querySelector('dialog'));
  app.w.document.querySelector('.food-name').click();await until(()=>app.w.history.state?.chidianshaModal);
  app.button('再抽一次').click();await until(()=>app.w.document.querySelector('.result-modal')&&app.w.history.state?.chidianshaModal);
  app.w.history.back();await until(()=>!app.w.document.querySelector('dialog'));
  assert.equal(app.w.location.pathname,'/');assert.equal(app.w.history.length,2);
  assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
});

test('reconnect keeps previous merchants and starts a new cursor instead of replaying the failed page',async()=>{
 let recovering=false;const requests=[];
 const app=await mount({seed:false,respond:body=>{
  requests.push({...body});
  if(!recovering&&body.page===2)return new Response(JSON.stringify({error:'暂时连接不上平台',retryable:false}),{status:502});
  if(recovering)return {items:[merchant('replacement')],page:body.page,hasMore:false,sessionId:'fresh-cursor'};
  return{items:[merchant('kept')],page:body.page,hasMore:true,sessionId:'failed-cursor'};
 }});
 try{
  await until(()=>app.w.document.querySelector('.error-state'));
  assert.ok(app.w.document.querySelector('.food-grid').textContent.includes('新商家 kept'));
  recovering=true;app.button('重新连接').click();
  await until(()=>app.w.document.querySelector('.food-grid').textContent.includes('新商家 replacement'));
  assert.ok(app.w.document.querySelector('.food-grid').textContent.includes('新商家 kept'));
  assert.equal(requests.at(-1).page,1);assert.equal(requests.at(-1).sessionId,undefined);
  assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
});
