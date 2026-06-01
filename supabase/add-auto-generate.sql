-- Aggiunge la colonna auto_generate alla tabella recurring_bills
-- Da eseguire una sola volta su Supabase SQL Editor

ALTER TABLE recurring_bills
  ADD COLUMN IF NOT EXISTS auto_generate boolean NOT NULL DEFAULT true;
