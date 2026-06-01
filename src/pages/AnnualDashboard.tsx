import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { formatCurrency, MONTH_NAMES } from '@/lib/formatters'
import { calcNetto } from '@/lib/nettometro'
import { DonutProgressRing } from '@/components/ui/DonutProgressRing'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { TrendingUp, TrendingDown, PiggyBank, CreditCard, Calculator, Landmark, ArrowLeftRight, BarChart2 } from 'lucide-react'
import { HelpTooltip } from '@/components/ui/HelpTooltip'
import type { Transaction } from '@/lib/database.types'

const TYPE_CONFIG = {
  INCOME:   { label: 'Entrate',  color: '#10b981', icon: TrendingUp,   bg: 'bg-emerald-50' },
  EXPENSES: { label: 'Spese',    color: '#f43f5e', icon: TrendingDown, bg: 'bg-rose-50' },
  SAVINGS:  { label: 'Risparmi', color: '#f59e0b', icon: PiggyBank,    bg: 'bg-amber-50' },
  DEBTS:    { label: 'Debiti',   color: '#8b5cf6', icon: CreditCard,   bg: 'bg-violet-50' },
}

export function AnnualDashboard() {
  const navigate = useNavigate()
  const { profile, selectedYear, setSelectedYear, darkMode } = useAppStore()
  const currency = profile?.currency ?? 'EUR'
  const now = new Date()
  const currentMonth = now.toLocaleString('it-IT', { month: 'long', year: 'numeric' })
  const isFreelance = profile?.profile_type === 'FREELANCE' || profile?.profile_type === 'BOTH'

  const { data: transactions = [], isFetching } = useQuery({
    queryKey: ['transactions', profile?.id, selectedYear],
    queryFn: async () => {
      const { data } = await supabase.from('transactions').select('*')
        .eq('user_id', profile!.id)
        .gte('date', `${selectedYear}-01-01`)
        .lte('date', `${selectedYear}-12-31`)
      return data ?? []
    },
    enabled: !!profile,
  })

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', profile?.id, selectedYear],
    queryFn: async () => {
      const { data } = await supabase.from('invoices').select('*')
        .eq('user_id', profile!.id)
        .gte('date_issued', `${selectedYear}-01-01`)
        .lte('date_issued', `${selectedYear}-12-31`)
      return data ?? []
    },
    enabled: !!profile && isFreelance,
  })

  const { data: budgetPlans = [] } = useQuery({
    queryKey: ['budget_plans', profile?.id, selectedYear],
    queryFn: async () => {
      const { data } = await supabase.from('budget_plans').select('*, categories(*)')
        .eq('user_id', profile!.id).eq('year', selectedYear)
      return data ?? []
    },
    enabled: !!profile,
  })

  // Effettivi per tipo
  const effectiveByType = Object.fromEntries(
    (['INCOME', 'EXPENSES', 'SAVINGS', 'DEBTS'] as const).map((type) => [
      type,
      transactions.filter((t: Transaction) => t.type === type).reduce((s: number, t: Transaction) => s + t.amount, 0),
    ])
  )

  // Budget per tipo
  const budgetByType = Object.fromEntries(
    (['INCOME', 'EXPENSES', 'SAVINGS', 'DEBTS'] as const).map((type) => [
      type,
      budgetPlans
        .filter((b: { categories?: { type: string } }) => b.categories?.type === type)
        .reduce((s: number, b: { amount: number }) => s + b.amount, 0),
    ])
  )

  // Saldo netto
  const netBalance = effectiveByType['INCOME'] - effectiveByType['EXPENSES'] - effectiveByType['SAVINGS'] - effectiveByType['DEBTS']
  const savingsRate = effectiveByType['INCOME'] > 0
    ? (effectiveByType['SAVINGS'] / effectiveByType['INCOME']) * 100 : 0

  // Dati mensili per grafici
  const monthlyData = MONTH_NAMES.map((name, i) => {
    const m = i + 1
    const income = transactions.filter((t: Transaction) => t.type === 'INCOME' && new Date(t.date).getMonth() + 1 === m).reduce((s: number, t: Transaction) => s + t.amount, 0)
    const expenses = transactions.filter((t: Transaction) => t.type === 'EXPENSES' && new Date(t.date).getMonth() + 1 === m).reduce((s: number, t: Transaction) => s + t.amount, 0)
    const savings = transactions.filter((t: Transaction) => t.type === 'SAVINGS' && new Date(t.date).getMonth() + 1 === m).reduce((s: number, t: Transaction) => s + t.amount, 0)
    const debts = transactions.filter((t: Transaction) => t.type === 'DEBTS' && new Date(t.date).getMonth() + 1 === m).reduce((s: number, t: Transaction) => s + t.amount, 0)
    return { name, income, expenses, residual: income - expenses - savings - debts }
  })

  // Nettometro YTD
  const fatturatoYTD = invoices.reduce((s: number, i: { amount_gross: number }) => s + i.amount_gross, 0)
  const nettoCalc = profile && fatturatoYTD > 0
    ? calcNetto(fatturatoYTD, profile.tax_regime, profile.ateco_coefficient)
    : null
  const sogliaPercent = profile ? (fatturatoYTD / profile.vat_threshold) * 100 : 0
  const sogliaColor = sogliaPercent < 60 ? '#10b981' : sogliaPercent < 85 ? '#f59e0b' : '#f43f5e'
  const months = now.getMonth() + 1
  const pressureFiscale = nettoCalc && fatturatoYTD > 0
    ? (nettoCalc.totalAccrual / fatturatoYTD) * 100 : 0

  const years = [2023, 2024, 2025, 2026, 2027]
  const hasTransactions = transactions.length > 0

  return (
    <div className="p-5 space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Ciao, {profile?.name}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Panoramica di {currentMonth}.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isFetching && (
            <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">Anno</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(+e.target.value)}
            className="border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Empty state — nessuna transazione */}
      {!hasTransactions && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/50 dark:to-purple-950/50 border border-indigo-100 dark:border-indigo-800 rounded-2xl p-6 flex flex-col sm:flex-row items-start gap-4">
          <div className="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
            <ArrowLeftRight size={19} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-indigo-900 dark:text-indigo-200 text-base">Aggiungi la tua prima transazione</p>
            <p className="text-sm text-indigo-600/80 dark:text-indigo-300/80 mt-1 leading-relaxed">
              I grafici e le analisi si attivano non appena inserisci entrate e uscite.
              Puoi anche importare lo storico direttamente dal CSV della tua banca.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={() => navigate('/transactions')}
                className="text-sm font-semibold bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                + Aggiungi transazione
              </button>
              <button
                onClick={() => navigate('/accounts')}
                className="text-sm font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-transparent px-4 py-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
              >
                Configura i conti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {(Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => {
          const cfg = TYPE_CONFIG[type]
          const Icon = cfg.icon
          const eff = effectiveByType[type] ?? 0
          const bud = budgetByType[type] ?? 0
          const delta = eff - bud
          const isIncome = type === 'INCOME'
          return (
            <div key={type} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{cfg.label}</span>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${cfg.bg}`}>
                  <Icon size={14} style={{ color: cfg.color }} />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(eff, currency)}</p>
              {bud > 0 && (
                <p className={`text-xs mt-1 ${isIncome ? (eff >= bud ? 'text-emerald-500' : 'text-rose-400') : (eff <= bud ? 'text-emerald-500' : 'text-rose-400')}`}>
                  {delta > 0 ? '+' : ''}{formatCurrency(delta, currency)} vs budget
                </p>
              )}
              {type === 'SAVINGS' && effectiveByType['INCOME'] > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{Math.round(savingsRate)}% delle entrate</p>
              )}
              {type === 'DEBTS' && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Saldo netto: {formatCurrency(netBalance, currency)}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Tasso di risparmio */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <PiggyBank size={16} className="text-amber-500" />
          <span className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Tasso di risparmio</span>
          <HelpTooltip
            content="Percentuale delle entrate che stai risparmiando. L'obiettivo consigliato è almeno il 20%. Si calcola come: Risparmi ÷ Entrate × 100."
            position="right"
            size="md"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center">
            <DonutProgressRing
              percentage={savingsRate}
              color="#f59e0b"
              size={100}
              strokeWidth={10}
              centerLabel={`${Math.round(savingsRate)}%`}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">del mese</p>
          </div>
          <div className="flex-1 ml-8 space-y-3">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Obiettivo consigliato: <span className="text-amber-500 font-semibold">20%</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(savingsRate / 20 * 100, 100)}%`, backgroundColor: '#f59e0b' }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-400 dark:text-gray-500 text-xs">Risparmiato</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(effectiveByType['SAVINGS'], currency)}</p>
              </div>
              <div>
                <p className="text-gray-400 dark:text-gray-500 text-xs">Entrate totali</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(effectiveByType['INCOME'], currency)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Nettometro YTD + Soglia (solo freelance) */}
      {isFreelance && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Nettometro YTD */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Calculator size={15} className="text-indigo-500" />
              <span className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Nettometro (YTD)</span>
            <HelpTooltip
              title="Nettometro YTD"
              content="YTD = Year To Date (dall'inizio dell'anno ad oggi). Mostra quanto hai fatturato, quanto devi accantonare per tasse e INPS, e il tuo netto reale disponibile. I valori sono stime basate sul tuo regime fiscale."
              position="bottom"
              size="lg"
            />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Fatturato</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(fatturatoYTD, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Imponibile</span>
                <span className="text-gray-700 dark:text-gray-300">{formatCurrency(nettoCalc?.imponibile ?? 0, currency)}</span>
              </div>
              <div className="flex justify-between text-rose-500">
                <span>INPS</span>
                <span>– {formatCurrency(nettoCalc?.inps ?? 0, currency)}</span>
              </div>
              <div className="flex justify-between text-rose-500">
                <span>Tasse</span>
                <span>– {formatCurrency(nettoCalc?.taxes ?? 0, currency)}</span>
              </div>
              <div className="border-t border-gray-100 dark:border-gray-600 pt-2 flex justify-between font-bold">
                <span className="text-gray-700 dark:text-gray-300">Netto stimato</span>
                <span className="text-emerald-600">{formatCurrency(nettoCalc?.netAmount ?? 0, currency)}</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Pressione fiscale = <span className="font-medium text-gray-600 dark:text-gray-400">{pressureFiscale.toFixed(1)}%</span>
              </p>
            </div>
          </div>

          {/* Soglia Regime */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Landmark size={15} className="text-violet-500" />
              <span className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Soglia regime</span>
            <HelpTooltip
              title="Soglia Regime Forfettario"
              content="Il regime forfettario ha un limite di fatturato annuo (es. 85.000€). Se superi la soglia, esci dal regime agevolato. La barra diventa gialla sopra il 60% e rossa sopra l'85% come allerta."
              position="bottom"
              size="lg"
            />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(fatturatoYTD, currency)}
                </span>
                <span className="text-gray-400 dark:text-gray-500">/ {formatCurrency(profile?.vat_threshold ?? 85000, currency)}</span>
                <span className="font-bold" style={{ color: sogliaColor }}>{Math.round(sogliaPercent)}%</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(sogliaPercent, 100)}%`, backgroundColor: sogliaColor }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span className={sogliaPercent < 60 ? 'text-emerald-600 font-medium' : 'text-gray-400'}>
                  {sogliaPercent < 60 ? 'Tutto ok' : sogliaPercent < 85 ? 'Attenzione' : 'Vicino alla soglia'}
                </span>
                <span>Rimanenti: <span className="font-semibold text-gray-600 dark:text-gray-400">{formatCurrency(Math.max(0, (profile?.vat_threshold ?? 85000) - fatturatoYTD), currency)}</span></span>
              </div>
              {months > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Media mensile: <span className="font-medium text-gray-600 dark:text-gray-400">{formatCurrency(fatturatoYTD / months, currency)}/mese</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grafici */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4">Reddito residuo per mese</h2>
          {hasTransactions ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: darkMode ? '#94a3b8' : '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: darkMode ? '#94a3b8' : '#6b7280' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v, currency)} contentStyle={{ background: darkMode ? '#1e293b' : '#fff', border: '1px solid ' + (darkMode ? '#334155' : '#e5e7eb'), color: darkMode ? '#f1f5f9' : '#111827' }} />
                <Bar dataKey="residual" fill="#10b981" radius={[4, 4, 0, 0]} name="Residuo" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex flex-col items-center justify-center gap-2 text-gray-300">
              <BarChart2 size={36} strokeWidth={1.2} />
              <p className="text-xs text-gray-400 dark:text-gray-500">Dati disponibili dopo la prima transazione</p>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4">Entrate vs Spese per mese</h2>
          {hasTransactions ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: darkMode ? '#94a3b8' : '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: darkMode ? '#94a3b8' : '#6b7280' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v, currency)} contentStyle={{ background: darkMode ? '#1e293b' : '#fff', border: '1px solid ' + (darkMode ? '#334155' : '#e5e7eb'), color: darkMode ? '#f1f5f9' : '#111827' }} />
                <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={false} name="Entrate" />
                <Line type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={2} dot={false} name="Spese" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex flex-col items-center justify-center gap-2 text-gray-300">
              <BarChart2 size={36} strokeWidth={1.2} />
              <p className="text-xs text-gray-400 dark:text-gray-500">Dati disponibili dopo la prima transazione</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
