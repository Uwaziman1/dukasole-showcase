import test from 'node:test';
import assert from 'node:assert/strict';
import {rateDate,projectRate,previousInterval} from '../src/quickbooks/currency.js';
import {convertDatedMinor,decimalRatio} from '../src/dated-currency.js';
const date='2026-10-13';
const raw=(code,rate)=>({ExchangeRate:{SourceCurrencyCode:code,TargetCurrencyCode:'USD',AsOfDate:date,Rate:rate},time:'2026-10-13T00:00:00Z'});
const quote=()=>({version:1,homeCurrency:'USD',date,rates:{KES:projectRate(raw('KES','0.0075'),'KES',date,'now'),EUR:projectRate(raw('EUR','1.10'),'EUR',date,'now')}});

test('dated foreign-to-home and cross-display conversion rounds once without changing source evidence',()=>{
  const q=quote(),before=JSON.stringify(q);
  assert.equal(convertDatedMinor(11600,'KES','USD',q),87);
  assert.equal(convertDatedMinor(11600,'KES','EUR',q),79);
  assert.equal(convertDatedMinor(100,'USD','KES',q),13333);
  assert.equal(convertDatedMinor(200,'KES','USD',q),2);
  assert.equal(convertDatedMinor(-200,'KES','USD',q),-2);
  assert.equal(convertDatedMinor(100,'KES','KES',null),100);
  assert.equal(convertDatedMinor(100,'KES','USD',null),null);
  assert.equal(convertDatedMinor(Number.MAX_SAFE_INTEGER,'USD','KES',q),null);
  assert.equal(JSON.stringify(q),before);
  for(const value of ['0','-1','1e-3','NaN',null])assert.equal(decimalRatio(value),null);
  q.rates.KES.date='2026-10-12';assert.equal(convertDatedMinor(11600,'KES','USD',q),null);
});

test('dated quote and prior comparison boundaries reject mismatched evidence with no fallback',()=>{
  assert.equal(rateDate({date}),date);
  for(const input of [{date:'2026-02-30'},{date:[date]},{date,url:'unsafe'}])assert.throws(()=>rateDate(input),{code:'RATE_DATE'});
  for(const [key,value] of [['AsOfDate','2026-10-12'],['TargetCurrencyCode','KES'],['SourceCurrencyCode','EUR'],['Rate',0],['Rate',null]]){
    const data=raw('KES','0.0075');data.ExchangeRate[key]=value;assert.throws(()=>projectRate(data,'KES',date,'now'),{code:'RATE_EVIDENCE'});
  }
  assert.deepEqual(previousInterval({from:'2026-10-01',to:'2026-10-02',basis:'Accrual'}),{from:'2026-09-29',to:'2026-09-30',basis:'Accrual'});
  assert.deepEqual(previousInterval({from:'2027-01-01',to:'2027-01-01',basis:'Cash'}),{from:'2026-12-31',to:'2026-12-31',basis:'Cash'});
});
