import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNearbyPages} from '../src/nearby.mjs';
test('initial nearby loading fetches six sequential pages for up to 120 candidates',async()=>{
 const fetched=[],received=[];
 await loadNearbyPages(1,async page=>{fetched.push(page);return{page,hasMore:true,items:Array.from({length:20},(_,i)=>({id:`${page}-${i}`}))};},d=>received.push(...d.items),new AbortController().signal);
 assert.deepEqual(fetched,[1,2,3,4,5,6]);assert.equal(received.length,120);
});
test('loading stops at provider exhaustion or the page cap',async()=>{
 for(const [start,more,expected] of [[1,false,[1]],[24,true,[24,25]]]){
  const fetched=[];await loadNearbyPages(start,async page=>{fetched.push(page);return{hasMore:more};},()=>{},new AbortController().signal);assert.deepEqual(fetched,expected);
 }
});
test('quota errors keep delivered pages and never retry or fetch subsequent pages',async()=>{
 let calls=0,received=0;
 await assert.rejects(loadNearbyPages(1,async()=>{calls++;if(calls===2)throw new Error('quota');return{hasMore:true};},()=>received++,new AbortController().signal),/quota/);
 assert.equal(calls,2);assert.equal(received,1);
});
test('changing search cancels remaining pages and stale page delivery',async()=>{
 const controller=new AbortController();let received=0,calls=0;
 await assert.rejects(loadNearbyPages(1,async()=>{calls++;controller.abort();return{hasMore:true};},()=>received++,controller.signal),{name:'AbortError'});
 assert.equal(calls,1);assert.equal(received,0);
});
