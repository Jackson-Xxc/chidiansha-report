import test from 'node:test';
import assert from 'node:assert/strict';
import {getBrowserLocation,locationErrorMessage} from '../src/location.mjs';

test('quick location succeeds without requesting GPS again',async()=>{
  let calls=0;
  const p={coords:{latitude:31,longitude:121}};
  assert.equal(await getBrowserLocation({getCurrentPosition(ok,fail,options){calls++;assert.equal(options.enableHighAccuracy,false);ok(p);}}),p);
  assert.equal(calls,1);
});
test('unavailable location retries GPS, but denial never retries',async()=>{
  for(const code of [1,2,3]){
    const options=[];
    const task=getBrowserLocation({getCurrentPosition(ok,fail,o){options.push(o);if(options.length===1)fail({code});else ok({coords:{}});}});
    if(code===1){await assert.rejects(task,e=>e.code===1);assert.equal(options.length,1);}
    else {await task;assert.equal(options.length,2);assert.equal(options[1].enableHighAccuracy,true);assert.equal(options[1].maximumAge,0);}
  }
});
test('location explains permission, unavailable, timeout and insecure contexts separately',async()=>{
  assert.match(locationErrorMessage({code:1}),/权限被拒绝/);
  assert.match(locationErrorMessage({code:2}),/无法提供位置/);
  assert.match(locationErrorMessage({code:3}),/超时/);
  await assert.rejects(getBrowserLocation({},false),e=>e.code==='insecure');
  await assert.rejects(getBrowserLocation({}),e=>e.code==='unsupported');
  await assert.rejects(getBrowserLocation({getCurrentPosition(){throw {name:'SecurityError'};}}),e=>e.code===1);
});
