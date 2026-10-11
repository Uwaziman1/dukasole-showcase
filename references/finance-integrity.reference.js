import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TisStore,issueCreditNote,xReport,zReport,pluReport,closingStock,verifyTisIntegrity } from '../src/tis.js';
import { SalesApi } from '../src/sales_api.js';
import { FinanceStore,resolveReportDateRange } from '../src/finance.js';
import { FinanceActivation } from '../src/finance_activation.js';
import { RetailAccounting } from '../src/retail_accounting.js';
import { FinanceApi } from '../src/finance_api.js';
import { FinanceReporting } from '../src/finance_reporting.js';
import { workspaceSummary } from '../src/workspace_summary.js';
import { businessDate,businessDayStart,businessDayEnd,businessMonth,businessDisplay } from '../src/business_time.js';
import { assertSupportedNode,supportsNode } from '../src/runtime_contract.js';
import { requestReceiptDocument } from '../src/tis_document_issuance.js';
import { transactionDocument } from '../src/transaction_document.js';
import { documentExport,assertDocumentProvenance,exportedDocumentModel } from '../src/document_evidence.js';
import { receiptPdf } from '../src/receipt_pdf.js';
import { extractPdf,assertPdfAmount,verifyFinancialPdf } from '../scripts/pdf_evidence.js';
import { printableLocalReport } from '../src/document_presentation.js';

function fixture(t,{tax='16',cost=3000,received=5}={}){
 const path=join(mkdtempSync(join(tmpdir(),'duka-integrity-')),'isolated.sqlite');let store=new TisStore(path),finance=new FinanceStore(path);
 store.transaction(()=>{store.configBusiness({tradeName:'Integrity acceptance shop',pin:'TEST-PIN',address:'Nairobi'});store.addTaxRate('A',tax);const user=store.addUser({name:'Acceptance operator'}),p=store.addProduct({name:'Costed shoe'});store.addVariant({id:'v',productId:p.id,sku:'INTEGRITY-40',colour:'Brown',size:40,price:'116.00'});store.receive('v',received,user.id,'2026-09-01T09:00:00Z');});
 if(cost)new RetailAccounting(finance,store).captureCost(store.data.stockMovements[0].id,{unitCost:cost,counterpartCode:'3100',evidenceReference:'Actual isolated cost evidence',reason:'Verified opening inventory'});
 const f={path,get store(){return store;},get finance(){return finance;},get sales(){return new SalesApi(store);},get retail(){return new RetailAccounting(finance,store);},get api(){return new FinanceApi(finance,{tisStore:store});},get reporting(){return new FinanceReporting(f.api);},restart(){store.db.close();finance.db.close();store=new TisStore(path);finance=new FinanceStore(path);},sell(at='2026-10-02T09:00:00Z',quantity=1){const d=f.sales.create({timestamp:at,items:[{variantId:'v',quantity}]});f.sales.addPaymentAllocation(d.id,{method:'CASH',amount:f.sales.load(d.id).totals.total});return {draftId:d.id,...f.sales.finalize(d.id,{timestamp:at,idempotencyKey:'complete:'+d.id})};}};
 t.after(()=>{store.db.close();finance.db.close();});return f;
}
const ledger=(f,code,to='2026-12-31')=>f.finance.generalLedger({accountId:f.finance.db.prepare('SELECT id FROM accounting_accounts WHERE code=?').get(code).id,fromDate:'2026-01-01',toDate:to});
const statements=(f,asOf='2026-10-31')=>({trial:f.api.report('trial-balance',{asOf}).report,pnl:f.api.report('profit-loss',{from:'2026-01-01',to:asOf}).report,balance:f.api.report('balance-sheet',{asOf}).report});
const assertEquation=s=>{assert.equal(s.trial.isBalanced,true);assert.equal(s.balance.isBalanced,true,JSON.stringify(s.balance));assert.equal(s.balance.totalAssets,s.balance.totalLiabilities+s.balance.totalEquity);assert.equal(s.balance.balanceDifference,0);assert.equal(s.balance.currentEarnings,s.pnl.netProfit);};

test('runtime minimum rejects Node 22 / early Node 24 and accepts the verified runtime',()=>{
 for(const v of ['22.19.0','24.0.0','24.6.9','invalid']){assert.equal(supportsNode(v),false);assert.throws(()=>assertSupportedNode(v),/requires Node.js >= 24.7.0/);}
 for(const v of ['24.7.0','24.19.0'])assert.equal(supportsNode(v),true);
 const pkg=JSON.parse(readFileSync('package.json','utf8'));assert.equal(pkg.engines.node,'>=24.7.0');assert.equal(pkg.scripts.doctor,'node scripts/doctor.js');
});

for(const restart of [false,true])for(const recovery of ['RECONCILE','FINALIZE','EXPLICIT_FINANCE'])test(`KES 116 closed-period hand-off is exactly once: restart=${restart}, recovery=${recovery}`,t=>{
 const f=fixture(t,{tax:'0',cost:null}),period=f.finance.createPeriod({name:'October locked',startDate:'2026-10-01',endDate:'2026-10-31',status:'CLOSED'}),sale=f.sell();
 assert.equal(sale.state,'FINALIZED');assert.equal(sale.accounting.state,'BLOCKED');assert.equal(f.store.stock('v'),4);
 const payment=f.finance.salePaymentEvidence(sale.saleId),initialDraft=f.finance.db.prepare('SELECT id FROM accounting_journal_entries WHERE source_accounting_event_id=?').get(payment.sourceEventId).id;
 assert.equal(f.finance.sourceEvent(payment.sourceEventId).status,'FAILED');assert.equal(f.retail.preview().items.filter(r=>r.type==='NORMAL_SALE').length,1);
 for(let i=0;i<2;i++)assert.equal(f.sales.finalize(sale.draftId,{idempotencyKey:'retry:'+i}).accounting.state,'BLOCKED');
 assert.throws(()=>f.retail.reconcile(),{code:'ACCOUNTING_PERIOD_BLOCKED'});
 if(restart)f.restart();assert.equal(f.finance.salePaymentEvidence(sale.saleId).sourceEventId,payment.sourceEventId);
 assert.throws(()=>f.finance.changePeriodStatus(period.id,'OPEN'),/privileged/);f.finance.changePeriodStatus(period.id,'OPEN',{privileged:true});
 const recover=()=>recovery==='RECONCILE'?f.retail.reconcile():recovery==='FINALIZE'?f.sales.finalize(sale.draftId,{idempotencyKey:'new-key'}):new FinanceActivation(f.finance).captureAndPostSale(f.store,sale.saleId);
 for(let i=0;i<3;i++){recover();f.sales.finalize(sale.draftId);}
 f.restart();recover();f.sales.finalize(sale.draftId);
 assert.equal(f.store.data.sales.length,1);assert.equal(f.store.data.receipts.filter(r=>r.label==='NS').length,1);assert.equal(f.store.data.stockMovements.filter(m=>m.type==='SALE').length,1);assert.equal(f.store.data.draftSales[0].paymentAllocations.length,1);
 assert.equal(f.finance.db.prepare("SELECT COUNT(*) n FROM accounting_source_events WHERE source_type='NORMAL_SALE'").get().n,1);
 const entries=f.finance.db.prepare('SELECT id,status FROM accounting_journal_entries WHERE source_accounting_event_id=?').all(payment.sourceEventId);assert.equal(entries.length,1);assert.equal(entries[0].id,initialDraft);assert.equal(entries[0].status,'POSTED');
 assert.equal(ledger(f,'1110').endingBalance,11600);assert.equal(ledger(f,'4100').endingBalance,11600);assert.equal(f.sales.finalize(sale.draftId).accounting.state,'POSTED');
 // The formerly independently postable stale draft is rejected at both layers.
 const j=f.finance.journal(initialDraft),rogue=f.finance.createJournalDraft({accountingDate:j.accountingDate,description:'Old failed recovery draft',sourceAccountingEventId:payment.sourceEventId,lines:j.lines});
 assert.throws(()=>f.finance.postJournal(rogue.id),{code:'ACCOUNTING_SOURCE_ALREADY_POSTED'});
 assert.throws(()=>f.finance.db.prepare("UPDATE accounting_journal_entries SET status='POSTED' WHERE id=?").run(rogue.id),/ACCOUNTING_SOURCE_ALREADY_POSTED|UNIQUE/);
 assert.throws(()=>f.finance.db.prepare('UPDATE accounting_journal_entries SET source_accounting_event_id=NULL WHERE id=?').run(initialDraft),/IMMUTABLE/);
 assert.equal(ledger(f,'1110').endingBalance,11600);assert.equal(ledger(f,'4100').endingBalance,11600);
});

test('source-linked reversal remains atomic, linked, and does not allow re-posting the original source',t=>{
 const f=fixture(t),sale=f.sell(),source=f.finance.salePaymentEvidence(sale.saleId).sourceEventId,j=f.finance.authoritativeJournal(source),period=f.finance.createPeriod({name:'October',startDate:'2026-10-01',endDate:'2026-10-31',status:'CLOSED'}),before=f.finance.db.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n;
 assert.throws(()=>f.finance.reverseJournal(j.id),{code:'ACCOUNTING_PERIOD_BLOCKED'});assert.equal(f.finance.db.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n,before);assert.equal(f.finance.journal(j.id).status,'POSTED');
 f.finance.changePeriodStatus(period.id,'OPEN',{privileged:true});const reversal=f.finance.reverseJournal(j.id);assert.equal(reversal.reversalOfJournalEntryId,j.id);assert.equal(f.finance.authoritativeJournal(source).status,'REVERSED');new FinanceActivation(f.finance).captureAndPostSale(f.store,sale.saleId);assert.equal(ledger(f,'1110').endingBalance,0);
});

test('legacy duplicate postings stay visible and untouched while recovery and new postings fail closed',t=>{
 const f=fixture(t),sale=f.sell(),source=f.finance.salePaymentEvidence(sale.saleId).sourceEventId,j=f.finance.authoritativeJournal(source);
 // Simulate pre-fix evidence in this disposable fixture only.
 f.finance.db.exec('DROP INDEX one_authoritative_journal_per_source; DROP TRIGGER one_source_post_insert; DROP TRIGGER one_source_post_update;');
 f.finance.db.prepare("INSERT INTO accounting_journal_entries SELECT 'legacy-duplicate','LEGACY-DUP',accounting_date,created_at,posted_at,description,status,source_accounting_event_id,NULL,NULL,operator_id,memo,reference FROM accounting_journal_entries WHERE id=?").run(j.id);
 f.finance.db.prepare("INSERT INTO accounting_journal_lines SELECT 'legacy-'||id,'legacy-duplicate',account_id,debit,credit,description,reference_metadata FROM accounting_journal_lines WHERE journal_entry_id=?").run(j.id);
 const old=f.finance.db.prepare('SELECT * FROM accounting_journal_entries ORDER BY id').all();f.restart();
 assert.deepEqual(f.finance.db.prepare('SELECT * FROM accounting_journal_entries ORDER BY id').all(),old);
 assert.equal(f.api.report('balance-sheet',{asOf:'2026-10-31'}).report.sourceCoverage.complete,false);
 assert.throws(()=>new FinanceActivation(f.finance).captureAndPostSale(f.store,sale.saleId),{code:'ACCOUNTING_SOURCE_CONFLICT'});
 const rogue=f.finance.createJournalDraft({accountingDate:j.accountingDate,description:'Third attempt',sourceAccountingEventId:source,lines:j.lines});
 assert.throws(()=>f.finance.postJournal(rogue.id),{code:'ACCOUNTING_SOURCE_CONFLICT'});
 assert.throws(()=>f.finance.db.prepare("UPDATE accounting_journal_entries SET status='POSTED' WHERE id=?").run(rogue.id),/ACCOUNTING_SOURCE_ALREADY_POSTED/);
 assert.equal(f.finance.db.prepare("SELECT COUNT(*) n FROM accounting_journal_entries WHERE source_accounting_event_id=? AND status='POSTED'").get(source).n,2,'Historical evidence must not be silently repaired or hidden');
});

test('profitable costed sale, credit and approved period lock reconcile all statements and actual PDF numbers',t=>{
 const f=fixture(t),sale=f.sell();let s=statements(f);assertEquation(s);assert.equal(s.pnl.netProfit,7000);assert.equal(s.balance.totalAssets,23600);assert.equal(s.balance.totalLiabilitiesAndEquity,23600);assert.equal(s.balance.totalLiabilities,1600);assert.equal(s.balance.totalEquity,22000);assert.equal(ledger(f,'5100').endingBalance,3000);
 for(const [name,report]of [['TRIAL_BALANCE',s.trial],['PROFIT_LOSS',s.pnl],['BALANCE_SHEET',s.balance]]){const bytes=f.reporting.pdf({report});verifyFinancialPdf(bytes,report);}
 const snapshot=f.reporting.snapshot('BALANCE_SHEET',{asOf:'2026-10-31'});verifyFinancialPdf(f.reporting.pdf(f.reporting.snapshotData(snapshot.id)),snapshot.reportData);
 const pack=f.reporting.pack({from:'2026-01-01',to:'2026-10-31',includedReports:['PROFIT_LOSS','BALANCE_SHEET','TRIAL_BALANCE']}),packText=extractPdf(f.reporting.packPdf(pack.id)).text;
 for(const [label,amount]of [['REVENUE',s.pnl.revenue],['NET PROFIT',s.pnl.netProfit],['Total Cost of Sales',s.pnl.totalExpenses],['TOTAL ASSETS',s.balance.totalAssets],['TOTAL LIABILITIES',s.balance.totalLiabilities],['TOTAL EQUITY',s.balance.totalEquity],['TOTAL LIABILITIES & EQUITY',s.balance.totalLiabilitiesAndEquity],['CURRENT EARNINGS',s.balance.currentEarnings]])assertPdfAmount(packText,label,amount);
 assert.ok(packText.includes('2026-01-01 - 2026-10-31'));assert.ok(packText.includes('Africa/Nairobi'));
 const period=f.finance.createPeriod({name:'October',startDate:'2026-10-01',endDate:'2026-10-31'});f.finance.changePeriodStatus(period.id,'CLOSED');s=statements(f);assertEquation(s);assert.equal(s.balance.reportStatus,'CLOSED');assert.equal(s.balance.currentEarnings,7000);verifyFinancialPdf(f.reporting.pdf({report:s.balance}),s.balance);
 // Existing close is a lock, not a transfer. November credit retains its own date.
 issueCreditNote(f.store,{originalReceiptId:sale.receipt.id,items:[{variantId:'v',quantity:1}],recipient:'Test buyer',reason:'Returned pair',justification:'Pair physically received',returnToStock:true,operatorId:f.store.data.users[0].id,timestamp:'2026-11-01T09:00:00Z'});f.retail.reconcile();s=statements(f,'2026-11-30');assertEquation(s);assert.equal(s.pnl.netProfit,0);assert.equal(s.balance.totalAssets,26600);assert.equal(s.balance.totalLiabilities,11600);assert.equal(f.store.stock('v'),5);verifyFinancialPdf(f.reporting.pdf({report:s.balance}),s.balance);
 assert.deepEqual(f.api.snapshot(snapshot.id).reportData,snapshot.reportData,'Earlier frozen snapshot must not change after credit');
});

test('actual income-to-retained-earnings journal is not counted again as projected current earnings',t=>{
 const f=fixture(t);f.sell();const ids=new FinanceActivation(f.finance).configure();f.finance.db.prepare("UPDATE accounting_report_classifications SET presentation_group='Current earnings' WHERE account_id=? AND report_type='BALANCE_SHEET'").run(ids['3200']);const transfer=f.finance.createJournalDraft({accountingDate:'2026-10-31',description:'Explicit accountant earnings transfer',lines:[{accountId:ids['4100'],debit:10000,credit:0},{accountId:ids['5100'],debit:0,credit:3000},{accountId:ids['3200'],debit:0,credit:7000}]});f.finance.postJournal(transfer.id);
 const period=f.finance.createPeriod({name:'October',startDate:'2026-10-01',endDate:'2026-10-31'});f.finance.changePeriodStatus(period.id,'CLOSED');const s=statements(f);assertEquation(s);assert.equal(s.balance.currentEarnings,0);assert.equal(s.balance.equityComponents.find(x=>x.account.code==='3200').currentAmount,7000);assert.equal(s.balance.totalEquity,22000);verifyFinancialPdf(f.reporting.pdf({report:s.balance}),s.balance);
});

test('loss is negative current earnings, not an omitted or absolute-valued equity amount',t=>{
 const f=fixture(t,{cost:11000});f.sell();const s=statements(f);assertEquation(s);assert.equal(s.pnl.netProfit,-1000);verifyFinancialPdf(f.reporting.pdf({report:s.balance}),s.balance);
});

test('unbalanced statement cannot hide behind complete coverage or a successful snapshot / pack / PDF',t=>{
 const f=fixture(t);f.sell();const vat=f.finance.db.prepare("SELECT id FROM accounting_accounts WHERE code='2200'").get().id;f.finance.db.prepare("DELETE FROM accounting_report_classifications WHERE account_id=? AND report_type='BALANCE_SHEET'").run(vat);
 const b=statements(f).balance;assert.equal(b.isBalanced,false);assert.equal(b.statementState,'UNBALANCED');assert.equal(b.reportStatus,'UNBALANCED');assert.equal(b.sourceCoverage.complete,false);assert.equal(b.balanceDifference,1600);
 assert.equal(f.api.summary({from:'2026-10-01',to:'2026-10-31'}).sourceCoverage.complete,false);
 assert.throws(()=>f.finance.createReportSnapshot({reportType:'BALANCE_SHEET',parameters:{},reportData:{...b,isBalanced:true,statementState:'BALANCED'}}),{code:'REPORT_UNBALANCED'});
 assert.throws(()=>f.reporting.snapshot('BALANCE_SHEET',{asOf:'2026-10-31'}),{code:'REPORT_UNBALANCED'});assert.throws(()=>f.finance.createReportSnapshot({reportType:'BALANCE_SHEET',parameters:{},reportData:b}),{code:'REPORT_UNBALANCED'});assert.throws(()=>f.reporting.pack({from:'2026-10-01',to:'2026-10-31',includedReports:['PROFIT_LOSS','BALANCE_SHEET']}),{code:'REPORT_UNBALANCED'});assert.equal(f.finance.db.prepare('SELECT COUNT(*) n FROM financial_report_snapshots').get().n,0);
 const text=verifyFinancialPdf(f.reporting.pdf({report:b}),b).text;assert.ok(text.includes('Status: UNBALANCED'));assert.ok(text.includes('INCOMPLETE:'));
 // Reproduce an older saved statement, before isBalanced was part of its shape.
 const old={type:'BALANCE_SHEET',title:'Balance Sheet',asOfDate:'2026-10-31',totalAssets:23600,totalLiabilitiesAndEquity:16600,sourceCoverage:{complete:true,warnings:[]},sections:[]},frozen=JSON.stringify(old);
 f.finance.db.prepare("INSERT INTO financial_report_snapshots VALUES('legacy-unbalanced','BALANCE_SHEET','{}','2026-10-31T09:00:00Z',NULL,NULL,?,'SNAPSHOT')").run(frozen);
 const oldText=extractPdf(f.reporting.pdf(f.reporting.snapshotData('legacy-unbalanced'))).text;assert.ok(oldText.includes('Status: UNBALANCED'));assertPdfAmount(oldText,'BALANCE DIFFERENCE',old.totalAssets-old.totalLiabilitiesAndEquity);assert.equal(f.finance.db.prepare("SELECT report_data FROM financial_report_snapshots WHERE id='legacy-unbalanced'").get().report_data,frozen);
 const viewed=f.api.snapshot('legacy-unbalanced');assert.deepEqual(viewed.reportData,old);assert.equal(viewed.displayReport.statementState,'UNBALANCED');assert.equal(viewed.displayReport.sourceCoverage.complete,false);
 f.finance.db.prepare("INSERT INTO finance_packs VALUES('legacy-pack',?,?, '2026-10-31T09:00:00Z')").run(JSON.stringify({fromDate:'2026-10-01',toDate:'2026-10-31'}),JSON.stringify([{reportType:'BALANCE_SHEET',snapshotId:'legacy-unbalanced'}]));assert.ok(extractPdf(f.reporting.packPdf('legacy-pack')).text.includes('Status: UNBALANCED'));
});

test('Nairobi IANA calendar contract owns day / month / year boundaries and Finance presets',()=>{
 for(const [utc,day]of [['2026-09-30T20:59:59Z','2026-09-30'],['2026-09-30T21:00:00Z','2026-10-01'],['2026-10-01T20:59:59Z','2026-10-01'],['2026-10-01T21:00:00Z','2026-10-02'],['2026-12-31T20:59:59Z','2026-12-31'],['2026-12-31T21:00:00Z','2027-01-01']])assert.equal(businessDate(utc),day);
 assert.equal(businessDayStart('2026-10-01'),'2026-09-30T21:00:00.000Z');assert.equal(businessDayEnd('2026-09-30'),'2026-09-30T20:59:59.999Z');assert.equal(businessMonth('2026-09-30T21:00:00Z').fromDate,'2026-10-01');assert.equal(businessMonth('2026-09-30T21:00:00Z').toDate,'2026-10-31');
 assert.deepEqual(resolveReportDateRange('TODAY',{now:new Date('2026-10-01T22:30:00Z')}),{preset:'TODAY',fromDate:'2026-10-02',toDate:'2026-10-02'});assert.equal(resolveReportDateRange('YEAR_TO_DATE',{now:new Date('2026-12-31T21:00:00Z')}).fromDate,'2027-01-01');
});

for(const boundary of [
 {name:'month-end',times:['2026-09-30T20:59:59Z','2026-09-30T21:00:00Z','2026-10-01T20:59:59Z','2026-10-01T21:00:00Z'],creditTimes:['2026-10-02T20:59:59Z','2026-10-02T21:00:00Z'],days:[['2026-09-30',1],['2026-10-01',2],['2026-10-02',1]]},
 {name:'year-end',times:['2026-12-31T20:59:59Z','2026-12-31T21:00:00Z','2027-01-01T20:59:59Z','2027-01-01T21:00:00Z'],creditTimes:['2027-01-02T20:59:59Z','2027-01-02T21:00:00Z'],days:[['2026-12-31',1],['2027-01-01',2],['2027-01-02',1]]}
])test(`${boundary.name} midnight sales and credits agree in Home / PLU / X-Z / Stock / Finance / snapshots / PDFs`,t=>{
 const f=fixture(t,{received:10}),{times,creditTimes}=boundary;
 const sales=times.map(at=>f.sell(at));
 const credits=creditTimes.map((at,i)=>issueCreditNote(f.store,{originalReceiptId:sales[i].receipt.id,items:[{variantId:'v',quantity:1}],recipient:'Test',reason:'Return',justification:'Received',returnToStock:true,operatorId:f.store.data.users[0].id,timestamp:at}));f.retail.reconcile();
 for(const [day,count]of boundary.days){
  const home=workspaceSummary(f.store,businessDayStart(day)),plu=pluReport(f.store,day,day)[0],summary=f.api.summary({from:day,to:day}),pnl=f.api.report('profit-loss',{from:day,to:day}).report;
  assert.equal(home.transactions,count);assert.equal(home.todaySales,count*11600);assert.equal(plu.quantitySold,count);assert.equal(plu.salesAmount,home.todaySales);assert.equal(summary.retailActivity.salesTotal,home.todaySales);assert.equal(pnl.netProfit,(count-creditTimes.filter(at=>businessDate(at)===day).length)*7000);
  const x=xReport(f.store,day),z=zReport(f.store,day);assert.equal(x.totals.NS.count,count);assert.deepEqual(x.totals,z.totals);assert.equal(z.to,businessDayEnd(day));
  for(const [name,report]of [['X-Report',x],['Z-Report',z],['PLU-Report',pluReport(f.store,day,day)],['Closing-Stock',closingStock(f.store,day)]])assert.ok(printableLocalReport(name,report,{asOf:day}).includes(day),`${name} must display the Finance business date`);
  const expected=f.store.data.stockMovements.filter(m=>m.occurredAt<=businessDayEnd(day)).reduce((n,m)=>n+m.quantity,0);assert.equal(closingStock(f.store,day)[0].quantity,expected);assert.equal(new FinanceActivation(f.finance).inventoryValuation(f.store,{asOfDate:day}).items[0].physicalQuantity,expected);
  const snap=f.reporting.snapshot('PROFIT_LOSS',{from:day,to:day});assert.equal(snap.reportData.netProfit,pnl.netProfit);verifyFinancialPdf(f.reporting.pdf(f.reporting.snapshotData(snap.id)),snap.reportData);
 }
 for(const [i,at]of creditTimes.entries()){const credit=credits[i],day=businessDate(at),summary=f.api.summary({from:day,to:day});assert.equal(summary.retailActivity.creditTotal,credit.totals.total);assert.equal(workspaceSummary(f.store,at).returns,1);assert.equal(pluReport(f.store,day,day)[0].quantityReturned,1);assert.equal(f.retail.credits().items.find(c=>c.id===credit.id).date,day);const z=day===boundary.days[2][0]?f.store.data.reports.find(r=>r.type==='Z'&&r.to===businessDayEnd(day)):zReport(f.store,day);assert.equal(z.totals.NC.count,1);const s=statements(f,day);assertEquation(s);verifyFinancialPdf(f.reporting.pdf({report:s.balance}),s.balance);}
 for(const row of f.finance.db.prepare("SELECT j.accounting_date,e.occurred_at FROM accounting_journal_entries j JOIN accounting_source_events e ON e.id=j.source_accounting_event_id").all())assert.equal(row.accounting_date,businessDate(row.occurred_at));
 assert.equal(verifyTisIntegrity(f.store).valid,true);
});

test('versioned document provenance permits presentation metadata but detects every economic mutation',t=>{
 const f=fixture(t),sale=f.sell(),issued=requestReceiptDocument(f.store,sale.receipt.id,{requestKey:'provenance-original',operatorId:f.store.data.users[0].id}),sidecar=documentExport(transactionDocument(f.store,issued.receipt,'TAX_INVOICE'));
 assertDocumentProvenance(sidecar,issued.receipt);assertDocumentProvenance(issued.receipt,issued.receipt);assert.equal(sidecar.schemaVersion,1);
 const changes=[r=>r.itemSnapshots[0].quantity++,r=>r.itemSnapshots[0].unitPrice++,r=>r.itemSnapshots[0].tax++,r=>r.itemSnapshots[0].discount++,r=>r.itemSnapshots[0].sku='tampered',r=>r.buyerPin='tampered',r=>r.paymentAllocations[0].amount++,r=>r.totals.total++,r=>r.relationshipId='tampered',r=>r.id='tampered',r=>r.originalReceiptId='tampered',r=>r.stockMovementIds=['tampered']];
 for(const mutate of changes){const edited=structuredClone(sidecar);mutate(edited.businessEvidence);assert.throws(()=>assertDocumentProvenance(edited,issued.receipt),/Immutable business/);}
 const wrong=structuredClone(sidecar);wrong.presentation.documentPresentation.payment.received++;assert.throws(()=>assertDocumentProvenance(wrong,issued.receipt),/Invalid document presentation/);
 const model=exportedDocumentModel(sidecar),parsed=extractPdf(receiptPdf(model));assert.equal(parsed.pages,1);assertPdfAmount(parsed.text,'TOTAL',model.totals.total);assertPdfAmount(parsed.text,'AMOUNT WITHOUT TAX',model.totals.subtotal);assertPdfAmount(parsed.text,'VAT / TOTAL TAX',model.totals.tax);assert.ok(parsed.text.includes(businessDisplay(model.timestamp).date));
});
