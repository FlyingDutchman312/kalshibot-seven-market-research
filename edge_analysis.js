'use strict';
// Diagnostics only: original fixed heuristic, existing paper decisions and order hard-disable remain unchanged.
const {scenario}=require('./economics');
const round4=x=>Math.round((x+Number.EPSILON)*1e4)/1e4;
const valid=x=>typeof x==='number'&&Number.isFinite(x);
const pct=x=>valid(x)&&x>=0&&x<=1;
const official=o=>o?.verified===true&&!o.conflict&&o.source==='kalshi_official'&&['yes','no'].includes(o.result);
function analyzeEdge(paperRows,outcomes,forwardRows=[],cutoff='2026-11-23T14:00:00Z'){
 const outcome=new Map(outcomes.filter(official).map(o=>[o.ticker,o.result.toUpperCase()]));
 const settled=new Map();
 const entries=[...paperRows].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 let eligible=0,skipped=0,verified=0,wins=0,net=0,stressNet=0,costed=0,qualityPass=0,qualityUnknown=0,netPositiveEV=0,netNonPositiveEV=0,netUnknown=0;
 const journal=entries.map(r=>{
   const isEligible=r.decision==='PAPER_CANDIDATE'; if(isEligible)eligible++;else skipped++;
   const actual=outcome.get(r.ticker)||null;
   const quoteQuality=r.worker_observation_quality||'LEGACY_UNKNOWN';
   if(isEligible){if(quoteQuality==='PASS')qualityPass++;else qualityUnknown++;}
   const cost=isEligible?scenario(r):null;
   const stress=isEligible?scenario(r,.01):null;
   const modelEV=isEligible&&cost?.contracts>0&&pct(r.p_yes)?cost.model_ev_usd:null;
   if(isEligible){if(modelEV===null)netUnknown++;else if(modelEV>0)netPositiveEV++;else netNonPositiveEV++;}
   const breakeven=isEligible&&cost?.contracts>0?cost.commitment_usd/cost.contracts:null;
   const selectedP=isEligible&&pct(r.p_yes)?(r.side==='YES'?r.p_yes:1-r.p_yes):null;
   let pnl=null,stressPnl=null,correct=null;
   if(isEligible&&actual){verified++;correct=actual===r.side;if(correct)wins++;
     if(cost?.contracts>0&&stress?.contracts>0){costed++;pnl=correct?cost.net_if_win_usd:cost.net_if_loss_usd;stressPnl=correct?stress.net_if_win_usd:stress.net_if_loss_usd;net+=pnl;stressNet+=stressPnl;}}
   const item={ticker:r.ticker,at:r.at,decision:r.decision,reason:r.reason||null,side:r.side||null,official_outcome:actual,quote_quality:quoteQuality,confidence:r.confidence??null,ask:r.ask??null,raw_edge_pp:valid(r.edge)?round4(r.edge*100):null,selected_probability:selectedP,
     estimated_break_even_probability:breakeven,estimated_net_edge_pp:selectedP!==null&&breakeven!==null?round4((selectedP-breakeven)*100):null,
     contracts:cost?.contracts||0,fee_estimate_usd:cost?.entry_fee_estimate_usd??null,model_ev_usd:modelEV,
     correctly_predicted:correct,conditional_net_usd:pnl,stress_conditional_net_usd:stressPnl,
     caveat:'No execution, liquidity, exchange-freshness or market-specific fee verification'};
   if(actual&&isEligible)settled.set(r.ticker,item);
   return item;
 });
 const pred=new Map(outcome);let n=0,modelB=0,baselineB=0;
 // Exactly one prospective minute-3 forecast per ticker. No later checkpoints or replay.
 for(const f of forwardRows){if(Number(f.checkpoint)!==3||!pred.has(f.ticker)||!pct(f.p_yes)||!pct(f.baseline_p_yes)||f.official_result_known_at_prediction===true)continue;
   if(!Number.isFinite(Date.parse(f.at))||Date.parse(f.at)<Date.parse(cutoff))continue;
   const y=pred.get(f.ticker)==='YES'?1:0;n++;modelB+=(f.p_yes-y)**2;baselineB+=(f.baseline_p_yes-y)**2;pred.delete(f.ticker);
 }
 return {policy:{analysis_only:true,orders_enabled:false,minimum_edge_unchanged:true,confidence_threshold_unchanged:true,baseline:'stored_quote_midpoint_proxy',fee_assumption:'STANDARD_TAKER_ASSUMED',no_executions:true,prospective_cutoff:cutoff},
  summary:{paper_evaluations:entries.length,eligible,skipped,verified_eligible:verified,settled_costed:costed,conditional_wins:wins,conditional_losses:verified-wins,conditional_win_rate:verified?wins/verified:null,conditional_net_usd:costed?round4(net):null,stress_conditional_net_usd:costed?round4(stressNet):null,quality_pass_eligible:qualityPass,quality_unknown_eligible:qualityUnknown,model_ev_positive:netPositiveEV,model_ev_nonpositive:netNonPositiveEV,model_ev_unavailable:netUnknown,
   distinct_settled_eligible_markets:settled.size},
  prospective:{verified_minute3:n,model_brier:n?round4(modelB/n):null,midpoint_baseline_brier:n?round4(baselineB/n):null,model_minus_baseline_brier:n?round4((modelB-baselineB)/n):null,warning:'Retrospectively selected observation cutoff for display only; not an untouched holdout. Baseline is quote midpoint, not executable price. Correlated markets and small samples limit conclusions.'},
  warning:'Exploratory diagnostics on fixed, existing candidates; never used to alter decisions. Expected value derives from uncalibrated model probabilities and fee assumptions, not realized edge. No real or simulated fills.',journal:journal.reverse()};
}
module.exports={analyzeEdge};
