import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {financeDashboardModel,financeDashboardView} from '../src/finance-dashboard-ui.js';
import {displayMoney} from '../src/demo-currency.js';
const summary=()=>({moneyUnit:'KES_MINOR',sourceCoverage:{complete:true},reports:{profitLoss:{capability:'READY',revenue:11600,totalExpenses:5000,netProfit:6600,sections:[{rows:[{account:{name:'COGS',accountType:'EXPENSE'},currentAmount:5000}]}]}},comparison:{dateRange:{fromDate:'2026-09-30',toDate:'2026-09-30'},profitLoss:{capability:'READY',revenue:10000,totalExpenses:4000,netProfit:6000},sourceCoverage:{complete:true}}});
test('dashboard shows exact statement values, signed comparisons and expense proportions without mutating evidence',()=>{
  const data=summary(),before=JSON.stringify(data),model=financeDashboardModel(data);
  assert.equal(model.profit,6600);assert.equal(model.donutAvailable,true);
  const html=financeDashboardView(data,{canRead:true,money:value=>displayMoney(value,'KES')});
  for(const value of ['KES 116.00','KES 50.00','KES 66.00','KES 60.00','KES 6.00','2026-09-30'])assert.ok(html.includes(value),value);
  assert.match(html,/conic-gradient/);assert.match(html,/not bank-feed balances/);assert.equal(JSON.stringify(data),before);
  assert.equal(financeDashboardView(data),'');
});
test('missing, unclassified, negative or non-reconciling evidence cannot make a misleading chart',()=>{
  for(const field of ['revenue','totalExpenses','netProfit']){const data=summary();data.reports.profitLoss[field]=null;assert.equal(financeDashboardModel(data).available,false);}
  const data=summary();data.reports.profitLoss.netProfit++;assert.equal(financeDashboardModel(data).available,false);
  data.reports.profitLoss.netProfit--;data.reports.profitLoss.capability='UNMAPPED';assert.equal(financeDashboardModel(data).available,false);
  data.reports.profitLoss.capability='READY';data.reports.profitLoss.sections[0].rows[0].currentAmount=-5000;assert.equal(financeDashboardModel(data).donutAvailable,false);
  data.sourceCoverage.complete=false;data.comparison.sourceCoverage.complete=false;
  const html=financeDashboardView(data,{canRead:true});assert.match(html,/Coverage requires review/);assert.match(html,/comparison unavailable/);assert.doesNotMatch(html,/conic-gradient/);
  data.reports.profitLoss.sections[0].rows[0].account.name='<script>unsafe</script>';
  assert.doesNotMatch(financeDashboardView(data,{canRead:true}),/<script>/);
  assert.doesNotMatch(readFileSync(new URL('../src/finance-dashboard-ui.js',import.meta.url),'utf8'),/fetch\(|localStorage|sessionStorage/);
});
