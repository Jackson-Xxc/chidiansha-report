import React,{useState,useEffect,useRef,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {motion,AnimatePresence,MotionConfig} from 'motion/react';
import {MapPin,NavigationArrow,DiceFive,Heart,ClockCounterClockwise,ArrowUpRight,ArrowRight,MagnifyingGlass,X,SlidersHorizontal,CaretDown,Check,ShareNetwork,ForkKnife,Compass,SpinnerGap,ArrowClockwise,Info} from '@phosphor-icons/react';
import {categories,categoryName,imageFor,fallbackImage} from './data';
import {pickRandom,filterItems,shareUrl,parseShared} from './logic.mjs';
import './style.css';
import './decision.css';
import './delivery.css';
import './compact-layout.css';
import './fullscreen-layout.css';
import './merchant-result.css';
import {createModalHistory} from './modal-history.mjs';
import {loadNearbyPages} from './nearby.mjs';
import {MAX_PAGES,MAX_CANDIDATES} from './search-options.mjs';
import {requestApi as api} from './api-client.mjs';
import {createNearbyCache,sameLocation} from './nearby-cache.mjs';
import {getBrowserLocation,locationErrorMessage} from './location.mjs';
const fallbackStorage={getItem(){return null;},setItem(){throw new Error('Storage unavailable');},removeItem(){}};
const browserStorage=(()=>{try{return window.localStorage;}catch{return fallbackStorage;}})();
const sessionStorage=(()=>{try{return window.sessionStorage;}catch{return fallbackStorage;}})();
// Retire map-derived cache and legacy ideas; retain merchant records and exclusion IDs.
try{browserStorage.removeItem('chidiansha-nearby-v1');}catch{}
const read=(key)=>{try{const a=JSON.parse(browserStorage.getItem(key)||'[]');return Array.isArray(a)?a.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string'&&(key==='chidiansha-blocked'||(x.kind==='delivery'&&x.id==='jtk-'+x.shopId))).slice(0,key==='chidiansha-blocked'?10000:100):[];}catch{return[];}};
const save=(key,val)=>{try{browserStorage.setItem(key,JSON.stringify(val));}catch{}};
const modalHistory=createModalHistory(window);
function Modal({title,onClose,children,footer,className=''}){const ref=useRef(),closeRef=useRef(onClose);closeRef.current=onClose;useEffect(()=>{const d=ref.current;d.showModal();const unregister=modalHistory.register(()=>closeRef.current());const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{unregister();document.body.style.overflow=old;d.close();};},[]);return <dialog ref={ref} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}} className={className} aria-label={title}><div className="modal-inner"><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={23}/></button></div><div className="modal-content">{children}</div>{footer&&<div className="modal-footer">{footer}</div>}</div></dialog>;}
function App(){
 const [nearbyCache]=useState(()=>createNearbyCache(sessionStorage));
 const [startup]=useState(()=>{const search=nearbyCache.last();return {search,entry:search?nearbyCache.get(search):null};});
 const [cachedAt,setCachedAt]=useState(startup.entry?.savedAt||null),[cachePersistent,setCachePersistent]=useState(true);
 const [filtersOpen,setFiltersOpen]=useState(false);
 const locationRun=useRef(0);
 const [view,setView]=useState('discover'),[category,setCategory]=useState('all');
 const [location,setLocation]=useState(startup.search?.location||null),[locating,setLocating]=useState(false);
 const [query,setQuery]=useState(''),[submitted,setSubmitted]=useState(''),[items,setItems]=useState(startup.entry?.items||[]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[resultInfo,setResultInfo]=useState(startup.entry?.info||null);
 const [blocked,setBlocked]=useState(()=>read('chidiansha-blocked')),[favorites,setFavorites]=useState(()=>read('chidiansha-favorites')),[history,setHistory]=useState(()=>read('chidiansha-history'));
 const [selected,setSelected]=useState(()=>parseShared(window.location.search)),[rolling,setRolling]=useState(false),[rollLabel,setRollLabel]=useState('今天会遇见哪一口？'),[modal,setModal]=useState(''),[toast,setToast]=useState('');
 const [locationError,setLocationError]=useState(''),[locationDiagnostic,setLocationDiagnostic]=useState(''),[visible,setVisible]=useState(12);
 const [detailState,setDetailState]=useState(null),[detailError,setDetailError]=useState(''),[detailLoading,setDetailLoading]=useState(false),[detailAttempt,setDetailAttempt]=useState(0);
 const detail=detailState&&detailState.shopId===selected?.shopId?detailState.data:null;
 const setDetail=data=>setDetailState(data?{shopId:selected?.shopId,data}:null);
 const requestRef=useRef(null),sequence=useRef(0),rollRef=useRef(null),toastRef=useRef(null),previousPick=useRef(null),listRef=useRef(null),detailCache=useRef(new Map()),loadingRef=useRef(false);
 useEffect(()=>()=>{requestRef.current?.abort();clearInterval(rollRef.current);clearTimeout(toastRef.current);},[]);
 useEffect(()=>{locate({automatic:true});return()=>{locationRun.current++;};},[]);
 useEffect(()=>save('chidiansha-blocked',blocked),[blocked]);
 useEffect(()=>save('chidiansha-favorites',favorites),[favorites]);useEffect(()=>save('chidiansha-history',history),[history]);
 useEffect(()=>{
  setDetail(null);setDetailError('');setDetailLoading(false);
  if(selected?.kind!=='delivery')return;
  const controller=new AbortController(),cached=detailCache.current.get(selected.shopId);
  if(cached&&Date.now()-cached.at<300000){setDetail(cached.data);return;}
  setDetailLoading(true);
  api('store',{shopId:selected.shopId},controller.signal,{retry:false}).then(data=>{if(controller.signal.aborted)return;if(!data.url)throw new Error('门店跳转暂不可用，请重试');detailCache.current.set(selected.shopId,{data,at:Date.now()});setDetail(data);}).catch(e=>{if(e.name!=='AbortError')setDetailError(e.message);}).finally(()=>{if(!controller.signal.aborted)setDetailLoading(false);});
  return()=>controller.abort();
 },[selected?.shopId,detailAttempt]);
 function notify(text){setToast(text);clearTimeout(toastRef.current);toastRef.current=setTimeout(()=>setToast(''),3500);}
 async function fetchNearby(page=1,preserveExisting=false){
  if(!location||page>MAX_PAGES||loadingRef.current)return;
  requestRef.current?.abort();const controller=new AbortController();requestRef.current=controller;const n=++sequence.current;
  const search={location},previous=nearbyCache.get(search)?.items||items;let accumulated=page===1?(preserveExisting?previous:[]):items,cursor=page===1?'':resultInfo?.sessionId,received=false;
  if(page>1&&!cursor)return;
  setLoading(true);loadingRef.current=true;setError('');
  try{
   await loadNearbyPages(page,async p=>{
    nearbyCache.put(search,received?accumulated:previous,{page:Math.max(1,p-1),hasMore:false,sessionId:'',provider:'jutuike'},Date.now());
    const data=await api('nearby',{lat:location.lat,lng:location.lng,page:p,...(p>1?{sessionId:cursor}:{})},controller.signal,{retry:false});cursor=data.sessionId;return data;
   },d=>{
    if(n!==sequence.current)return;
    received=true;accumulated=[...new Map([...accumulated,...d.items].map(x=>[x.id,x])).values()].slice(0,MAX_CANDIDATES);if(accumulated.length>=MAX_CANDIDATES)d={...d,hasMore:false};
    const updated=Date.now();setItems(accumulated);setResultInfo(d);setCachedAt(updated);setCachePersistent(nearbyCache.put(search,accumulated,d,updated));
   },controller.signal);
  }catch(e){if(e.name!=='AbortError'&&n===sequence.current){setError(e.message);setResultInfo(old=>old?{...old,hasMore:false,sessionId:''}:null);nearbyCache.put(search,received?accumulated:previous,{page:1,hasMore:false,provider:'jutuike'},Date.now());}}
  finally{if(n===sequence.current){setLoading(false);loadingRef.current=false;}}
 }
 useEffect(()=>{
  requestRef.current?.abort();sequence.current++;loadingRef.current=false;setLoading(false);setError('');setVisible(12);
  if(!location||view!=='discover')return;
  const search={location},cached=nearbyCache.get(search);nearbyCache.remember(search);
  if(cached){setItems(cached.items);setResultInfo(cached.info);setCachedAt(cached.savedAt);return;}
  setItems([]);setResultInfo(null);setCachedAt(null);
  const timer=setTimeout(()=>fetchNearby(),150);
  return()=>{clearTimeout(timer);requestRef.current?.abort();sequence.current++;loadingRef.current=false;};
 },[location,view]);
 async function locate(options={}){
  if(locating)return;const automatic=options.automatic===true,run=++locationRun.current;
  setLocating(true);setLocationError('');setLocationDiagnostic('');
  try{
   const p=await getBrowserLocation(navigator.geolocation,window.isSecureContext);if(run!==locationRun.current)return;
   const next={lat:p.coords.latitude,lng:p.coords.longitude,coordinate:'wgs84',name:'当前位置'};setLocation(old=>sameLocation(old,next)?old:next);
   if(!automatic){setView('discover');setModal('');}
   if(p.coords.accuracy>1500)notify('当前定位较粗略，请在下单平台确认收货地址');else if(!automatic)notify('位置已就绪，来选今天这一餐');
  }catch(e){
   if(run!==locationRun.current)return;setLocationError(locationErrorMessage(e));if(automatic)notify('自动定位未成功，可以手动重试');else setModal('location');
   let permission='无法查询';try{const status=await navigator.permissions.query({name:'geolocation'});permission=({granted:'已允许',denied:'已拒绝',prompt:'需要询问'})[status.state]||status.state;}catch{}
   if(run===locationRun.current)setLocationDiagnostic(`网站位置权限：${permission}；定位错误：${e.code||'未知'}`);
  }finally{if(run===locationRun.current)setLocating(false);}
 }

 const base=view==='favorites'?favorites:view==='history'?history:items;
 const filtered=useMemo(()=>filterItems(base.filter(x=>!blocked.some(b=>b.id===x.id)),{category,query:submitted}),[base,category,submitted,blocked]);
 function blockItem(x){setBlocked(old=>old.some(b=>b.id===x.id)?old:[{id:x.id,name:x.name,kind:x.kind},...old].slice(0,10000));setSelected(null);notify('已拉黑，下次不会再抽到它');}
 function toggleFavorite(x){setFavorites(old=>old.some(f=>f.id===x.id)?old.filter(f=>f.id!==x.id):[x,...old].slice(0,100));}
 function choose(){if(rolling)return;if(!filtered.length){notify('先选一些好吃的，再来抽签吧');return;}const winner=pickRandom(filtered,previousPick.current);setRolling(true);setSelected(null);let tick=0;const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;rollRef.current=setInterval(()=>{setRollLabel(filtered[Math.floor(Math.random()*filtered.length)].name);tick++;if(tick>=(reduced?1:15)){clearInterval(rollRef.current);setRolling(false);setSelected(winner);previousPick.current=winner.id;setHistory(old=>[{...winner,pickedAt:Date.now()},...old.filter(x=>x.id!==winner.id)].slice(0,30));setRollLabel('这一口，刚刚好。');}},reduced?50:90);}
 function changeView(next){setView(next);setCategory('all');setQuery('');setSubmitted('');setVisible(12);setTimeout(()=>{if(next==='discover')window.scrollTo({top:0,behavior:'smooth'});else listRef.current?.scrollIntoView({behavior:'smooth',block:'start'});},30);}
 async function share(x){const url=shareUrl(x,window.location.href),text=`吃点啥？今天就选「${x.name}」`;try{if(navigator.share)await navigator.share({title:'吃点啥 · 今天就吃这家',text,url});else{await navigator.clipboard.writeText(text+'\n'+url);notify('已复制分享链接，发给饭搭子吧');}}catch(e){if(e.name!=='AbortError')setModal('copy');}}

 const saved=selected&&favorites.some(x=>x.id===selected.id);
 return <MotionConfig reducedMotion="user"><div className={`app-shell ${view==='discover'?'landing-view':''} ${view!=='discover'?'saved-view':''}`}>
 <header className="header"><a className="brand" href="/" aria-label="吃点啥首页"><img src="/logo.png" alt="吃点啥"/></a><nav className="desktop-nav" aria-label="主导航"><button className={view==='discover'?'active':''} onClick={()=>changeView('discover')}>发现好吃的</button><button className={view==='favorites'?'active':''} onClick={()=>changeView('favorites')}>我的收藏 <span>{favorites.length||''}</span></button><button className={view==='history'?'active':''} onClick={()=>changeView('history')}>抽选足迹</button></nav><button className="location-button" onClick={()=>setModal('location')}><MapPin weight="fill" size={18}/><span>{locating?'正在定位…':location?.name||'选择你的位置'}</span><CaretDown size={13}/></button></header>
 <main>
 <section className="decision-workspace" aria-label="选择这一餐">
 {view==='discover'&&<div className="decision-controls"><span className="nearby-label"><MapPin size={16}/>附近商家</span><button className="preferences-button" onClick={()=>setModal('about')} aria-label="数据与偏好"><Info size={20}/></button></div>}
 <div className="quick-filters"><button className={`compact-filter-toggle ${filtersOpen?'active':''}`} aria-expanded={filtersOpen} aria-controls="discovery-filters" onClick={()=>setFiltersOpen(x=>!x)}><SlidersHorizontal size={17}/><span>{category==='all'?'口味与偏好':categoryName(category)}</span><CaretDown size={14}/></button>{submitted&&<span className="query-chip">{submitted}</span>}{view==='discover'&&<span className="delivery-context">淘宝闪购</span>}</div>
 <div id="discovery-filters" className={`discovery-filters ${filtersOpen?'is-open':''}`}><div className="category-grid">{categories.map(c=><button className={`category ${category===c.id?'selected':''}`} key={c.id} aria-pressed={category===c.id} onClick={()=>{setCategory(c.id);setVisible(12);}}><span className="category-image"><img src={`/images/${c.image}.jpg`} alt="" loading="lazy"/>{category===c.id&&<span className="category-check"><Check size={13} weight="bold"/></span>}</span><strong>{c.name}</strong><span>{c.sub}</span></button>)}</div>
 <div className="filters"><form className="search" onSubmit={e=>{e.preventDefault();setSubmitted(query.trim());setVisible(12);}}><MagnifyingGlass size={21}/><input aria-label="搜索美食或店名" placeholder="在已加载门店中搜店名" value={query} maxLength={60} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" className="clear-search" aria-label="清空搜索" onClick={()=>{setQuery('');setSubmitted('');}}><X size={16}/></button>}<button className="search-submit" type="submit">搜索</button></form></div>
 </div>
 <section className="chooser" aria-label="随机抽选">
 <div className="chooser-title"><span className="decision-kicker">好好吃饭 · 不用纠结</span><h1>今天，<br className="decision-break"/>吃点什么<span>？</span></h1></div>
 <p className="decision-count">{view==='discover'&&!location?<span>{locating?'正在定位，马上查找附近商家':'允许定位，发现附近好吃的'}</span>:<><strong>{filtered.length}</strong><span>家合口味的店</span></>}</p>
 <div className="chooser-right"><button className="dark-button" onClick={choose} disabled={rolling||!filtered.length}>{rolling?<SpinnerGap className="spinning"/>:<DiceFive size={21} weight="fill"/>}<span>{rolling?'抽选中':locating&&!filtered.length?'定位中…':loading&&!filtered.length?'寻找中…':'帮我选一个'}</span><ArrowRight size={18}/></button></div>
 </section>
 {view==='discover'&&<div className="pool-tools">{location?<><span className="pool-status" aria-live="polite"><span className={loading?'status-dot is-loading':'status-dot'}/>{loading?`已找到 ${items.length} 家 · 继续加载中`:cachedAt?`这次找到的门店 · ${items.length} 家`:`${items.length} 家可选`}</span><div className="pool-actions">{resultInfo?.hasMore&&resultInfo.page<MAX_PAGES&&<button disabled={loading} onClick={()=>fetchNearby(resultInfo.page+1)}><Compass size={16}/>增加候选</button>}<button className="refresh-button" aria-label="刷新商家" title="刷新商家" disabled={loading} onClick={()=>fetchNearby(1)}><ArrowClockwise size={18} className={loading?'spinning':''}/><span>刷新商家</span></button></div></>:<><span className="pool-status" aria-live="polite">{locating?'正在获取位置，准备查找附近商家':locationError?'定位未成功，请重试或检查位置权限':'允许定位后，自动查找附近商家'}</span><button className="light-button" disabled={locating} onClick={locate}>{locating?'正在定位…':'重新定位'}</button></>}
 </div>}
 {view==='discover'&&<button className="scroll-to-list" aria-controls="merchant-results" onClick={()=>listRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})}><span>下滑看看商家</span><CaretDown size={19}/></button>}
 </section>
 <section className="discovery" ref={listRef}>{view==='discover'&&<div className="browse-heading"><span>慢慢挑，也很好。</span><h2>这一餐的好去处</h2></div>}<div className="section-heading" hidden={view==='discover'}><div><h2>{view==='favorites'?'把喜欢的，留给下一次。':'每一口，都有迹可循。'}</h2></div></div>
 <div className="results-heading"><p>{view==='favorites'?`收藏夹 · ${filtered.length} 个心动选择`:view==='history'?`最近抽选 · ${filtered.length} 条记录`:`已加载 ${items.length} 家，符合口味 ${filtered.length} 家`}</p></div>
 {error&&<div className="error-state" role="alert"><Info size={24}/><div><strong>{error}</strong><p>已加载的商家仍保留，可以继续查看和随机抽选。</p></div><button disabled={loading} onClick={()=>fetchNearby(1,true)}>重新连接</button></div>}
 {view==='discover'&&location&&locationError&&<div className="error-state" role="alert"><MapPin size={24}/><div><strong>{locationError}</strong><p>暂时保留上次位置的商家，请重新定位确认附近结果。</p></div><button disabled={locating} onClick={locate}>重新定位</button></div>}
 <div id="merchant-results">
 {view==='discover'&&!location?<div className="empty location-empty" role={locationError?'alert':'status'}><span className="empty-icon"><MapPin size={35}/></span><h3>{locating?'正在定位，查找附近商家':locationError?'暂时无法获取位置':'看看附近吃点什么'}</h3><p>{locationError||'允许浏览器使用位置后，会自动查询附近商家。'}</p><button className="light-button" disabled={locating} onClick={locate}>{locating?<SpinnerGap className="spinning" size={18}/>:<NavigationArrow size={18}/>} {locating?'定位中，请稍候…':'重试定位'}</button>{locationError&&<button className="light-button" onClick={()=>setModal('location')}>查看定位设置</button>}</div>:loading&&!items.length?<div className="food-grid" aria-label="正在寻找附近商家">{Array.from({length:6},(_,i)=><div className="skeleton" key={i}><div/><span/><span/></div>)}</div>:!filtered.length?<div className="empty"><span className="empty-icon"><ForkKnife size={35}/></span><h3>{view==='favorites'?'收藏第一口心动':view==='history'?'你的美食故事，从这一签开始':'这一口，还没找到'}</h3><p>{view==='favorites'?'点一下卡片上的爱心，喜欢的小店和美食就会留在这里。':'试试其他口味，或增加候选。'}</p><button className="light-button" onClick={()=>{setCategory('all');setSubmitted('');setQuery('');if(view!=='discover')changeView('discover');}}>看看全部选择 <ArrowRight/></button></div>:<div className="food-grid">{filtered.slice(0,visible).map((item,i)=><motion.article initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{duration:.32,delay:Math.min(i%12*.025,.2)}} className={`food-card ${item.kind==="delivery"?"delivery-card":""}`} key={item.id}><button className={`food-image-button ${item.kind==='delivery'&&item.photo?'shop-logo':''}`} onClick={()=>setSelected(item)} aria-label={`查看${item.name}`}><img src={imageFor(item)} onError={e=>{if(e.currentTarget.dataset.fallback)return;e.currentTarget.dataset.fallback='1';e.currentTarget.src=fallbackImage(item);}} alt={item.photo?`${item.name}门店标识`:`${categoryName(item.category)}品类示意`} loading="lazy"/><span className="image-corner"><ArrowUpRight size={21}/></span></button><button className={`favorite ${favorites.some(x=>x.id===item.id)?'is-saved':''}`} aria-label={`${favorites.some(x=>x.id===item.id)?'取消收藏':'收藏'}${item.name}`} aria-pressed={favorites.some(x=>x.id===item.id)} onClick={()=>toggleFavorite(item)}><Heart size={20} weight={favorites.some(x=>x.id===item.id)?'fill':'regular'}/></button><div className="food-body"><div className="food-kicker"><span>{categoryName(item.category)}</span><span>{item.photo?'门店标识':'品类示意图'}</span></div><button className="food-name" onClick={()=>setSelected(item)}>{item.name}</button><div className="food-meta"><span>{item.platform||'淘宝闪购'}</span>{item.sales&&<span>{item.sales}</span>}{view==='history'&&item.pickedAt&&<time>{new Date(item.pickedAt).toLocaleDateString('zh-CN')}</time>}</div></div></motion.article>)}</div>}
 {(filtered.length>visible||(view==='discover'&&resultInfo?.hasMore))&&<button className="load-more" disabled={loading} onClick={()=>{if(filtered.length>visible)setVisible(x=>x+12);else{setVisible(x=>x+12);fetchNearby(resultInfo.page+1);}}}>{loading?'正在寻找…':'查看更多商家'} {loading?<SpinnerGap className="spinning" size={18}/>:<ArrowRight size={18}/>}</button>}
 </div>
 </section>
 <section className="bottom-banner"><div><span>LESS DECIDING. MORE ENJOYING.</span><h2>生活很忙，<br className="mobile-only"/>吃饭这件事简单一点。</h2></div><button onClick={choose} disabled={rolling||!filtered.length}>再帮我选一家 <DiceFive size={25}/></button></section>
 </main><footer><a className="brand" href="/"><img src="/logo.png" alt="吃点啥"/></a><span>好好吃饭，快乐出发。</span><button onClick={()=>setModal('about')}>设置</button></footer>
 <nav className="mobile-nav" aria-label="手机导航"><button className={view==='discover'?'active':''} onClick={()=>changeView('discover')}><Compass size={23}/>发现</button><button className="mobile-random" onClick={choose} disabled={rolling||!filtered.length} aria-label="随机选一个"><DiceFive size={24} weight="fill"/><span>{rolling?'抽选中…':'随机选一个'}</span></button><button className={view==='favorites'?'active':''} onClick={()=>changeView('favorites')}><Heart size={23}/>收藏</button><button className={view==='history'?'active':''} onClick={()=>changeView('history')}><ClockCounterClockwise size={23}/>足迹</button></nav>
 <AnimatePresence>{toast&&<motion.div className="toast" role="status" initial={{opacity:0,y:15}} animate={{opacity:1,y:0}} exit={{opacity:0,y:10}}><Check size={18}/>{toast}</motion.div>}</AnimatePresence>
 {rolling&&<div className="rolling-overlay" role="status"><DiceFive className="dice-roll" size={74} weight="fill"/><h2>{rollLabel}</h2><p>今天的好心情，马上揭晓</p></div>}
 {selected&&<Modal title={selected.shared?'饭搭子的选择':'这一口，刚刚好。'} onClose={()=>setSelected(null)} className={`result-modal ${selected.kind==='delivery'?'merchant-result':''}`} footer={<div className="result-decision"><button className="reroll-button" disabled={rolling||!filtered.length} onClick={choose}><ArrowClockwise size={20}/>再抽一次</button>{detail?.url?<a className="primary wide" href={detail.url} target="_blank" rel="noopener noreferrer sponsored"><ArrowUpRight size={20}/>去淘宝闪购看看</a>:<button className="primary wide" disabled={detailLoading} onClick={()=>setDetailAttempt(x=>x+1)}>{detailLoading?<SpinnerGap className="spinning" size={20}/>:<ArrowClockwise size={20}/>} {detailLoading?'加载中…':'重新加载'}</button>}</div>}><div className={`result-image ${selected.kind==='delivery'&&selected.photo?'shop-logo':''}`}><img src={imageFor(selected)} onError={e=>{if(e.currentTarget.dataset.fallback)return;e.currentTarget.dataset.fallback='1';e.currentTarget.src=fallbackImage(selected);}} alt={selected.photo?`${selected.name}门店标识`:'美食品类示意图'}/><span>{selected.photo?'门店标识':'品类示意图'}</span></div><div className="result-body"><div className="result-info"><span className="result-label">今天这家，试试看</span><h3>{selected.name}</h3><p className="result-address">先看看菜单，合胃口再下单。</p><div className="result-details"><span>{categoryName(selected.category)}</span>{selected.kind==='delivery'&&<span>淘宝闪购</span>}{selected.sales&&<span>{selected.sales}</span>}</div></div>{detailError&&<p className="inline-error" role="alert">{detailError}</p>}<div className="result-actions"><button onClick={()=>toggleFavorite(selected)}><Heart size={19} weight={saved?'fill':'regular'}/>{saved?'已收藏':'先收藏'}</button><button onClick={()=>share(selected)}><ShareNetwork size={19}/>分享给饭搭子</button></div><button className="blacklist-action" onClick={()=>blockItem(selected)}>不合胃口，拉黑这个选择</button></div></Modal>}
 {modal==='location'&&<Modal title="今天，就在附近选一口" onClose={()=>setModal('')}><button className="primary wide" disabled={locating} onClick={locate}>{locating?<SpinnerGap className="spinning"/>:<NavigationArrow weight="fill" size={20}/>} {locating?'定位中，请稍候…':'使用我的当前位置'}</button>{locationError&&<div role="alert"><p className="inline-error">{locationError}</p><details className="location-help"><summary>手机定位设置怎么检查？</summary><ol><li>开启手机的定位服务。</li><li>在系统设置 → 当前浏览器 → 权限中，允许使用位置。</li><li>在地址栏的网站权限中允许位置，然后重试。</li></ol>{locationDiagnostic&&<p className="location-diagnostic">{locationDiagnostic}</p>}</details></div>}<p className="modal-sub">位置仅用于查询附近商家，定位成功后自动加载。</p></Modal>}
 {modal==='blacklist'&&<Modal title="黑名单 · 不再随机遇见" onClose={()=>setModal('')}><p className="modal-sub">恢复后，这个选择就会重新参与随机。</p><div className="blacklist-list">{blocked.length?blocked.map(x=><div key={x.id}><span>{x.name}</span><button onClick={()=>{setBlocked(old=>old.filter(b=>b.id!==x.id));notify('已恢复这个选择');}}>恢复</button></div>):<p className="muted">暂时没有拉黑任何选择。</p>}</div></Modal>}
 {modal==='copy'&&<Modal title="把这一口分享出去" onClose={()=>setModal('')}><p>浏览器未开放复制权限，可以长按下方链接复制。</p><textarea readOnly aria-label="分享链接" value={selected?shareUrl(selected,window.location.href):window.location.href} onFocus={e=>e.target.select()}/></Modal>}
 {modal==='about'&&<Modal title="吃点啥 · 好好吃饭" onClose={()=>setModal('')}><div className="about-copy"><h3>位置与记录</h3><p>收藏、黑名单和足迹保存在当前设备。打开首页会请求定位，浏览器位置权限由你控制。</p>{cachedAt&&<p className="cache-detail">本次商家更新于 {new Date(cachedAt).toLocaleString('zh-CN')}。{cachePersistent?'本标签页内暂存。':'当前页面内暂存。'}</p>}<button className="light-button" onClick={()=>{requestRef.current?.abort();sequence.current++;loadingRef.current=false;setLoading(false);nearbyCache.clear();setItems([]);setResultInfo(null);setLocation(null);setCachedAt(null);setLocationError('');locationRun.current++;setLocating(false);notify('本次位置与候选已清空');}}>清空本次位置与候选</button><h3>我的偏好</h3><button className="light-button" onClick={()=>setModal('blacklist')}>管理黑名单（{blocked.length}）</button><button className="light-button" onClick={()=>{setFavorites([]);setHistory([]);notify('本机收藏和足迹已清空');}}>清空本机收藏和足迹</button></div></Modal>}
 </div></MotionConfig>;
}
createRoot(document.getElementById('root')).render(<App/>);
