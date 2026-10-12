import test from 'node:test';
import assert from 'node:assert/strict';
import {minorUnits,reportParameters,projectReport,discoveryProjection} from '../src/quickbooks/reports.js';
import {createUsdFixture,DUKASOLE_ROLES,FIXTURE_ACCOUNTS,journalPayload,verifyJournalResponse,verifyFixtureReports} from '../src/quickbooks/usd-fixture.js';
import {convertDemoMinor,displayMoney,DEMO_FX} from '../src/demo-currency.js';

const params={from:'2026-10-01',to:'2026-10-13',basis:'Accrual'};
const report=(name,groups)=>({Header:{ReportName:name,StartPeriod:params.from,EndPeriod:params.to,ReportBasis:params.basis,Currency:'USD'},
 Columns:{Column:[{ColTitle:'Account'},{ColTitle:'Total'}]},Rows:{Row:Object.entries(groups).map(([group,value])=>({group,Summary:{ColData:[{value:group},{value}]}}))}});
// Invented IDs and account metadata: no connected company response is published.
const mappings=Object.fromEntries(Object.keys(DUKASOLE_ROLES).map((role,index)=>[role,String(index+1)]));
const discovery={homeCurrency:'USD',accounts:Object.entries(DUKASOLE_ROLES).map(([role,contract])=>({id:mappings[role],name:contract.targetNames[0],type:FIXTURE_ACCOUNTS[role][0],active:true,currency:'USD'}))};
const fixture=()=>createUsdFixture({date:params.to,mappings},discovery);

test('report amounts preserve exact cents; missing totals are not manufactured as zero',()=>{
 assert.equal(minorUnits('123456.78'),12345678);assert.equal(minorUnits('-0.01'),-1);
 for(const value of [null,'','1.234','1,000.00','NaN'])assert.equal(minorUnits(value),null);
 const projection=projectReport(report('ProfitAndLoss',{NetIncome:'-34.00'}),'ProfitAndLoss',params);
 assert.equal(projection.totals.NetIncome,-3400);assert.equal(projection.totals.Income,undefined);
});
test('report boundaries and Balance Sheet equation fail visibly, not as a healthy statement',()=>{
 assert.deepEqual(reportParameters(params),params);
 assert.throws(()=>reportParameters({...params,to:'2026-02-30'}));
 const raw=report('BalanceSheet',{TotalAssets:'236.00',Liabilities:'0.00',Equity:'166.00',TotalLiabEquity:'166.00'});
 const projection=projectReport(raw,'BalanceSheet',params);
 assert.equal(projection.balance.status,'UNBALANCED');assert.equal(projection.balance.difference,7000);
 raw.Header.ReportBasis='Cash';assert.throws(()=>projectReport(raw,'BalanceSheet',params),{code:'REPORT_BOUNDARY'});
});
test('display conversion is not an accounting currency policy or permission to export KES',()=>{
 const view=discoveryProjection({CompanyInfo:{CompanyName:'Fictional company'}},{Preferences:{CurrencyPrefs:{HomeCurrency:{value:'USD'}}}},[]);
 assert.equal(view.sync.enabled,false);assert.equal(view.sync.status,'CURRENCY_BLOCKED');
 assert.match(DEMO_FX.description,/Not live quotes/);
 assert.equal(convertDemoMinor(12000,'USD','KES'),1560000);assert.equal(convertDemoMinor(12000,'USD','EUR'),10800);
 assert.equal(convertDemoMinor(65,'KES','USD'),1);assert.equal(convertDemoMinor(-65,'KES','USD'),-1);
 assert.equal(convertDemoMinor(Number.MAX_SAFE_INTEGER,'USD','KES'),null);assert.equal(convertDemoMinor(null,'USD','KES'),null);
 assert.equal(displayMoney(convertDemoMinor(12000,'USD','KES'),'KES'),'KES 15,600.00');
});
test('fictional receive, cost, sale and quantity-based credits reconcile six DukaSole account roles',()=>{
 const f=fixture(),balances=Object.fromEntries(Object.keys(mappings).map(role=>[role,0]));
 assert.equal(f.events.length,9);assert.deepEqual(f.reportingParameters,params);
 for(const [index,event] of f.events.entries()){
  assert.equal(event.lines.filter(line=>line.posting==='Debit').reduce((sum,line)=>sum+line.cents,0),event.lines.filter(line=>line.posting==='Credit').reduce((sum,line)=>sum+line.cents,0));
  for(const line of event.lines){const role=Object.keys(mappings).find(role=>mappings[role]===line.account);balances[role]+=line.posting==='Debit'?line.cents:-line.cents;}
  const stage={2:'SALE',5:'PARTIAL_CREDIT',8:'FULL_CREDIT'}[index];if(!stage)continue;
  const expected=f.expectations[stage],profit=-balances.revenue-balances.cogs;
  for(const role of ['cash','inventory','cogs'])assert.equal(balances[role],expected[role]);
  assert.equal(-balances.revenue||0,expected.revenue);assert.equal(profit||0,expected.profit);
  assert.equal(balances.cash+balances.inventory,-balances.refund-balances.capital+profit);
 }
});
test('journal evidence detects changed amount, account, date and currency',()=>{
 const f=fixture(),payload=journalPayload(f,f.events[1]),response={...structuredClone(payload),Id:'100',CurrencyRef:{value:'USD'}};
 assert.equal(verifyJournalResponse(response,payload),'100');
 for(const mutate of [j=>j.Line[0].Amount++,j=>j.Line[0].JournalEntryLineDetail.AccountRef.value='999',j=>j.TxnDate='2026-10-12',j=>j.CurrencyRef.value='KES']){
  const changed=structuredClone(response);mutate(changed);assert.throws(()=>verifyJournalResponse(changed,payload),{code:'FIXTURE_RESPONSE'});
 }
});
test('fixture verification compares calculated deltas and reports missing or conflicting evidence',()=>{
 const expected=fixture().expectations.SALE;
 const data=(profit,assets,equity)=>({reports:[{name:'ProfitAndLoss',currency:'USD',totals:{NetIncome:profit}},{name:'BalanceSheet',currency:'USD',balance:{status:'BALANCED',assets,liabilities:0,equity,liabilitiesAndEquity:equity}}]});
 const baseline=data(0,0,0),current=data(expected.profit,expected.cash+expected.inventory,expected.capital+expected.profit);
 assert.equal(verifyFixtureReports(baseline,current,expected).status,'MATCHED');
 current.reports[0].totals.NetIncome=null;assert.equal(verifyFixtureReports(baseline,current,expected).status,'INCOMPLETE');
 current.reports[0].totals.NetIncome=expected.profit+100;assert.equal(verifyFixtureReports(baseline,current,expected).status,'REVIEW_REQUIRED');
});
