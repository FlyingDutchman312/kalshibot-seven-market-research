'use strict';
// Observational, conditional economics only. No simulated fills, no orders.
// Illustrative STANDARD taker schedule effective July 7 2026; verify series fee configuration.
const MAX_BUDGET=5, STRESS_SLIPPAGE_CENTS=1, TAKER_RATE=.07;
const round4=x=>Math.round((x+Number.EPSILON)*10000)/10000;
function finite(v){return typeof v==='number'&&Number.isFinite(v);}
function fee(contracts,price){
  if(!Number.isInteger(contracts)||contracts<=0||!finite(price)||price<=0||price>=1)return null;
  // Official rule: round so total position cost + fee rounds UP to centicent ($0.0001).
  const cost=contracts*price;
  const nominal=TAKER_RATE*contracts*price*(1-price);
  return round4(Math.ceil((cost+nominal-1e-10)*10000)/10000-cost);
}
function scenario(row,priceShift=0){
  const p=row.ask;
  if(!finite(p)||p<=0||p>=1)return {reason:'INVALID_ASK',contracts:0};
  const price=Math.round((p+priceShift)*10000)/10000;
  if(price<=0||price>=1)return {reason:'STRESS_PRICE_OUT_OF_BOUNDS',contracts:0};
  let contracts=0,entryFee=0,commitment=0;
  for(let n=1;n<=10000;n++){
    const f=fee(n,price),spent=round4(n*price+f);
    if(spent>MAX_BUDGET+1e-10)break;
    contracts=n;entryFee=f;commitment=spent;
  }
  if(!contracts)return {reason:'NO_WHOLE_CONTRACT_WITHIN_BUDGET',contracts:0};
  const probability=row.side==='YES'?row.p_yes:1-row.p_yes;
  const estimatedEV=finite(probability)?round4(contracts*probability-commitment):null;
  return {reason:'ILLUSTRATIVE_ONLY',contracts,entry_price:price,entry_fee_estimate_usd:entryFee,commitment_usd:commitment,model_ev_usd:estimatedEV,
      net_if_win_usd:round4(contracts-commitment),net_if_loss_usd:round4(-commitment)};
}
function analyze(rows,outcomes){
  const map=new Map(outcomes.filter(o=>o.verified===true&&!o.conflict&&o.source==='kalshi_official'&&['yes','no'].includes(o.result)).map(o=>[o.ticker,o.result.toUpperCase()]));
  let eligible=0,skipped=0,settled=0,pending=0,net=0,stressNet=0,wins=0,uncosted=0;
  const journal=rows.map(r=>{
    const selected=r.decision==='PAPER_CANDIDATE',observed=map.get(r.ticker)||null;
    if(!selected){skipped++;return {ticker:r.ticker,at:r.at,decision:r.decision,reason:r.reason,side:r.side,official_outcome:observed,status:'SKIPPED',contracts:0,net_scenario_usd:null,stress_scenario_usd:null};}
    eligible++;
    const base=scenario(r),stress=scenario(r,STRESS_SLIPPAGE_CENTS/100);
    if(!base.contracts||!stress.contracts)uncosted++;
    if(!observed)pending++;
    else if(base.contracts&&stress.contracts){settled++;const won=r.side===observed;if(won)wins++;net+=won?base.net_if_win_usd:base.net_if_loss_usd;stressNet+=won?stress.net_if_win_usd:stress.net_if_loss_usd;}
    return {ticker:r.ticker,at:r.at,decision:r.decision,reason:r.reason,side:r.side,confidence:r.confidence,ask:r.ask,edge:r.edge,official_outcome:observed,status:observed?'SETTLED_SCENARIO':'PENDING_OFFICIAL',
       contracts:base.contracts,fee_estimate_usd:base.entry_fee_estimate_usd??null,commitment_usd:base.commitment_usd??null,model_ev_usd:base.model_ev_usd??null,
       net_scenario_usd:observed&&base.contracts?(r.side===observed?base.net_if_win_usd:base.net_if_loss_usd):null,
       stress_scenario_usd:observed&&stress.contracts?(r.side===observed?stress.net_if_win_usd:stress.net_if_loss_usd):null,stress_contracts:stress.contracts,
       quote_quality:r.worker_observation_quality??'LEGACY_UNKNOWN',exchange_verified:r.exchange_freshness_verified===true,
       fee_type:'STANDARD_TAKER_ASSUMED',fill_verified:false,liquidity_verified:false};
  });
  return {policy:{stake_cap_usd:MAX_BUDGET,assumed_standard_taker_fee_rate:TAKER_RATE,fee_schedule_effective:'2026-07-07',stress_slippage_cents:STRESS_SLIPPAGE_CENTS,orders_enabled:false,fill_assumed:false,fill_verified:false,liquidity_verified:false,exchange_timestamp_verified:false,settlement_only_no_exit_fee:true},
    summary:{evaluations:rows.length,eligible,skipped,settled_costed: settled,pending,uncosted,scenario_wins:wins,scenario_net_usd:settled?round4(net):null,stress_net_usd:settled?round4(stressNet):null,
      warning:'Conditional standard-taker-fee scenario. Market-specific fee terms, available volume, execution, slippage, and fills are NOT verified. No real or paper orders executed.'},journal};
}
module.exports={fee,scenario,analyze};
