'use strict';
// Frozen prospective candidates; never fit on the evaluation sample.
const VERSION='2.4.0-fixed-v1', CP=[3,5,7,9,11];
const MODELS=['original','midpoint','recalibration_candidate','market_blend','checkpoint_blend'];
const prob=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
const weights={3:.5,5:.4,7:.3,9:.2,11:.1};
function capture(f,cp,snap,at,open,close){
 if(!CP.includes(cp)||!prob(f.p_yes)||!prob(f.baseline_p_yes)||!(Date.parse(open)<=Date.parse(at)&&Date.parse(at)<Date.parse(close)))return null;
 const p=f.p_yes,b=f.baseline_p_yes,w=weights[cp];
 return {version:VERSION,at,probabilities:{original:p,midpoint:b,recalibration_candidate:Math.max(0,Math.min(1,.5+1.1*(p-.5))) ,market_blend:.25*p+.75*b,checkpoint_blend:w*p+(1-w)*b},yes_ask:prob(snap.yes_ask)?snap.yes_ask:null,no_ask:prob(snap.no_ask)?snap.no_ask:null,quality:snap.worker_observation_quality||null};
}
function summarize(rows,outcomes){
 const y=new Map(outcomes.filter(o=>o.verified===true&&!o.conflict&&o.source==='kalshi_official'&&['yes','no'].includes(o.result)).map(o=>[o.ticker,Number(o.result==='yes')]));
 const seen=new Set();const saved=rows.filter(r=>r.shadow?.version===VERSION&&r.origin==='live_forward_pre_settlement'&&r.official_result_known_at_prediction===false&&CP.includes(r.checkpoint)&&Date.parse(r.shadow.at)===Date.parse(r.at)&&Date.parse(r.market_open_time)<=Date.parse(r.at)&&Date.parse(r.at)<Date.parse(r.market_close_time)&&MODELS.every(k=>prob(r.shadow.probabilities?.[k]))).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).filter(r=>{const k=r.ticker+':'+r.checkpoint;if(seen.has(k))return false;seen.add(k);return true;});
 const mean=(a)=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
 const metric=(arr,k)=>{const brier=mean(arr.map(r=>(r.shadow.probabilities[k]-y.get(r.ticker))**2));const baseline=mean(arr.map(r=>(r.shadow.probabilities.midpoint-y.get(r.ticker))**2));const ev=[],net=[];for(const r of arr){const p=r.shadow.probabilities[k],yes=p>=.5,ask=yes?r.shadow.yes_ask:r.shadow.no_ask;if(r.shadow.quality!=='PASS'||!prob(ask)||ask<=0||ask>=1)continue;const cost=ask+Math.ceil(.07*ask*(1-ask)*10000)/10000;const e=(yes?p:1-p)-cost;if(e>0){ev.push(e);net.push(Number(yes===Boolean(y.get(r.ticker)))-cost);}}return {n:arr.length,brier,skill:baseline>0?1-brier/baseline:null,accuracy:mean(arr.map(r=>Number((r.shadow.probabilities[k]>=.5)===Boolean(y.get(r.ticker))))),positive_ev_count:ev.length,mean_ev:mean(ev),conditional_net_per_contract:mean(net),calibration:[0,.2,.4,.6,.8].map(lo=>{const subset=arr.filter(r=>r.shadow.probabilities[k]>=lo&&(lo===.8||r.shadow.probabilities[k]<Math.round((lo+.2)*10)/10));return {lo,n:subset.length,mean_p:mean(subset.map(r=>r.shadow.probabilities[k])),observed_yes:mean(subset.map(r=>y.get(r.ticker)))};})};};
 return {version:VERSION,orders_enabled:false,scope:'bounded recent research window; not lifetime',saved:saved.length,distinct_markets:new Set(saved.map(r=>r.ticker)).size,checkpoints:CP.map(minute=>{const records=saved.filter(r=>r.checkpoint===minute),graded=records.filter(r=>y.has(r.ticker));return {minute,saved:records.length,graded:graded.length,models:MODELS.map(model=>({model,...metric(graded,model),rolling25:metric(graded.slice(-25),model).brier,rolling100:metric(graded.slice(-100),model).brier}))};})};
}
module.exports={capture,summarize,VERSION};
