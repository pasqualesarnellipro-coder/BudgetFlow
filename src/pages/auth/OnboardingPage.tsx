import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { getSeedCategories } from '@/lib/seedCategories'
import { AtecoLookup } from '@/components/ui/AtecoLookup'
import type { ProfileType, TaxRegime } from '@/lib/database.types'
import type { InpsRegime } from '@/lib/fiscalePlanning'
import { InpsRegimeSelector } from '@/components/ui/InpsRegimeSelector'

const PROFILE_OPTIONS: { value: ProfileType; label: string; icon: string; desc: string }[] = [
  { value: 'PERSONAL', label: 'Privato', icon: '👤', desc: 'Gestisco solo le finanze personali — entrate, spese, risparmi e debiti' },
  { value: 'FREELANCE', label: 'Freelance / P.IVA', icon: '💼', desc: 'Ho una Partita IVA — voglio gestire fatture, tasse e soglia forfettaria' },
  { value: 'BOTH', label: 'Entrambi', icon: '⚡', desc: 'Ho sia finanze personali che una P.IVA attiva' },
]

const REGIME_OPTIONS: { value: TaxRegime; label: string; desc: string; rate: string }[] = [
  { value: 'FORFETTARIO_5', label: 'Forfettario 5%', desc: 'Regime agevolato per le prime attività (primi 5 anni)', rate: '5%' },
  { value: 'FORFETTARIO_15', label: 'Forfettario 15%', desc: 'Il regime forfettario standard più comune', rate: '15%' },
  { value: 'ORDINARIO', label: 'Regime Ordinario', desc: 'Per chi supera la soglia forfettaria o ha contabilità ordinaria', rate: '27%+' },
]

const STEPS = [
  { num: 1, label: 'Profilo' },
  { num: 2, label: 'Fisco' },
  { num: 3, label: 'Setup' },
]

interface OnboardingPageProps {
  userId: string
  /** Modalità modifica: precompila dal profilo esistente, non ricrea le categorie */
  editMode?: boolean
}

export function OnboardingPage({ userId, editMode = false }: OnboardingPageProps) {
  const { setProfile, profile: existingProfile } = useAppStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [profileType, setProfileType] = useState<ProfileType>(existingProfile?.profile_type ?? 'PERSONAL')
  const [taxRegime, setTaxRegime] = useState<TaxRegime>(existingProfile?.tax_regime ?? 'FORFETTARIO_15')
  const [vatThreshold, setVatThreshold] = useState(existingProfile?.vat_threshold ?? 85000)
  const [atecoCoefficient, setAtecoCoefficient] = useState(existingProfile?.ateco_coefficient ?? 0.78)
  const [inpsRegime, setInpsRegime] = useState<InpsRegime>(existingProfile?.inps_regime ?? 'GESTIONE_SEPARATA')
  const [stipendioAnnuoLordo, setStipendioAnnuoLordo] = useState(existingProfile?.stipendio_annuo_lordo ?? 0)
  const [name, setName] = useState(existingProfile?.name ?? '')
  const [currency, setCurrency] = useState(existingProfile?.currency ?? 'EUR')
  const [loading, setLoading] = useState(false)

  const isFreelance = profileType === 'FREELANCE' || profileType === 'BOTH'
  const totalSteps = isFreelance ? 3 : 2

  const handleFinish = async () => {
    setLoading(true)
    const profileData = {
      id: userId,
      name,
      currency,
      profile_type: profileType,
      tax_regime: taxRegime,
      vat_threshold: vatThreshold,
      ateco_coefficient: atecoCoefficient,
      inps_regime: inpsRegime,
      inps_reduction_pct: existingProfile?.inps_reduction_pct ?? 0,
      stipendio_annuo_lordo: profileType === 'BOTH' ? stipendioAnnuoLordo : 0,
    }

    await supabase.from('profiles').upsert(profileData)

    // In modalità creazione aggiungiamo le categorie di default
    if (!editMode) {
      const categories = getSeedCategories(profileType).map((c) => ({
        user_id: userId,
        ...c,
        active: true,
      }))
      await supabase.from('categories').insert(categories)
    }

    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data) setProfile(data)
    setLoading(false)
    navigate(editMode ? '/settings' : '/welcome')
  }

  const goNext = () => {
    if (step === 1) {
      setStep(isFreelance ? 2 : 3)
    } else {
      setStep(3)
    }
  }

  const goBack = () => {
    if (step === 3) setStep(isFreelance ? 2 : 1)
    else setStep(1)
  }

  return (
    <div className="min-h-screen bg-sidebar flex flex-col items-center justify-start py-8 px-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="bg-sidebar px-8 pt-8 pb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-income text-xl">📊</span>
            <span className="text-white font-bold text-lg">BudgetFlow</span>
          </div>
          <h1 className="text-white text-xl font-bold mb-1">
            {editMode ? 'Modifica profilo' : 'Configurazione iniziale'}
          </h1>
          <p className="text-white/60 text-sm">
            {editMode
              ? 'Aggiorna i tuoi dati. Le categorie esistenti non verranno modificate.'
              : 'Ci vogliono meno di 2 minuti. Puoi modificare tutto in seguito.'}
          </p>

          {/* Step indicators */}
          <div className="flex items-center gap-3 mt-5">
            {STEPS.filter((s) => s.num <= totalSteps || s.num === 3).slice(0, totalSteps).map((s, i) => (
              <div key={s.num} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === s.num ? 'bg-income text-white' :
                  step > s.num ? 'bg-white/30 text-white' :
                  'bg-white/10 text-white/40'
                }`}>
                  {step > s.num ? '✓' : s.num}
                </div>
                <span className={`text-xs ${step === s.num ? 'text-white font-medium' : 'text-white/40'}`}>{s.label}</span>
                {i < totalSteps - 1 && <div className="w-8 h-px bg-white/20 ml-1" />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6">

          {/* STEP 1 — Profilo */}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Chi sei?</h2>
              <p className="text-gray-500 text-sm mb-5">
                Scegli il profilo che meglio ti descrive. L'app mostrerà solo le funzioni che ti servono.
              </p>
              <div className="space-y-3 mb-6">
                {PROFILE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setProfileType(opt.value)}
                    className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                      profileType === opt.value
                        ? 'border-income bg-emerald-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-2xl mt-0.5">{opt.icon}</span>
                    <div>
                      <p className="font-semibold text-gray-900">{opt.label}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{opt.desc}</p>
                    </div>
                    {profileType === opt.value && (
                      <span className="ml-auto text-income text-lg">✓</span>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={goNext}
                className="w-full bg-income text-white font-semibold py-3 rounded-xl hover:bg-emerald-600 transition-colors"
              >
                Continua →
              </button>
            </div>
          )}

          {/* STEP 2 — Regime fiscale (solo freelance) */}
          {step === 2 && isFreelance && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Regime fiscale</h2>
              <p className="text-gray-500 text-sm mb-5">
                Questi dati vengono usati dal <strong>Nettometro</strong> per calcolare automaticamente tasse e INPS su ogni fattura che emetti.
              </p>

              <div className="space-y-3 mb-5">
                {REGIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTaxRegime(opt.value)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                      taxRegime === opt.value
                        ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                      taxRegime === opt.value ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {opt.rate}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{opt.label}</p>
                      <p className="text-sm text-gray-500">{opt.desc}</p>
                    </div>
                    {taxRegime === opt.value && <span className="text-indigo-500 text-lg">✓</span>}
                  </button>
                ))}
              </div>

              {/* INPS regime */}
              <div className="mb-5">
                <p className="text-sm font-semibold text-gray-700 mb-3">Regime INPS</p>
                <InpsRegimeSelector value={inpsRegime} onChange={setInpsRegime} />
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Parametri avanzati</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Soglia forfettaria annua (€)
                    <span className="ml-1 text-gray-400 text-xs">(default: 85.000€)</span>
                  </label>
                  <input
                    type="number"
                    value={vatThreshold}
                    onChange={(e) => setVatThreshold(+e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <p className="text-xs text-gray-400 mt-1">Importo massimo di fatturato annuo nel regime forfettario</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Coefficiente ATECO
                  </label>
                  {/* Lookup guidato */}
                  <div className="mb-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                    <p className="text-xs text-indigo-700 font-medium mb-2">
                      Selezionato: <strong>{Math.round(atecoCoefficient * 100)}%</strong>
                      {' '}— non sai qual è il tuo? Cercalo qui sotto 👇
                    </p>
                    <AtecoLookup
                      currentCoefficient={atecoCoefficient}
                      onSelect={(coeff) => setAtecoCoefficient(coeff)}
                    />
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={atecoCoefficient}
                    onChange={(e) => setAtecoCoefficient(+e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <p className="text-xs text-gray-400 mt-1">Oppure inseriscilo manualmente se lo conosci già (es. 0,78)</p>
                </div>
              </div>

              {/* Stipendio dipendente — solo per BOTH */}
              {profileType === 'BOTH' && (
                <div className="mb-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Stipendio da lavoro dipendente</p>

                  {/* Input RAL */}
                  <div className="relative mb-3">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">€</span>
                    <input
                      type="number"
                      value={stipendioAnnuoLordo || ''}
                      onChange={(e) => setStipendioAnnuoLordo(+e.target.value)}
                      placeholder="Es. 24.000"
                      className="w-full border border-gray-300 rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>

                  {/* Dove lo trovo */}
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5 space-y-2.5">
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Dove trovo la RAL?</p>
                    <div className="space-y-2">
                      {[
                        {
                          label: 'Busta paga',
                          detail: 'Guarda la voce "Retribuzione annua lorda" o "RAL" — di solito in alto o nel riepilogo annuale.',
                        },
                        {
                          label: 'Contratto di lavoro',
                          detail: 'È scritta nell\'offerta/contratto che hai firmato. Cerca "retribuzione lorda annua" o "RAL".',
                        },
                        {
                          label: 'CU (Certificazione Unica)',
                          detail: 'Il documento fiscale che ricevi ogni marzo dal tuo datore di lavoro. Casella 1 = reddito lavoro dipendente.',
                        },
                        {
                          label: 'Dichiarazione dei redditi',
                          detail: 'Nel 730 o Modello Redditi, quadro RC, trovi il totale dei redditi da lavoro dipendente.',
                        },
                      ].map(({ label, detail }) => (
                        <div key={label} className="flex gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-amber-800">{label}</p>
                            <p className="text-xs text-amber-600 leading-relaxed">{detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-amber-500 pt-1 border-t border-amber-100">
                      Non sei sicuro? Puoi inserire una stima e aggiornarlo in seguito dalle Impostazioni.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={goBack} className="flex-1 border border-gray-300 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50">
                  ← Indietro
                </button>
                <button onClick={() => setStep(3)} className="flex-1 bg-indigo-500 text-white font-semibold py-3 rounded-xl hover:bg-indigo-600">
                  Continua →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Setup base */}
          {step === 3 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Quasi fatto</h2>
              <p className="text-gray-500 text-sm mb-5">
                Inserisci il tuo nome e la valuta. Creeremo automaticamente tutte le categorie di partenza per te.
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Come ti chiami?</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Es. Pasquale"
                    autoFocus
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-income/50 focus:border-income"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valuta principale</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-income/50 focus:border-income"
                  >
                    <option value="EUR">🇪🇺 EUR — Euro</option>
                    <option value="USD">🇺🇸 USD — Dollaro americano</option>
                    <option value="GBP">🇬🇧 GBP — Sterlina inglese</option>
                    <option value="CHF">🇨🇭 CHF — Franco svizzero</option>
                  </select>
                </div>
              </div>

              {/* Riepilogo */}
              <div className="bg-gray-50 rounded-xl p-4 mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Riepilogo configurazione</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Profilo</span>
                    <span className="font-medium text-gray-800">
                      {profileType === 'PERSONAL' ? '👤 Privato' : profileType === 'FREELANCE' ? '💼 Freelance' : '⚡ Entrambi'}
                    </span>
                  </div>
                  {isFreelance && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Regime fiscale</span>
                      <span className="font-medium text-gray-800">{taxRegime.replace('_', ' ')}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Categorie create</span>
                    <span className="font-medium text-emerald-600">✓ Auto-generate</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={goBack} className="flex-1 border border-gray-300 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50">
                  ← Indietro
                </button>
                <button
                  onClick={handleFinish}
                  disabled={!name.trim() || loading}
                  className="flex-1 bg-income text-white font-semibold py-3 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  {loading
                    ? 'Salvataggio...'
                    : editMode
                    ? '✓ Salva modifiche'
                    : '🚀 Entra in BudgetFlow'
                  }
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
