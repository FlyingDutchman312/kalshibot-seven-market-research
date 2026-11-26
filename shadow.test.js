const test=require('node:test'),assert=require('node:assert/strict');const {capture,summarize}=require('../shadow');
const at='2026-11-26T07:03:00Z',open='2026-11-26T07:00:00Z',close='2026-11-26T07:15:00Z';
const shadow=capture({p_yes:.7,baseline_p_yes:.8},3,{yes_ask:.6,no_ask:.4,worker_observation_quality:'PASS'},at,open,close);
const row={ticker:'X',checkpoint:3,at,market_open_time:open,market_close_time:close,origin:'live_forward_pre_settlement',official_result_known_at_prediction:false,shadow};
const outcome={ticker:'X',verified:true,source:'kalshi_official',result:'yes'};
test('fixed candidates preserve control, capture only before close',()=>{assert.equal(shadow.probabilities.original,.7);assert.equal(shadow.probabilities.midpoint,.8);assert.equal(capture({p_yes:.7,baseline_p_yes:.8},3,{},close,open,close),null);});
test('paired grading deduplicates and excludes historical and unverified records',()=>{const s=summarize([row,row,{...row,ticker:'Y',shadow:null}],[outcome]);assert.equal(s.saved,1);assert.equal(s.checkpoints[0].graded,1);assert.equal(s.checkpoints[0].models[1].skill,0);assert.equal(summarize([row],[{...outcome,conflict:true}]).checkpoints[0].graded,0);});
test('no fills or promotion implied; missing outcomes not graded',()=>{const s=summarize([row],[]);assert.equal(s.orders_enabled,false);assert.equal(s.checkpoints[0].models[0].brier,null);});
