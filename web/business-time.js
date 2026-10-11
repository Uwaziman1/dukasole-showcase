// Shared by browser and Node. UTC is storage time; this owns business calendars.
export const BUSINESS_TIMEZONE = 'Africa/Nairobi';
const calendar = /^\d{4}-\d{2}-\d{2}$/;
const formatter = new Intl.DateTimeFormat('en-CA', {timeZone:BUSINESS_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const parts = value => Object.fromEntries(formatter.formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
export function businessDate(value=new Date()) {
  if(calendar.test(String(value)))return String(value);
  const p=parts(value);return `${p.year.padStart(4,'0')}-${p.month}-${p.day}`;
}
export function addBusinessDays(value,count) {
  return new Date(Date.parse(`${businessDate(value)}T00:00:00Z`)+count*86400000).toISOString().slice(0,10);
}
export function businessDayStart(value) {
  const target=Date.parse(`${businessDate(value)}T00:00:00Z`);let instant=target;
  // Resolve local midnight through the IANA timezone, not a hard-coded offset.
  for(let i=0;i<3;i++){const p=parts(instant),wall=Date.parse(`${p.year.padStart(4,'0')}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`),next=instant+target-wall;if(next===instant)break;instant=next;}
  return new Date(instant).toISOString();
}
export const businessDayEnd = value => new Date(Date.parse(businessDayStart(addBusinessDays(value,1)))-1).toISOString();
export const businessInterval = (from,to) => ({timezone:BUSINESS_TIMEZONE,fromDate:businessDate(from),toDate:businessDate(to),from:businessDayStart(from),to:businessDayEnd(to)});
export function businessMonth(value=new Date()) {
  const day=businessDate(value),first=day.slice(0,7)+'-01',next=new Date(`${first}T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);
  return businessInterval(first,addBusinessDays(next.toISOString().slice(0,10),-1));
}
export const reportingBoundary = (value,end=true) => calendar.test(String(value))?(end?businessDayEnd(value):businessDayStart(value)):new Date(value).toISOString();
export const businessDisplay = value => ({timezone:BUSINESS_TIMEZONE,businessDate:businessDate(value),date:new Intl.DateTimeFormat('en-GB',{timeZone:BUSINESS_TIMEZONE,dateStyle:'short'}).format(new Date(value)),time:new Intl.DateTimeFormat('en-GB',{timeZone:BUSINESS_TIMEZONE,timeStyle:'medium'}).format(new Date(value))});
