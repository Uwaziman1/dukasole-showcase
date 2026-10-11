// Renderer metadata is explicit and versioned, outside immutable issuance data.
import assert from 'node:assert/strict';
import { documentMeaning } from './transaction_document.js';
import { businessDisplay } from './business_time.js';
export const DOCUMENT_EXPORT_SCHEMA='DUKASOLE_DOCUMENT_EXPORT';
export const DOCUMENT_EXPORT_VERSION=1;
export function canonicalDocumentSnapshot(value){
  if(value?.schema===DOCUMENT_EXPORT_SCHEMA){assert.equal(value.schemaVersion,DOCUMENT_EXPORT_VERSION,'Unsupported document export schema');return canonicalDocumentSnapshot(value.businessEvidence);}
  const {documentPresentation,businessTime,...businessEvidence}=value;
  return structuredClone(businessEvidence);
}
export function documentExport(value){return {schema:DOCUMENT_EXPORT_SCHEMA,schemaVersion:DOCUMENT_EXPORT_VERSION,businessEvidence:canonicalDocumentSnapshot(value),presentation:{documentPresentation:value.documentPresentation||documentMeaning(value),businessTime:businessDisplay(value.timestamp)}};}
export function exportedDocumentModel(value){
  if(value?.schema!==DOCUMENT_EXPORT_SCHEMA)return value;
  assert.equal(value.schemaVersion,DOCUMENT_EXPORT_VERSION,'Unsupported document export schema');
  return {...value.businessEvidence,...value.presentation};
}
export function assertDocumentProvenance(exported,persisted){
  const model=exportedDocumentModel(exported);
  assert.deepEqual(canonicalDocumentSnapshot(model),canonicalDocumentSnapshot(persisted),'Immutable business document evidence differs from persisted issuance');
  if(model.businessTime)assert.deepEqual(model.businessTime,businessDisplay(model.timestamp),'Business-date presentation differs from the authoritative timezone');
  if(model.documentPresentation){
    const p=model.documentPresentation,expected=documentMeaning(model,['RECEIPT','TAX_INVOICE'].includes(p.kind)?p.kind:null);
    for(const key of ['kind','title','purpose','copy','training','proforma','credit','payment','creditAmount','fiscal'])assert.deepEqual(p[key],expected[key],`Invalid document presentation: ${key}`);
  }
  return canonicalDocumentSnapshot(model);
}
