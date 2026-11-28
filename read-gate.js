'use strict';
// One process-wide queue for public reads. No order methods or credentials.
function createReadGate({now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),spacing=350}={}){
 let tail=Promise.resolve(),next=0,blockedUntil=0,strikes=0,requests=0,rateLimits=0;
 function status(){return {requests,rateLimits,strikes,blocked_until:blockedUntil>now()?new Date(blockedUntil).toISOString():null};}
 function run(fn){
  const task=tail.then(async()=>{
   if(now()<blockedUntil)throw Object.assign(new Error('Kalshi shared backoff active'),{httpStatus:429});
   const delay=Math.max(0,next-now());if(delay)await sleep(delay);
   if(now()<blockedUntil)throw Object.assign(new Error('Kalshi shared backoff active'),{httpStatus:429});
   requests++;next=now()+spacing;
   try{const value=await fn();strikes=0;return value;}
   catch(e){
    if(e.httpStatus===429){
     rateLimits++;strikes++;
     const retry=Number(e.retryAfterMs);
     blockedUntil=now()+Math.max(Math.min(300000,30000*2**Math.min(strikes-1,4)),Number.isFinite(retry)?retry:0);
    }
    throw e;
   }
  });tail=task.catch(()=>{});return task;
 }
 return {run,status};
}
function retryAfterMs(value,now=Date.now()){
 if(!value)return 0;
 const n=Number(value);if(Number.isFinite(n)&&n>=0)return n*1000;
 const date=Date.parse(value);return Number.isFinite(date)?Math.max(0,date-now):0;
}
module.exports={createReadGate,retryAfterMs};
