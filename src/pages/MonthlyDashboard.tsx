import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { formatCurrency, MONTH_NAMES } from '@/lib/formatters'
import { DonutProgressRing } from '@/components/ui/DonutProgressRing'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Transaction, BudgetPlan, Category } from '@/lib/database.types'

const TYPE_CONFIG = {
  INCOME:   { label: 'Reddito',  color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  EXPENSES: { label: 'Spese',    color: '#f43f5e', bg: 'bg-rose-50',    text: 'text-rose-500'    },
  SAVINGS:  { label: 'Risparmi', color: '#f59e0b', bg: 'bg-amber-50',   text: 'text-amber-500'   },
  DEBTS:    { label: 'Debiti',   color: '#8b5cf6', bg: 'bg-violet-50',  text: 'text-violet-500'  },
}

export function MonthlyDashboard() {
  const { profile, selectedYear, selectedMonth, setSelectedMonth, darkMode } = useAppStore()
  const currency = profile?.currency ?? 'EUR'
  const monthName = MONTH_NAMES[selectedMonth - 1]

  const { data: transactions = [], isFetching } = useQuery({
    queryKey: ['transactions', profile?.id, selectedYear],
    queryFn: async () => {
      const { data } = await supabase.from('transactions').select('*').eq('user_id', profile!.id)
        .gte('date', `${selectedYear}-01-01`).lte('date', `${selectedYear}-12-31`)
      return data ?? []
    },
    enabled: !!profile,
  })

  const { data: budgetPlans = [] } = useQuery({
    queryKey: ['budget_plans', profile?.id, selectedYear],
    queryFn: async () => {
      const { data } = await supabase.from('budget_plans').select('*, categories(*)').eq('user_id', profile!.id).eq('year', selectedYear)
      return data ?? []
    },
    enabled: !!profile,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', profile?.id],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('*').eq('user_id', profile!.id).eq('active', true)
      return data ?? []
    },
    enabled: !!profile,
  })

  const monthTx = transactions.filter((t: Transaction) => new Date(t.date).getMonth() + 1 === selectedMonth)

  const effectiveByType = Object.fromEntries(
    (Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => [
      type,
      monthTx.filter((t: Transaction) => t.type === type).reduce((s: number, t: Transaction) => s + t.amount, 0),
    ])
  )

  const budgetByType = Object.fromEntries(
    (Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => [
      type,
      budgetPlans
        .filter((b: BudgetPlan & { categories?: Category }) => b.categories?.type === type && b.month === selectedMonth)
        .reduce((s: number, b: BudgetPlan) => s + b.amount, 0),
    ])
  )

  const netEffective = effectiveByType['INCOME'] - effectiveByType['EXPENSES'] - effectiveByType['SAVINGS'] - effectiveByType['DEBTS']
  const netBudget = budgetByType['INCOME'] - budgetByType['EXPENSES'] - budgetByType['SAVINGS'] - budgetByType['DEBTS']

  const barData = (Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => ({
    name: TYPE_CONFIG[type].label,
    budget: budgetByType[type] ?? 0,
    effettivo: effectiveByType[type] ?? 0,
    color: TYPE_CONFIG[type].color,
  }))

  return (
    <div className="p-5 space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard Mensile</h1>
            {isFetching && (
              <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            )}
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{monthName} {selectedYear}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedMonth(Math.max(1, selectedMonth - 1))}
            disabled={selectedMonth === 1}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors shrink-0"
          >
            <ChevronLeft size={15} />
          </button>
          <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5">
            {MONTH_NAMES.map((m, i) => (
              <button
                key={m}
                onClick={() => setSelectedMonth(i + 1)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedMonth === i + 1
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSelectedMonth(Math.min(12, selectedMonth + 1))}
            disabled={selectedMonth === 12}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors shrink-0"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* 4 KPI Donut cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {(Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => {
          const cfg = TYPE_CONFIG[type]
          const eff = effectiveByType[type] ?? 0
          const bud = budgetByType[type] ?? 0
          const pct = bud > 0 ? Math.min((eff / bud) * 100, 100) : 0
          const delta = eff - bud
          const isIncome = type === 'INCOME'
          const isGood = isIncome ? eff >= bud : eff <= bud
          return (
            <div key={type} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 flex flex-col items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{cfg.label}</span>
              <DonutProgressRing
                percentage={pct}
                color={cfg.color}
                size={90}
                strokeWidth={9}
                centerLabel={`${Math.round(pct)}%`}
              />
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(eff, currency)}</p>
              {bud > 0 && (
                <p className={`text-xs font-medium ${isGood ? 'text-emerald-500' : 'text-rose-400'}`}>
                  {isIncome
                    ? (delta >= 0 ? `+${formatCurrency(delta, currency)} sopra` : `${formatCurrency(Math.abs(delta), currency)} sotto`)
                    : (delta <= 0 ? `${formatCurrency(Math.abs(delta), currency)} sotto al budget` : `+${formatCurrency(delta, currency)} oltre`)}
                </p>
              )}
              <p className="text-xs text-gray-300 dark:text-gray-600">Budget: {formatCurrency(bud, currency)}</p>
            </div>
          )
        })}
      </div>

      {/* Main content: Tables + Right panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Tables — left 2/3 */}
        <div className="xl:col-span-2 space-y-4">
          {(Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => {
            const cfg = TYPE_CONFIG[type]
            const typeCats = categories.filter((c: Category) => c.type === type)
            if (!typeCats.length) return null
            const isIncome = type === 'INCOME'
            return (
              <div key={type} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div
                  className="px-5 py-3 flex items-center gap-2"
                  style={{ borderLeft: `4px solid ${cfg.color}` }}
                >
                  <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{cfg.label}</span>
                  <span className={`ml-auto text-xs font-semibold ${cfg.text}`}>
                    {formatCurrency(effectiveByType[type], currency)} / {formatCurrency(budgetByType[type], currency)}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-700/50">
                      <th className="text-left px-5 py-2">Categoria</th>
                      <th className="text-right px-5 py-2">Obiettivo</th>
                      <th className="text-right px-5 py-2">Effettivo</th>
                      <th className="text-right px-5 py-2">Differenza</th>
                      <th className="text-right px-5 py-2">% budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeCats.map((cat: Category) => {
                      const eff = monthTx.filter((t: Transaction) => t.category_id === cat.id).reduce((s: number, t: Transaction) => s + t.amount, 0)
                      const bud = budgetPlans.find((b: BudgetPlan) => b.category_id === cat.id && b.month === selectedMonth)?.amount ?? 0
                      const diff = eff - bud
                      const pct = bud > 0 ? Math.round((eff / bud) * 100) : 0
                      const isGood = isIncome ? diff >= 0 : diff <= 0
                      return (
                        <tr key={cat.id} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/60 dark:hover:bg-gray-700/30">
                          <td className="px-5 py-2.5 text-gray-700 dark:text-gray-300">{cat.icon} {cat.name}</td>
                          <td className="px-5 py-2.5 text-right text-gray-400 dark:text-gray-500">{bud > 0 ? formatCurrency(bud, currency) : '—'}</td>
                          <td className="px-5 py-2.5 text-right font-medium text-gray-900 dark:text-gray-100">{eff > 0 ? formatCurrency(eff, currency) : '—'}</td>
                          <td className={`px-5 py-2.5 text-right font-medium ${bud > 0 ? (isGood ? 'text-emerald-500' : 'text-rose-400') : 'text-gray-300'}`}>
                            {bud > 0 ? (diff >= 0 ? '+' : '') + formatCurrency(diff, currency) : '—'}
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            {bud > 0 ? (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pct > 100 ? 'bg-rose-100 text-rose-600' : pct > 80 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                {pct}%
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>

        {/* Right panel — 1/3 */}
        <div className="space-y-4">

          {/* Effettivo vs Budget bar */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4">Effettivo vs Budget</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: darkMode ? '#94a3b8' : '#6b7280' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: darkMode ? '#94a3b8' : '#6b7280' }} width={55} />
                <Tooltip formatter={(v) => formatCurrency(Number(v), currency)} contentStyle={{ background: darkMode ? '#1e293b' : '#fff', border: '1px solid ' + (darkMode ? '#334155' : '#e5e7eb'), color: darkMode ? '#f1f5f9' : '#111827' }} />
                <Bar dataKey="budget" name="Budget" fill="#e5e7eb" radius={[0, 3, 3, 0]} barSize={8} />
                <Bar dataKey="effettivo" name="Effettivo" radius={[0, 3, 3, 0]} barSize={8}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Reddito residuo donuts */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4">Reddito Residuo</h3>
            <div className="space-y-4">
              {[
                { label: 'Effettivo', value: netEffective, base: effectiveByType['INCOME'] },
                { label: 'Budget', value: netBudget, base: budgetByType['INCOME'] },
              ].map((item) => {
                const pct = item.base > 0 ? Math.max(0, Math.min((item.value / item.base) * 100, 100)) : 0
                const color = pct >= 30 ? '#10b981' : pct >= 10 ? '#f59e0b' : '#f43f5e'
                return (
                  <div key={item.label} className="flex items-center gap-4">
                    <DonutProgressRing
                      percentage={pct}
                      color={color}
                      size={72}
                      strokeWidth={8}
                      centerLabel={`${Math.round(pct)}%`}
                    />
                    <div>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{item.label}</p>
                      <p className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(item.value, currency)}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">di {formatCurrency(item.base, currency)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick summary */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Riepilogo {monthName}</h3>
            {(Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => {
              const cfg = TYPE_CONFIG[type]
              const eff = effectiveByType[type] ?? 0
              const bud = budgetByType[type] ?? 0
              const pct = bud > 0 ? Math.round((eff / bud) * 100) : 0
              return (
                <div key={type} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">{cfg.label}</span>
                  <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(eff, currency)}</span>
                  {bud > 0 && <span className="text-xs text-gray-400 dark:text-gray-500">{pct}%</span>}
                </div>
              )
            })}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-2 flex justify-between">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Saldo netto</span>
              <span className={`text-xs font-bold ${netEffective >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                {formatCurrency(netEffective, currency)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
