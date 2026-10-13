// Exact display/conversion arithmetic. No network, storage or accounting writes.
export const CURRENCIES = Object.freeze(['USD', 'KES', 'EUR']);
export function decimalRatio(value) {
  const text = String(value ?? '');
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,18})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const numerator = BigInt(whole + fraction), denominator = 10n ** BigInt(fraction.length);
  return numerator > 0n ? { numerator, denominator } : null;
}
export function convertDatedMinor(minor, source, target, quotes) {
  if (!Number.isSafeInteger(minor) || !CURRENCIES.includes(source) || !CURRENCIES.includes(target)) return null;
  if (source === target) return minor;
  if (quotes?.version !== 1 || quotes.homeCurrency !== 'USD' || !/^\d{4}-\d{2}-\d{2}$/.test(quotes.date || '')) return null;
  const ratio = currency => currency === 'USD' ? {numerator:1n, denominator:1n} :
    quotes.rates?.[currency]?.date === quotes.date && quotes.rates[currency].sourceCurrency === currency && quotes.rates[currency].targetCurrency === 'USD' ? decimalRatio(quotes.rates[currency].rate) : null;
  const from = ratio(source), to = ratio(target);
  if (!from || !to) return null;
  const numerator = BigInt(minor) * from.numerator * to.denominator;
  const denominator = from.denominator * to.numerator;
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = (absolute * 2n + denominator) / (2n * denominator);
  const signed = numerator < 0n ? -rounded : rounded;
  return signed <= BigInt(Number.MAX_SAFE_INTEGER) && signed >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(signed) : null;
}
