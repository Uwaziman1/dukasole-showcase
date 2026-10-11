// Read-only audience projection. No issuance, recalculation, or evidence writes.
const definitions={RECEIPT:['Receipt','Proof of this completed sale'],TAX_INVOICE:['Tax Invoice','Formal invoice issued for this sale'],CREDIT_NOTE:['Credit Note','Adjustment to an earlier sale'],PROFORMA:['Proforma','Estimate before completing the sale'],TRAINING:['Training document','Practice transaction - not a real sale']};
const paymentMethods=new Set(['CASH','MOBILE_MONEY','CARD','BANK']);
export function documentMeaning(r,representation=null,original=null){
 if(representation&&!['RECEIPT','TAX_INVOICE'].includes(representation))throw Object.assign(new Error('Choose Receipt or Tax Invoice.'),{status:400,code:'INVALID_DOCUMENT_REPRESENTATION'});
 const training=['TS','TC'].includes(r.label)||r.type==='TRAINING'||original?.type==='TRAINING',proforma=r.label==='PS'||original?.label==='PS',credit=r.transactionType==='CREDIT_NOTE';
 const kind=training?'TRAINING':proforma?'PROFORMA':credit?'CREDIT_NOTE':representation||'RECEIPT';
 const allocations=r.paymentAllocations,known=Array.isArray(allocations)&&allocations.length>0&&allocations.every(a=>paymentMethods.has(a.method)||a.method==='CREDIT');
 const received=known?allocations.filter(a=>paymentMethods.has(a.method)).reduce((n,a)=>n+a.amount,0):null;
 const due=known?allocations.filter(a=>a.method==='CREDIT').reduce((n,a)=>n+a.amount,0):null;
 const copy=r.type==='COPY'||r.documentDesignation==='COPY';
 return {kind,title:definitions[kind][0],purpose:definitions[kind][1],copy,training,proforma,credit,
  availableRepresentations:training||proforma||credit?[]:['RECEIPT','TAX_INVOICE'],
  status:training?'TRAINING':proforma?'Not a completed sale':credit?'Credit issued':!known?'Payment details not fully recorded':due>0?(received>0?'Part paid - amount due':'Unpaid - amount due'):'Paid - payment recorded',
  payment:training||proforma||credit?null:{received,due,known,note:'Recorded at sale completion; not proof of bank settlement or later debt collection.'},
  creditAmount:credit?Math.abs(r.totals.total):null,
  originalNumber:copy?(original?.number||r.originalReceiptNumber||r.number):r.originalReceiptNumber,
  saleNumber:credit?r.originalReceiptNumber:copy?(original?.number||r.originalReceiptNumber||r.number):r.number,
  originalTimestamp:copy?(original?.timestamp||null):null,
  warning:training?'Practice transaction - not a real sale. Existing training behaviour changes stock.':proforma?'This is an estimate, not a completed sale or proof of payment.':copy?'This is a copy of an existing document. No new sale was created.':credit?'Credit reduces the earlier sale. It does not prove money was refunded.':null,
  fiscal:{status:'Not fiscally issued',description:'Local TIS document only. No KRA acceptance is recorded; the logo and local QR are not verification.'}};
}
const tableExists=(db,name)=>!!db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?').get(name);
export function transactionDocument(store,r,representation=null){
 const original=r.originalReceiptId?store.data.receipts.find(x=>x.id===r.originalReceiptId):null;
 const meaning=documentMeaning(r,representation,original),root=r.type==='COPY'?(original||r):r;
 const related=store.data.receipts.filter(x=>x.id===root.id||x.originalReceiptId===root.id);
 const saleOriginal=root.transactionType==='CREDIT_NOTE'?store.data.receipts.find(x=>x.id===root.originalReceiptId):null;
 if(saleOriginal&&!related.some(x=>x.id===saleOriginal.id))related.unshift(saleOriginal);
 const history=related.map(x=>({receiptId:x.id,number:x.number,timestamp:x.timestamp,title:documentMeaning(x,null,root).title,event:x.type==='COPY'?'Copy prepared':x.transactionType==='CREDIT_NOTE'?'Credit issued':x.label==='PS'?'Estimate prepared':['TS','TC'].includes(x.label)?'Training recorded':'Sale completed',amount:x.totals.total}));
 if(tableExists(store.db,'tis_document_issues'))for(const row of store.db.prepare('SELECT json FROM tis_document_issues WHERE receipt_id=? ORDER BY rowid').all(root.id)){
  const issue=JSON.parse(row.json);if(issue.documentDesignation==='ORIGINAL')history.push({receiptId:root.id,number:root.number,timestamp:null,title:meaning.title,event:'Original document prepared - preparation time not recorded',amount:root.totals.total});
 }
 const refunds=[];
 if(tableExists(store.db,'retail_refunds')&&tableExists(store.db,'cash_flow_operations'))for(const credit of related.filter(x=>x.transactionType==='CREDIT_NOTE'&&x.type!=='COPY')){
  const rows=store.db.prepare('SELECT r.amount,o.created_at,o.reversal_journal_entry_id,o.journal_entry_id FROM retail_refunds r JOIN cash_flow_operations o ON o.id=r.operation_id WHERE r.credit_id=? ORDER BY o.created_at').all(credit.relationshipId);
  for(const row of rows){
   // Method follows the actual cash journal, never the credit allocation.
   const account=store.db.prepare('SELECT a.code FROM accounting_journal_lines l JOIN accounting_accounts a ON a.id=l.account_id WHERE l.journal_entry_id=? AND l.credit>0 LIMIT 1').get(row.journal_entry_id);
   const method=({'1110':'Cash','1120':'Mobile money','1130':'Card','1140':'Bank'})[account?.code]||'Recorded cash account';
   const refund={creditNumber:credit.number,amount:row.amount,timestamp:row.created_at,method,status:row.reversal_journal_entry_id?'Reversed':'Completed'};
   refunds.push(refund);history.push({...refund,title:'Refund',event:`${refund.status} - ${method}`,number:credit.number});
  }
 }
 history.sort((a,b)=>String(a.timestamp||'9999').localeCompare(String(b.timestamp||'9999')));
 return {...r,documentPresentation:{...meaning,refunds,history}};
}
