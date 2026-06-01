-- ─── Fix: default profile_type da BOTH a PERSONAL ───────────────────────────
-- Il trigger di registrazione creava profili con profile_type = 'BOTH',
-- rendendo tutti gli utenti "freelance" per default prima che l'onboarding
-- salvasse il tipo corretto. Questo causava la visibilità del Freelance Hub
-- e degli step fatture per utenti "Solo personale".

-- 1. Aggiorna il trigger con il default corretto
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, currency, profile_type, tax_regime, vat_threshold, ateco_coefficient)
  VALUES (
    NEW.id,
    '',
    'EUR',
    'PERSONAL',          -- era 'BOTH' — corretto a 'PERSONAL'
    'FORFETTARIO_15',
    85000,
    0.78
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Correggi i profili esistenti che non hanno mai completato l'onboarding
--    (name = '' significa che l'onboarding non è stato completato)
UPDATE public.profiles
SET profile_type = 'PERSONAL'
WHERE name = ''
  AND profile_type = 'BOTH';

-- Nota: i profili con name != '' hanno già salvato il tipo scelto dall'utente —
-- non toccarli.
