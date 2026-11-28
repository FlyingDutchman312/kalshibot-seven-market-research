'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createReadGate,retryAfterMs}=require('../read-gate');
test('concurrent reads serialize and pace',async()=>{
 let t=0,active=0,peak=0;const starts=[];
 const g=createReadGate({now:()=>t,sleep:async ms=>{t+=ms},spacing:350});
 await Promise.all([1,2,3].map(()=>g.run(async()=>{starts.push(t);active++;peak=Math.max(peak,active);await Promise.resolve();active--;})));
 assert.deepEqual(starts,[0,350,700]);assert.equal(peak,1);
});
test('429 blocks queued requests without contacting provider and honors Retry-After',async()=>{
 let t=0,calls=0;const g=createReadGate({now:()=>t,sleep:async ms=>{t+=ms}});
 await assert.rejects(g.run(async()=>{calls++;throw Object.assign(Error('limited'),{httpStatus:429,retryAfterMs:90000});}));
 await assert.rejects(g.run(async()=>{calls++;}),/backoff/);
 assert.equal(calls,1);assert.equal(g.status().rateLimits,1);
 t=90000;await g.run(async()=>{calls++;});assert.equal(calls,2);assert.equal(g.status().strikes,0);
});
test('repeated rate limits increase backoff and ordinary errors do not poison queue',async()=>{
 let t=0;const g=createReadGate({now:()=>t,sleep:async ms=>{t+=ms}});
 const limit=()=>g.run(async()=>{throw Object.assign(Error('limited'),{httpStatus:429});});
 await assert.rejects(limit());t=30000;await assert.rejects(limit());
 assert.equal(Date.parse(g.status().blocked_until),90000);
 t=90000;await assert.rejects(g.run(async()=>{throw Error('network');}));
 assert.equal(await g.run(async()=>42),42);
});
test('Retry-After accepts numeric seconds and HTTP-date',()=>{
 assert.equal(retryAfterMs('45',0),45000);
 assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:01:00 GMT',10000),50000);
 assert.equal(retryAfterMs(null,0),0);
});
