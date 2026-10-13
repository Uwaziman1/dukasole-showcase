import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {convertDemoMinor,displayMoney,DEMO_CURRENCIES,DEMO_FX} from '../src/demo-currency.js';
import {currencyPreviewView,parseDisplayQuote} from '../src/currency-preview-ui.js';
import {convertDatedMinor} from '../src/dated-currency.js';
const quoteFixture=()=>({version:1,homeCurrency:'USD',source:'QUICKBOOKS_SANDBOX',date:'2026-10-13',fetchedAt:'2026-10-13T00:00:00Z',rates:{KES:{sourceCurrency:'KES',targetCurrency:'USD',date:'2026-10-13',rate:'0.007708'},EUR:{sourceCurrency:'EUR',targetCurrency:'USD',date:'2026-10-13',rate:'1.115461'}}});
test('demo FX uses exact integer rounding, original source and explicit non-live rates',()=>{
 assert.deepEqual(DEMO_CURRENCIES,['KES','USD','EUR']);assert.ok(Object.isFrozen(DEMO_FX));
 assert.equal(convertDemoMinor(12000,'USD','KES'),1560000);assert.equal(convertDemoMinor(12000,'USD','EUR'),10800);
 assert.equal(convertDemoMinor(13000,'KES','USD'),100);assert.equal(convertDemoMinor(13000,'KES','EUR'),90);
 assert.equal(convertDemoMinor(65,'KES','USD'),1);assert.equal(convertDemoMinor(-65,'KES','USD'),-1);
 assert.equal(convertDemoMinor(-1,'EUR','USD'),-1);assert.equal(convertDemoMinor(0,'KES','USD'),0);
 for(const value of [null,undefined,NaN,1.2,Infinity,Number.MAX_SAFE_INTEGER+1])assert.equal(convertDemoMinor(value,'KES','USD'),null);
 assert.equal(convertDemoMinor(Number.MAX_SAFE_INTEGER,'USD','KES'),null);
 assert.equal(convertDemoMinor(100,'GBP','USD'),null);assert.equal(convertDemoMinor(100,'USD','JPY'),null);
 assert.equal(displayMoney(Number.MAX_SAFE_INTEGER,'USD'),'USD 90,071,992,547,409.91');assert.equal(displayMoney(-1,'KES'),'KES -0.01');
});
test('currency preview preserves permission, source evidence, missing data and native PDF/workflow contracts',()=>{
 const summary={moneyUnit:'KES_MINOR',dateRange:{toDate:'2026-10-13'},reports:{profitLoss:{revenue:1560000,totalExpenses:1300000,netProfit:260000}},metrics:{cashAndCashEquivalents:1560000}};
 const before=JSON.stringify(summary);
 assert.equal(currencyPreviewView(summary),'');
 for(const currency of DEMO_CURRENCIES){const html=currencyPreviewView(summary,{currency,canRead:true});assert.ok(html.includes('Source: KES 15,600.00'));assert.ok(html.includes('PDF exports stay in KES'));assert.ok(html.includes('No example or current-rate fallback'));}
 assert.ok(currencyPreviewView(summary,{currency:'USD',canRead:true}).includes('Not available'));
 const quote=parseDisplayQuote(JSON.stringify(quoteFixture()));
 assert.ok(currencyPreviewView(summary,{currency:'USD',canRead:true,quote}).includes('USD 120.24'));
 assert.ok(currencyPreviewView(summary,{currency:'EUR',canRead:true,quote}).includes('EUR 107.80'));
 assert.ok(currencyPreviewView({...summary,dateRange:{toDate:'2026-10-12'}},{currency:'USD',canRead:true,quote}).includes('Not available'));
 assert.equal(JSON.stringify(summary),before);
 assert.ok(currencyPreviewView({}, {canRead:true}).includes('Not available'));
 assert.ok(!currencyPreviewView(summary,{currency:'<script>',canRead:true}).includes('<script>'));
 for(const file of ['demo-currency.js','currency-preview-ui.js','dated-currency.js']){
  const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|\/api\//);
 }
});

test('imported display quotes are allowlisted, date-checked, untrusted and cannot mutate money or historical evidence',()=>{
 const q=quoteFixture();q.realmId='must-not-retain';q.token='must-not-retain';q.rates.KES.privateData='must-not-retain';
 const result=parseDisplayQuote(JSON.stringify(q));assert.equal(result.realmId,undefined);assert.equal(result.token,undefined);assert.equal(result.rates.KES.privateData,undefined);
 const before=JSON.stringify(result);assert.equal(convertDatedMinor(11600,'KES','USD',result),89);assert.equal(convertDatedMinor(-11600,'KES','USD',result),-89);assert.equal(JSON.stringify(result),before);
 for(const mutate of [q=>q.version=2,q=>q.date='2026-02-30',q=>q.rates.KES.rate='0',q=>q.rates.EUR.date='2026-10-12',q=>q.rates.KES.targetCurrency='KES',q=>q.fetchedAt='bad']){const q=quoteFixture();mutate(q);assert.throws(()=>parseDisplayQuote(JSON.stringify(q)));}
 assert.throws(()=>parseDisplayQuote('{'));assert.throws(()=>parseDisplayQuote(' '.repeat(16385)));
});
