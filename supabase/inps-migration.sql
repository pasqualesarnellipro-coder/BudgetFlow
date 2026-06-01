-- Add INPS regime fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS inps_regime text NOT NULL DEFAULT 'GESTIONE_SEPARATA'
    CHECK (inps_regime IN ('GESTIONE_SEPARATA', 'IVS_ARTIGIANI', 'IVS_COMMERCIANTI')),
  ADD COLUMN IF NOT EXISTS inps_reduction_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stipendio_annuo_lordo numeric NOT NULL DEFAULT 0;
