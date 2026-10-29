import {MAX_CANDIDATES} from './search-options.mjs';
import {distanceMeters} from './logic.mjs';
export const CACHE_KEY='chidiansha-delivery-session-v1';
export const LOCATION_TOLERANCE=150;
const TTL=30*60*1000;
const validLocation=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180&&p.coordinate==='wgs84';
export const sameLocation=(a,b)=>validLocation(a)&&validLocation(b)&&distanceMeters(a,b)<=LOCATION_TOLERANCE;
const validItem=x=>x&&x.kind==='delivery'&&typeof x.name==='string'&&typeof x.shopId==='string'&&x.id==='jtk-'+x.shopId;
export function createNearbyCache(storage){
 let state={entries:[],last:null};
 try{const raw=JSON.parse(storage.getItem(CACHE_KEY)||'null');if(raw?.version===1){state.entries=(raw.entries||[]).filter(e=>validLocation(e.search?.location)&&Date.now()-e.savedAt<TTL&&Array.isArray(e.items)&&e.items.length<=MAX_CANDIDATES&&e.items.every(validItem)).slice(0,4).map(e=>({...e,info:{...e.info,sessionId:'',hasMore:false}}));state.last=validLocation(raw.last?.location)&&state.entries.length?raw.last:null;}}catch{}
 const persist=()=>{try{storage.setItem(CACHE_KEY,JSON.stringify({version:1,...state,entries:state.entries.map(e=>({...e,info:{...e.info,sessionId:'',hasMore:false}}))}));return true;}catch{return false;}};
 return {
  last:()=>state.last,
  get:search=>state.entries.find(e=>sameLocation(e.search.location,search.location)&&Date.now()-e.savedAt<TTL)||null,
  remember:search=>{state.last=search;return persist();},
  put:(search,items,info,savedAt=Date.now())=>{state.entries=[{search,items,info,savedAt},...state.entries.filter(e=>!sameLocation(e.search.location,search.location))].slice(0,4);state.last=search;return persist();},
  clear:()=>{state={entries:[],last:null};try{storage.removeItem(CACHE_KEY);}catch{}},
 };
}
