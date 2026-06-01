import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { formatCurrency, MONTH_NAMES } from '@/lib/formatters'
import type { Category, BudgetPlan } from '@/lib/database.types'
import { useState, useRef } from 'react'
import { X, ChevronRight, Check } from 'lucide-react'

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

  const currency = profile?.currency ?? 'EUR'

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

      {/* Pannello fill inline ─────────────────────────────────────────────── */}
      {fillPanel && (
        <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-700 rounded-2xl px-5 py-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">{fillPanel.icon}</span>
            <span className="font-semibold text-indigo-900 dark:text-indigo-200 text-sm">{fillPanel.catName}</span>
          </div>

          {/* Importo */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-indigo-700 dark:text-indigo-400 font-medium">Importo</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-400 text-xs">€</span>
              <input
                type="number"
                autoFocus
                value={fillPanel.amount}
                onChange={(e) => setFillPanel({ ...fillPanel, amount: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleFill()}
                placeholder="0"
                className="pl-6 pr-2 py-1.5 w-28 text-right text-sm border border-indigo-300 dark:border-indigo-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Da quale mese */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-indigo-700 dark:text-indigo-400 font-medium">Da</label>
            <select
              value={fillPanel.fromMonth}
              onChange={(e) => setFillPanel({ ...fillPanel, fromMonth: +e.target.value })}
              className="border border-indigo-300 dark:border-indigo-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-700 dark:text-gray-100"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <span className="text-xs text-indigo-600 dark:text-indigo-400">a Dicembre</span>
          </div>

          {/* Azioni */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setFillPanel({ ...fillPanel, fromMonth: 1 })}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
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
              className="text-xs px-4 py-1.5 rounded-lg font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvataggio...' : `Applica ${fillPanel.fromMonth === 1 ? '(12 mesi)' : `(${13 - fillPanel.fromMonth} mesi)`}`}
            </button>
            <button
              onClick={() => setFillPanel(null)}
              className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 p-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Grand total annuo per tipo ─────────────────────────────────────── */}
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

      {/* Summary row */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 overflow-x-auto">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Ancora da allocare per mese
        </p>
        <div className="flex gap-2 min-w-max">
          {MONTH_NAMES.map((m, i) => {
            const month = i + 1
            const income = getMonthBudgetByType('INCOME', month)
            const out = ['EXPENSES', 'SAVINGS', 'DEBTS'].reduce((s, t) => s + getMonthBudgetByType(t, month), 0)
            const residual = income - out
            return (
              <div key={m} className="text-center min-w-16">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{m}</p>
                <p className={`text-xs font-bold ${residual >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {residual >= 0 ? '+' : ''}{formatCurrency(residual, currency)}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tabelle per tipo ────────────────────────────────────────────────── */}
      {(Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => {
        const typeCats = (categories as Category[]).filter((c) => c.type === type)
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
                    <th className="text-left px-4 py-2 w-44">Categoria</th>
                    {MONTH_NAMES.map((m) => (
                      <th key={m} className="text-right px-2 py-2 w-20">{m}</th>
                    ))}
                    <th className="text-right px-4 py-2 w-24">Totale</th>
                    <th className="px-3 py-2 w-24 text-right text-[10px] text-indigo-400">Riempi →</th>
                  </tr>
                </thead>
                <tbody>
                  {typeCats.map((cat) => {
                    const total = MONTH_NAMES.reduce((s, _, i) => s + getAmount(cat.id, i + 1), 0)
                    const isActiveFill = fillPanel?.catId === cat.id
                    return (
                      <tr
                        key={cat.id}
                        className={`border-t border-gray-50 dark:border-gray-700/50 group ${
                          isActiveFill ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : 'hover:bg-gray-50/50 dark:hover:bg-gray-700/20'
                        }`}
                      >
                        <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                          {cat.icon} {cat.name}
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
                        {/* Pulsante "Riempi tutti" — sempre visibile, non più nascosto */}
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
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
