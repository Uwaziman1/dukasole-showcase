import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE accounting_journal_entries(id TEXT PRIMARY KEY,source_accounting_event_id TEXT,reversal_of_journal_entry_id TEXT,status TEXT,accounting_date TEXT,amount INTEGER)');
  db.exec(readFileSync(new URL('../samples/accounting-source-guard.sql', import.meta.url), 'utf8'));
  return db;
}
test('persistence refuses a second authoritative KES 116 posting for one source', () => {
  const db = fixture();
  try {
    const insert = db.prepare('INSERT INTO accounting_journal_entries VALUES(?,?,?,?,?,?)');
    insert.run('journal-one', 'sale-source', null, 'POSTED', '2026-10-02', 11600);
    for (let i = 0; i < 3; i++) assert.throws(() => insert.run(`duplicate-${i}`, 'sale-source', null, 'POSTED', '2026-10-02', 11600), /ACCOUNTING_SOURCE_ALREADY_POSTED/);
    const result = db.prepare("SELECT COUNT(*) count,SUM(amount) amount FROM accounting_journal_entries WHERE reversal_of_journal_entry_id IS NULL AND status IN ('POSTED','REVERSED')").get();
    assert.equal(result.count, 1); assert.equal(result.amount, 11600);
  } finally { db.close(); }
});
test('a leftover draft cannot post after that source has recovered', () => {
  const db = fixture();
  try {
    const insert = db.prepare('INSERT INTO accounting_journal_entries VALUES(?,?,?,?,?,?)');
    insert.run('leftover-draft', 'sale-source', null, 'DRAFT', '2026-10-02', 11600);
    insert.run('recovered-journal', 'sale-source', null, 'POSTED', '2026-10-02', 11600);
    assert.throws(() => db.prepare("UPDATE accounting_journal_entries SET status='POSTED' WHERE id='leftover-draft'").run(), /ACCOUNTING_SOURCE_ALREADY_POSTED/);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM accounting_journal_entries WHERE status='POSTED'").get().count, 1);
  } finally { db.close(); }
});
test('reversal does not make the original source independently postable again', () => {
  const db = fixture();
  try {
    const insert = db.prepare('INSERT INTO accounting_journal_entries VALUES(?,?,?,?,?,?)');
    insert.run('original', 'sale-source', null, 'POSTED', '2026-10-02', 11600);
    db.prepare("UPDATE accounting_journal_entries SET status='REVERSED' WHERE id='original'").run();
    insert.run('reversal', 'sale-source', 'original', 'POSTED', '2026-10-02', -11600);
    assert.throws(() => insert.run('duplicate', 'sale-source', null, 'POSTED', '2026-10-02', 11600), /ACCOUNTING_SOURCE_ALREADY_POSTED/);
    assert.throws(() => db.prepare("UPDATE accounting_journal_entries SET source_accounting_event_id='different-source' WHERE id='original'").run(), /POSTED_SOURCE_IDENTITY_IMMUTABLE/);
    assert.throws(() => db.prepare("DELETE FROM accounting_journal_entries WHERE id='original'").run(), /POSTED_JOURNAL_IMMUTABLE/);
  } finally { db.close(); }
});
