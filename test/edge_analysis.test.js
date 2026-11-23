'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {analyzeEdge}=require('../edge_analysis');
const at='2026-11-23T15:00:00Z';
const row={ticker:'ABC',at,decision:'PAPER_CANDIDATE',side:'YES',ask:.60,edge:.10,p_yes:.70,confidence:.70,worker_observation_quality:'PASS'};
const o={ticker:'ABC',result:'yes',verified:true,source:'kalshi_official'};
const f={ticker:'ABC',at,checkpoint:3,p_yes:.7,baseline_p_yes:.6,official_result_known_at_prediction:false};
test('eligible settled candidate has cost-inclusive break-even probability and separate conditional P&L',()=>{
 const x=analyzeEdge([row],[o],[f]); const j=x.journal[0];
 assert.equal(x.summary.eligible,1);assert.equal(x.summary.conditional_wins,1);
 assert.ok(j.estimated_break_even_probability>row.ask);
 assert.ok(j.estimated_net_edge_pp<row.edge*100);
 assert.ok(j.conditional_net_usd>0);assert.equal(x.policy.orders_enabled,false);
 assert.equal(x.prospective.verified_minute3,1);
});
test('skipped decisions never generate hypothetical trades or net edge',()=>{
 const x=analyzeEdge([{...row,decision:'SKIP',reason:'LOW_CONFIDENCE'}],[o],[f]);
 assert.equal(x.summary.eligible,0);assert.equal(x.summary.conditional_net_usd,null);
 assert.equal(x.journal[0].contracts,0);assert.equal(x.journal[0].estimated_net_edge_pp,null);
});
test('unverified conflicting or nonofficial outcomes are not scored',()=>{
 for(const bad of [{...o,verified:false},{...o,conflict:true},{...o,source:'unofficial'}]){
  const x=analyzeEdge([row],[bad],[f]);assert.equal(x.summary.verified_eligible,0);
  assert.equal(x.summary.conditional_net_usd,null);assert.equal(x.prospective.verified_minute3,0);
 }
});
test('only prospective minute-3 outcomes count in model vs baseline diagnostic',()=>{
 const old={...f,ticker:'OLD',at:'2026-11-22T14:00:00Z'};
 const later={...f,ticker:'LATER',checkpoint:5};
 const leaked={...f,ticker:'LEAKED',official_result_known_at_prediction:true};
 const more=[o,{...o,ticker:'OLD'},{...o,ticker:'LATER'},{...o,ticker:'LEAKED'}];
 const x=analyzeEdge([row],more,[f,old,later,leaked]);
 assert.equal(x.prospective.verified_minute3,1);
 assert.ok(x.prospective.model_brier<x.prospective.midpoint_baseline_brier);
});
test('low forecast probability can yield negative fee-inclusive expected value without changing entry decision',()=>{
 const x=analyzeEdge([{...row,p_yes:.605,confidence:.605}], [o]);
 assert.equal(x.summary.eligible,1);assert.equal(x.summary.model_ev_nonpositive,1);
 assert.ok(x.journal[0].model_ev_usd<0);
});
