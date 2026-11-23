'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {Store}=require('./storage');
const {candidate,evaluate}=require('./paper');
const {SERIES,discover,kalshi,snapshot,forecast,checkpoint,resultOf,settled,score,authorized,account,iso}=require('./lib');
const store=new Store(),PORT=Number(process.env.PORT||3000),POLL=Math.max(15,Number(process.env.POLL_SECONDS||30))*1000;
const assets=Object.keys(SERIES),cache=new Map(),errors={};let lastPoll=null,working=false,cycles=0;
const escapeError=e=>String(e?.message||e).slice(0,300);
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(data));};
function miniMarket(s){const old=cache.get(s);return old||{symbol:s,series:SERIES[s],market:null,source:'not_yet_polled'};}
async function tickSymbol(s){
 const cur=await discover(s);cache.set(s,cur);errors[s]=null;
 const m=cur.market;if(!m)return;
 const now=new Date().toISOString(),snap=snapshot(m,now);
 const id=`quote:${m.ticker}:${Math.floor(Date.now()/30000)}`;
 await store.put('quote',s,m.ticker,id,snap,now);
 const cp=checkpoint(m);
 if(cp){const pid=`forward:${m.ticker}:${cp}`;if(!await store.find('forward',s,pid)){
   const quotes=(await store.list('quote',s,250,m.ticker)).reverse();
   const f=forecast(quotes);
   if(f.ready){await store.put('forward',s,m.ticker,pid,{...f,checkpoint:cp,market_open_time:m.open_time,market_close_time:m.close_time,observed_quote_at:quotes.at(-1)?.at,origin:'live_forward_pre_settlement',official_result_known_at_prediction:false},now);
     // Only the first qualifying checkpoint generates one shadow decision per market.
     // The prediction and quote are captured BEFORE official outcome publication.
     if(cp===3){const paperId=`paper:${m.ticker}`;
       if(!await store.find('paper',s,paperId))await store.put('paper',s,m.ticker,paperId,{...candidate({...f,checkpoint:cp},snap),origin:'live_pre_settlement_shadow',observed_quote_at:now,market_close_time:m.close_time},now);
     }
   }
 }}
}
async function auditTicker(s,ticker){
 const m=(await kalshi('/markets/'+encodeURIComponent(ticker))).market;
 if(!m)return;
 const now=new Date().toISOString(),r=resultOf(m),valid=settled(m);
 const observed={result:r,status:m.status,settlement_ts:m.settlement_ts||null,source:'official_kalshi_market_endpoint',observed_at:now,valid};
 const prior=(await store.list('audit',s,15,ticker)).filter(x=>x.valid).sort((a,b)=>iso(b.at)-iso(a.at));
 const priorDistinct=prior.find(a=>a.result===r && (Date.now()-(iso(a.at)||0))>=30000);
 const mismatch=prior.some(a=>a.result && r && a.result!==r);
 const aid=`audit:${ticker}:${Math.floor(Date.now()/60000)}`;
 await store.put('audit',s,ticker,aid,{...observed,conflict:mismatch},now);
 if(valid&&priorDistinct&&!mismatch){const id=`outcome:${ticker}`;const old=await store.find('outcome',s,id);if(!old||old.result!==r||!old.verified){await store.put('outcome',s,ticker,id,{result:r,verified:true,verification:'two_separated_official_kalshi_reads_same_source',first_observation:priorDistinct.at,second_observation:now,settlement_ts:m.settlement_ts||null,source:'kalshi_official',is_independent_source:false},now);}}
 if(mismatch){const existing=await store.find('outcome',s,`outcome:${ticker}`);if(existing?.verified)await store.put('outcome',s,ticker,`outcome:${ticker}`,{...existing,verified:false,conflict:true},now);}
}
async function settlementSweep(s){
 const recent=await store.list('quote',s,650);const seen=new Set();const tickers=[];
 for(const q of recent){if(!seen.has(q.ticker)){seen.add(q.ticker);if(q.close_time && iso(q.close_time)<Date.now()+10000 && iso(q.close_time)>Date.now()-36*3600000)tickers.push(q.ticker);}}
 let work=0;for(const ticker of tickers){if(work>=5)break;const outcome=await store.find('outcome',s,`outcome:${ticker}`);if(outcome?.verified)continue;const audits=await store.list('audit',s,1,ticker);if(audits.length&&Date.now()-(iso(audits[0].at)||0)<60000)continue;work++;try{await auditTicker(s,ticker);}catch(e){errors[`${s}_settlement`]=escapeError(e);}}
}
async function poll(){if(working)return;working=true;try{await store.health();await Promise.all(assets.map(async s=>{try{await tickSymbol(s);await settlementSweep(s);}catch(e){errors[s]=escapeError(e);console.warn('POLL_ERROR',s,escapeError(e));}}));lastPoll=new Date().toISOString();cycles++;}catch(e){errors.storage=escapeError(e);console.error('PERSISTENCE_ERROR',escapeError(e));}finally{working=false;}}
function rowsSample(rows,limit=100){return rows.slice(0,limit);}
async function dataset(symbol){const [predictions,outcomes,audits,quotes,paperRows]=await Promise.all([store.list('forward',symbol,2500),store.list('outcome',symbol,1500),store.list('audit',symbol,1600),store.list('quote',symbol,1000),store.list('paper',symbol,2500)]);
 const ps=predictions.filter(p=>p.origin==='live_forward_pre_settlement');const official=outcomes.filter(o=>o.verified);
 const stats=score(ps,official);
 const verifiedByTicker=new Map(official.filter(o=>['yes','no'].includes(o.result)).map(o=>[o.ticker,o.result]));
 const checkpoint_stats=[3,5,7,9,11].map(minute=>{const entries=ps.filter(p=>p.checkpoint===minute);const x=score(entries,official);return {minute,saved:entries.length,scored:x.n,accuracy:x.accuracy,brier:x.brier,baseline:x.baseline_brier};});
 const journal=rowsSample(ps,120).map(p=>{const result=verifiedByTicker.get(p.ticker);return {...p,official_outcome:result?result.toUpperCase():null,verification:!result?'PENDING':result.toUpperCase()===p.side?'CORRECT':'INCORRECT'};});
 const marketCount=new Set(ps.map(p=>p.ticker)).size;
 const verifiedCount=new Set(ps.filter(p=>official.some(o=>o.ticker===p.ticker)).map(p=>p.ticker)).size;
 const disputes=audits.filter(x=>x.conflict).length;
 return {symbol,series:SERIES[symbol],paper:evaluate(paperRows,outcomes),stats:{...stats,forward_signals:ps.length,distinct_forward_markets:marketCount,verified_distinct_forward_markets:verifiedCount,official_results:official.length,distinct_audited_markets:new Set(audits.map(a=>a.ticker)).size,official_read_disputes:disputes,quotes_saved:quotes.length,score_note:'Brier scores count checkpoint-level predictions; multiple checkpoints in one market are correlated. Market-level count is reported separately.',promotion:'BLOCKED_RESEARCH_ONLY'},checkpoint_stats,journal,predictions:rowsSample(ps,120),outcomes:rowsSample(outcomes,120),audits:rowsSample(audits,120),quotes:rowsSample(quotes,250)};
}
function replay(quotes,outcomes){
 const y=new Map(outcomes.filter(o=>o.verified&&resultOf(o)).map(o=>[o.ticker,o]));const by=new Map();
 for(const q of quotes){if(!y.has(q.ticker))continue;if(!by.has(q.ticker))by.set(q.ticker,[]);by.get(q.ticker).push(q);}
 const candidates=[];for(const [ticker,rows] of by){rows.sort((a,b)=>iso(a.at)-iso(b.at));const open=iso(rows[0].open_time);if(!open)continue;const eligible=rows.filter(q=>iso(q.at)>=open+3*60000 && iso(q.at)<open+4*60000);if(!eligible.length)continue;const at=eligible[0].at;const before=rows.filter(q=>iso(q.at)<=iso(at));const f=forecast(before);if(f.ready)candidates.push({...f,ticker,at,kind:'retrospective_quote_replay_not_live',origin:'retrospective_replay'});}
 candidates.sort((a,b)=>iso(a.at)-iso(b.at));const split=Math.floor(candidates.length*.7);
 return {design:'Fixed quote-momentum heuristic; forecasts computed using only snapshots saved before each replay checkpoint. No model fitting or hyperparameter optimization.',leakage_warning:'Historical replay is not prospective validation. Stored snapshots may be sparse; do not claim pre-existing-market backtest coverage.',total_markets:candidates.length,early_sample:score(candidates.slice(0,split),[...y.values()]),holdout:score(candidates.slice(split),[...y.values()]),holdout_market_count:candidates.length-split,cutoff:candidates[split]?.at||null};
}
const staticRoot=path.join(__dirname,'public');
const server=http.createServer(async(req,res)=>{
 let u;try{u=new URL(req.url,'http://localhost');}catch{return send(res,400,{error:'Invalid URL'});}
 if(req.method!=='GET')return send(res,405,{error:'Only GET is supported. No order-writing routes exist.'});
 const route=u.pathname;
 if(route==='/api/health'){let persistence;try{persistence=await store.health()}catch(e){persistence={ok:false,error:escapeError(e)}}return send(res,200,{status:persistence.ok&&lastPoll?'running':'starting_or_degraded',research_only:true,live_trading_enabled:false,demo_trading_enabled:false,orders_enabled:false,assets,series:SERIES,persistence,last_poll:lastPoll,cycles,poll_running:working,errors,account_key_configured:!!(process.env.KALSHI_API_KEY_ID&&process.env.KALSHI_PRIVATE_KEY_PEM),viewer_auth_enabled:!!process.env.VIEWER_PASSPHRASE});}
 if(route==='/api/overview')return send(res,200,{markets:assets.map(miniMarket),as_of:new Date().toISOString(),research_only:true});
 if(route==='/api/market'){const s=(u.searchParams.get('symbol')||'').toUpperCase();return assets.includes(s)?send(res,200,miniMarket(s)):send(res,400,{error:'Unknown symbol'});}
 if(route.startsWith('/api/')){
   const pass=req.headers['x-viewer-passphrase'];if(!authorized(pass,process.env.VIEWER_PASSPHRASE))return send(res,401,{error:'Viewer passphrase required. Set VIEWER_PASSPHRASE on the server and unlock dashboard.'});
   if(route==='/api/account'){try{return send(res,200,await account())}catch(e){return send(res,502,{connected:false,error:escapeError(e),orders_enabled:false});}}
   if(route==='/api/research'||route==='/api/backtest'){
     const s=(u.searchParams.get('symbol')||'').toUpperCase();if(!assets.includes(s))return send(res,400,{error:'Unknown symbol'});
     try{if(route==='/api/research')return send(res,200,await dataset(s));
       const [quotes,outcomes]=await Promise.all([store.list('quote',s,6000),store.list('outcome',s,2000)]);return send(res,200,{symbol:s,...replay(quotes,outcomes)});
     }catch(e){return send(res,503,{error:escapeError(e)});}
   }
   return send(res,404,{error:'Unknown endpoint'});
 }
 const file=route==='/'?'/index.html':route;let normalized;try{normalized=path.resolve(staticRoot,'.'+decodeURIComponent(file))}catch{return send(res,400,{error:'Bad path'})};if(!normalized.startsWith(staticRoot+path.sep))return send(res,403,{error:'Forbidden'});
 fs.readFile(normalized,(err,body)=>{if(err)return send(res,404,{error:'Not found'});const ext=path.extname(normalized);res.writeHead(200,{'Content-Type':ext==='.html'?'text/html; charset=utf-8':ext==='.js'?'text/javascript':'text/css','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(body);});
});
if(require.main===module){server.listen(PORT,'0.0.0.0',()=>console.log(`MISSION_CONTROL_RESEARCH port=${PORT} markets=${assets.join(',')} orders=HARD_DISABLED storage=${store.mode}`));setTimeout(poll,500).unref();setInterval(poll,POLL).unref();}
module.exports={server,replay,dataset,store};
