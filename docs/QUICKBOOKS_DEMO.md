# QuickBooks reporting and currency presentation

Selection/update: **13 October 2026**. This repository contains selected pure contracts, not a working OAuth server or a business exporter.

- [`reports.js`](../src/quickbooks/reports.js) checks the provider's currency, date interval and accounting basis, preserves exact cents, and exposes missing/unbalanced statements instead of inventing totals.
- [`usd-fixture.js`](../src/quickbooks/usd-fixture.js) defines an isolated fictional receive/cost → sale → quantity-based credit/stock return → separate refund sequence using DukaSole's existing account roles. Each stage has calculated journal and statement expectations. This is not a KES-to-USD conversion or a production transaction sync.
- [`demo-currency.js`](../src/demo-currency.js) is the same browser-safe display contract used in the local DukaSole and QuickBooks workspaces. USD/KES/EUR selection uses clearly labelled **example**, not live, exchange rates. Integer rounding, missing evidence and overflow are explicit. It never changes records, tax, payments, snapshots or PDFs.

The private optional sandbox module supplies encrypted OAuth token storage, rotation, browser ownership, explicit account approval and durable write intents. Confirmed fixture events are read back; repeated/concurrent/restarted requests reuse the same identity. Uncertain remote outcomes block further posting instead of automatically retrying. Those server implementations and credentials are intentionally not published here.

The local DukaSole Finance page remains complete and uses its existing permissions. Its collapsed currency preview is separate from the normal KES reports and payment controls. QuickBooks report cards can be previewed in USD, KES or EUR while the original report tables and balance check remain in the provider currency. No QuickBooks multicurrency preference is activated, and real DukaSole transaction export remains off.

## Evidence and limits

The focused public tests use invented IDs and synthetic report structures only. They do not prove an active OAuth connection, durable remote exactly-once delivery or a live Payments authorization. The private system separately tests actual DukaSole costed sales, quantity-based credits, evidenced refunds, restart and statement parity with this fixture in isolated databases.

Live sandbox CompanyInfo, USD preferences, report reads and the three user-approved matching chart accounts were verified locally. On 13 October 2026, nine fictional journals were read back and sale/partial-credit/full-credit profit and Balance Sheet deltas matched their calculated expectations. A repeated sale reused its three confirmed IDs; replaying the completed fixture after restart reused all nine IDs and still matched. This narrow evidence does not authorize real business export or prove indefinite provider-side deduplication. Private response bodies, company identifiers and account IDs are excluded here. The hosted public tour remains the original fictional-data screenshot walkthrough; it is not a live QuickBooks or till service.

## Primary implementation references

Checked **11–13 October 2026**; no third-party integration guide is used.

- [Official Intuit Node OAuth SDK](https://github.com/intuit/oauth-jsclient), installed **4.2.5**, and [official Node OAuth sample](https://github.com/IntuitDeveloper/oauth2-nodejs).
- [Official Intuit PHP SDK v6.3.1 JournalEntry sample](https://github.com/intuit/QuickBooks-V3-PHP-SDK/blob/v6.3.1/src/_Samples/JournalEntryCreate.php), used for API fields, not as a runtime dependency.
- [Official report service v6.3.1](https://github.com/intuit/QuickBooks-V3-PHP-SDK/blob/v6.3.1/src/ReportService/ReportService.php), used for report names and explicit parameters.
- [Intuit multicurrency/exchange-rate explanation](https://quickbooks.intuit.com/learn-support/en-us/help-article/currency/learn-exchange-rates-quickbooks-online/L97rmEAdR_US_en_US). The local display preview is deliberately not this accounting feature or a live rate service.

Copyright 2026 Uwaziman1. All rights reserved for original selected code; existing third-party rights are unchanged.
