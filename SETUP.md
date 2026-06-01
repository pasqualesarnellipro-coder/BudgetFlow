# BudgetFlow — Guida di Setup Completa

## Prerequisiti

- Node.js 18+
- Account Supabase (gratuito su supabase.com)
- Account Anthropic (per l'AI sulle fatture — opzionale)
- Git

---

## PARTE 1 — Supabase: crea il progetto

### 1. Crea il progetto su Supabase

1. Vai su **supabase.com → New project**
2. Scegli nome, password DB e regione (es. `eu-west-2` per Europa)
3. Aspetta ~2 minuti che il progetto si avvii

### 2. Esegui lo schema del database

1. Vai su **SQL Editor** nel pannello Supabase
2. Clicca **New query**
3. Copia il contenuto di `supabase/schema.sql` e incollalo
4. Clicca **Run** (▶)

### 3. Esegui le migrazioni aggiuntive (in ordine)

Nel SQL Editor, esegui questi file **uno alla volta** nell'ordine indicato:

```
1. supabase/goals-migration.sql
2. supabase/add-auto-generate.sql
3. supabase/inps-migration.sql
4. supabase/fic-migration.sql          (solo se usi Fatture in Cloud)
5. supabase/fic-invoice-column.sql     (solo se usi Fatture in Cloud)
```

Per ogni file: apri → copia → incolla nell'SQL Editor → Run.

### 4. Abilita l'autenticazione email

1. Vai su **Authentication → Providers**
2. Assicurati che **Email** sia abilitato
3. (Opzionale) Disabilita "Confirm email" per sviluppo locale

### 5. Copia le credenziali

1. Vai su **Settings → API**
2. Copia:
   - **Project URL** (es. `https://abcdefgh.supabase.co`)
   - **anon public key** (la chiave lunga che inizia con `eyJ...`)

---

## PARTE 2 — App React: installazione e avvio

### 6. Clona e installa le dipendenze

```bash
cd "Budget expert APP/BudgetFlow"
npm install
```

### 7. Crea il file .env

Crea un file `.env` nella cartella `BudgetFlow` con:

```env
VITE_SUPABASE_URL=https://TUO-PROGETTO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...la-tua-chiave-anon...
```

Sostituisci con i valori copiati al passo 5.

### 8. Avvia l'app in locale

```bash
npm run dev
```

Apri il browser su **http://localhost:5173**

---

## PARTE 3 — Primo accesso

### 9. Crea il tuo account

1. Nella schermata di login clicca **Registrati**
2. Inserisci email e password
3. Verifica l'email se richiesto

### 10. Completa l'onboarding (3 passaggi)

**Step 1 — Chi sei?**
- Scegli tra: Solo personale / Freelance P.IVA / Entrambi
- Se hai P.IVA scegli "Freelance" o "Entrambi"

**Step 2 — Regime fiscale** *(solo Freelance/Entrambi)*
- Scegli il regime (Forfettario 5%, 15% o Ordinario)
- Scegli il regime INPS:
  - **Gestione Separata** → consulenti, copywriter, sviluppatori
  - **IVS Artigiani** → idraulici, elettricisti, parrucchieri
  - **IVS Commercianti** → negozi, e-commerce
- Cerca il tuo coefficiente ATECO cliccando "Cerca per professione"
- Se hai anche un contratto dipendente (caso ibrido): inserisci la RAL

**Step 3 — Nome e valuta**
- Inserisci il tuo nome
- Scegli la valuta (default: EUR)
- Clicca **Entra in BudgetFlow** 🚀

---

## PARTE 4 — Funzione AI per le fatture (opzionale)

*Necessario solo per importare fatture da PDF/immagini con AI.*

### 11. Installa Supabase CLI

```bash
npm install -g supabase
```

### 12. Collega il progetto

```bash
supabase login
supabase link --project-ref TUO-PROJECT-REF
```

Il `project-ref` è la parte iniziale del tuo URL Supabase (es. `abcdefgh` da `https://abcdefgh.supabase.co`).

### 13. Ottieni la tua API key Anthropic

1. Vai su **console.anthropic.com**
2. Crea un account (se non ce l'hai)
3. Vai su **API Keys → Create Key**
4. Copia la chiave (inizia con `sk-ant-...`)

### 14. Aggiungi la variabile d'ambiente

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-la-tua-chiave
```

### 15. Deploy dell'edge function

```bash
supabase functions deploy extract-invoice
```

Verifica che il deploy sia andato a buon fine dal pannello Supabase → **Edge Functions**.

---

## PARTE 5 — Usare le funzionalità principali

### Importare transazioni bancarie (CSV/Excel/PDF)

1. Vai su **Transazioni**
2. Clicca il bottone **↑ Importa** (accanto ad "Aggiungi")
3. Trascina il file o clicca per selezionarlo
4. Verifica il mapping delle colonne (data, descrizione, importo)
5. Controlla l'anteprima e assegna le categorie
6. Clicca **Importa N transazioni**

**Come esportare dalla tua banca:**

| Banca | Percorso |
|---|---|
| Intesa Sanpaolo | Area personale → Movimenti → Esporta → CSV |
| UniCredit | Conto → Movimenti → Scarica → Excel |
| Fineco | Conto → Movimenti → Scarica → CSV |
| N26 | Conto → Estratto conto → Esporta CSV |
| Revolut | Conto → Estratti conto → CSV o Excel |
| PayPal | Attività → Estratto conto → CSV |

### Importare fatture con AI (Freelance Hub)

1. Vai su **Freelance Hub**
2. Nella sezione "Fatture Emesse" clicca **↑ Importa AI**
3. Trascina la fattura (PDF, foto, CSV, Excel)
4. Per PDF/immagini: Claude analizza automaticamente il documento
5. Verifica i dati estratti (cliente, data, importo, stato)
6. Modifica eventuali errori cliccando la matita ✏️
7. Clicca **Importa N fatture nel Hub**

### RataPilota — Pianificazione fiscale

1. Vai su **Freelance Hub** → sezione **RataPilota**
2. Inserisci le fatture emesse nell'anno
3. Leggi la **rata mensile da accantonare** in cima
4. Guarda il grafico: barre indigo (rata piatta) vs picchi arancioni (senza piano)
5. Controlla il calendario scadenze per le date esatte

---

## PARTE 6 — Build per produzione

### Deploy su Vercel (raccomandato)

```bash
npm run build        # build locale di verifica
```

Su Vercel:
1. Importa il repo GitHub
2. Framework: **Vite**
3. Build command: `npm run build`
4. Output directory: `dist`
5. Aggiungi le variabili d'ambiente:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

---

## Risoluzione problemi comuni

| Problema | Soluzione |
|---|---|
| Pagina bianca dopo login | Esegui tutte le migrazioni SQL in ordine |
| "Cannot read properties of null" | Ricarica la pagina — problema di caricamento profilo |
| Import AI non funziona | Verifica `ANTHROPIC_API_KEY` con `supabase secrets list` |
| Categorie non compaiono | Completa l'onboarding: vengono create in automatico |
| RataPilota mostra 0 | Aggiungi fatture nel Freelance Hub per l'anno selezionato |
