import { AppError } from './errors.js';
import { decimalRatio } from '../dated-currency.js';
export function rateDate(input = {}) {
  if (Object.keys(input).some(key => key !== 'date') || typeof input.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date+'T00:00:00Z')) ||
    new Date(input.date+'T00:00:00Z').toISOString().slice(0,10) !== input.date)
    throw new AppError(400,'RATE_DATE','Choose one valid YYYY-MM-DD quote date.');
  return input.date;
}
export function projectRate(raw, sourceCurrency, date, fetchedAt) {
  const rate = raw?.ExchangeRate;
  if (!rate || rate.SourceCurrencyCode !== sourceCurrency || rate.TargetCurrencyCode !== 'USD' ||
    rate.AsOfDate !== date || !decimalRatio(rate.Rate))
    throw new AppError(502,'RATE_EVIDENCE','No exact dated '+sourceCurrency+' to USD quote was verified. Conversion is unavailable; no fallback rate is used.');
  return {sourceCurrency,targetCurrency:'USD',date,rate:String(rate.Rate),
    source:'QUICKBOOKS_SANDBOX',fetchedAt,providerResponseAt:raw.time || null,
    providerUpdatedAt:rate.MetaData?.LastUpdatedTime || null};
}
// Read-only presentation comparison; date arithmetic is on calendar dates, not timestamps.
export function previousInterval(parameters) {
  const start = Date.parse(parameters.from+'T00:00:00Z'), end = Date.parse(parameters.to+'T00:00:00Z');
  const duration = end-start+86400000;
  return {from:new Date(start-duration).toISOString().slice(0,10),to:new Date(start-86400000).toISOString().slice(0,10),basis:parameters.basis};
}
