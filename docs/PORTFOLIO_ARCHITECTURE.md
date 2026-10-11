# Portfolio architecture

Source snapshot prepared 11 October 2026. This describes implemented local behavior, not planned connector activation.

The full application described below is private. This public showcase contains only selected modules, a persistence-guard excerpt, focused runnable tests, reference integration specifications and safe screenshots. Private module filenames below describe architectural ownership; they are not promises that the complete module is published here.

## Boundaries

The browser calls explicit HTTP routes in `src/server.js`. `auth_policy.js` defines the method/path permission contract, `actor_context.js` supplies authoritative staff identity and `auth_fields.js` filters role-sensitive responses. Business endpoints remain private even before first-owner setup. Login, first-run setup, verification, recovery and revocation stay owned by Auth.

Sales, Stock, Finance, Operations, Customer Communication, Settings and Notifications are domain modules in one Node.js application using SQLite. Settings govern future behavior and must not rewrite frozen transaction evidence. Notification attention state is separate from source resolution. Receipt delivery requests and promotional consent are separate from payment evidence.

## Transaction integrity

The existing explicit sale-completion workflow commits commercial evidence and stock once. Finance captures an immutable source identity and uses its same draft/journal during recovery. Domain checks, transactional posting and persistence uniqueness guards prevent a second authoritative posting for that source. A closed period can leave an already-completed commercial sale with blocked accounting; recovery does not duplicate the commercial transaction, stock or payment evidence.

Retail Accounting links cost evidence, inventory reduction, COGS, credit/return effects and explicit refund records. The financial statements expose their totals and source coverage. Untransferred accumulated earnings are represented in Balance Sheet equity; actual transfers to equity do not get counted again. Period closure is a lock, not a fabricated retained-earnings journal. An unbalanced statement is disclosed and cannot be saved as a healthy new financial snapshot.

UTC remains the technical timestamp representation. `web/business-time.js`, re-exported by `src/business_time.js`, supplies the shared Africa/Nairobi calendar contract for operational and financial reporting.

## Documents and tests

Durable issuance freezes business/economic evidence. `document_evidence.js` separates that canonical snapshot from legitimate renderer presentation metadata and gives exports an explicit schema/version. Python/ReportLab produces PDFs; pypdf-backed assertions compare actual printed values and dates with domain calculations rather than only checking file existence.

The preserved Golden Transaction and financial regressions jointly cover sale, stock, split allocation, cost/COGS, accounting, statements, PDF output, credits, recovery and restart. Security and UI contract tests cover permissions, account lifecycle, staff guidance, checkout consent and QR scanning.

## Integration status

This copy has no active KRA/eTIMS, OSCU/VSCU, Daraja or SMS connection. It demonstrates internal integration boundaries and local simulations. Recorded MOBILE_MONEY/CARD allocations do not establish external settlement. The repository contains no claim of live fiscal issuance, automated marketing delivery or autonomous AI operation.
