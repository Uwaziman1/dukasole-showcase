# Selected engineering, not the full application

Selection date: **11 October 2026**. The four JavaScript implementation files are unchanged copies from the private application's source snapshot. The SQL is a formatting-expanded excerpt of its actual persistence guards. Newly written focused tests exercise those selections; reference integration tests retain their private dependencies and are for inspection only.

## 1. Business dates are domain-owned

[`web/business-time.js`](../web/business-time.js) uses `Intl.DateTimeFormat` with the IANA timezone `Africa/Nairobi`. [`src/business_time.js`](../src/business_time.js) re-exports the same module for Node consumers. UTC stays storage time; one shared contract resolves business day, month and reporting interval boundaries. The focused tests cover Nairobi midnight, month-end and year-end rather than scattering manual offset arithmetic.

## 2. Evidence and presentation have different contracts

[`src/document_evidence.js`](../src/document_evidence.js) exports schema/version 1, separates `businessEvidence` from `presentation`, and compares the canonical immutable snapshot. Receipt/invoice presentation changes may be legitimate; a changed buyer, quantity, price, tax, payment allocation, sale or credit/stock linkage is not. The tests deliberately mutate each of those fields and require rejection.

[`src/transaction_document.js`](../src/transaction_document.js) supplies a read-only audience projection. A customer invoice view is not another sale. A credit is not proof of a cash refund. A recorded payment allocation is not proof of provider settlement. Its optional store-backed history projection is selected for source review; the showcase does not provide that store or expose business records.

## 3. Domain idempotency is backed by durable enforcement

[`samples/accounting-source-guard.sql`](../samples/accounting-source-guard.sql) excerpts the private `src/finance.js` guard: one non-reversal authoritative journal per accounting source. Both `POSTED` and `REVERSED` originals occupy that identity, so reversing one cannot accidentally free it for another original posting. Insert/update guards also reject a leftover draft after another journal has posted that source; posted identities and records are immutable.

The runnable SQLite tests use a deliberately small in-memory schema to verify the persistence boundary. They are **not** the complete Sales/Stock/Finance recovery integration test. The reference specification in [`references/finance-integrity.reference.js`](../references/finance-integrity.reference.js) shows the fuller closed-period, repeat-finalization, recovery and restart acceptance scenarios using private application modules.

## 4. A Golden Transaction crosses module boundaries

[`references/golden-transaction.reference.js`](../references/golden-transaction.reference.js) is the actual source-derived acceptance specification. It traces receipt/cost → stock → sale → split payments → accounting → statements → PDF text → credit/refund → restart. It compares rendered PDF amounts with calculated statement values, rather than proving only that a file exists. Dependencies needed to run this full test are intentionally private.

The original full application's 279-test run is historical local evidence, not a claim that this reduced repository includes that suite. The runnable showcase tests and their scope are recorded separately in [VALIDATION](VALIDATION.md).
