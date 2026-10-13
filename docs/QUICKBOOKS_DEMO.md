# QuickBooks reporting and currency presentation

Selection/update: **13 October 2026**. This repository contains selected pure contracts, not a working OAuth server or a business exporter.

- [`reports.js`](../src/quickbooks/reports.js) checks the provider's currency, date interval and accounting basis, preserves exact cents, and exposes missing/unbalanced statements instead of inventing totals.
- [`usd-fixture.js`](../src/quickbooks/usd-fixture.js) defines an isolated fictional receive/cost → sale → quantity-based credit/stock return → separate refund sequence using DukaSole's existing account roles. Each stage has calculated journal and statement expectations. This is not a KES-to-USD conversion or a production transaction sync.
- [`dated-currency.js`](../src/dated-currency.js) converts original minor units using one-step rational arithmetic and exact-date foreign-to-USD quotes. [`currency.js`](../src/quickbooks/currency.js) checks quote date, direction, positivity and preceding calendar intervals. Wrong or missing evidence means unavailable conversion, not a fallback.
- [`currency-preview-ui.js`](../src/currency-preview-ui.js) allowlists downloaded quote fields, validates the selected end date, treats imports as untrusted display inputs, and preserves existing Finance permissions. Quotes live only in browser memory; no OAuth credentials move to DukaSole.
- [`finance-dashboard-ui.js`](../src/finance-dashboard-ui.js) projects bilingual profit/expense charts and exact comparison tables without modifying statements. Missing, negative or non-reconciling expense values cannot create a misleading donut.
- The older [`demo-currency.js`](../src/demo-currency.js) remains a selected historical example-rate helper. It is **not** the current local conversion source.

The private optional sandbox module supplies encrypted OAuth token storage, rotation, browser ownership, explicit account approval and durable write intents. Confirmed fixture events are read back; repeated/concurrent/restarted requests reuse the same identity. Uncertain remote outcomes block further posting instead of automatically retrying. Those server implementations and credentials are intentionally not published here.

The local DukaSole Finance page remains complete and uses its existing permissions. Its collapsed currency preview is separate from normal KES reports and payment controls. QuickBooks report cards and P&L bars can be previewed in USD, KES or EUR while original statement/comparison tables, the expense breakdown and balance checks remain in provider currency. Report conversion uses one end-date quote for an explicitly approximate view, not transaction-by-transaction accounting or historical revaluation.

The owner explicitly approved permanent multicurrency activation in the existing USD sandbox for **accounting only**, accepting the provider's Payments/Bill Pay and cash-flow-planner limitations. The preference was saved in QuickBooks and read back locally. The shipped local verification path only GETs preferences and records approval; it cannot activate preferences on startup or POST that preference. Local QuickBooks Payments authorization is blocked; DukaSole's payment records and checkout are unchanged. Real DukaSole transaction export remains off pending account/tax mappings, a future cutover and credit/reversal FX/rounding policy.

## Evidence and limits

The focused public tests use invented IDs and synthetic report structures only. They do not prove an active OAuth connection, durable remote exactly-once delivery or a live Payments authorization. The private system separately tests actual DukaSole costed sales, quantity-based credits, evidenced refunds, restart and statement parity with this fixture in isolated databases.

Live sandbox CompanyInfo, USD preferences, report reads and the three user-approved matching chart accounts were verified locally. On 13 October 2026, nine fictional journals were read back and sale/partial-credit/full-credit profit and Balance Sheet deltas matched their calculated expectations. A repeated sale reused its three confirmed IDs; replaying the completed fixture after restart reused all nine IDs and still matched. Later in the same local pass, USD + multicurrency enabled and exact-date KES/EUR quote reads were verified after restart. A transient read error cleared stale report figures; a manual read retry succeeded without a write.

This narrow evidence does not authorize real business export or prove indefinite provider-side deduplication. Private response bodies, company identifiers, rates actually returned to the owner, account IDs and business screenshots are excluded here. Public rate/report tests use fictional evidence only. The hosted public tour remains the original fictional-data screenshot walkthrough; it is not a live QuickBooks or till service.

## Primary implementation references

Checked **11–13 October 2026**; no third-party integration guide is used.

- [Official Intuit Node OAuth SDK](https://github.com/intuit/oauth-jsclient), installed **4.2.5**, and [official Node OAuth sample](https://github.com/IntuitDeveloper/oauth2-nodejs).
- [Official Intuit PHP SDK v6.3.1 JournalEntry sample](https://github.com/intuit/QuickBooks-V3-PHP-SDK/blob/v6.3.1/src/_Samples/JournalEntryCreate.php), used for API fields, not as a runtime dependency.
- [Official report service v6.3.1](https://github.com/intuit/QuickBooks-V3-PHP-SDK/blob/v6.3.1/src/ReportService/ReportService.php), used for report names and explicit parameters.
- [Intuit Multicurrency guidance](https://quickbooks.intuit.com/learn-support/en-us/help-article/multicurrency/learn-multicurrency-quickbooks-online/L5krkKQi8_US_en_US), updated **6 October 2026**, accessed **13 October 2026**: irreversible feature and provider-product limitations.
- [Intuit ExchangeRate API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/all-entities/exchangerate), accessed **13 October 2026**, no declared publication version/date: exact dated source/target/rate fields. An imported display quote is not independently authenticated accounting evidence.

Copyright 2026 Uwaziman1. All rights reserved for original selected code; existing third-party rights are unchanged.
