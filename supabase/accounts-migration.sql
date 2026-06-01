-- ─── Conti bancari ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  bank_name   text NOT NULL DEFAULT '',
  type        text NOT NULL DEFAULT 'CHECKING'
              CHECK (type IN ('CHECKING','SAVINGS','CREDIT_CARD','CASH','INVESTMENT','CRYPTO','OTHER')),
  color       text NOT NULL DEFAULT '#6366f1',
  icon        text NOT NULL DEFAULT '🏦',
  balance     numeric NOT NULL DEFAULT 0,
  currency    text NOT NULL DEFAULT 'EUR',
  is_default  boolean NOT NULL DEFAULT false,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_accounts_own" ON bank_accounts FOR ALL USING (auth.uid() = user_id);

-- ─── Collega le transazioni ai conti ─────────────────────────────────────────
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL;
