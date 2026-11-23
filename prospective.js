'use strict';
// Observation-only. All metrics are per market/ticker, after a fixed UTC cutoff.
const CUTOFF='2026-11-23T14:00:00Z';
const validProb=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const validTime=t=>Number.isFinite(Date.parse(t||''));
function validation(forwards,outcomes,papers,cutoff=CUTOFF){
 const start=Date.parse(cutoff);
 const verified=new Map(outcomes.filter(o=>o.verified===true&&o.conflict!==true&&o.source==='kalshi_official'&&['yes','no'].includes(String(o.result).toLowerCase())).map(o=>[o.ticker,String(o.result).toLowerCase()]));
 const seen=new Set();
 const forecasts=forwards.filter(f=>Number(f.checkpoint)===3&&validTime(f.at)&&Date.parse(f.at)>=start&&f.official_result_known_at_prediction===false&&validProb(f.p_yes)&&validProb(f.baseline_p_yes)&&['YES','NO'].includes(f.side)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).filter(f=>{if(seen.has(f.ticker))return false;seen.add(f.ticker);return true;});
 const done=forecasts.filter(f=>verified.has(f.ticker)).map(f=>{const outcome=verified.get(f.ticker),yes=outcome==='yes'?1:0,correct=f.side.toLowerCase()===outcome;return {ticker:f.ticker,at:f.at,correct,confidence:f.confidence,model_loss:(f.p_yes-yes)**2,baseline_loss:(f.baseline_p_yes-yes)**2};});
 const score=arr=>({n:arr.length,accuracy:arr.length?arr.filter(x=>x.correct).length/arr.length:null,model_brier:arr.length?arr.reduce((v,x)=>v+x.model_loss,0)/arr.length:null,baseline_brier:arr.length?arr.reduce((v,x)=>v+x.baseline_loss,0)/arr.length:null,brier_advantage:arr.length?arr.reduce((v,x)=>v+x.baseline_loss-x.model_loss,0)/arr.length:null});
 const rolling=Object.fromEntries([25,50,100].map(k=>[String(k),score(done.slice(-k))]));
 const buckets=[[.5,.6],[.6,.7],[.7,.8],[.8,1.000001]].map(([lo,hi])=>{const arr=done.filter(x=>validProb(x.confidence)&&x.confidence>=lo&&x.confidence<hi);return {range:Math.round(lo*100)+'–'+Math.round(Math.min(hi,1)*100)+'%',n:arr.length,mean_confidence:arr.length?arr.reduce((v,x)=>v+x.confidence,0)/arr.length:null,observed_accuracy:score(arr).accuracy};});
 const postPaper=papers.filter(p=>validTime(p.at)&&Date.parse(p.at)>=start);
 const candidates=postPaper.filter(p=>p.decision==='PAPER_CANDIDATE');
 const settledCandidates=candidates.filter(p=>verified.has(p.ticker));
 const qualified=postPaper.filter(p=>p.worker_observation_quality==='PASS').length;
 const conditionalWins=settledCandidates.filter(p=>p.side.toLowerCase()===verified.get(p.ticker)).length;
 return {policy:{cutoff,analysis_only:true,orders_enabled:false,model_unchanged:true,no_new_orders:true,baseline:'stored_quote_midpoint_proxy',warning:'Cutoff is a labeling convention, not an untouched holdout. Correlated markets and market-specific fees/fills are not verified.'},summary:{minute3_saved:forecasts.length,minute3_verified:done.length,minute3_pending:forecasts.length-done.length,progress_target:100,progress_pct:Math.min(done.length,100),all:score(done),rolling,calibration:buckets,paper_evaluations:postPaper.length,paper_candidates:candidates.length,paper_skipped:postPaper.length-candidates.length,paper_settled: settledCandidates.length,paper_pending:candidates.length-settledCandidates.length,paper_settled_wins:conditionalWins,quality_pass:qualified,quality_other:postPaper.length-qualified},recent:done.slice(-25).reverse()};
}
module.exports={validation,CUTOFF};
