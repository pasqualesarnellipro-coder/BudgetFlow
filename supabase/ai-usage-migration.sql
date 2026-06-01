-- Traccia l'utilizzo AI per utente/mese per rate limiting
CREATE TABLE IF NOT EXISTS ai_usage (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month      text NOT NULL,           -- formato "YYYY-MM"
  calls      integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, month)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Ogni utente vede solo i propri dati
CREATE POLICY "ai_usage_own" ON ai_usage
  FOR ALL USING (auth.uid() = user_id);

-- Service role può fare tutto (per l'edge function)
CREATE POLICY "ai_usage_service" ON ai_usage
  FOR ALL TO service_role USING (true);
