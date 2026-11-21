'use strict';const test=require('node:test'),assert=require('node:assert/strict');const {forecast,score,settled,checkpoint,selectMarket,authorized,price,midpoint}=require('../lib');
test('markets choose still-active, never expired',()=>{const now=Date.now();const xs=[{ticker:'old',status:'active',close_time:new Date(now-1000).toISOString()},{ticker:'live',status:'active',close_time:new Date(now+60000).toISOString()}];assert.equal(selectMarket(xs,now).ticker,'live');});
test('no forecast without observed premarket quote history',()=>{assert.equal(forecast([]).ready,false);assert.equal(forecast([{at:'2026-01-01T00:00:00Z',market_p:.6}]).ready,false);});
test('quotes produce bounded heuristic not AI',()=>{const times=['00:00:00','00:00:20','00:00:50'];const f=forecast(times.map((t,i)=>({at:`2026-01-01T${t}Z`,market_p:.51+i*.03})));assert.equal(f.ready,true);assert.equal(f.is_ai,false);assert.ok(f.p_yes<=.95);});
test('unverified official outcome never counted',()=>{const p=[{ticker:'x',p_yes:.8,baseline_p_yes:.7}];assert.equal(score(p,[{ticker:'x',result:'yes',verified:false}]).n,0);assert.equal(score(p,[{ticker:'x',result:'yes',verified:true}]).n,1);});
test('requires final/settled with yes/no result',()=>{assert.equal(settled({result:'yes',status:'active'}),false);assert.equal(settled({result:'yes',status:'finalized'}),true);assert.equal(settled({result:'',status:'finalized'}),false);});
test('fixed checkpoint intervals',()=>{const m={open_time:'2026-01-01T00:00:00Z',close_time:'2026-01-01T00:15:00Z'};assert.equal(checkpoint(m,Date.parse('2026-01-01T00:05:20Z')),5);assert.equal(checkpoint(m,Date.parse('2026-01-01T00:14:00Z')),null);});
test('viewer secret must be configured',()=>{assert.equal(authorized('abc',undefined),false);assert.equal(authorized('abc','abc'),true);assert.equal(authorized('abd','abc'),false);});
test('new dollar quote fields normalize',()=>{const m={yes_ask_dollars:'0.6100',yes_bid_dollars:'0.5900'};assert.equal(price(m,'yes'),.61);assert.equal(midpoint(m),.6);});

test('XRP 15m series is available alongside all seven market tabs', () => {
  const {SERIES} = require('../lib');
  assert.deepEqual(Object.keys(SERIES), ['BTC','BNB','ETH','SOL','XRP','GOLD','SILVER']);
  assert.equal(SERIES.XRP, process.env.SERIES_XRP || 'KXXRP15M');
  const fs = require('node:fs');
  const client = fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
  assert.match(client, /'XRP'/);
});
