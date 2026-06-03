import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { DonutProgressRing } from '@/components/ui/DonutProgressRing'
import { HelpTooltip } from '@/components/ui/HelpTooltip'
import { formatCurrency } from '@/lib/formatters'
import { Plus, Pencil, Trash2, PiggyBank, Target, CalendarDays, TrendingUp, Sparkles } from 'lucide-react'
import type { SavingGoal } from '@/lib/database.types'

const ICON_PRESETS = [
  '✈️','🏖️','🌍','🗺️','🏔️',   // viaggi
  '🏠','🏡','🏗️','🔑',           // casa
  '🚗','🛵','🚲','🚢',            // mobilità
  '💻','📱','🎮','📷','🎧',       // tech
  '🎓','📚','🏫',                 // studio
  '💍','💒','🥂',                 // matrimonio/eventi
  '🐶','🐱','🐾',                 // animali
  '👶','🍼',                      // famiglia
  '🏋️','⚽','🎾','🎿',            // sport
  '🎸','🎹','🎨',                 // hobby
  '💰','🏦','📈','🛡️',            // finanza
  '🎁','🎄',                      // regali/festività
]

// ─── Mappa keyword → icona ────────────────────────────────────────────────────
const ICON_MAP: { keywords: string[]; icon: string }[] = [
  { keywords: ['vacan', 'viag', 'volo', 'ferie', 'vacanz'], icon: '✈️' },
  { keywords: ['spiag', 'mare', 'estate', 'resort', 'tropic'], icon: '🏖️' },
  { keywords: ['mondo', 'giro', 'tour', 'avvent', 'esplor'], icon: '🌍' },
  { keywords: ['mont', 'alpi', 'sci', 'neve', 'trekk'], icon: '🏔️' },
  { keywords: ['casa', 'appartam', 'affitt', 'mutuo', 'acconto', 'immobil', 'abitaz'], icon: '🏠' },
  { keywords: ['villa', 'seconda casa', 'casetta'], icon: '🏡' },
  { keywords: ['ristruttur', 'lavori', 'cantiere', 'costruz'], icon: '🏗️' },
  { keywords: ['auto', 'macch', 'moto', 'patente', 'veicolo', 'bmw', 'mercedes', 'ferrari', 'fiat'], icon: '🚗' },
  { keywords: ['bici', 'ciclo', 'scooter', 'monopatt'], icon: '🛵' },
  { keywords: ['barca', 'barchett', 'vela', 'nave'], icon: '🚢' },
  { keywords: ['pc', 'laptop', 'computer', 'mac', 'macbook', 'notebook'], icon: '💻' },
  { keywords: ['telefon', 'iphone', 'samsung', 'smartphone', 'cellu'], icon: '📱' },
  { keywords: ['playstation', 'xbox', 'nintendo', 'gioc', 'gaming', 'ps5', 'ps4'], icon: '🎮' },
  { keywords: ['fotoc', 'camera', 'obiettivo', 'foto', 'reflex'], icon: '📷' },
  { keywords: ['cuffie', 'airpod', 'auricolar', 'audio', 'speaker'], icon: '🎧' },
  { keywords: ['laure', 'universit', 'studio', 'corso', 'master', 'dottor', 'scuola', 'formaz'], icon: '🎓' },
  { keywords: ['libri', 'libro'], icon: '📚' },
  { keywords: ['matrimon', 'nozze', 'fidanzam', 'fede', 'anello', 'proposta'], icon: '💍' },
  { keywords: ['cerimonia', 'festa', 'evento', 'complean', 'anniversar'], icon: '🥂' },
  { keywords: ['cane', 'cucciolo', 'labrador', 'golden'], icon: '🐶' },
  { keywords: ['gatto', 'micio', 'felino'], icon: '🐱' },
  { keywords: ['animale', 'pet', 'veterinar'], icon: '🐾' },
  { keywords: ['bambino', 'figlio', 'bimbo', 'bebè', 'bebe', 'nascita', 'cicogna', 'gravidanza'], icon: '👶' },
  { keywords: ['palestra', 'fitness', 'allenamento', 'pesi', 'muscolaz'], icon: '🏋️' },
  { keywords: ['calcio', 'sport', 'squadra', 'campion'], icon: '⚽' },
  { keywords: ['tennis', 'padel', 'racchetta'], icon: '🎾' },
  { keywords: ['musica', 'chitarra', 'strumento', 'concerto', 'band'], icon: '🎸' },
  { keywords: ['pianofort', 'tastier'], icon: '🎹' },
  { keywords: ['pittura', 'arte', 'disegno', 'quadro'], icon: '🎨' },
  { keywords: ['fondo', 'emergenza', 'scorta', 'riserva', 'sicurezza', 'cuscinetto'], icon: '🛡️' },
  { keywords: ['pensione', 'pensionamento', 'futuro', 'integrazione'], icon: '🏦' },
  { keywords: ['investiment', 'azioni', 'borsa', 'cripto', 'bitcoin', 'etf'], icon: '📈' },
  { keywords: ['risparmi', 'soldi', 'capital', 'liquidit'], icon: '💰' },
  { keywords: ['regalo', 'regali', 'natale', 'dono', 'gift'], icon: '🎁' },
]

function suggestIcon(name: string): string | null {
  const normalized = name.toLowerCase().trim()
  if (!normalized) return null
  for (const { keywords, icon } of ICON_MAP) {
    if (keywords.some((k) => normalized.includes(k))) return icon
  }
  return null
}

const COLOR_PRESETS = [
  '#f59e0b','#10b981','#6366f1','#f43f5e','#8b5cf6',
  '#0ea5e9','#ec4899','#14b8a6','#f97316','#84cc16',
]

const emptyForm = () => ({
  name: '',
  icon: '🎯',
  color: '#f59e0b',
  target_amount: '',
  current_amount: '',
  deadline: '',
  category_id: '',
})

type FormState = ReturnType<typeof emptyForm>

export function GoalsPage() {
  const { profile, selectedYear } = useAppStore()
  const qc = useQueryClient()
  const currency = profile?.currency ?? 'EUR'

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [iconManual, setIconManual] = useState(false)   // true = utente ha scelto manualmente
  const [suggestedIcon, setSuggestedIcon] = useState<string | null>(null)
  const [addContribId, setAddContribId] = useState<string | null>(null)
  const [contribAmount, setContribAmount] = useState('')

  const { data: savingsTransactions = [] } = useQuery({
    queryKey: ['transactions_savings', profile?.id, selectedYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('category_id, amount')
        .eq('user_id', profile!.id)
        .eq('type', 'SAVINGS')
        .gte('date', `${selectedYear}-01-01`)
        .lte('date', `${selectedYear}-12-31`)
      return data ?? []
    },
    enabled: !!profile,
  })

  const { data: budgetPlans = [] } = useQuery({
    queryKey: ['budget_plans', profile?.id, selectedYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_plans')
        .select('category_id, amount')
        .eq('user_id', profile!.id)
        .eq('year', selectedYear)
      return data ?? []
    },
    enabled: !!profile,
  })

  const { data: savingsCategories = [] } = useQuery({
    queryKey: ['categories_savings', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', profile!.id)
        .eq('type', 'SAVINGS')
        .eq('active', true)
      return data ?? []
    },
    enabled: !!profile,
  })

  const { data: goals = [] } = useQuery({
    queryKey: ['saving_goals', profile?.id, selectedYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('saving_goals')
        .select('*')
        .eq('user_id', profile!.id)
        .eq('year', selectedYear)
        .order('created_at', { ascending: true })
      return data ?? []
    },
    enabled: !!profile,
  })

  const getSavedFromTx = (categoryId: string) =>
    (savingsTransactions as { category_id: string; amount: number }[])
      .filter((t) => t.category_id === categoryId)
      .reduce((s, t) => s + t.amount, 0)

  const getBudgetTarget = (categoryId: string) =>
    (budgetPlans as { category_id: string; amount: number }[])
      .filter((b) => b.category_id === categoryId)
      .reduce((s, b) => s + b.amount, 0)

  const openNew = () => {
    setForm(emptyForm())
    setEditingId(null)
    setIconManual(false)
    setSuggestedIcon(null)
    setShowModal(true)
  }

  const openEdit = (g: SavingGoal) => {
    setForm({
      name: g.name,
      icon: g.icon,
      color: g.color,
      target_amount: String(g.target_amount),
      current_amount: String(g.current_amount),
      deadline: g.deadline ?? '',
      category_id: g.category_id ?? '',
    })
    setEditingId(g.id)
    setIconManual(true)   // in edit mode l'icona è già stata scelta
    setSuggestedIcon(null)
    setShowModal(true)
  }

  // Gestione cambio nome con auto-suggestion icona
  const handleNameChange = (name: string) => {
    const suggestion = suggestIcon(name)
    setSuggestedIcon(suggestion)
    if (!iconManual && suggestion) {
      setForm((f) => ({ ...f, name, icon: suggestion }))
    } else {
      setForm((f) => ({ ...f, name }))
    }
  }

  // Click manuale su un'icona → blocca auto-suggestion
  const handleIconSelect = (emoji: string) => {
    setIconManual(true)
    setSuggestedIcon(null)
    setForm((f) => ({ ...f, icon: emoji }))
  }

  const handleSave = async () => {
    if (!profile || !form.name || !form.target_amount) return

    let linkedCategoryId = form.category_id || null

    // ── Se non c'è categoria collegata, creane una SAVINGS automaticamente ──────
    // Questo connette l'obiettivo al resto dell'app (transazioni, budget, dashboard)
    if (!linkedCategoryId && !editingId) {
      const { data: newCat } = await supabase
        .from('categories')
        .insert({ user_id: profile.id, name: form.name, icon: form.icon, type: 'SAVINGS', active: true })
        .select()
        .single()
      if (newCat) {
        linkedCategoryId = newCat.id
        qc.invalidateQueries({ queryKey: ['categories'] })
        qc.invalidateQueries({ queryKey: ['categories_savings'] })
      }
    }

    const payload = {
      user_id: profile.id,
      name: form.name,
      icon: form.icon,
      color: form.color,
      target_amount: parseFloat(form.target_amount),
      current_amount: linkedCategoryId
        ? getSavedFromTx(linkedCategoryId)
        : parseFloat(form.current_amount || '0'),
      deadline: form.deadline || null,
      year: selectedYear,
      category_id: linkedCategoryId,
    }

    if (editingId) {
      await supabase.from('saving_goals').update(payload).eq('id', editingId)
    } else {
      await supabase.from('saving_goals').insert(payload)
    }
    qc.invalidateQueries({ queryKey: ['saving_goals'] })
    setShowModal(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questo obiettivo?')) return
    await supabase.from('saving_goals').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['saving_goals'] })
  }

  const handleAddContrib = async (goal: SavingGoal) => {
    const amount = parseFloat(contribAmount)
    if (!amount || amount <= 0) return

    if (goal.category_id) {
      // ── Crea una vera transazione SAVINGS → appare in tutta l'app ────────────
      // (dashboard, transazioni, budget, margine mensile)
      await supabase.from('transactions').insert({
        user_id: profile!.id,
        date: new Date().toISOString().slice(0, 10),
        type: 'SAVINGS',
        category_id: goal.category_id,
        description: `Risparmio — ${goal.name}`,
        amount,
        is_business: false,
        activity_name: null,
        account_id: null,
      })
      // Invalida transazioni e il contatore risparmiato nell'obiettivo
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['transactions_savings'] })
    } else {
      // Nessuna categoria → aggiorna current_amount direttamente (fallback)
      await supabase
        .from('saving_goals')
        .update({ current_amount: goal.current_amount + amount })
        .eq('id', goal.id)
    }

    qc.invalidateQueries({ queryKey: ['saving_goals'] })
    setAddContribId(null)
    setContribAmount('')
  }

  // Summary stats
  const totalTarget = (goals as SavingGoal[]).reduce((s, g) => s + g.target_amount, 0)
  const totalSaved = (goals as SavingGoal[]).reduce((s, g) => s + (g.category_id ? getSavedFromTx(g.category_id) : g.current_amount), 0)
  const completed = (goals as SavingGoal[]).filter((g) => {
    const eff = g.category_id ? getSavedFromTx(g.category_id) : g.current_amount
    return eff >= g.target_amount && g.target_amount > 0
  }).length

  return (
    <div className="p-5 space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Obiettivi di Risparmio</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Crea obiettivi personalizzati e tieni traccia dei progressi</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuovo obiettivo
        </button>
      </div>

      {/* Riepilogo */}
      {goals.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target size={14} className="text-indigo-500" />
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">Obiettivo totale</span>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totalTarget, currency)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <PiggyBank size={14} className="text-amber-500" />
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">Risparmiato</span>
            </div>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(totalSaved, currency)}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0}% del totale</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-emerald-500" />
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">Completati</span>
            </div>
            <p className="text-xl font-bold text-emerald-600">{completed} / {goals.length}</p>
          </div>
        </div>
      )}

      {/* Grid obiettivi */}
      {goals.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-600 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mx-auto mb-4">
            <Target size={28} className="text-indigo-400" strokeWidth={1.5} />
          </div>
          <p className="text-gray-700 dark:text-gray-200 font-semibold text-lg">Nessun obiettivo ancora</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 mb-5">Crea il tuo primo obiettivo: casa, vacanze, fondo emergenza…</p>
          <button onClick={openNew} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700">
            Crea il primo obiettivo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {(goals as SavingGoal[]).map((g) => {
            const effectiveSaved = g.category_id ? getSavedFromTx(g.category_id) : g.current_amount
            const pct = g.target_amount > 0 ? Math.min((effectiveSaved / g.target_amount) * 100, 100) : 0
            const remaining = Math.max(0, g.target_amount - effectiveSaved)
            const isComplete = pct >= 100

            const deadlineDays = g.deadline
              ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000)
              : null

            return (
              <div
                key={g.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col"
                style={{ borderTop: `4px solid ${g.color}` }}
              >
                {/* Card header */}
                <div className="px-5 pt-4 pb-2 flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-3xl">{g.icon}</span>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{g.name}</p>
                      {g.category_id && (
                        <span className="text-[10px] text-indigo-500 font-medium">🔗 Collegato a transazioni</span>
                      )}
                      {g.deadline && (
                        <p className={`text-xs flex items-center gap-1 mt-0.5 ${deadlineDays !== null && deadlineDays < 30 ? 'text-rose-500' : 'text-gray-400 dark:text-gray-500'}`}>
                          <CalendarDays size={10} />
                          {deadlineDays !== null && deadlineDays > 0
                            ? `${deadlineDays} giorni`
                            : deadlineDays === 0 ? 'Oggi!'
                            : 'Scaduto'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(g)} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(g.id)} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Donut */}
                <div className="flex justify-center py-3">
                  <DonutProgressRing
                    percentage={pct}
                    color={isComplete ? '#10b981' : g.color}
                    size={100}
                    strokeWidth={10}
                    centerLabel={isComplete ? '🎉' : `${Math.round(pct)}%`}
                  />
                </div>

                {/* Stats */}
                <div className="px-5 pb-2 space-y-1.5 text-sm flex-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400 dark:text-gray-500">Obiettivo</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(g.target_amount, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 dark:text-gray-500">Risparmiato</span>
                    <span className="font-semibold" style={{ color: g.color }}>{formatCurrency(effectiveSaved, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 dark:text-gray-500">Manca ancora</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(remaining, currency)}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="px-5 pb-3">
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: isComplete ? '#10b981' : g.color }}
                    />
                  </div>
                </div>

                {/* Aggiungi contributo */}
                <div className="border-t border-gray-50 dark:border-gray-700 px-5 py-3">
                  {isComplete ? (
                    <p className="text-center text-xs font-semibold text-emerald-600">🎉 Obiettivo raggiunto!</p>
                  ) : addContribId === g.id ? (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">€</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0,00"
                          value={contribAmount}
                          onChange={(e) => setContribAmount(e.target.value)}
                          autoFocus
                          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg pl-6 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-700 dark:text-gray-100"
                        />
                      </div>
                      <button
                        onClick={() => handleAddContrib(g)}
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => { setAddContribId(null); setContribAmount('') }}
                        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddContribId(g.id); setContribAmount('') }}
                      className="w-full text-xs font-medium py-1.5 rounded-lg border border-dashed border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      + Aggiungi risparmio {g.category_id ? '→ crea transazione' : ''}
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Aggiungi nuovo card */}
          <button
            onClick={openNew}
            className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-600 p-5 flex flex-col items-center justify-center gap-2 text-gray-300 dark:text-gray-600 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-400 dark:hover:text-indigo-400 transition-colors min-h-64"
          >
            <Plus size={28} />
            <span className="text-sm font-medium">Nuovo obiettivo</span>
          </button>
        </div>
      )}

      {/* Modal crea/modifica */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">

            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {editingId ? 'Modifica obiettivo' : 'Nuovo obiettivo'}
                </h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Personalizza nome, icona, colore e importo</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Preview live */}
              <div
                className="flex items-center gap-3 p-3 rounded-xl border-2"
                style={{ borderColor: form.color, backgroundColor: form.color + '15' }}
              >
                <span className="text-3xl">{form.icon || '🎯'}</span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{form.name || 'Nome obiettivo'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{form.target_amount ? formatCurrency(parseFloat(form.target_amount), currency) : '€ 0'}</p>
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Nome
                  <HelpTooltip content="Dagli un nome chiaro: es. 'Vacanze Giappone 2026', 'Fondo emergenza', 'Acconto casa'." position="right" />
                </label>
                <input
                  type="text"
                  placeholder="Es. Vacanze, Fondo emergenza, Auto nuova…"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
                  autoFocus
                />
              </div>

              {/* Collega a categoria risparmio */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Collega a categoria risparmio
                  <HelpTooltip content="Collegando una categoria, ogni risparmio aggiunto creerà una vera transazione visibile ovunque nell'app (Dashboard, Budget, Transazioni). Se non selezioni nulla, viene creata automaticamente una categoria con il nome dell'obiettivo." position="right" />
                </label>
                {!editingId && !form.category_id && (
                  <div className="mb-2 flex items-start gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2">
                    <span className="text-emerald-500 text-sm mt-0.5">✨</span>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">
                      Verrà creata automaticamente una categoria risparmio <strong>"{form.name || 'con il nome dell\'obiettivo'}"</strong>. Ogni contributo aggiungerà una transazione reale collegata.
                    </p>
                  </div>
                )}
                <select
                  value={form.category_id}
                  onChange={(e) => {
                    const catId = e.target.value
                    const budgetTarget = catId ? getBudgetTarget(catId) : 0
                    setForm((f) => ({
                      ...f,
                      category_id: catId,
                      current_amount: catId ? String(getSavedFromTx(catId)) : f.current_amount,
                      target_amount: catId && budgetTarget > 0 ? String(budgetTarget) : f.target_amount,
                    }))
                  }}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="">— Crea categoria automaticamente —</option>
                  {(savingsCategories as { id: string; icon: string; name: string }[]).map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
                {form.category_id && (
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                    🔗 Risparmiato da transazioni reali: <strong>{formatCurrency(getSavedFromTx(form.category_id), currency)}</strong>
                  </p>
                )}
              </div>

              {/* Icona */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Icona
                    <HelpTooltip content="L'icona viene suggerita automaticamente mentre scrivi il nome. Puoi sempre cambiarla manualmente." position="right" />
                  </label>
                  {suggestedIcon && !iconManual && (
                    <span className="flex items-center gap-1 text-xs text-indigo-500 font-medium animate-pulse">
                      <Sparkles size={11} />
                      Suggerita automaticamente
                    </span>
                  )}
                  {iconManual && (
                    <button
                      type="button"
                      onClick={() => {
                        setIconManual(false)
                        const s = suggestIcon(form.name)
                        if (s) { setSuggestedIcon(s); setForm((f) => ({ ...f, icon: s })) }
                      }}
                      className="text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-500 transition-colors"
                    >
                      ↩ Ripristina suggerimento
                    </button>
                  )}
                </div>

                {/* Griglia emoji con scroll */}
                <div className="grid grid-cols-8 gap-1.5 max-h-36 overflow-y-auto pr-1 mb-2">
                  {ICON_PRESETS.map((emoji) => {
                    const isSelected = form.icon === emoji
                    const isSuggested = emoji === suggestedIcon && !iconManual
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleIconSelect(emoji)}
                        className={`relative w-full aspect-square rounded-xl text-xl flex items-center justify-center border-2 transition-all ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-indigo-200 scale-110'
                            : isSuggested
                            ? 'border-indigo-300 bg-indigo-50/60 dark:bg-indigo-900/20'
                            : 'border-gray-100 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {emoji}
                        {isSuggested && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full flex items-center justify-center">
                            <Sparkles size={7} className="text-white" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                <input
                  type="text"
                  placeholder="…oppure scrivi qualsiasi emoji"
                  value={form.icon}
                  onChange={(e) => { setIconManual(true); setForm((f) => ({ ...f, icon: e.target.value })) }}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>

              {/* Colore */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 block">Colore</label>
                <div className="flex items-center gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-gray-800 dark:border-gray-200 scale-110' : 'border-white dark:border-gray-600 shadow'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="w-7 h-7 rounded-full cursor-pointer border border-gray-200 dark:border-gray-600"
                    title="Colore personalizzato"
                  />
                </div>
              </div>

              {/* Importo + Attuale */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    Obiettivo (€)
                    <HelpTooltip content="Quanto vuoi risparmiare in totale per questo obiettivo?" position="top" />
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      value={form.target_amount}
                      onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    Già risparmiato
                    <HelpTooltip content="Quanto hai già da parte per questo obiettivo? Se colleghi una categoria, il valore viene calcolato automaticamente dalle transazioni." position="top" />
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      readOnly={!!form.category_id}
                      value={form.current_amount}
                      onChange={(e) => !form.category_id && setForm({ ...form, current_amount: e.target.value })}
                      className={`w-full border rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                        form.category_id
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 cursor-not-allowed'
                          : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-gray-100'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Scadenza */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Scadenza <span className="font-normal text-gray-400 dark:text-gray-500 normal-case">(opzionale)</span>
                  <HelpTooltip content="Entro quando vuoi raggiungere questo obiettivo? Ti mostreremo quanti giorni mancano." position="top" />
                </label>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>

              {/* CTA */}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-medium py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm">
                  Annulla
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.name || !form.target_amount}
                  className="flex-1 text-white font-semibold py-2.5 rounded-xl disabled:opacity-40 text-sm transition-colors hover:opacity-90"
                  style={{ backgroundColor: form.color }}
                >
                  {editingId ? 'Salva modifiche' : 'Crea obiettivo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
