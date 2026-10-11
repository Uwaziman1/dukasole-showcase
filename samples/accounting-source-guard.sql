-- Selected persistence guard from the private src/finance.js, 11 October 2026.
-- This is an engineering excerpt, not the full Finance schema or posting path.
CREATE UNIQUE INDEX IF NOT EXISTS one_authoritative_journal_per_source
ON accounting_journal_entries(source_accounting_event_id)
WHERE source_accounting_event_id IS NOT NULL
  AND reversal_of_journal_entry_id IS NULL
  AND status IN ('POSTED','REVERSED');

CREATE TRIGGER IF NOT EXISTS one_source_post_insert BEFORE INSERT ON accounting_journal_entries
WHEN NEW.source_accounting_event_id IS NOT NULL AND NEW.reversal_of_journal_entry_id IS NULL AND NEW.status IN ('POSTED','REVERSED') AND EXISTS(SELECT 1 FROM accounting_journal_entries WHERE source_accounting_event_id=NEW.source_accounting_event_id AND reversal_of_journal_entry_id IS NULL AND status IN ('POSTED','REVERSED'))
BEGIN SELECT RAISE(ABORT,'ACCOUNTING_SOURCE_ALREADY_POSTED'); END;
CREATE TRIGGER IF NOT EXISTS one_source_post_update BEFORE UPDATE ON accounting_journal_entries
WHEN NEW.source_accounting_event_id IS NOT NULL AND NEW.reversal_of_journal_entry_id IS NULL AND NEW.status IN ('POSTED','REVERSED') AND EXISTS(SELECT 1 FROM accounting_journal_entries WHERE id!=NEW.id AND source_accounting_event_id=NEW.source_accounting_event_id AND reversal_of_journal_entry_id IS NULL AND status IN ('POSTED','REVERSED'))
BEGIN SELECT RAISE(ABORT,'ACCOUNTING_SOURCE_ALREADY_POSTED'); END;
CREATE TRIGGER IF NOT EXISTS posted_source_identity_immutable BEFORE UPDATE ON accounting_journal_entries
WHEN OLD.status IN ('POSTED','REVERSED') AND (NEW.source_accounting_event_id IS NOT OLD.source_accounting_event_id OR NEW.reversal_of_journal_entry_id IS NOT OLD.reversal_of_journal_entry_id OR NEW.accounting_date!=OLD.accounting_date OR NEW.status='DRAFT')
BEGIN SELECT RAISE(ABORT,'POSTED_SOURCE_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS posted_source_delete_guard BEFORE DELETE ON accounting_journal_entries WHEN OLD.status IN ('POSTED','REVERSED')
BEGIN SELECT RAISE(ABORT,'POSTED_JOURNAL_IMMUTABLE'); END;
