import { AppError } from './errors.js';

// Read-only projection. Never infer a missing total as zero or relabel currency.
export function minorUnits(value) {
  const text = String(value ?? '');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const negative = text.startsWith('-');
  const [whole, cents = ''] = text.replace(/^-/, '').split('.');
  const amount = BigInt(whole) * 100n + BigInt(cents.padEnd(2, '0'));
  const signed = negative ? -amount : amount;
  return signed <= BigInt(Number.MAX_SAFE_INTEGER) && signed >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(signed) : null;
}
export function reportParameters(input = {}) {
  if (Object.keys(input).some(key => !['from', 'to', 'basis'].includes(key)))
    throw new AppError(400, 'REPORT_PARAMETERS', 'Only from, to and basis are accepted.');
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  if (!date(input.from) || !date(input.to) || input.from > input.to ||
    (Date.parse(input.to) - Date.parse(input.from)) / 86400000 > 183)
    throw new AppError(400, 'REPORT_DATES', 'Choose valid dates in order, spanning at most 183 days.');
  if (!['Accrual', 'Cash'].includes(input.basis))
    throw new AppError(400, 'REPORT_BASIS', 'Select Accrual or Cash explicitly.');
  return { from: input.from, to: input.to, basis: input.basis };
}
export function projectReport(raw, name, parameters) {
  if (!raw?.Header || !Array.isArray(raw.Columns?.Column) || !raw.Rows)
    throw new AppError(502, 'REPORT_SCHEMA', 'QuickBooks returned an unsupported report structure. No totals were guessed.');
  const header = raw.Header;
  if (header.ReportName !== name || header.StartPeriod !== parameters.from || header.EndPeriod !== parameters.to || header.ReportBasis !== parameters.basis)
    throw new AppError(502, 'REPORT_BOUNDARY', 'QuickBooks report dates or accounting basis differ from the request. No comparison is shown.');
  if (!/^[A-Z]{3}$/.test(header.Currency || ''))
    throw new AppError(502, 'REPORT_CURRENCY', 'The report does not declare a supported currency code.');
  const columns = raw.Columns.Column.map(column => String(column.ColTitle || column.ColType || '').slice(0, 200));
  const rows = [], totals = {};
  const cells = values => (values || []).map(cell => String(cell.value ?? '').slice(0, 400));
  function visit(list, depth = 0) {
    if (depth > 20 || rows.length > 10000) throw new AppError(502, 'REPORT_LIMIT', 'Report too large. Select a smaller date range.');
    for (const row of list || []) {
      if (row.Header?.ColData) rows.push({ depth, kind: 'heading', cells: cells(row.Header.ColData) });
      if (row.ColData) rows.push({ depth, kind: 'data', cells: cells(row.ColData) });
      if (row.Rows?.Row) visit(row.Rows.Row, depth + 1);
      if (row.Summary?.ColData) {
        const values = cells(row.Summary.ColData);
        rows.push({ depth, kind: 'total', cells: values });
        // A single Total column is required for cards; unknown groups stay in the table.
        if (row.group && values.length === 2 && columns.length === 2) {
          if (Object.hasOwn(totals, row.group)) throw new AppError(502, 'REPORT_TOTAL_DUPLICATE', 'Ambiguous report totals. No aggregate cards were guessed.');
          totals[row.group] = minorUnits(values[1]);
        }
      }
    }
  }
  visit(raw.Rows.Row);
  const balance = name === 'BalanceSheet' ? {
    assets: totals.TotalAssets ?? null, liabilities: totals.Liabilities ?? totals.TotalLiab ?? null,
    equity: totals.Equity ?? totals.TotalEquity ?? null,
    liabilitiesAndEquity: totals.TotalLiabilitiesAndEquity ?? totals.TotalLiabEquity ?? null
  } : null;
  if (balance) {
    balance.difference = balance.assets !== null && balance.liabilitiesAndEquity !== null ? balance.assets - balance.liabilitiesAndEquity : null;
    balance.status = balance.difference === null ? 'INCOMPLETE' : Math.abs(balance.difference) <= 1 ? 'BALANCED' : 'UNBALANCED';
    if (balance.liabilities !== null && balance.equity !== null && balance.liabilitiesAndEquity !== null &&
      Math.abs(balance.liabilities + balance.equity - balance.liabilitiesAndEquity) > 1) balance.status = 'UNBALANCED';
  }
  return { name, currency: header.Currency, from: header.StartPeriod, to: header.EndPeriod,
    basis: header.ReportBasis, providerGeneratedAt: header.Time || null, columns, rows, totals, balance, moneyUnit: 'minor' };
}
export function discoveryProjection(company, preferences, accounts) {
  const prefs = preferences?.QueryResponse?.Preferences?.[0] || preferences?.Preferences;
  const currency = prefs?.CurrencyPrefs?.HomeCurrency?.value || null;
  const compatible = currency === 'KES';
  return {
    companyName: company?.CompanyInfo?.CompanyName || 'Unknown company',
    country: company?.CompanyInfo?.Country || null,
    companyTimezone: company?.CompanyInfo?.DefaultTimeZone || null,
    homeCurrency: currency, multicurrency: prefs?.CurrencyPrefs?.MultiCurrencyEnabled ?? null,
    sync: { enabled: false, status: compatible ? 'MAPPINGS_REQUIRED' : currency ? 'CURRENCY_BLOCKED' : 'CURRENCY_UNKNOWN',
      message: compatible ? 'Approve account IDs, tax treatment and cutover before exporting.' :
        'DukaSole is KES. Do not send KES amounts into this company without an approved compatible currency policy.' },
    accounts: accounts.map(account => ({ id: account.Id, name: account.Name, type: account.AccountType,
      subtype: account.AccountSubType, active: account.Active, currency: account.CurrencyRef?.value || currency }))
  };
}
