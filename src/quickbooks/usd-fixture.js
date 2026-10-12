import { createHash } from 'node:crypto';
import { AppError } from './errors.js';
import { minorUnits, reportParameters } from './reports.js';
export const FIXTURE_VERSION = 'DUKASOLE_USD_FIXTURE_V1';
export const FIXTURE_ACCOUNTS = {
  cash: ['Bank'], inventory: ['Other Current Asset'], capital: ['Equity'],
  revenue: ['Income'], cogs: ['Cost of Goods Sold'], refund: ['Other Current Liability']
};
// Roles are the existing DukaSole chart, not newly invented business accounts.
// Opening-stock capital and quantity-based credits follow RetailAccounting v1.
export const DUKASOLE_ROLES = {
  cash: {code:'1110',name:'Cash on Hand',targetNames:['Cash on Hand']},
  inventory: {code:'1300',name:'Inventory',targetNames:['Inventory','Inventory Asset']},
  capital: {code:'3100',name:'Contributed Capital',targetNames:['Contributed Capital']},
  revenue: {code:'4100',name:'Retail Sales Revenue',targetNames:['Retail Sales Revenue','Sales of Product Income']},
  cogs: {code:'5100',name:'Cost of Goods Sold',targetNames:['Cost of Goods Sold']},
  refund: {code:'2400',name:'Customer Refunds Payable',targetNames:['Customer Refunds Payable']}
};
export const PHASES = { SALE: 3, PARTIAL_CREDIT: 6, FULL_CREDIT: 9 };
export function createUsdFixture(input, discovery) {
  if (!input || Object.keys(input).some(key => !['date','mappings'].includes(key)))
    throw new AppError(400,'FIXTURE_INPUT','Provide only date and six fixture mappings.');
  reportParameters({from:input.date,to:input.date,basis:'Accrual'});
  if (discovery.homeCurrency !== 'USD') throw new AppError(409,'FIXTURE_CURRENCY','This isolated fixture requires a USD home-currency sandbox.');
  if (!input.mappings || Object.keys(input.mappings).length !== 6 || Object.keys(input.mappings).some(key => !Object.hasOwn(FIXTURE_ACCOUNTS,key)))
    throw new AppError(400,'FIXTURE_MAPPING','Explicitly select all six destination accounts.');
  const mappings = {};
  for (const [role,types] of Object.entries(FIXTURE_ACCOUNTS)) {
    const id=input.mappings[role], account=discovery.accounts.find(value=>value.id===id);
    if(typeof id!=='string' || !/^\d{1,40}$/.test(id) || !account || account.active!==true || account.currency!=='USD' || !types.includes(account.type) || !DUKASOLE_ROLES[role].targetNames.includes(account.name))
      throw new AppError(400,'FIXTURE_MAPPING','Each fixture account must match the displayed DukaSole role, be active, USD and have its required type. Loan, tax and retained-earnings substitutes are not accepted.');
    mappings[role]=id;
  }
  if(new Set(Object.values(mappings)).size!==6) throw new AppError(400,'FIXTURE_MAPPING','Use six distinct accounts.');
  const entry=(event,debit,credit,cents)=>({event,lines:[{account:mappings[debit],posting:'Debit',cents},{account:mappings[credit],posting:'Credit',cents}]});
  // Two pairs at cost USD 50 each; sell both at USD 60 each. Each subsequent
  // credit returns one whole pair. Credit liability, stock return and evidenced
  // refund remain separate entries, as in DukaSole's existing domains.
  const events=[entry('RECEIVE','inventory','capital',10000),entry('SALE','cash','revenue',12000),entry('COGS','cogs','inventory',10000),
    entry('PARTIAL-CREDIT','revenue','refund',6000),entry('PARTIAL-RETURN','inventory','cogs',5000),entry('PARTIAL-REFUND','refund','cash',6000),
    entry('FINAL-CREDIT','revenue','refund',6000),entry('FINAL-RETURN','inventory','cogs',5000),entry('FINAL-REFUND','refund','cash',6000)];
  const reportingParameters={from:input.date.slice(0,8)+'01',to:input.date,basis:'Accrual'};
  const fixture={version:FIXTURE_VERSION,currency:'USD',date:input.date,reportingParameters,mappings,events};
  return {...fixture,digest:createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),
    roles:DUKASOLE_ROLES,
    expectations:{SALE:{units:0,inventory:0,cash:12000,revenue:12000,cogs:10000,profit:2000,refund:0,capital:10000},
      PARTIAL_CREDIT:{units:1,inventory:5000,cash:6000,revenue:6000,cogs:5000,profit:1000,refund:0,capital:10000},
      FULL_CREDIT:{units:2,inventory:10000,cash:0,revenue:0,cogs:0,profit:0,refund:0,capital:10000}}};
}
export function verifyFixtureReports(baseline,current,expected) {
  const values=data=>{
    const pnl=data.reports.find(r=>r.name==='ProfitAndLoss'),bs=data.reports.find(r=>r.name==='BalanceSheet');
    if(!pnl||!bs||pnl.currency!=='USD'||bs.currency!=='USD'||bs.balance.status!=='BALANCED')
      throw new AppError(409,'FIXTURE_REPORTS','USD reports and a balanced company statement are required before comparison.');
    return {profit:pnl.totals.NetIncome,assets:bs.balance.assets,liabilities:bs.balance.liabilities,
      equity:bs.balance.equity,liabilitiesAndEquity:bs.balance.liabilitiesAndEquity};
  };
  const before=values(baseline),after=values(current),want={profit:expected.profit,assets:expected.cash+expected.inventory,
    liabilities:expected.refund,equity:expected.capital+expected.profit,liabilitiesAndEquity:expected.capital+expected.profit+expected.refund};
  const comparisons=Object.entries(want).map(([field,value])=>({field,expected:value,
    actual:Number.isSafeInteger(before[field])&&Number.isSafeInteger(after[field])?after[field]-before[field]:null}));
  const complete=comparisons.every(row=>row.actual!==null);
  return {status:!complete?'INCOMPLETE':comparisons.every(row=>row.actual===row.expected)?'MATCHED':'REVIEW_REQUIRED',
    comparisons,moneyUnit:'USD_MINOR',note:'Company report deltas, not whole-company totals. Other sandbox activity or report delay can require review; this never authorizes reposting.'};
}
export function journalPayload(fixture,event) {
  return {TxnDate:fixture.date,DocNumber:'DSUSD1-'+event.event,PrivateNote:'Fictional USD integration fixture; not DukaSole business evidence. '+event.event,
    Line:event.lines.map(line=>({Description:'USD fixture '+event.event,Amount:line.cents/100,DetailType:'JournalEntryLineDetail',
      JournalEntryLineDetail:{PostingType:line.posting,AccountRef:{value:line.account}}}))};
}
export function verifyJournalResponse(journal,payload) {
  const actual=(journal?.Line||[]).map(line=>({account:line.JournalEntryLineDetail?.AccountRef?.value,
    posting:line.JournalEntryLineDetail?.PostingType,cents:minorUnits(line.Amount)}));
  const expected=payload.Line.map(line=>({account:line.JournalEntryLineDetail.AccountRef.value,posting:line.JournalEntryLineDetail.PostingType,cents:minorUnits(line.Amount)}));
  if(!journal?.Id || journal.TxnDate!==payload.TxnDate || (journal.CurrencyRef?.value && journal.CurrencyRef.value!=='USD') || JSON.stringify(actual)!==JSON.stringify(expected))
    throw new AppError(502,'FIXTURE_RESPONSE','Journal response did not match the frozen fixture. Review the sandbox; no automatic repost is allowed.');
  return String(journal.Id);
}
