import test from 'node:test';
import assert from 'node:assert/strict';
import { accountFixture } from './account_fixture.js';
import { TisStore, issueCreditNote, xReport, pluReport } from '../src/tis.js';
import { SalesApi } from '../src/sales_api.js';
import { FinanceStore } from '../src/finance.js';
import { FinanceActivation } from '../src/finance_activation.js';
import { printableReceipt } from '../src/document_presentation.js';
import { RetailAccounting } from '../src/retail_accounting.js';
import { FinanceApi } from '../src/finance_api.js';
import { FinanceReporting } from '../src/finance_reporting.js';
import { requestReceiptDocument } from '../src/tis_document_issuance.js';
import { transactionDocument } from '../src/transaction_document.js';
import { documentExport,assertDocumentProvenance,exportedDocumentModel } from '../src/document_evidence.js';
import { receiptPdf } from '../src/receipt_pdf.js';
import { extractPdf,assertPdfAmount,verifyFinancialPdf } from '../scripts/pdf_evidence.js';
test('real API economics survive restart, changed catalogue and repeated discounted split-tender credits',async()=>{
 const fixture=await accountFixture();let store=new TisStore(fixture.path),finance;
 try{
  store.transaction(()=>{store.configBusiness({tradeName:'Retail simulation',pin:'TEST',address:'Nairobi'});store.addTaxRate('A','16');const product=store.addProduct({name:'Variable price shoe'});store.addVariant({productId:product.id,sku:'VARIABLE',colour:'Brown',size:40,price:'1234.57'});store.receive(store.data.variants[0].id,12,'test','2026-10-01T09:00:00Z');});
  const variant=store.data.variants[0],api=new SalesApi(store,{operatorId:fixture.owner.staff.id}),draft=api.create({timestamp:'2026-10-02T09:00:00Z'});
  api.addItem(draft.id,{variantId:variant.id,quantity:1});api.changeQuantity(draft.id,variant.id,{quantity:3});
  const review=api.setLineDiscount(draft.id,variant.id,{discountAmount:1});assert.equal(review.totals.gross,370371);assert.equal(review.totals.total,370370);assert.equal(review.totals.tax,51086);assert.equal(review.totals.subtotal,319284);assert.equal(review.totals.subtotal+review.totals.tax,review.totals.total);
  api.updateCustomer(draft.id,{buyerPin:'FROZEN-BUYER'});api.addPaymentAllocation(draft.id,{method:'MOBILE_MONEY',amount:200000});api.addPaymentAllocation(draft.id,{method:'CASH',amount:170370});
  assert.equal(store.data.sales.length,0);assert.equal(store.data.journal.length,0);assert.equal(store.stock(variant.id),12);
  const sale=api.finalize(draft.id,{timestamp:'2026-10-02T10:00:00Z'});const original=store.one('receipts',sale.receipt.id);assert.equal(store.stock(variant.id),9);
  finance=new FinanceStore(fixture.path);const evidence=finance.salePaymentEvidence(sale.saleId);assert.equal(evidence.saleTotal,original.totals.total);assert.equal(finance.sourceEvent(evidence.sourceEventId).status,'POSTED');
  const activation=new FinanceActivation(finance);store.data.business.tradeName='Synthetic Demonstration';store.data.stockMovements[0].referenceId='sup_demo';
  const costs=activation.backfillDemoCosts(store);assert.equal(costs[0].status,'MISSING_COST');assert.equal(costs[0].unitCost,null);assert.equal(activation.inventoryValuation(store).items[0].carryingValue,null);
  store.db.close();store=new TisStore(fixture.path);assert.deepEqual(store.one('receipts',original.id),original);
  store.transaction(()=>{store.data.variants[0].price=999999;store.data.taxRates[0].percentage=9900;});
  const credits=[];for(let i=0;i<3;i++)credits.push(issueCreditNote(store,{originalReceiptId:original.id,items:[{variantId:variant.id,quantity:1}],recipient:'Actual test buyer',reason:'Pair returned',justification:'Received physically',returnToStock:true,operatorId:fixture.owner.staff.id,timestamp:`2026-10-02T1${i+1}:00:00Z`}));
  for(const key of ['gross','discount','subtotal','tax','total'])assert.equal(credits.reduce((n,c)=>n+c.totals[key],0),-original.totals[key]);
  assert.equal(store.stock(variant.id),12);assert.deepEqual(xReport(store,'2026-10-02T20:00:00Z').paymentMethods,{MOBILE_MONEY:0,CASH:0});
  const plu=pluReport(store,'2026-10-02','2026-10-02')[0];assert.equal(plu.unitPrice,123457);assert.equal(plu.quantitySold,3);assert.equal(plu.quantityReturned,3);
  for(const c of credits){const receipt=store.one('receipts',c.receiptId);assert.equal(receipt.buyerPin,'FROZEN-BUYER');assert.ok(printableReceipt(receipt).includes('FROZEN-BUYER'));assert.equal(receipt.paymentAllocations.reduce((n,a)=>n+a.amount,0),c.totals.total);}
 }finally{finance?.db.close();store.db.close();await fixture.close();}
});

test('Golden financial truth: acquisition, split sale, COGS, statements, PDF, partial credit and explicit refund survive restart',async()=>{
 const fixture=await accountFixture();let store=new TisStore(fixture.path),finance=new FinanceStore(fixture.path);
 try{
  store.transaction(()=>{store.configBusiness({tradeName:'Golden costed retail simulation',pin:'TEST',address:'Nairobi'});store.addTaxRate('A','16');const p=store.addProduct({name:'Golden costed shoe'});store.addVariant({id:'golden-v',productId:p.id,sku:'GOLDEN-COSTED',colour:'Brown',size:40,price:'1234.57'});store.receive('golden-v',12,fixture.owner.staff.id,'2026-10-01T09:00:00Z');});
  let retail=new RetailAccounting(finance,store);const unitCost=70001;retail.captureCost(store.data.stockMovements[0].id,{unitCost,counterpartCode:'3100',evidenceReference:'Verified Golden acquisition',reason:'Actual cost acceptance'});
  let sales=new SalesApi(store,{operatorId:fixture.owner.staff.id});const draft=sales.create({timestamp:'2026-10-01T21:00:00Z',items:[{variantId:'golden-v',quantity:3}]});sales.setLineDiscount(draft.id,'golden-v',{discountAmount:1});sales.updateCustomer(draft.id,{buyerPin:'GOLDEN-BUYER'});const expected=sales.load(draft.id).totals;
  sales.addPaymentAllocation(draft.id,{method:'MOBILE_MONEY',amount:200000});sales.addPaymentAllocation(draft.id,{method:'CASH',amount:expected.total-200000});assert.equal(store.data.sales.length,0);assert.equal(store.stock('golden-v'),12);
  const sale=sales.finalize(draft.id,{timestamp:'2026-10-01T21:00:00Z'}),receipt=store.one('receipts',sale.receipt.id),frozen=structuredClone(receipt),cost=unitCost*3,source=finance.salePaymentEvidence(sale.saleId).sourceEventId;
  assert.equal(sale.accounting.state,'POSTED');assert.equal(store.stock('golden-v'),9);assert.equal(expected.subtotal+expected.tax,expected.total);
  const verifyBooks=(creditSubtotal=0,creditTax=0,returnedCost=0,refund=0)=>{
   const api=new FinanceApi(finance,{tisStore:store}),reporting=new FinanceReporting(api),pnl=api.report('profit-loss',{from:'2026-10-01',to:'2026-10-31'}).report,balance=api.report('balance-sheet',{asOf:'2026-10-31'}).report,trial=api.report('trial-balance',{asOf:'2026-10-31'}).report;
   assert.equal(pnl.revenue,expected.subtotal-creditSubtotal);assert.equal(pnl.sections.find(s=>s.name==='Cost of Sales').subtotal,cost-returnedCost);assert.equal(pnl.netProfit,expected.subtotal-creditSubtotal-cost+returnedCost);
   assert.equal(trial.isBalanced,true);assert.equal(balance.isBalanced,true);assert.equal(balance.currentEarnings,pnl.netProfit);assert.equal(balance.totalAssets,unitCost*12-cost+returnedCost+expected.total-refund);assert.equal(balance.totalLiabilities,expected.tax-creditTax+creditSubtotal+creditTax-refund);assert.equal(balance.totalEquity,unitCost*12+pnl.netProfit);assert.equal(balance.totalAssets,balance.totalLiabilitiesAndEquity);assert.equal(balance.sourceCoverage.complete,true,JSON.stringify(balance.sourceCoverage));
   for(const r of [pnl,balance,trial])verifyFinancialPdf(reporting.pdf({report:r}),r);
   const snap=reporting.snapshot('BALANCE_SHEET',{asOf:'2026-10-31'});verifyFinancialPdf(reporting.pdf(reporting.snapshotData(snap.id)),snap.reportData);return snap;
  };
  const before=verifyBooks();const issuance=requestReceiptDocument(store,receipt.id,{requestKey:'golden-original',operatorId:fixture.owner.staff.id}),sidecar=documentExport(transactionDocument(store,issuance.receipt,'TAX_INVOICE'));assertDocumentProvenance(sidecar,issuance.receipt);const text=extractPdf(receiptPdf(exportedDocumentModel(sidecar))).text;assertPdfAmount(text,'TOTAL',expected.total);assertPdfAmount(text,'AMOUNT WITHOUT TAX',expected.subtotal);assertPdfAmount(text,'VAT / TOTAL TAX',expected.tax);
  const copy=requestReceiptDocument(store,receipt.id,{requestKey:'golden-copy',kind:'COPY',operatorId:fixture.owner.staff.id});assert.deepEqual(copy.receipt.totals,frozen.totals);
  store.db.close();finance.db.close();store=new TisStore(fixture.path);finance=new FinanceStore(fixture.path);retail=new RetailAccounting(finance,store);sales=new SalesApi(store);assert.deepEqual(store.one('receipts',receipt.id),frozen);for(let i=0;i<3;i++){sales.finalize(draft.id);retail.reconcile();}
  assert.equal(finance.db.prepare("SELECT COUNT(*) n FROM accounting_journal_entries WHERE source_accounting_event_id=? AND reversal_of_journal_entry_id IS NULL AND status IN ('POSTED','REVERSED')").get(source).n,1);assert.equal(store.data.stockMovements.filter(m=>m.type==='SALE').length,1);
  const credit=issueCreditNote(store,{originalReceiptId:receipt.id,items:[{variantId:'golden-v',quantity:1}],recipient:'Golden buyer',reason:'One pair returned',justification:'Returned to physical stock',returnToStock:true,operatorId:fixture.owner.staff.id,timestamp:'2026-10-02T21:00:00Z'});retail.reconcile();const creditSubtotal=Math.abs(credit.totals.subtotal),creditTax=Math.abs(credit.totals.tax);verifyBooks(creditSubtotal,creditTax,unitCost);assert.equal(store.stock('golden-v'),10);
  const creditReceipt=store.one('receipts',credit.receiptId),creditIssue=requestReceiptDocument(store,creditReceipt.id,{requestKey:'golden-credit',operatorId:fixture.owner.staff.id}),creditModel=transactionDocument(store,creditIssue.receipt);assertDocumentProvenance(documentExport(creditModel),creditIssue.receipt);assertPdfAmount(extractPdf(receiptPdf(creditModel)).text,'TOTAL',credit.totals.total);
  const refund=Math.abs(credit.totals.total),cashAccount=new FinanceActivation(finance).configure()['1110'],refundInput={amount:refund,sourceAccount:cashAccount,accountingDate:'2026-10-03',requestKey:'golden-paid-refund',evidenceReference:'Actual test cash refund',reason:'Refund already paid'};for(let i=0;i<2;i++){const paid=await fixture.call(`/api/finance/credit-notes/${credit.id}/refunds`,{method:'POST',body:refundInput});assert.equal(paid.status,201,JSON.stringify(paid.body));}assert.equal(retail.credits().items[0].outstanding,0);verifyBooks(creditSubtotal,creditTax,unitCost,refund);
  const refunded=transactionDocument(store,creditIssue.receipt),refundText=extractPdf(receiptPdf(refunded)).text;assertPdfAmount(refundText,'Refund: Completed - Cash:',refund);assert.equal(new FinanceApi(finance,{tisStore:store}).snapshot(before.id).reportData.currentEarnings,expected.subtotal-cost);
  store.db.close();finance.db.close();store=new TisStore(fixture.path);finance=new FinanceStore(fixture.path);verifyBooks(creditSubtotal,creditTax,unitCost,refund);assert.deepEqual(store.one('receipts',receipt.id),frozen);
 }finally{store.db.close();finance.db.close();await fixture.close();}
});
