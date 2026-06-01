-- Migrazione: rende gli obiettivi di risparmio completamente personalizzabili
-- Esegui su Supabase SQL Editor

ALTER TABLE saving_goals
  ADD COLUMN IF NOT EXISTS name        text         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS icon        text         NOT NULL DEFAULT '🎯',
  ADD COLUMN IF NOT EXISTS color       text         NOT NULL DEFAULT '#f59e0b',
  ADD COLUMN IF NOT EXISTS current_amount numeric    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deadline    date         NULL;

-- category_id diventa opzionale
ALTER TABLE saving_goals
  ALTER COLUMN category_id DROP NOT NULL;
