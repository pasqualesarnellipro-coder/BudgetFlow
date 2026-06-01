import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { formatCurrency, MONTH_NAMES } from '@/lib/formatters'
import type { Category, BudgetPlan } from '@/lib/database.types'
import { useState } from 'react'

const TYPE_CONFIG = {
  INCOME:   { label: 'Reddito',  color: '#10b981' },
  EXPENSES: { label: 'Spese',    color: '#f43f5e' },
  SAVINGS:  { label: 'Risparmi', color: '#f59e0b' },
  DEBTS:    { label: 'Debiti',   color: '#8b5cf6' },
}

export function AnnualBudgetPage() {
  const { profile, selectedYear, setSelectedYear } = useAppStore()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const years = [2023, 2024, 2025, 2026, 2027]

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
    budgetPlans.find((b: BudgetPlan) => b.category_id === catId && b.month === month)?.amount ?? 0

  const handleBlur = async (catId: string, month: number, value: string) => {
    if (!profile) return
    setSaving(true)
    const amount = parseFloat(value) || 0
    const existing = budgetPlans.find((b: BudgetPlan) => b.category_id === catId && b.month === month)
    if (existing) {
      await supabase.from('budget_plans').update({ amount }).eq('id', existing.id)
    } else {
      await supabase.from('budget_plans').insert({ user_id: profile.id, category_id: catId, year: selectedYear, month, amount })
    }
    await qc.invalidateQueries({ queryKey: ['budget_plans'] })
    setSaving(false)
  }

  const currency = profile?.currency ?? 'EUR'

  const getMonthBudgetByType = (type: string, month: number) => {
    return categories
      .filter((c: Category) => c.type === type)
      .reduce((s: number, c: Category) => s + getAmount(c.id, month), 0)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Budget Annuale</h1>
          {saving && <span className="text-xs text-gray-400">Salvataggio...</span>}
        </div>
        <select value={selectedYear} onChange={(e) => setSelectedYear(+e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-income/50">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary row */}
      <div className="bg-white rounded-xl shadow-sm p-4 overflow-x-auto">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Ancora da allocare per mese</p>
        <div className="flex gap-2 min-w-max">
          {MONTH_NAMES.map((m, i) => {
            const month = i + 1
            const income = getMonthBudgetByType('INCOME', month)
            const out = ['EXPENSES', 'SAVINGS', 'DEBTS'].reduce((s, t) => s + getMonthBudgetByType(t, month), 0)
            const residual = income - out
            return (
              <div key={m} className="text-center min-w-16">
                <p className="text-xs text-gray-400 mb-1">{m}</p>
                <p className={`text-xs font-bold ${residual >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {residual >= 0 ? '+' : ''}{formatCurrency(residual, currency)}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {(Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => {
        const typeCats = categories.filter((c: Category) => c.type === type)
        if (!typeCats.length) return null
        return (
          <div key={type} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100" style={{ borderLeft: `4px solid ${TYPE_CONFIG[type].color}` }}>
              <span className="font-semibold text-gray-900 text-sm">{TYPE_CONFIG[type].label}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-max">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-50">
                    <th className="text-left px-4 py-2 w-40">Categoria</th>
                    {MONTH_NAMES.map((m) => <th key={m} className="text-right px-2 py-2 w-20">{m}</th>)}
                    <th className="text-right px-4 py-2 w-24">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {typeCats.map((cat: Category) => {
                    const total = MONTH_NAMES.reduce((s, _, i) => s + getAmount(cat.id, i + 1), 0)
                    return (
                      <tr key={cat.id} className="border-t border-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">{cat.icon} {cat.name}</td>
                        {MONTH_NAMES.map((_, i) => (
                          <td key={i} className="px-2 py-1">
                            <input
                              type="number"
                              defaultValue={getAmount(cat.id, i + 1) || ''}
                              onBlur={(e) => handleBlur(cat.id, i + 1, e.target.value)}
                              placeholder="0"
                              className="w-full text-right text-xs border border-transparent hover:border-gray-300 focus:border-income rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-income/50 bg-transparent"
                            />
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-medium text-gray-900">{formatCurrency(total, currency)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
