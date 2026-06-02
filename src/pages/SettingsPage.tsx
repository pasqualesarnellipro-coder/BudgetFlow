import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { FICConnect } from '@/components/fic/FICConnect'
import { useNavigate } from 'react-router-dom'
import type { TaxRegime, ProfileType } from '@/lib/database.types'
import type { InpsRegime } from '@/lib/fiscalePlanning'
import { InpsRegimeSelector } from '@/components/ui/InpsRegimeSelector'
import type { Language } from '@/lib/i18n'
import { HelpTooltip } from '@/components/ui/HelpTooltip'
import { AtecoLookup } from '@/components/ui/AtecoLookup'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { getSeedCategories } from '@/lib/seedCategories'

export function SettingsPage() {
  const { profile, setProfile, language, setLanguage, t } = useAppStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [reclassifyResult, setReclassifyResult] = useState<string | null>(null)
  const [reclassifyLoading, setReclassifyLoading] = useState(false)
  const [seedCatsResult, setSeedCatsResult] = useState<string | null>(null)
  const [seedCatsLoading, setSeedCatsLoading] = useState(false)

  if (!profile) return null

  const [form, setForm] = useState({ ...profile })

  const handleSave = async (field: Partial<typeof profile>) => {
    const updated = { ...form, ...field }
    setForm(updated)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from('profiles').update(field as any).eq('id', profile.id)
    setProfile(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isFreelance = form.profile_type === 'FREELANCE' || form.profile_type === 'BOTH'

  const reclassifyTransactions = async () => {
    if (!profile) return
    setReclassifyLoading(true)
    setReclassifyResult(null)
    const { data: cats } = await supabase.from('categories').select('id, type').eq('user_id', profile.id)
    const debtSavingsCatIds = (cats ?? [])
      .filter((c: { id: string; type: string }) => c.type === 'DEBTS' || c.type === 'SAVINGS')
      .map((c: { id: string }) => c.id)
    if (debtSavingsCatIds.length === 0) {
      setReclassifyResult('0 transazioni aggiornate')
      setReclassifyLoading(false)
      return
    }
    const { data: txs } = await supabase
      .from('transactions')
      .select('id, category_id, type')
      .eq('user_id', profile.id)
      .eq('type', 'EXPENSES')
      .in('category_id', debtSavingsCatIds)
    if (!txs || txs.length === 0) {
      setReclassifyResult('0 transazioni aggiornate')
      setReclassifyLoading(false)
      return
    }
    const catTypeMap = Object.fromEntries(
      (cats ?? []).map((c: { id: string; type: string }) => [c.id, c.type])
    )
    let count = 0
    for (const tx of txs) {
      const correctType = catTypeMap[tx.category_id] as string
      if (correctType === 'DEBTS' || correctType === 'SAVINGS') {
        await supabase.from('transactions').update({ type: correctType }).eq('id', tx.id)
        count++
      }
    }
    qc.invalidateQueries({ queryKey: ['transactions'] })
    setReclassifyResult(`${count} transazioni aggiornate`)
    setReclassifyLoading(false)
  }

  const seedMissingCategories = async () => {
    if (!profile) return
    setSeedCatsLoading(true)
    setSeedCatsResult(null)
    const { data: existing } = await supabase.from('categories').select('name').eq('user_id', profile.id)
    const existingNames = new Set((existing ?? []).map((c: { name: string }) => c.name.toLowerCase()))
    const allSeed = getSeedCategories(profile.profile_type ?? 'PERSONAL')
    const toInsert = allSeed.filter((c) => !existingNames.has(c.name.toLowerCase()))
    if (toInsert.length === 0) {
      setSeedCatsResult('0 categorie aggiunte (già tutte presenti)')
      setSeedCatsLoading(false)
      return
    }
    await supabase.from('categories').insert(
      toInsert.map((c) => ({ user_id: profile.id, name: c.name, icon: c.icon, type: c.type, active: true }))
    )
    qc.invalidateQueries({ queryKey: ['categories'] })
    setSeedCatsResult(`${toInsert.length} categorie aggiunte`)
    setSeedCatsLoading(false)
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Impostazioni</h1>
        {saved && <span className="text-sm text-emerald-600 font-medium">✓ Salvato</span>}
      </div>

      {/* Banner modifica profilo guidata */}
      <div className="bg-sidebar rounded-2xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <RefreshCw size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Riconfigura il tuo profilo</p>
            <p className="text-white/60 text-xs mt-0.5">Rivedi tipo di account, regime fiscale, ATECO e INPS passo per passo</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/profile-setup')}
          className="shrink-0 bg-white text-sidebar font-semibold text-sm px-4 py-2 rounded-xl hover:bg-white/90 transition-colors"
        >
          Avvia wizard →
        </button>
      </div>

      {/* Lingua */}
      <Card title={t('settings_language')}>
        <div className="flex gap-2">
          {([
            { code: 'it', flag: '🇮🇹', label: 'Italiano' },
            { code: 'en', flag: '🇬🇧', label: 'English' },
          ] as { code: Language; flag: string; label: string }[]).map((lang) => (
            <button
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                language === lang.code
                  ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-300'
                  : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-lg">{lang.flag}</span>
              {lang.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">La lingua si applica a tutta l'interfaccia dell'app.</p>
      </Card>

      <Card title={t('settings_name')}>
        <div className="flex gap-3">
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-income/50 bg-white dark:bg-gray-700 dark:text-gray-100" />
          <button onClick={() => handleSave({ name: form.name })} className="bg-income text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">Salva</button>
        </div>
      </Card>

      <Card title="Valuta">
        <div className="flex gap-3">
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-income/50 bg-white dark:bg-gray-700 dark:text-gray-100">
            <option value="EUR">EUR — Euro</option>
            <option value="USD">USD — Dollaro</option>
            <option value="GBP">GBP — Sterlina</option>
            <option value="CHF">CHF — Franco Svizzero</option>
          </select>
          <button onClick={() => handleSave({ currency: form.currency })} className="bg-income text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">Salva</button>
        </div>
      </Card>

      <Card
        title="Profilo"
        help="Scegli 'Solo personale' per le finanze private. 'Freelance / P.IVA' attiva il Freelance Hub. 'Entrambi' è per chi ha sia una P.IVA che un contratto da dipendente (es. part-time + libero professionista)."
      >
        <div className="flex gap-2 flex-wrap">
          {([
            { value: 'PERSONAL',  label: '👤 Solo personale' },
            { value: 'FREELANCE', label: '💼 Freelance / P.IVA' },
            { value: 'BOTH',      label: '🔄 Entrambi' },
          ] as { value: ProfileType; label: string }[]).map((p) => (
            <button key={p.value} onClick={() => handleSave({ profile_type: p.value })}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${form.profile_type === p.value ? 'bg-income border-income text-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      {isFreelance && (
        <>
          <Card
            title="Regime Fiscale"
            help="Forfettario 5%: primo anno di attività o subentro. Forfettario 15%: regime standard agevolato. Ordinario: superi la soglia forfettaria o hai scelto il regime ordinario. Influisce direttamente sul calcolo del Nettometro."
          >
            <div className="flex gap-2 flex-wrap">
              {([
                { value: 'FORFETTARIO_5',  label: 'Forfettario 5%' },
                { value: 'FORFETTARIO_15', label: 'Forfettario 15%' },
                { value: 'ORDINARIO',      label: 'Ordinario' },
              ] as { value: TaxRegime; label: string }[]).map((r) => (
                <button key={r.value} onClick={() => handleSave({ tax_regime: r.value })}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${form.tax_regime === r.value ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Soglia Forfettaria (€)" help="Dal 2024 la soglia del regime forfettario è 85.000€. Se sei nel primo anno o hai accordi diversi, adattala qui. Viene usata per calcolare la barra di avanzamento nella dashboard.">
            <div className="flex gap-3">
              <input type="number" value={form.vat_threshold} onChange={(e) => setForm({ ...form, vat_threshold: +e.target.value })}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={() => handleSave({ vat_threshold: form.vat_threshold })} className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-600">Salva</button>
            </div>
          </Card>

          <Card
            title="Regime INPS"
            help="Il regime INPS determina quanto paghi di contributi previdenziali. Influisce sul calcolo RataPilota nella Pianificazione Fiscale."
          >
            <InpsRegimeSelector
              value={(form.inps_regime ?? 'GESTIONE_SEPARATA') as InpsRegime}
              onChange={(v) => handleSave({ inps_regime: v })}
            />
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Riduzione contributi % <span className="text-gray-400">(es. 35% per agevolazione primi anni)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number" min="0" max="100" step="1"
                  value={form.inps_reduction_pct ?? 0}
                  onChange={(e) => setForm({ ...form, inps_reduction_pct: +e.target.value })}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="0"
                />
                <button onClick={() => handleSave({ inps_reduction_pct: form.inps_reduction_pct })}
                  className="bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-violet-600">
                  Salva
                </button>
              </div>
            </div>
          </Card>

          <Card title="Coefficiente ATECO" help="Il coefficiente di redditività ATECO determina l'imponibile fiscale sul quale vengono calcolate tasse e INPS. Ogni categoria di attività ha il suo coefficiente stabilito per legge.">
            {/* Valore attuale */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Coefficiente attuale</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-indigo-600">
                    {Math.round((form.ateco_coefficient ?? 0) * 100)}%
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    ({form.ateco_coefficient ?? 0})
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 dark:text-gray-500">Imponibile su</p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">€ 10.000 lordi</p>
                <p className="text-xs text-indigo-600 font-medium">
                  = € {((form.ateco_coefficient ?? 0) * 10000).toLocaleString('it-IT')} imponibile
                </p>
              </div>
            </div>

            {/* Lookup ATECO */}
            <div className="mb-3">
              <AtecoLookup
                currentCoefficient={form.ateco_coefficient ?? 0.78}
                onSelect={(coeff) => {
                  setForm({ ...form, ateco_coefficient: coeff })
                  handleSave({ ateco_coefficient: coeff })
                }}
              />
            </div>

            {/* Oppure inserisci manualmente */}
            <details className="group">
              <summary className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer list-none flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform inline-block">›</span>
                Inserisci manualmente
              </summary>
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  placeholder="0.78"
                  value={form.ateco_coefficient}
                  onChange={(e) => setForm({ ...form, ateco_coefficient: +e.target.value })}
                  className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-700 dark:text-gray-100"
                />
                <button
                  onClick={() => handleSave({ ateco_coefficient: form.ateco_coefficient })}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700"
                >
                  Salva
                </button>
              </div>
            </details>
          </Card>
        </>
      )}

      {/* Caso ibrido: dipendente + P.IVA */}
      {form.profile_type === 'BOTH' && (
        <Card
          title="Reddito da lavoro dipendente"
          help="Se hai anche un contratto da dipendente (a tempo pieno o part-time), inserisci il tuo stipendio annuo lordo. BudgetFlow lo usa per mostrare il tuo reddito totale reale nella pianificazione fiscale. Non cambia il calcolo forfettario P.IVA — quel reddito è già tassato alla fonte dal tuo datore di lavoro."
        >
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl p-3 mb-3">
            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
              Caso ibrido: hai sia un contratto da dipendente che una P.IVA.<br />
              <span className="font-normal text-amber-600">I due redditi sono tassati separatamente: il forfettario si applica solo ai proventi P.IVA, lo stipendio è già tassato con IRPEF e INPS alla fonte.</span>
            </p>
          </div>
          <div className="mb-3">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">€</span>
              <input
                type="number"
                value={form.stipendio_annuo_lordo ?? 0}
                onChange={(e) => setForm({ ...form, stipendio_annuo_lordo: +e.target.value })}
                placeholder="Es. 24000"
                className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Dove lo trovo */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl p-3.5 mb-3 space-y-2">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Dove trovo la RAL?</p>
            {[
              { label: 'Busta paga', detail: 'Voce "Retribuzione annua lorda" — di solito nel riepilogo annuale.' },
              { label: 'Contratto di lavoro', detail: 'Cerca "retribuzione lorda annua" o "RAL" nell\'offerta firmata.' },
              { label: 'CU (Certificazione Unica)', detail: 'Il documento che ricevi ogni marzo dal datore di lavoro. Casella 1.' },
            ].map(({ label, detail }) => (
              <div key={label} className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                <div>
                  <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">{label}</span>
                  <span className="text-xs text-amber-600 dark:text-amber-400 ml-1">{detail}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => handleSave({ stipendio_annuo_lordo: form.stipendio_annuo_lordo })}
            className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-600"
          >
            Salva
          </button>
        </Card>
      )}

      {isFreelance && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Integrazioni</h3>
          <FICConnect />
        </div>
      )}

      <Card title="Manutenzione dati">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">Riclassifica transazioni</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              Corregge le transazioni che usano categorie RISPARMI o DEBITI ma sono classificate come Spesa
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={reclassifyTransactions}
                disabled={reclassifyLoading}
                className="border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {reclassifyLoading ? 'In corso…' : 'Esegui riclassificazione'}
              </button>
              {reclassifyResult && <span className="text-sm text-emerald-600 font-medium">✓ {reclassifyResult}</span>}
            </div>
          </div>
          <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">Aggiungi categorie mancanti</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              Inserisce le categorie di default che non hai ancora nel tuo account
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={seedMissingCategories}
                disabled={seedCatsLoading}
                className="border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {seedCatsLoading ? 'In corso…' : 'Aggiungi categorie mancanti'}
              </button>
              {seedCatsResult && <span className="text-sm text-emerald-600 font-medium">✓ {seedCatsResult}</span>}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Sessione">
        <button onClick={() => supabase.auth.signOut()} className="bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-600">
          Disconnetti
        </button>
      </Card>
    </div>
  )
}

function Card({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
        {help && <HelpTooltip content={help} position="right" size="lg" />}
      </div>
      {children}
    </div>
  )
}
