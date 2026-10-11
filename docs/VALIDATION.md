# Validation and evidence scope

Date: **11 October 2026**.

## This reduced public repository

`node --test`: **27 passing, 0 failing, 0 skipped**, verified locally with Node **24.19.0** and native SQLite **3.53.3**. No dependencies were installed and no business database or external service was used. These tests verify selected calendar, document projection, immutable provenance and SQLite persistence-guard contracts. They do not replace the private full-system acceptance suite.

An initial draft of the newly written date tests compared equivalent ISO timestamps with and without `.000`. Expectations were normalized to ISO format; no implementation module was changed. The complete focused rerun passed.

The four selected implementation modules are byte-identical to the private source snapshot `016275755d3ace68b93ced9d88fa88505aa39633`:

| Module | SHA-256 |
| --- | --- |
| `src/business_time.js` | `B4A669AF2952AD2BAC2F4F2DEFD49CFB351EC2998C9C69B3F298A53C2EE4B444` |
| `src/document_evidence.js` | `7E4308EC89319E7563C9E8C376003E13F107A3C959001E64065131A5E22DB39E` |
| `src/transaction_document.js` | `3CB0523B2BB8081E55AF298FFA81A6D8166C0806FF9756FF7735410D46C49A7C` |
| `web/business-time.js` | `45BAA8E9E4B757EBD1CADA2A565F36A9264CCD4FF52D14108AF51F81F54BC170` |

The SQL excerpt preserves the actual unique-index predicate and four journal guards from private `src/finance.js`; it is not the whole Finance schema. The reference files are unchanged source-derived integration specifications, with their private imports intentionally retained. They are named `.reference.js` rather than `.test.js` so the focused runner does not claim to execute them.

## Prior private full-application validation

The separate full application recorded **279 passing, 0 failing, 0 skipped** in the local run earlier on 11 October 2026 (107643.169 ms). That result predates this reduced repository; it is not a CI result or a claim that 279 tests run here. No production workflow or implementation file was changed during the publication-boundary correction.

The nine screenshots were captured from a fresh synthetic fixture. That fixture verified a KES 8,000 sale, zero browser errors and a balanced Balance Sheet: KES 78,000 assets = KES 1,103.45 liabilities + KES 76,896.55 equity. The credit-note form was prepared but not submitted. See [capture evidence](screenshots/capture-evidence.json); amounts there are integer cents.

The hosted tour's nine images, step navigation, keyboard navigation, numerical evidence and 390px mobile layout passed local browser checks. It is a static walkthrough, not a deployed till, public authentication bypass or external integration demonstration.
