// Browser-only presentation contract. Not a business setting, FX quote, journal
// conversion or payment currency. No network, storage or domain mutation.
export const DEMO_CURRENCIES = Object.freeze(['KES','USD','EUR']);
export const DEMO_FX = Object.freeze({version:'DISPLAY_FX_DEMO_V1',USD:100,KES:13000,EUR:90,
  description:'Example rates only: 1 USD = 130 KES = 0.90 EUR. Not live quotes. / Viwango vya mfano tu, si vya sasa.'});
export function convertDemoMinor(minor,source,target) {
  if(!Number.isSafeInteger(minor)||!DEMO_CURRENCIES.includes(source)||!DEMO_CURRENCIES.includes(target))return null;
  const value=BigInt(minor),negative=value<0n,numerator=(negative?-value:value)*BigInt(DEMO_FX[target]),denominator=BigInt(DEMO_FX[source]);
  const rounded=(numerator+denominator/2n)/denominator,result=negative?-rounded:rounded;
  return result<=BigInt(Number.MAX_SAFE_INTEGER)&&result>=BigInt(Number.MIN_SAFE_INTEGER)?Number(result):null;
}
export function displayMoney(minor,currency) {
  if(!Number.isSafeInteger(minor)||!DEMO_CURRENCIES.includes(currency))return 'Not available';
  const value=BigInt(minor),absolute=value<0n?-value:value;
  return currency+' '+(value<0n?'-':'')+new Intl.NumberFormat('en-KE',{maximumFractionDigits:0}).format(absolute/100n)+'.'+String(absolute%100n).padStart(2,'0');
}
