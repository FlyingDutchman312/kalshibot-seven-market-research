'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
test('minute-3 paper decision is not nested under missing forward record',()=>{
  assert.match(code,/const needsForward=!existingForward;/);
  assert.match(code,/const needsPaper=cp===3&&!existingPaper;/);
  assert.match(code,/if\(needsForward\|\|needsPaper\)/);
  assert.match(code,/if\(needsPaper\)\{[\s\S]*?store\.put\('paper'/);
});
test('paper fix retains strict read-only routes and settlement check',()=>{
  assert.match(code,/if\(req\.method!=='GET'\)/);
  assert.match(code,/const f=forecast\(quotes\);/);
  assert.match(code,/if\(f\.ready\)/);
  assert.match(code,/if\(cp\)/);
  assert.match(code,/orders_enabled:false/);
});
