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

  // Dipendente + P.IVA: aliquota GS agevolata al 24% (INPS Circ. 35/2025)
  // Corrisponde a inps_reduction_pct ≈ 8.5 (= 1 - 24/26.23)
  const INPS_DIPENDENTE_REDUCTION = Math.round((1 - 24 / 26.23) * 100 * 10) / 10  // ~8.5
  const existingReduction = existingProfile?.inps_reduction_pct ?? 0
  const [haDipendente, setHaDipendente] = useState(
    existingProfile?.profile_type === 'BOTH' && existingReduction > 0 && existingReduction <= 10
  )

  // Caso speciale: aliquota personalizzata (pensionato, cassa professionale, ecc.)
  const INPS_BASE: Record<InpsRegime, number> = { GESTIONE_SEPARATA: 26.23, IVS_ARTIGIANI: 24.00, IVS_COMMERCIANTI: 24.48 }
  const isCustom = existingReduction > 10  // >10% riduzione = custom (non standard dipendente)
  const [casoSpeciale, setCasoSpeciale] = useState(isCustom)
  const [customInpsAliquota, setCustomInpsAliquota] = useState(
    isCustom
      ? String(+(INPS_BASE[existingProfile?.inps_regime ?? 'GESTIONE_SEPARATA'] * (1 - existingReduction / 100)).toFixed(2))
      : ''
  )
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
      inps_reduction_pct: (() => {
        if (casoSpeciale && customInpsAliquota !== '') {
          const base = INPS_BASE[inpsRegime]
          const custom = parseFloat(customInpsAliquota)
          if (!isNaN(custom) && custom === 0) return 100
          if (!isNaN(custom) && custom > 0 && custom < base) {
            return Math.round((1 - custom / base) * 100 * 10) / 10
          }
        }
        // Dipendente + P.IVA: aliquota GS agevolata 24% (non 26.23%)
        // Fonte: INPS Circ. 35/2025, art. 2 c.26 L. 335/95
        if (profileType === 'BOTH' && haDipendente && !casoSpeciale) return INPS_DIPENDENTE_REDUCTION
        return 0
      })(),
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
    setLoading(false)
    if (editMode) {
      if (data) setProfile(data)
      navigate('/settings')
    } else {
      // Naviga prima (AuthGate monta AppLayout), poi setta il profilo nello store.
      // In questo ordine WelcomePage viene mostrata correttamente invece di
      // venire saltata dal re-render di AuthGate che smonterebbe OnboardingPage.
      navigate('/welcome')
      if (data) setProfile(data)
    }
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
    <div className="min-h-screen bg-sidebar flex flex-col items-center justify-start py-8 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">

        {/* Header — nascosto al riepilogo finale */}
        <div className={`bg-sidebar px-8 pt-8 pb-6 ${step === 4 ? 'hidden' : ''}`}>
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

          {/* STEP 2 — Fisco */}
          {step === 2 && isFreelance && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-0.5">Come fatturi?</h2>
                <p className="text-gray-400 text-sm">Scegli il tuo regime fiscale — il Nettometro calcolerà tasse e accantonamenti automaticamente.</p>
              </div>

              {/* ── 1. REGIME FISCALE ─────────────────────────────── */}
              <div className="grid grid-cols-3 gap-2">
                {REGIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTaxRegime(opt.value)}
                    className={`flex flex-col items-center gap-1.5 p-3.5 rounded-2xl border-2 transition-all text-center ${
                      taxRegime === opt.value
                        ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                        : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`text-2xl font-black ${taxRegime === opt.value ? 'text-indigo-600' : 'text-gray-400'}`}>
                      {opt.rate}
                    </span>
                    <p className={`text-xs font-semibold leading-tight ${taxRegime === opt.value ? 'text-indigo-700' : 'text-gray-600'}`}>
                      {opt.label}
                    </p>
                    <p className="text-[10px] text-gray-400 leading-tight">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* ── 2. SITUAZIONE INPS ───────────────────────────── */}
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">Qual è la tua situazione previdenziale?</p>
                <p className="text-xs text-gray-400 mb-3">Scegli quella che ti descrive meglio — influenza il calcolo INPS sulla P.IVA.</p>

                {profileType === 'BOTH' ? (
                  /* BOTH: 3 scelte chiare */
                  <div className="space-y-2">
                    {[
                      {
                        id: 'dipendente',
                        icon: '💼',
                        title: 'Ho la busta paga',
                        sub: 'Sono dipendente — il mio datore versa l\'INPS',
                        badge: '24% INPS P.IVA',
                        badgeColor: 'bg-violet-100 text-violet-700',
                        active: haDipendente && !casoSpeciale,
                        onSelect: () => { setHaDipendente(true); setCasoSpeciale(false) },
                      },
                      {
                        id: 'speciale',
                        icon: '🏛️',
                        title: 'Caso speciale',
                        sub: 'Cassa professionale, pensionato o aliquota diversa',
                        badge: 'personalizzato',
                        badgeColor: 'bg-orange-100 text-orange-700',
                        active: casoSpeciale,
                        onSelect: () => { setCasoSpeciale(true); setHaDipendente(false) },
                      },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={opt.onSelect}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all ${
                          opt.active
                            ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-2xl shrink-0">{opt.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${opt.active ? 'text-indigo-700' : 'text-gray-800'}`}>{opt.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{opt.sub}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${opt.badgeColor}`}>
                          {opt.badge}
                        </span>
                        {opt.active && <span className="text-indigo-500 font-bold shrink-0">✓</span>}
                      </button>
                    ))}
                  </div>
                ) : (
                  /* FREELANCE puro: selettore INPS standard */
                  <InpsRegimeSelector value={inpsRegime} onChange={setInpsRegime} />
                )}

                {/* Input aliquota custom — solo se caso speciale */}
                {casoSpeciale && (
                  <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-orange-800 mb-3">Qual è la tua aliquota INPS effettiva?</p>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {[
                        { label: '0%', sub: 'Cassa professionale', val: '0' },
                        { label: '24%', sub: 'Pensionato', val: '24' },
                        { label: '26.23%', sub: 'Standard', val: '26.23' },
                      ].map((p) => (
                        <button
                          key={p.val}
                          type="button"
                          onClick={() => setCustomInpsAliquota(p.val)}
                          className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                            customInpsAliquota === p.val
                              ? 'border-orange-400 bg-orange-100'
                              : 'border-orange-200 hover:border-orange-300 bg-white'
                          }`}
                        >
                          <p className="text-sm font-bold text-orange-800">{p.label}</p>
                          <p className="text-[10px] text-orange-500 mt-0.5">{p.sub}</p>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Altro:</span>
                      <div className="relative flex-1">
                        <input
                          type="number" step="0.01" min="0" max="100"
                          value={customInpsAliquota}
                          onChange={(e) => setCustomInpsAliquota(e.target.value)}
                          placeholder="inserisci %"
                          className="w-full border border-orange-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 pr-7"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-orange-400 mt-2">Verifica con il tuo commercialista.</p>
                  </div>
                )}
              </div>

              {/* ── 3. CODICE ATECO ──────────────────────────────── */}
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-1">Qual è il tuo codice ATECO?</p>
                <p className="text-xs text-gray-400 mb-3">Determina la % di imponibile fiscale sul tuo fatturato. Cerca la tua attività qui sotto.</p>
                <AtecoLookup
                  currentCoefficient={atecoCoefficient}
                  onSelect={(coeff) => setAtecoCoefficient(coeff)}
                />
                {/* Conferma visiva */}
                <div className="mt-3 flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5">
                  <span className="text-xs text-indigo-600">Coefficiente selezionato</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-indigo-700">{Math.round(atecoCoefficient * 100)}%</span>
                    <button
                      type="button"
                      onClick={() => {
                        const v = prompt('Inserisci il coefficiente ATECO (es. 0.78 per 78%):')
                        if (v && !isNaN(parseFloat(v))) setAtecoCoefficient(parseFloat(v))
                      }}
                      className="text-xs text-indigo-400 hover:text-indigo-600 underline"
                    >
                      modifica
                    </button>
                  </div>
                </div>
              </div>

              {/* ── 4. RAL DIPENDENTE (solo BOTH) ────────────────── */}
              {profileType === 'BOTH' && (
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-1">Quanto guadagni come dipendente?</p>
                  <p className="text-xs text-gray-400 mb-3">
                    Inserisci la tua RAL (Retribuzione Annua Lorda) — la trovi nella busta paga o nel contratto.
                    <span className="text-indigo-500"> Puoi saltare e inserirla dopo.</span>
                  </p>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">€</span>
                    <input
                      type="number"
                      value={stipendioAnnuoLordo || ''}
                      onChange={(e) => setStipendioAnnuoLordo(+e.target.value)}
                      placeholder="Es. 17.000 — lascia vuoto se non lo sai"
                      className="w-full border border-gray-300 rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                    />
                  </div>
                </div>
              )}

              {/* ── IMPOSTAZIONI AVANZATE (collassabili) ─────────── */}
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-xs text-gray-400 hover:text-gray-600 list-none select-none">
                  <span className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center text-[10px] group-open:rotate-90 transition-transform">▶</span>
                  Impostazioni avanzate (soglia forfettaria)
                </summary>
                <div className="mt-3 bg-gray-50 rounded-xl p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Soglia forfettaria annua (€)
                  </label>
                  <input
                    type="number"
                    value={vatThreshold}
                    onChange={(e) => setVatThreshold(+e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <p className="text-xs text-gray-400 mt-1">Default 85.000€ — modifica solo se conosci la tua soglia specifica.</p>
                </div>
              </details>

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
