'use strict';
// Shadow-only: no API orders, no account writes and no simulated fill assertion.
const {num}=require('./lib');
const STAKE=5, MIN_CONFIDENCE=.65, MIN_EDGE=.03, MAX_ASK=.95;
function candidate(f,quote){
  const side=f.side==='YES'?'YES':'NO';
  const ask=num(side==='YES'?quote.yes_ask:quote.no_ask);
  const probability=side==='YES'?num(f.p_yes):1-num(f.p_yes);
  const confidence=num(f.confidence);
  const edge=ask===null?null:probability-ask;
  let decision='SKIP',reason='';
  if(ask===null||ask<=0||ask>MAX_ASK)reason='NO_EXECUTABLE_ASK';
  else if(confidence===null||confidence<MIN_CONFIDENCE)reason='LOW_CONFIDENCE';
  else if(edge<MIN_EDGE)reason='INSUFFICIENT_EDGE_OVER_ASK';
  else {decision='PAPER_CANDIDATE';reason='ELIGIBLE_SHADOW_ONLY';}
  // Fractional contracts are used as an analytical normalization, NOT executable orders.
  const units=decision==='PAPER_CANDIDATE'?STAKE/ask:0;
  return {decision,reason,side,p_yes:f.p_yes,confidence,ask,edge,stake_usd:decision==='PAPER_CANDIDATE'?STAKE:0,notional_contracts:units,checkpoint:f.checkpoint,model:f.model,simulated_only:true,fees_included:false,slippage_included:false,fill_assumed:false};
}
function evaluate(rows,outcomes){
  const official=new Map(outcomes.filter(x=>x.verified&&['yes','no'].includes(x.result)&&!x.conflict).map(x=>[x.ticker,x.result.toUpperCase()]));
  let eligible=0,settled=0,wins=0,gross=0,skipped=0;
  const journal=rows.map(r=>{const result=official.get(r.ticker)||null,selected=r.decision==='PAPER_CANDIDATE';if(!selected){skipped++;return {...r,official_outcome:result,status:'SKIPPED',gross_pnl_usd:null};}
    eligible++;if(!result)return {...r,official_outcome:null,status:'AWAITING_VERIFIED_SETTLEMENT',gross_pnl_usd:null};
    settled++;const win=result===r.side;if(win)wins++;const pnl=win?r.notional_contracts*(1-r.ask):-r.stake_usd;gross+=pnl;return {...r,official_outcome:result,status:win?'PAPER_WIN':'PAPER_LOSS',gross_pnl_usd:Number(pnl.toFixed(4))};
  });
  return {policy:{stake_usd:STAKE,min_confidence:MIN_CONFIDENCE,min_edge_over_ask:MIN_EDGE,entry_checkpoint:3,fees_included:false,slippage_included:false,fill_assumed:false,orders_enabled:false,model_is_ai:false},summary:{records:rows.length,eligible,skipped,settled,pending:eligible-settled,wins,win_rate:settled?wins/settled:null,gross_pnl_usd:Number(gross.toFixed(4)),caveat:'Hypothetical fractional-contract gross payout, excludes fees, slippage and fill constraints; not a tradable return.'},journal};
}
module.exports={candidate,evaluate};
