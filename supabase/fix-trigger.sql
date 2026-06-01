-- Fix trigger registrazione utente
-- Esegui su Supabase > SQL Editor > New query

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, currency, profile_type, tax_regime, vat_threshold, ateco_coefficient)
  VALUES (
    NEW.id,
    '',
    'EUR',
    'BOTH',
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
