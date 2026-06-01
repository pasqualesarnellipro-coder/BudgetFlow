-- Aggiunge colonna fic_id alla tabella invoices per evitare duplicati durante la sync
-- Esegui su Supabase > SQL Editor > New query

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fic_id TEXT;
CREATE INDEX IF NOT EXISTS idx_invoices_fic_id ON invoices(fic_id);
