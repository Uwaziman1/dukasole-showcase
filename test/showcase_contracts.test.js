import test from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESS_TIMEZONE, businessDate, businessDayStart, businessDayEnd, businessInterval, businessMonth, reportingBoundary } from '../src/business_time.js';
import { documentMeaning } from '../src/transaction_document.js';
import { canonicalDocumentSnapshot, documentExport, exportedDocumentModel, assertDocumentProvenance } from '../src/document_evidence.js';

const sample = () => ({ id: 'demo-receipt', relationshipId: 'demo-sale', number: 'NORMAL-DEMO-1', timestamp: '2026-10-01T21:30:00Z', type: 'NORMAL', label: 'NS', transactionType: 'SALE', buyerPin: 'TEST-BUYER-PIN', items: [{ variantId: 'demo-variant', quantity: 2, unitPrice: 400000, taxLabel: 'A', discountAmount: 0, stockMovementId: 'demo-stock' }], totals: { total: 800000, subtotal: 689655, tax: 110345, discount: 0 }, paymentAllocations: [{ id: 'demo-mobile', method: 'MOBILE_MONEY', amount: 480000 }, { id: 'demo-cash', method: 'CASH', amount: 320000 }], stockMovementId: 'demo-stock' });

test('shared business timezone is Africa/Nairobi, not a UTC date slice', () => {
  assert.equal(BUSINESS_TIMEZONE, 'Africa/Nairobi');
  assert.equal(businessDate('2026-10-01T22:30:00Z'), '2026-10-02');
});
for (const [before, after, first, second] of [
  ['2026-09-30T20:59:59Z', '2026-09-30T21:00:00Z', '2026-09-30', '2026-10-01'],
  ['2026-10-01T20:59:59Z', '2026-10-01T21:00:00Z', '2026-10-01', '2026-10-02'],
  ['2026-12-31T20:59:59Z', '2026-12-31T21:00:00Z', '2026-12-31', '2027-01-01']
]) test(`Nairobi midnight: ${first} to ${second}`, () => {
  assert.equal(businessDate(before), first); assert.equal(businessDate(after), second);
  assert.equal(businessDayStart(second), new Date(after).toISOString());
  assert.equal(new Date(Date.parse(businessDayEnd(first)) + 1).toISOString(), new Date(after).toISOString());
});
test('month and report intervals use the same business boundary contract', () => {
  const month = businessMonth('2026-10-11');
  assert.deepEqual(month, businessInterval('2026-10-01', '2026-10-31'));
  assert.equal(month.from, '2026-09-30T21:00:00.000Z');
  assert.equal(month.to, '2026-10-31T20:59:59.999Z');
  assert.equal(reportingBoundary('2026-10-01', false), month.from);
});
test('receipt versus invoice is a read-only projection of the same economics', () => {
  const receipt = sample(), before = structuredClone(receipt);
  const r = documentMeaning(receipt, 'RECEIPT'), invoice = documentMeaning(receipt, 'TAX_INVOICE');
  assert.equal(r.title, 'Receipt'); assert.equal(invoice.title, 'Tax Invoice');
  assert.equal(invoice.payment.received, 800000); assert.equal(invoice.payment.due, 0);
  assert.deepEqual(receipt, before);
  assert.ok(invoice.payment.note.includes('not proof of bank settlement'));
  assert.equal(invoice.fiscal.status, 'Not fiscally issued');
});
test('recorded credit allocation stays amount due, not money received', () => {
  const receipt = sample(); receipt.paymentAllocations = [{ method: 'CASH', amount: 300000 }, { method: 'CREDIT', amount: 500000 }];
  const p = documentMeaning(receipt);
  assert.equal(p.payment.received, 300000); assert.equal(p.payment.due, 500000);
  assert.equal(p.status, 'Part paid - amount due');
});
test('unknown payment methods do not manufacture settled payment evidence', () => {
  const receipt = sample(); receipt.paymentAllocations = [{ method: 'UNKNOWN', amount: 800000 }];
  const p = documentMeaning(receipt); assert.equal(p.payment.known, false); assert.equal(p.payment.received, null);
});
test('credit and copy meanings preserve linkage and do not imply a new sale/refund', () => {
  const credit = { ...sample(), transactionType: 'CREDIT_NOTE', originalReceiptNumber: 'NORMAL-DEMO-1', totals: { total: -400000 } };
  assert.equal(documentMeaning(credit).creditAmount, 400000);
  assert.ok(documentMeaning(credit).warning.includes('does not prove money was refunded'));
  const copy = { ...sample(), type: 'COPY', originalReceiptNumber: 'NORMAL-DEMO-1' };
  assert.equal(documentMeaning(copy).copy, true);
  assert.ok(documentMeaning(copy).warning.includes('No new sale'));
});
test('invalid document representation is rejected without mutating evidence', () => {
  const receipt = sample(), before = structuredClone(receipt);
  assert.throws(() => documentMeaning(receipt, 'INVENTED'), { code: 'INVALID_DOCUMENT_REPRESENTATION' });
  assert.deepEqual(receipt, before);
});
test('versioned sidecar retains canonical business evidence and Nairobi presentation', () => {
  const receipt = sample(), exported = documentExport(receipt);
  assert.equal(exported.schemaVersion, 1); assert.equal(exported.presentation.businessTime.businessDate, '2026-10-02');
  assert.deepEqual(assertDocumentProvenance(exported, receipt), receipt);
  assert.deepEqual(canonicalDocumentSnapshot(exportedDocumentModel(exported)), receipt);
});
test('legitimate receipt/invoice presentation does not drift canonical provenance', () => {
  const receipt = sample(), exported = documentExport(receipt);
  exported.presentation.documentPresentation = documentMeaning(receipt, 'TAX_INVOICE');
  assert.deepEqual(assertDocumentProvenance(exported, receipt), receipt);
  const snapshot = canonicalDocumentSnapshot(receipt); snapshot.items[0].quantity = 9;
  assert.equal(receipt.items[0].quantity, 2);
});
for (const [name, change] of [
  ['item identity', r => r.items[0].variantId = 'another-item'],
  ['quantity', r => r.items[0].quantity++],
  ['price', r => r.items[0].unitPrice++],
  ['tax', r => r.totals.tax++],
  ['discount', r => r.items[0].discountAmount++],
  ['buyer', r => r.buyerPin = 'ANOTHER-TEST-BUYER'],
  ['payment allocation', r => r.paymentAllocations[0].amount++],
  ['total', r => r.totals.total++],
  ['sale identity', r => r.relationshipId = 'different-sale'],
  ['credit linkage', r => r.originalReceiptId = 'different-original'],
  ['stock source', r => r.stockMovementId = 'different-stock-source']
]) test(`provenance rejects changed ${name}`, () => {
  const receipt = sample(), exported = documentExport(receipt); change(exported.businessEvidence);
  assert.throws(() => assertDocumentProvenance(exported, receipt), /Immutable business document evidence differs/);
});
test('unsupported export schema and incorrect business-date presentation fail closed', () => {
  const receipt = sample(), unsupported = documentExport(receipt); unsupported.schemaVersion = 99;
  assert.throws(() => canonicalDocumentSnapshot(unsupported), /Unsupported document export schema/);
  const wrongDate = documentExport(receipt); wrongDate.presentation.businessTime.businessDate = '2026-10-01';
  assert.throws(() => assertDocumentProvenance(wrongDate, receipt), /Business-date presentation differs/);
});
