// Read-only charts from the same posted Finance evidence as the statements.
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const colors = ['#176a45','#277d9e','#7966ad','#d88528','#627563'];
const valid = value => Number.isSafeInteger(value);
export function financeDashboardModel(summary) {
  const pnl=summary?.reports?.profitLoss, prior=summary?.comparison?.profitLoss;
  if(summary?.moneyUnit!=='KES_MINOR' || pnl?.capability!=='READY' ||
    ![pnl.revenue,pnl.totalExpenses,pnl.netProfit].every(valid) || pnl.revenue-pnl.totalExpenses!==pnl.netProfit)
    return {available:false};
  const expenses=(pnl.sections||[]).flatMap(section=>(section.rows||[]))
    .filter(row=>row.account?.accountType==='EXPENSE')
    .map(row=>({label:row.account.name,value:row.currentAmount}));
  const comparable=summary.comparison?.sourceCoverage?.complete===true && prior?.capability==='READY' &&
    [prior.revenue,prior.totalExpenses,prior.netProfit].every(valid);
  return {available:true,revenue:pnl.revenue,expenses:pnl.totalExpenses,profit:pnl.netProfit,
    prior:comparable?{revenue:prior.revenue,expenses:prior.totalExpenses,profit:prior.netProfit}:null,
    previousRange:summary.comparison?.dateRange||null,expenseRows:expenses,
    donutAvailable:expenses.length>0 && expenses.every(row=>valid(row.value)&&row.value>=0) &&
      expenses.reduce((sum,row)=>sum+row.value,0)===pnl.totalExpenses && pnl.totalExpenses>0,
    incomplete:summary.sourceCoverage?.complete!==true};
}
export function financeDashboardView(summary,{canRead=false,money=value=>String(value)}={}) {
  if(!canRead)return '';
  const model=financeDashboardModel(summary);
  if(!model.available)return '<section class="sheet"><h2>Business at a glance / Muhtasari wa biashara</h2><p>Charts are unavailable until classified Finance evidence is ready. / Chati zinahitaji rekodi za fedha zilizokamilika.</p></section>';
  const fmt=value=>escape(money(value));
  const max=Math.max(1,Math.abs(model.revenue),Math.abs(model.expenses));
  const bar=(label,value,kind)=>`<div class="finance-bar-row"><span>${label}</span><b>${fmt(value)}</b><div class="finance-bar-track"><i class="${kind}" style="width:${Math.abs(value)/max*100}%"></i></div></div>`;
  const comparison=model.prior?`<p class="meta">Previous equal-length period / Kipindi kilichotangulia: ${escape(model.previousRange.fromDate)} – ${escape(model.previousRange.toDate)}</p><div class="report-table-wrap"><table class="finance-report-table"><thead><tr><th>Metric / Kipimo</th><th>Current / Sasa</th><th>Previous / Awali</th><th>Change / Tofauti</th></tr></thead><tbody>${[['Revenue / Mapato','revenue'],['Expenses / Gharama','expenses'],['Profit / Faida','profit']].map(([label,key])=>`<tr><th>${label}</th><td class="amount">${fmt(model[key])}</td><td class="amount">${fmt(model.prior[key])}</td><td class="amount">${fmt(model[key]-model.prior[key])}</td></tr>`).join('')}</tbody></table></div>`:'<p class="meta">Previous-period comparison unavailable; missing evidence is not zero.</p>';
  let cursor=0;
  const stops=model.donutAvailable?model.expenseRows.filter(row=>row.value>0).map((row,index)=>{const start=cursor;cursor+=row.value/model.expenses*100;return `${colors[index%colors.length]} ${start}% ${cursor}%`;}).join(','):'';
  return `<section class="sheet finance-dashboard"><p class="eyebrow">Posted Finance · KES</p><h2>Business at a glance / Muhtasari wa biashara</h2>${model.incomplete?'<p class="attention-panel">Coverage requires review. These charts do not certify complete books. / Rekodi zinahitaji ukaguzi.</p>':''}<div class="finance-chart-grid"><section><h3>Profit &amp; Loss / Faida na hasara</h3><p class="finance-chart-value">${fmt(model.profit)}</p>${bar('Revenue / Mapato',model.revenue,'income')}${bar('Total expenses / Gharama zote',model.expenses,'expense')}<p class="meta">Expenses include cost of goods sold. Bar lengths show magnitude; signs remain in the amounts.</p></section><section><h3>Expense breakdown / Mgawanyo wa gharama</h3>${stops?`<div class="finance-donut" role="img" aria-label="Expense proportions; exact values are in the table below" style="background:conic-gradient(${stops})"><span>Expenses<br>${fmt(model.expenses)}</span></div>`:'<p class="meta">A proportion chart cannot represent missing, zero or negative expense values. See signed values below.</p>'}<div class="report-table-wrap"><table class="finance-report-table"><thead><tr><th>Account / Akaunti</th><th>Amount / Kiasi</th></tr></thead><tbody>${model.expenseRows.map(row=>`<tr><th>${escape(row.label)}</th><td class="amount">${fmt(row.value)}</td></tr>`).join('')}</tbody><tfoot><tr><th>Total expenses</th><td class="amount">${fmt(model.expenses)}</td></tr></tfoot></table></div></section></div>${comparison}<p class="meta">Charts summarize existing statements. They are not bank-feed balances, payment settlement, or QuickBooks export.</p></section>`;
}
