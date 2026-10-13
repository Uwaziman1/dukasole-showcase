import {DEMO_CURRENCIES,displayMoney} from './demo-currency.js';
import {convertDatedMinor,decimalRatio} from './dated-currency.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function parseDisplayQuote(text){
  if(typeof text!=='string'||text.length>16384)throw new Error('Choose a display quote JSON file smaller than 16 KB.');
  let q;try{q=JSON.parse(text);}catch{throw new Error('The display quote must be valid JSON.');}
  if(q?.version!==1||q.homeCurrency!=='USD'||q.source!=='QUICKBOOKS_SANDBOX'||typeof q.date!=='string'||
    !/^\d{4}-\d{2}-\d{2}$/.test(q.date)||!Number.isFinite(Date.parse(q.date+'T00:00:00Z'))||new Date(q.date+'T00:00:00Z').toISOString().slice(0,10)!==q.date||
    typeof q.fetchedAt!=='string'||!Number.isFinite(Date.parse(q.fetchedAt)))throw new Error('Unsupported quote version, source or date. Download a display quote from the local QuickBooks workspace.');
  const rates={};
  for(const code of ['KES','EUR']){
    const r=q.rates?.[code];
    if(r?.sourceCurrency!==code||r.targetCurrency!=='USD'||r.date!==q.date||!decimalRatio(r.rate))throw new Error('Both positive KES-to-USD and EUR-to-USD rates must match the quote date.');
    rates[code]={sourceCurrency:code,targetCurrency:'USD',date:q.date,rate:String(r.rate)};
  }
  // Allowlist public quote fields. Imported files are display inputs, never accounting evidence.
  return {version:1,homeCurrency:'USD',source:'QUICKBOOKS_SANDBOX',date:q.date,fetchedAt:q.fetchedAt,rates};
}
export function currencyPreviewView(summary,{currency='KES',open=false,canRead=false,quote=null,error=''}={}) {
  if(!canRead)return '';
  const target=DEMO_CURRENCIES.includes(currency)?currency:'KES',pnl=summary?.reports?.profitLoss,supported=summary?.moneyUnit==='KES_MINOR';
  const date=summary?.dateRange?.toDate,matching=quote?.date===date?quote:null;
  const rows=[['Revenue / Mapato',pnl?.revenue],['Total expenses / Gharama zote',pnl?.totalExpenses],['Net profit / Faida halisi',pnl?.netProfit],['Cash available / Fedha zilizopo',summary?.metrics?.cashAndCashEquivalents]];
  return `<details class="sheet currency-preview" ${open?'open':''}><summary>Dated currency view / Mwonekano wa sarafu</summary><div class="period-controls"><label for="finance-display-currency">Display currency / Sarafu ya kuonyesha</label><select id="finance-display-currency" aria-describedby="finance-fx-note">${DEMO_CURRENCIES.map(code=>`<option value="${code}" ${code===target?'selected':''}>${code}</option>`).join('')}</select><label for="finance-display-quote">Import display quote JSON / Ingiza faili la viwango</label><input id="finance-display-quote" type="file" accept=".json,application/json" aria-describedby="finance-fx-note"></div><p id="finance-fx-note" class="supporting">${matching?`Imported quote declares QuickBooks sandbox rates for ${esc(matching.date)}: 1 KES = USD ${esc(matching.rates.KES.rate)}; 1 EUR = USD ${esc(matching.rates.EUR.rate)}. Fetched ${esc(matching.fetchedAt)}.`:`Download a dated display quote from the local QuickBooks workspace, then import it here. Its date must match this period's end (${esc(date||'not available')}). No example or current-rate fallback.`} Stored records, payments, tax, reports and PDF exports stay in KES. / Rekodi na malipo hazibadilishwi.</p>${error?`<p role="alert">${esc(error)}</p>`:''}<div class="period-metrics">${rows.map(([label,value])=>`<div><span>${label}</span><b>${displayMoney(supported?convertDatedMinor(value,'KES',target,matching):null,target)}</b><small>Source: ${displayMoney(supported?value:null,'KES')}</small></div>`).join('')}</div><p class="meta">Approximate display only, using one end-date quote; each amount is rounded separately. Imported quotes are not trusted accounting evidence and remain in this browser's memory only. No transaction syncing or historical revaluation. / Mwonekano tu; si mabadiliko ya hesabu.</p></details>`;
}
