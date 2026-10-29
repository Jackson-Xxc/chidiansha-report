import {PAGE_SIZE,MAX_PAGES} from '../src/search-options.mjs';
// Jutuike food endpoints only. Credentials and commission fields stay on the server.
const limits=new Map();
const shopId=/^[A-Za-z0-9_-]{5,100}$/;
const cursorId=/^[A-Za-z0-9_-]{1,180}$/;
const clean=(value,max=160)=>typeof value==='string'?value.slice(0,max):'';
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
function safeURL(value,hosts){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))return '';u.protocol='https:';return u.href;}catch{return '';}}
const imageURL=value=>safeURL(value,['alicdn.com','elemecdn.com','jutuike.com','meituan.net','jd.com','360buyimg.com']);
const linkURL=value=>safeURL(value,['duanqu.com','ele.me','taobao.com','meituan.com','dpurl.cn','dianping.com','jutuike.com','jd.com','kurl05.cn','kurl07.cn','jfshou.cn']);
function categorize(name){
 if(/奶茶|咖啡|茶(?!餐厅)|果汁|柠檬|热饮|燕窝|奈雪|蜜雪|古茗|LINLEE|cafe|coffee|tea/i.test(name))return 'drinks';
 if(/甜|蛋糕|烘焙|面包|冰淇淋|bakery/i.test(name))return 'dessert';
 if(/火锅|烧烤|烤肉|香锅/i.test(name))return 'hotpot';
 if(/寿司|日式|韩式|日本|韩国/i.test(name))return 'japanese';
 if(/西餐|汉堡|披萨|沙拉|轻食|三明治|pizza|burger/i.test(name))return 'western';
 if(/面|粉|小吃|快餐|饺|包子|馄饨|粥/i.test(name))return 'noodles';if(/饭|炒|汤|菜|鱼|鸡|鸭|鹅|排骨|川|湘|粤|茶餐厅|农家|家常/.test(name))return 'chinese';return 'other';
}
function merchant(item){if(!item||!shopId.test(item.shop_id)||!clean(item.title))return null;return {id:'jtk-'+item.shop_id,shopId:item.shop_id,name:clean(item.title),kind:'delivery',category:categorize(item.title),photo:imageURL(item.shop_logo),sales:clean(item.indistinct_monthly_sales,40),source:'聚推客 · 淘宝闪购',platform:'淘宝闪购'};}
async function upstream(path,params,key,fetcher){
 const controller=typeof AbortController==='function'?new AbortController():null;
 const timer=controller?setTimeout(()=>controller.abort(),15000):null;
 try{
  let response;
  try{response=await fetcher('https://api.jutuike.com'+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({apikey:key,sid:'todayeat',...params}).toString(),...(controller?{signal:controller.signal}:{})});}
  catch{throw Object.assign(new Error('UPSTREAM'),{stage:'connection'});}
  if(!response.ok)throw Object.assign(new Error(response.status===429?'RATE':'UPSTREAM'),{stage:'response',providerStatus:response.status});
  let data;try{data=await response.json();}catch{throw Object.assign(new Error('UPSTREAM'),{stage:'format'});}
  if(Number(data.code)!==1)throw new Error('PROVIDER');
  if(!data.data||typeof data.data!=='object')throw new Error('UPSTREAM');return data.data;
 }finally{if(timer)clearTimeout(timer);}
}
export async function handleApi(request,env={},fetcher=fetch,{publicOrigin}={}){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/config'&&request.method==='GET')return json({provider:'jutuike',ready:!!env.JUTUIKE_API_KEY,name:'吃点啥',version:'2.0.0'});
 if(!['/api/nearby','/api/store'].includes(path))return json({error:'接口不存在'},404);
 if(request.method!=='POST')return json({error:'请使用 POST 请求'},405);
 // Cloud gateways may expose an internal URL. The deployment supplies its
 // fixed public origin; never derive this allowlist from forwarded headers.
 const origin=request.headers.get('origin');if(origin&&origin!==(publicOrigin||url.origin))return json({error:'不允许跨站请求'},403);
 const ip=request.eo?.clientIp||request.headers.get('eo-connecting-ip')||request.headers.get('x-real-ip')||'local',now=Date.now(),rate=limits.get(ip);
 if(rate&&now-rate.at<60000){if(rate.n>=35)return json({error:'操作有点快，请一分钟后再试',code:'RATE',retryable:false},429);rate.n++;}else limits.set(ip,{at:now,n:1});
 if(limits.size>2000)for(const [k,v]of limits)if(now-v.at>60000)limits.delete(k);
 try{
  const text=await request.text();if(text.length>2048)return json({error:'请求过长'},400);
  const body=JSON.parse(text);if(!body||Array.isArray(body)||typeof body!=='object')return json({error:'请求格式有误'},400);
  if(path==='/api/nearby'){
   const {lat,lng,sessionId}=body,page=body.page??1;
   if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Number.isInteger(page)||page<1||page>MAX_PAGES||(page>1&&!cursorId.test(sessionId||''))||(page===1&&sessionId))return json({error:'无效位置或分页，请重新定位后刷新'},400);
  }else if(path==='/api/store'&&!shopId.test(body.shopId||''))return json({error:'无效门店'},400);
  if(!env.JUTUIKE_API_KEY)return json({error:'商家服务暂未配置，请联系站点管理员',code:'CONFIG',retryable:false},503);
  if(path==='/api/nearby'){
   const page=body.page??1;
   // The upstream advances a session on EVERY request. Never cache first-page
   // cursors across visitors, and never automatically replay a failed page.
   const data=await upstream('/ele/store_list',{longitude:String(body.lng),latitude:String(body.lat),page_size:String(PAGE_SIZE),...(page>1?{session_id:body.sessionId}:{})},env.JUTUIKE_API_KEY,fetcher);
   const records=data.records?.store_promotion_dto;if(!Array.isArray(records))throw new Error('UPSTREAM');
   const items=[...new Map(records.map(merchant).filter(Boolean).map(x=>[x.id,x])).values()];
   const sessionId=cursorId.test(data.session_id||'')?data.session_id:'';
   return json({items,page,sessionId,hasMore:records.length===PAGE_SIZE&&!!sessionId&&page<MAX_PAGES,provider:'jutuike',note:'基于当前位置查询的推广门店，非全部商家。价格、营业及配送范围请在平台确认。'});
  }
  if(path==='/api/store'){
   const data=await upstream('/ele/store_promotion',{shop_id:body.shopId},env.JUTUIKE_API_KEY,fetcher),link=data.link||{};
   const url=linkURL(link.taobao_scheme_url);
   if(!url)throw new Error('UNAVAILABLE');return json({name:clean(data.title),url,platform:'淘宝闪购',affiliate:true});
  }
 }catch(error){
  const code=error instanceof SyntaxError?'INPUT':['RATE','PROVIDER','UNAVAILABLE'].includes(error.message)?error.message:'UPSTREAM';
  const errors={INPUT:'请求格式有误',RATE:'平台请求较频繁，请稍后再试',PROVIDER:'平台暂时未返回可用结果，请稍后刷新',UNAVAILABLE:'这个入口暂时不可用，请稍后再试',UPSTREAM:'暂时连接不上平台，请稍后刷新'};
  const diagnostic=code==='UPSTREAM'?{stage:['connection','response','format'].includes(error.stage)?error.stage:'runtime',...(Number.isInteger(error.providerStatus)?{providerStatus:error.providerStatus}:{})}:{};
  return json({error:errors[code],code,...diagnostic,retryable:false,restart:path==='/api/nearby'},code==='INPUT'?400:code==='RATE'?429:502);
 }
}
