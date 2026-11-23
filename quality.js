'use strict';
// This measures *worker receipt* quality. Kalshi market-list responses are not
// guaranteed exchange-timestamped, executable order-book quotations.
const MAX_RTT_MS = 10000;
const MAX_RECEIPT_AGE_MS = 10000;
function finite(v){return typeof v==='number' && Number.isFinite(v);}
function assessQuote(quote, context={}, now=Date.now()){
 const reasons=[];
 const requestStart=Date.parse(context.request_started_at||'');
 const received=Date.parse(context.response_received_at||'');
 const rtt=context.request_duration_ms;
 const receiptAge=Number.isFinite(received)?now-received:null;
 const bid=quote.yes_bid,ya=quote.yes_ask,na=quote.no_ask;
 if(!Number.isFinite(requestStart)||!Number.isFinite(received)||!finite(rtt)||rtt<0||received<requestStart)reasons.push('MISSING_REQUEST_TIMING');
 if(!finite(rtt)||rtt>MAX_RTT_MS)reasons.push('SLOW_API_RESPONSE');
 if(receiptAge===null||receiptAge<0||receiptAge>MAX_RECEIPT_AGE_MS)reasons.push('STALE_WORKER_OBSERVATION');
 if(!['active','open'].includes(quote.status))reasons.push('MARKET_NOT_ACTIVE');
 if(!Number.isFinite(Date.parse(quote.close_time||''))||Date.parse(quote.close_time)<=now)reasons.push('MARKET_CLOSED');
 if(!finite(bid)||!finite(ya)||!finite(na)||bid<0||ya>1||na>1||ya<=0||na<=0||bid>ya)reasons.push('INVALID_BID_ASK');
 if(finite(ya)&&finite(na)&&ya+na<.995)reasons.push('INCONSISTENT_TWO_SIDED_ASK');
 return {worker_observation_quality:reasons.length?'REJECT':'PASS',quality_reasons:reasons,request_started_at:context.request_started_at||null,response_received_at:context.response_received_at||null,request_duration_ms:finite(rtt)?rtt:null,receipt_age_ms:receiptAge,quote_timestamp_origin:'worker_received_after_http_response',exchange_quote_timestamp:null,exchange_freshness_verified:false,executable_liquidity_verified:false,quality_policy:'v2.3.2_worker_observed_v1',max_request_duration_ms:MAX_RTT_MS,max_receipt_age_ms:MAX_RECEIPT_AGE_MS};
}
module.exports={assessQuote,MAX_RTT_MS,MAX_RECEIPT_AGE_MS};
