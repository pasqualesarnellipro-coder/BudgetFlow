import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { formatCurrency, MONTH_NAMES } from '@/lib/formatters'
import type { Category, BudgetPlan, CategoryType } from '@/lib/database.types'
import { useState, useRef, useCallback, Fragment } from 'react'
import { X, ChevronRight, Check, Plus, ArrowUp, ArrowDown } from 'lucide-react'
import { CategoryIcon } from '@/lib/categoryIcons'

const TYPE_ICONS: Record<string, string[]> = {
  INCOME:   ['💼','🤝','↩️','🏠','📈','🏆','🎯','💻','🌍','➕'],
  EXPENSES: ['🏠','🛒','🍽️','🚇','⛽','🩺','📺','📱','👔','🏃','🎓','🎭','✈️','🛡️','🏛️','🎁','💄','🐾','🛋️','⚡','📋'],
  SAVINGS:  ['🔐','🌅','📊','🏡','🧳','🎯','🏦','💰','✈️','🎁'],
  DEBTS:    ['🔑','📝','💳','📅','⚖️','🚗','🏦'],
}

const TYPE_CONFIG = {
  INCOME:   { label: 'Reddito',  color: '#10b981' },
  EXPENSES: { label: 'Spese',    color: '#f43f5e' },
  SAVINGS:  { label: 'Risparmi', color: '#f59e0b' },
  DEBTS:    { label: 'Debiti',   color: '#8b5cf6' },
}

interface FillPanel {
  catId: string
  catName: string
  icon: string
  amount: string
  fromMonth: number
}

export function AnnualBudgetPage() {
  const { profile, selectedYear, setSelectedYear } = useAppStore()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [fillPanel, setFillPanel] = useState<FillPanel | null>(null)
  const [addingCatType, setAddingCatType] = useState<CategoryType | null>(null)
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('📋')
  // Feedback cella: chiave "catId-month" → mostra ✓ per 1.2s dopo il save
  const [savedCell, setSavedCell] = useState<string | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 3 + i)

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', profile?.id],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('*').eq('user_id', profile!.id).eq('active', true)
      return data ?? []
    },
    enabled: !!profile,
  })

  const { data: budgetPlans = [] } = useQuery({
    queryKey: ['budget_plans', profile?.id, selectedYear],
    queryFn: async () => {
      const { data } = await supabase.from('budget_plans').select('*').eq('user_id', profile!.id).eq('year', selectedYear)
      return data ?? []
    },
    enabled: !!profile,
  })

  const getAmount = (catId: string, month: number) =>
    (budgetPlans as BudgetPlan[]).find((b) => b.category_id === catId && b.month === month)?.amount ?? 0

  // ── Salvataggio cella singola ─────────────────────────────────────────────
  const handleBlur = async (catId: string, month: number, value: string) => {
    if (!profile) return
    setSaving(true)
    const amount = parseFloat(value) || 0
    const existing = (budgetPlans as BudgetPlan[]).find((b) => b.category_id === catId && b.month === month)
    if (existing) {
      await supabase.from('budget_plans').update({ amount }).eq('id', existing.id)
    } else {
      await supabase.from('budget_plans').insert({ user_id: profile.id, category_id: catId, year: selectedYear, month, amount })
    }
    await qc.invalidateQueries({ queryKey: ['budget_plans'] })
    setSaving(false)
    // Feedback visivo: ✓ verde per 1.2s sulla cella appena salvata
    const cellKey = `${catId}-${month}`
    setSavedCell(cellKey)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedCell(null), 1200)
  }

  // ── Fill: riempi da un mese a Dicembre (o tutti i 12) ────────────────────
  const handleFill = async () => {
    if (!profile || !fillPanel) return
    const amount = parseFloat(fillPanel.amount) || 0
    setSaving(true)

    const fromMonth = fillPanel.fromMonth
    const months = Array.from({ length: 13 - fromMonth }, (_, i) => fromMonth + i)

    // Separa mesi con piano esistente (UPDATE) da mesi nuovi (INSERT)
    const existing = (budgetPlans as BudgetPlan[]).filter(
      (b) => b.category_id === fillPanel.catId && b.month >= fromMonth
    )
    const existingMonths = new Set(existing.map((b) => b.month))
    const toInsert = months
      .filter((m) => !existingMonths.has(m))
      .map((m) => ({ user_id: profile.id, category_id: fillPanel.catId, year: selectedYear, month: m, amount }))

    await Promise.all([
      ...existing.map((b) => supabase.from('budget_plans').update({ amount }).eq('id', b.id)),
      ...(toInsert.length ? [supabase.from('budget_plans').insert(toInsert)] : []),
    ])

    await qc.invalidateQueries({ queryKey: ['budget_plans'] })
    setSaving(false)
    setFillPanel(null)
  }

  // ── Apri pannello fill per una riga (opzionalmente da un mese specifico) ─
  const openFill = (cat: Category, fromMonth = 1, prefillAmount?: string) => {
    // Se non viene passato un importo, usa il primo valore non-zero della riga
    const firstNonZero = MONTH_NAMES.findIndex((_, i) => getAmount(cat.id, i + 1) > 0)
    const suggestedAmount = prefillAmount
      ?? (firstNonZero >= 0 ? String(getAmount(cat.id, firstNonZero + 1)) : '')
    setFillPanel({
      catId: cat.id,
      catName: cat.name,
      icon: cat.icon,
      amount: suggestedAmount,
      fromMonth,
    })
  }

  const handleAddCategory = async () => {
    if (!profile || !addingCatType || !newCatName.trim()) return
    setSaving(true)
    await supabase.from('categories').insert({
      user_id: profile.id,
      name: newCatName.trim(),
      icon: newCatIcon,
      type: addingCatType,
      active: true,
    })
    await qc.invalidateQueries({ queryKey: ['categories'] })
    setSaving(false)
    setAddingCatType(null)
    setNewCatName('')
    setNewCatIcon('📋')
  }

  const currency = profile?.currency ?? 'EUR'

  // ── Ordine categorie per sezione — salvato in localStorage ───────────────────
  const storageKey = `bf_cat_order_${profile?.id ?? 'anon'}`
  const [catOrders, setCatOrders] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}') } catch { return {} }
  })

  const getOrderedCats = useCallback((type: string, cats: Category[]): Category[] => {
    const order = catOrders[type]
    if (!order || order.length === 0) return cats
    const indexed = new Map(cats.map((c) => [c.id, c]))
    const sorted = order.filter((id) => indexed.has(id)).map((id) => indexed.get(id)!)
    // Aggiungi eventuali nuove categorie non ancora nell'ordine
    const missing = cats.filter((c) => !order.includes(c.id))
    return [...sorted, ...missing]
  }, [catOrders])

  const moveCategory = useCallback((type: string, catId: string, dir: 'up' | 'down', cats: Category[]) => {
    const ordered = getOrderedCats(type, cats)
    const idx = ordered.findIndex((c) => c.id === catId)
    if (dir === 'up' && idx === 0) return
    if (dir === 'down' && idx === ordered.length - 1) return
    const newOrder = ordered.map((c) => c.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    ;[newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]]
    const updated = { ...catOrders, [type]: newOrder }
    setCatOrders(updated)
    localStorage.setItem(storageKey, JSON.stringify(updated))
  }, [catOrders, getOrderedCats, storageKey])

  const getMonthBudgetByType = (type: string, month: number) =>
    (categories as Category[])
      .filter((c) => c.type === type)
      .reduce((s, c) => s + getAmount(c.id, month), 0)

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Budget Annuale</h1>
          {saving && <span className="text-xs text-gray-400 dark:text-gray-500">Salvataggio...</span>}
        </div>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(+e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-income/50 dark:bg-gray-700 dark:text-gray-100"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Hint primo utilizzo */}
      {(budgetPlans as BudgetPlan[]).length === 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800 rounded-xl px-4 py-3 flex items-start gap-3 text-sm">
          <span className="text-indigo-500 text-base mt-0.5">💡</span>
          <p className="text-indigo-700 dark:text-indigo-300 leading-relaxed">
            <strong>Come funziona:</strong> clicca su qualsiasi cella e digita l'importo obiettivo. I valori vengono salvati automaticamente.
            Usa il pulsante <strong>≡</strong> su ogni riga per compilare tutti i mesi in un colpo solo.
          </p>
        </div>
      )}

      {/* Il pannello fill è ora inline sotto ogni riga — rimosso da qui */}

      {/* Grand total annuo per tipo */}
      {(budgetPlans as BudgetPlan[]).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => {
            const typeCats = (categories as Category[]).filter((c) => c.type === type)
            const annualTotal = typeCats.reduce(
              (sum, cat) => sum + MONTH_NAMES.reduce((s, _, i) => s + getAmount(cat.id, i + 1), 0),
              0
            )
            return (
              <div
                key={type}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3"
                style={{ borderLeft: `3px solid ${TYPE_CONFIG[type].color}` }}
              >
                <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">
                  {TYPE_CONFIG[type].label}
                </p>
                <p className="font-bold text-gray-900 dark:text-gray-100 text-lg">
                  {formatCurrency(annualTotal, currency)}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">totale anno</p>
              </div>
            )
          })}
        </div>
      )}

      {/* ── SOLO QUESTO sticky ───────────────────────────────────────────── */}
      {(() => {
        const monthData = MONTH_NAMES.map((m, i) => {
          const month = i + 1
          const income = getMonthBudgetByType('INCOME', month)
          const out = ['EXPENSES', 'SAVINGS', 'DEBTS'].reduce((s, t) => s + getMonthBudgetByType(t, month), 0)
          return { m, month, income, out, residual: income - out }
        })
        const annualResidual = monthData.reduce((s, d) => s + d.residual, 0)
        const hasAnyData = monthData.some((d) => d.income > 0 || d.out > 0)
        const overBudgetCount = monthData.filter((d) => d.income > 0 && d.residual < 0).length

        return (
          <div className="sticky top-0 z-20 bg-sidebar rounded-2xl shadow-[0_4px_16px_-2px_rgba(0,0,0,0.25)] p-5 overflow-x-auto">
            {/* Header con spiegazione */}
            <div className="flex items-start justify-between mb-1 gap-4">
              <div>
                <p className="text-white font-bold text-sm">Margine mensile disponibile</p>
                <p className="text-white/50 text-xs mt-0.5">
                  Reddito pianificato <span className="text-white/30">−</span> spese <span className="text-white/30">−</span> risparmi <span className="text-white/30">−</span> debiti
                </p>
              </div>
              {/* Totale annuo residuo */}
              {hasAnyData && (
                <div className="text-right shrink-0">
                  <p className="text-white/40 text-[10px] uppercase tracking-wide">Residuo annuale</p>
                  <p className={`text-base font-bold ${annualResidual > 0 ? 'text-emerald-400' : annualResidual < 0 ? 'text-rose-400' : 'text-white/30'}`}>
                    {annualResidual >= 0 ? '+' : ''}{formatCurrency(annualResidual, currency)}
                  </p>
                </div>
              )}
            </div>

            {/* Legenda colori */}
            <div className="flex items-center gap-4 mb-4 mt-2">
              <span className="flex items-center gap-1.5 text-[10px] text-white/40">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                Avanzo — puoi allocare altro o risparmiare
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-white/40">
                <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                Sforamento — spese pianificate superiori al reddito
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-white/40">
                <span className="w-2 h-2 rounded-full bg-white/20 inline-block" />
                Nessun dato inserito
              </span>
            </div>

            {/* Avviso sforamento */}
            {overBudgetCount > 0 && (
              <div className="mb-4 flex items-center gap-2 bg-rose-500/20 border border-rose-400/30 rounded-xl px-3 py-2">
                <span className="text-rose-300 text-sm">⚠️</span>
                <p className="text-rose-200 text-xs">
                  <strong>{overBudgetCount} {overBudgetCount === 1 ? 'mese' : 'mesi'}</strong> in sforamento — le uscite pianificate superano il reddito. Riduci le spese o aumenta il reddito pianificato.
                </p>
              </div>
            )}

            {/* Griglia mesi */}
            <div className="flex gap-3 min-w-max">
              {monthData.map(({ m, month, income, out, residual }) => {
                const isCurrentMonth = month === new Date().getMonth() + 1 && selectedYear === new Date().getFullYear()
                return (
                  <div
                    key={m}
                    className={`text-center min-w-20 rounded-xl px-3 py-2.5 ${
                      isCurrentMonth ? 'bg-white/15 ring-1 ring-white/30' : 'bg-white/5'
                    }`}
                  >
                    <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${
                      isCurrentMonth ? 'text-white' : 'text-white/40'
                    }`}>{m}</p>
                    <p className={`text-sm font-bold ${
                      residual > 0 ? 'text-emerald-400' :
                      residual < 0 ? 'text-rose-400' :
                      'text-white/30'
                    }`}>
                      {income === 0 && out === 0 ? '—' : (residual >= 0 ? '+' : '') + formatCurrency(residual, currency)}
                    </p>
                    {/* Mini barra sotto */}
                    {(income > 0 || out > 0) && (
                      <div className="mt-1.5 h-0.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${residual >= 0 ? 'bg-emerald-400/60' : 'bg-rose-400/60'}`}
                          style={{ width: income > 0 ? `${Math.min(100, (out / income) * 100)}%` : '100%' }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Tabelle per tipo ────────────────────────────────────────────────── */}
      {(Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => {
        const rawCats = (categories as Category[]).filter((c) => c.type === type)
        const typeCats = getOrderedCats(type, rawCats)
        if (!typeCats.length) return null
        return (
          <div key={type} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            <div
              className="px-5 py-3 border-b border-gray-100 dark:border-gray-700"
              style={{ borderLeft: `4px solid ${TYPE_CONFIG[type].color}` }}
            >
              <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                {TYPE_CONFIG[type].label}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-max">
                <thead>
                  <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-50 dark:border-gray-700">
                    <th className="text-left px-4 py-2 w-52">Categoria</th>
                    {MONTH_NAMES.map((m) => (
                      <th key={m} className="text-right px-2 py-2 w-20">{m}</th>
                    ))}
                    <th className="text-right px-4 py-2 w-24">Totale</th>
                    <th className="px-3 py-2 w-24 text-right text-[10px] text-indigo-400">Riempi →</th>
                  </tr>
                </thead>
                <tbody>
                  {typeCats.map((cat, catIdx) => {
                    const total = MONTH_NAMES.reduce((s, _, i) => s + getAmount(cat.id, i + 1), 0)
                    const isActiveFill = fillPanel?.catId === cat.id
                    const isFirst = catIdx === 0
                    const isLast = catIdx === typeCats.length - 1
                    return (
                      <Fragment key={cat.id}>
                      <tr
                        className={`border-t border-gray-50 dark:border-gray-700/50 group ${
                          isActiveFill ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : 'hover:bg-gray-50/50 dark:hover:bg-gray-700/20'
                        }`}
                      >
                        <td className="px-2 py-2 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {/* Frecce riordino — visibili al hover */}
                            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                onClick={() => moveCategory(type, cat.id, 'up', rawCats)}
                                disabled={isFirst}
                                title="Sposta su"
                                className="p-0.5 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                              >
                                <ArrowUp size={11} />
                              </button>
                              <button
                                onClick={() => moveCategory(type, cat.id, 'down', rawCats)}
                                disabled={isLast}
                                title="Sposta giù"
                                className="p-0.5 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                              >
                                <ArrowDown size={11} />
                              </button>
                            </div>
                            <CategoryIcon name={cat.name} type={cat.type} size={13} />
                            <span>{cat.name}</span>
                          </div>
                        </td>
                        {MONTH_NAMES.map((_, i) => {
                          const month = i + 1
                          const currentAmount = getAmount(cat.id, month)
                          return (
                            <td key={i} className="px-1 py-1 relative group/cell">
                              {savedCell === `${cat.id}-${month}` ? (
                                // Feedback ✓ dopo il save
                                <div className="w-full flex items-center justify-end pr-1.5 py-1 text-emerald-500">
                                  <Check size={13} strokeWidth={2.5} />
                                </div>
                              ) : (
                                <input
                                  key={`${cat.id}-${month}-${currentAmount}`}
                                  type="number"
                                  defaultValue={currentAmount || ''}
                                  onBlur={(e) => handleBlur(cat.id, month, e.target.value)}
                                  placeholder="0"
                                  className="w-full text-right text-xs border border-transparent hover:border-gray-300 dark:hover:border-gray-500 focus:border-income rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-income/50 bg-transparent dark:text-gray-200 pr-5"
                                />
                              )}
                              {/* Mini bottone "→ da qui" — appare al focus della cella */}
                              <button
                                tabIndex={-1}
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  const inputEl = e.currentTarget.previousElementSibling as HTMLInputElement
                                  openFill(cat, month, inputEl?.value || String(currentAmount || ''))
                                }}
                                title={`Riempi da ${MONTH_NAMES[i]} a Dicembre`}
                                className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-focus-within/cell:opacity-100 transition-opacity p-0.5 rounded text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                              >
                                <ChevronRight size={12} />
                              </button>
                            </td>
                          )
                        })}
                        <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {formatCurrency(total, currency)}
                        </td>
                        {/* Pulsante "Riempi tutti" */}
                        <td className="px-3 py-1 text-right">
                          <button
                            onClick={() => isActiveFill ? setFillPanel(null) : openFill(cat)}
                            title="Riempi tutti i mesi con lo stesso importo"
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                              isActiveFill
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'text-indigo-500 dark:text-indigo-400 border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 bg-white dark:bg-transparent'
                            }`}
                          >
                            {isActiveFill ? 'Chiudi' : <><span>= tutti</span><ChevronRight size={10} /></>}
                          </button>
                        </td>
                      </tr>

                      {/* ── Pannello fill INLINE — appare subito sotto la riga attiva ── */}
                      {isActiveFill && fillPanel && (
                        <tr className="bg-indigo-50/80 dark:bg-indigo-950/30 border-t border-indigo-100 dark:border-indigo-800">
                          <td colSpan={16} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-3">
                              {/* Importo */}
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-indigo-700 dark:text-indigo-400 font-medium whitespace-nowrap">Importo €</label>
                                <input
                                  type="number"
                                  autoFocus
                                  value={fillPanel.amount}
                                  onChange={(e) => setFillPanel({ ...fillPanel, amount: e.target.value })}
                                  onKeyDown={(e) => e.key === 'Enter' && handleFill()}
                                  placeholder="0"
                                  className="w-28 text-right text-sm border border-indigo-300 dark:border-indigo-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-700 dark:text-gray-100"
                                />
                              </div>

                              {/* Da quale mese */}
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-indigo-700 dark:text-indigo-400 font-medium whitespace-nowrap">Da</label>
                                <select
                                  value={fillPanel.fromMonth}
                                  onChange={(e) => setFillPanel({ ...fillPanel, fromMonth: +e.target.value })}
                                  className="border border-indigo-300 dark:border-indigo-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-700 dark:text-gray-100"
                                >
                                  {MONTH_NAMES.map((m, i) => (
                                    <option key={i} value={i + 1}>{m}</option>
                                  ))}
                                </select>
                                <span className="text-xs text-indigo-500 dark:text-indigo-400 whitespace-nowrap">a Dicembre</span>
                              </div>

                              {/* Azioni */}
                              <div className="flex items-center gap-2 ml-auto">
                                <button
                                  onClick={() => setFillPanel({ ...fillPanel, fromMonth: 1 })}
                                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                                    fillPanel.fromMonth === 1
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                                  }`}
                                >
                                  = Tutti i mesi
                                </button>
                                <button
                                  onClick={handleFill}
                                  disabled={saving || !fillPanel.amount}
                                  className="text-xs px-4 py-1.5 rounded-lg font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                                >
                                  {saving ? 'Salvataggio…' : `Applica ${fillPanel.fromMonth === 1 ? '(12 mesi)' : `(${13 - fillPanel.fromMonth} mesi)`}`}
                                </button>
                                <button
                                  onClick={() => setFillPanel(null)}
                                  className="p-1.5 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    )
                  })}
                  {/* Riga totale sezione */}
                  {typeCats.length > 1 && (
                    <tr className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50/70 dark:bg-gray-700/30">
                      <td className="px-4 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Totale {TYPE_CONFIG[type].label}
                      </td>
                      {MONTH_NAMES.map((_, i) => {
                        const monthTotal = typeCats.reduce((s, cat) => s + getAmount(cat.id, i + 1), 0)
                        return (
                          <td key={i} className="px-2 py-2 text-right text-xs font-semibold" style={{ color: TYPE_CONFIG[type].color }}>
                            {monthTotal > 0 ? formatCurrency(monthTotal, currency) : <span className="text-gray-300">—</span>}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2 text-right text-sm font-bold" style={{ color: TYPE_CONFIG[type].color }}>
                        {formatCurrency(
                          typeCats.reduce((s, cat) => s + MONTH_NAMES.reduce((ms, _, i) => ms + getAmount(cat.id, i + 1), 0), 0),
                          currency
                        )}
                      </td>
                      <td />
                    </tr>
                  )}

                  {/* Riga "+ Nuova categoria" */}
                  {addingCatType === type ? (
                    <tr className="border-t border-dashed border-indigo-200 dark:border-indigo-700 bg-indigo-50/30 dark:bg-indigo-950/20">
                      <td className="px-3 py-2" colSpan={15}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Emoji picker rapido */}
                          <div className="flex gap-1 flex-wrap">
                            {(TYPE_ICONS[type] ?? ['📋']).map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => setNewCatIcon(emoji)}
                                className={`text-base w-7 h-7 rounded-lg transition-all ${
                                  newCatIcon === emoji
                                    ? 'bg-indigo-200 dark:bg-indigo-800 ring-2 ring-indigo-400 scale-110'
                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                          {/* Input nome */}
                          <input
                            autoFocus
                            type="text"
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddCategory()
                              if (e.key === 'Escape') { setAddingCatType(null); setNewCatName('') }
                            }}
                            placeholder="Nome categoria…"
                            className="border border-indigo-300 dark:border-indigo-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-800 dark:text-gray-100 w-48"
                          />
                          <button
                            onClick={handleAddCategory}
                            disabled={!newCatName.trim() || saving}
                            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-40"
                          >
                            {saving ? '...' : 'Aggiungi'}
                          </button>
                          <button
                            onClick={() => { setAddingCatType(null); setNewCatName('') }}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr className="border-t border-dashed border-gray-200 dark:border-gray-700">
                      <td colSpan={15} className="px-4 py-1.5">
                        <button
                          onClick={() => {
                            setAddingCatType(type as CategoryType)
                            setNewCatName('')
                            setNewCatIcon((TYPE_ICONS[type] ?? ['📋'])[0])
                          }}
                          className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        >
                          <Plus size={12} />
                          Nuova categoria {TYPE_CONFIG[type].label.toLowerCase()}
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
