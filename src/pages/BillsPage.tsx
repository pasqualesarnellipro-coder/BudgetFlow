import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { formatCurrency, MONTH_NAMES_FULL } from '@/lib/formatters'
import { Plus, Trash2, RefreshCw, CheckCircle2, Clock, Repeat2 } from 'lucide-react'
import { HelpTooltip } from '@/components/ui/HelpTooltip'
import type { RecurringBill, BillPeriod, Category } from '@/lib/database.types'

// Key for localStorage tracking: which bills have been auto-generated this month
function getStorageKey(year: number, month: number) {
  return `bf_generated_bills_${year}_${month}`
}

function getGeneratedBillIds(year: number, month: number): string[] {
  try {
    const raw = localStorage.getItem(getStorageKey(year, month))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function markBillGenerated(year: number, month: number, billId: string) {
  const existing = getGeneratedBillIds(year, month)
  if (!existing.includes(billId)) {
    localStorage.setItem(getStorageKey(year, month), JSON.stringify([...existing, billId]))
  }
}

// Auto-match emoji dal nome dell'abbonamento
function getSubscriptionEmoji(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('netflix'))                       return '🎬'
  if (n.includes('spotify') || n.includes('music'))return '🎵'
  if (n.includes('amazon'))                        return '📦'
  if (n.includes('disney'))                        return '🏰'
  if (n.includes('youtube'))                       return '▶️'
  if (n.includes('apple') || n.includes('icloud')) return '🍎'
  if (n.includes('adobe'))                         return '🎨'
  if (n.includes('palest') || n.includes('gym') || n.includes('fitness')) return '🏋️'
  if (n.includes('affitt'))                        return '🏠'
  if (n.includes('mutuo'))                         return '🏦'
  if (n.includes('luce') || n.includes('elettr'))  return '⚡'
  if (n.includes('gas'))                           return '🔥'
  if (n.includes('acqua'))                         return '💧'
  if (n.includes('telefon') || n.includes('phone') || n.includes('vodafone') || n.includes('tim')) return '📱'
  if (n.includes('internet') || n.includes('wifi') || n.includes('fibra')) return '📡'
  if (n.includes('assicur'))                       return '🛡️'
  if (n.includes('hype') || n.includes('satispay')|| n.includes('paypal')) return '💳'
  if (n.includes('sky') || n.includes('dazn') || n.includes('prime video')) return '📺'
  if (n.includes('dropbox') || n.includes('drive') || n.includes('cloud')) return '☁️'
  if (n.includes('notion') || n.includes('slack') || n.includes('zoom'))   return '💼'
  return '🔄'
}

const SUBSCRIPTION_PRESETS = [
  { name: 'Netflix', amount: 17.99 },
  { name: 'Spotify', amount: 11.99 },
  { name: 'Amazon Prime', amount: 4.99 },
  { name: 'Disney+', amount: 8.99 },
  { name: 'YouTube Premium', amount: 13.99 },
  { name: 'iCloud+', amount: 2.99 },
  { name: 'Adobe CC', amount: 59.99 },
  { name: 'Palestra', amount: 0 },
  { name: 'Affitto', amount: 0 },
  { name: 'Mutuo', amount: 0 },
]

export function BillsPage() {
  const { profile, t } = useAppStore()
  const qc = useQueryClient()
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear] = useState(new Date().getFullYear())
  const [showModal, setShowModal] = useState(false)
  const [autoToast, setAutoToast] = useState<string[]>([])
  const [autoError, setAutoError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    category_id: '',
    amount_due: '',
    period: 'MONTHLY' as BillPeriod,
    day_of_month: '1',
    auto_generate: true,
  })

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const { data: bills = [] } = useQuery({
    queryKey: ['bills', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('recurring_bills')
        .select('*')
        .eq('user_id', profile!.id)
        .eq('active', true)
        .order('day_of_month', { ascending: true })
      return data ?? []
    },
    enabled: !!profile,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', profile?.id],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('*').eq('user_id', profile!.id)
      return data ?? []
    },
    enabled: !!profile,
  })

  // Auto-generation: run when bills load
  useEffect(() => {
    if (!profile || bills.length === 0) return
    autoGenerateBills(bills, false)
  }, [bills, profile])

  const autoGenerateBills = async (billList: RecurringBill[], manual: boolean) => {
    if (!profile) return
    const generated: string[] = []
    const alreadyGenerated = getGeneratedBillIds(currentYear, currentMonth)

    for (const bill of billList) {
      if (bill.period !== 'MONTHLY') continue
      if (alreadyGenerated.includes(bill.id)) continue
      if (!manual && !(bill as RecurringBill & { auto_generate?: boolean }).auto_generate) continue

      // Check if a transaction already exists this month for this bill
      const monthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
      const monthEnd = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', profile.id)
        .eq('amount', bill.amount_due)
        .eq('category_id', bill.category_id)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .ilike('description', `%${bill.name}%`)
        .limit(1)

      if (existing && existing.length > 0) {
        markBillGenerated(currentYear, currentMonth, bill.id)
        continue
      }

      // Insert transaction
      const day = Math.min(bill.day_of_month, new Date(currentYear, currentMonth, 0).getDate())
      const date = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const { error } = await supabase.from('transactions').insert({
        user_id: profile.id,
        date,
        type: 'EXPENSES',
        category_id: bill.category_id,
        description: bill.name,
        amount: bill.amount_due,
        is_business: false,
        account_id: null,
      })
      if (error) {
        setAutoError(`Errore generando "${bill.name}": ${error.message}`)
        continue
      }
      markBillGenerated(currentYear, currentMonth, bill.id)
      generated.push(bill.name)
    }

    if (generated.length > 0) {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      setAutoToast(generated)
      setTimeout(() => setAutoToast([]), 5000)
    }
  }

  const handleSave = async () => {
    if (!profile || !form.name || !form.amount_due) return
    setSaveError(null)
    const { error } = await supabase.from('recurring_bills').insert({
      user_id: profile.id,
      name: form.name,
      category_id: form.category_id || null,
      amount_due: parseFloat(form.amount_due),
      amount_paid: 0,
      period: form.period,
      day_of_month: parseInt(form.day_of_month),
      active: true,
      auto_generate: form.auto_generate,
    })
    if (error) { setSaveError(`Errore nel salvataggio: ${error.message}`); return }
    qc.invalidateQueries({ queryKey: ['bills'] })
    setShowModal(false)
    setForm({ name: '', category_id: '', amount_due: '', period: 'MONTHLY', day_of_month: '1', auto_generate: true })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questo abbonamento?')) return
    await supabase.from('recurring_bills').update({ active: false }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['bills'] })
  }

  const applyPreset = (preset: { name: string; amount: number }) => {
    setForm((f) => ({
      ...f,
      name: preset.name,
      amount_due: preset.amount > 0 ? String(preset.amount) : '',
    }))
  }

  const currency = profile?.currency ?? 'EUR'
  const monthlyBills = bills.filter((b: RecurringBill) => b.period === 'MONTHLY')
  const monthlyTotal = monthlyBills.reduce((s: number, b: RecurringBill) => s + b.amount_due, 0)
  const annualTotal = bills.reduce((s: number, b: RecurringBill) => {
    if (b.period === 'MONTHLY') return s + b.amount_due * 12
    if (b.period === 'WEEKLY') return s + b.amount_due * 52
    return s + b.amount_due
  }, 0)

  const getCatName = (id: string) => categories.find((c: Category) => c.id === id)?.name ?? '—'
  const getCatIcon = (id: string) => categories.find((c: Category) => c.id === id)?.icon ?? ''
  const isGeneratedThisMonth = (id: string) => getGeneratedBillIds(currentYear, currentMonth).includes(id)

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const billsByDay: Record<number, RecurringBill[]> = {}
  monthlyBills.forEach((b: RecurringBill) => {
    const d = b.day_of_month
    if (!billsByDay[d]) billsByDay[d] = []
    billsByDay[d].push(b)
  })

  const FREQ_LABEL: Record<BillPeriod, string> = {
    MONTHLY: t('bills_freq_monthly'),
    WEEKLY: t('bills_freq_weekly'),
    ANNUAL: t('bills_freq_annual'),
  }

  return (
    <div className="p-5 space-y-5 max-w-5xl">

      {/* Toast successo auto-generazione */}
      {autoToast.length > 0 && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm flex items-center gap-2">
          <CheckCircle2 size={16} />
          <div>
            <p className="font-semibold">Transazioni generate automaticamente!</p>
            <p className="text-emerald-100 text-xs">{autoToast.join(', ')}</p>
          </div>
        </div>
      )}

      {/* Banner errore auto-generazione */}
      {autoError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
          <span className="text-rose-500 shrink-0">⚠</span>
          <div className="flex-1">
            <p className="text-sm text-rose-700">{autoError}</p>
          </div>
          <button onClick={() => setAutoError(null)} className="text-rose-400 hover:text-rose-600 text-lg leading-none">×</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{t('bills_title')}</h1>
            <HelpTooltip
              title="Abbonamenti & Ricorrenti"
              content="Inserisci qui Netflix, Spotify, affitto, mutuo e qualsiasi spesa ricorrente. Se attivi 'Inserisci automaticamente', BudgetFlow aggiungerà la transazione ogni mese al giorno che hai scelto, senza che tu faccia nulla."
              position="bottom"
              size="lg"
            />
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            Le transazioni mensili vengono inserite automaticamente ogni mese 🤖
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HelpTooltip
            content="Forza la generazione manuale delle transazioni per questo mese. Utile se hai aggiunto nuovi abbonamenti o se vuoi rieseguire il controllo."
            position="bottom"
          />
          <button
            onClick={() => autoGenerateBills(bills, true)}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-2 rounded-xl text-xs font-medium hover:bg-gray-50"
          >
            <RefreshCw size={13} /> Genera ora
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700"
          >
            <Plus size={16} /> {t('bills_add')}
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t('bills_monthly_total')}</p>
          <p className="text-xl font-bold text-rose-500">{formatCurrency(monthlyTotal, currency)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{monthlyBills.length} abbonamenti attivi</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t('bills_annual_total')}</p>
          <p className="text-xl font-bold text-violet-500">{formatCurrency(annualTotal, currency)}</p>
          <p className="text-xs text-gray-400 mt-0.5">proiettato su 12 mesi</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Generati questo mese</p>
          <p className="text-xl font-bold text-emerald-500">
            {monthlyBills.filter((b: RecurringBill) => isGeneratedThisMonth(b.id)).length}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">di {monthlyBills.length} mensili</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Da generare</p>
          <p className="text-xl font-bold text-amber-500">
            {monthlyBills.filter((b: RecurringBill) => !isGeneratedThisMonth(b.id)).length}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">in attesa</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Lista abbonamenti */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">I tuoi abbonamenti</h2>
            <span className="text-xs text-gray-400">{MONTH_NAMES_FULL[currentMonth - 1]} {currentYear}</span>
          </div>
          {bills.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Repeat2 size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">{t('bills_none')}</p>
              <button onClick={() => setShowModal(true)} className="mt-4 text-indigo-600 text-sm font-medium hover:underline">
                + Aggiungi il primo
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide bg-gray-50">
                  <th className="text-left px-5 py-2">Abbonamento</th>
                  <th className="text-right px-5 py-2">Importo</th>
                  <th className="text-center px-5 py-2">Giorno</th>
                  <th className="text-center px-5 py-2">Freq.</th>
                  <th className="text-center px-5 py-2">Stato</th>
                  <th className="px-5 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(bills as (RecurringBill & { auto_generate?: boolean })[]).map((b) => {
                  const generated = isGeneratedThisMonth(b.id)
                  return (
                    <tr key={b.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-base">
                            {getCatIcon(b.category_id) || getSubscriptionEmoji(b.name)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{b.name}</p>
                            <p className="text-xs text-gray-400">{getCatName(b.category_id)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-900">
                        {formatCurrency(b.amount_due, currency)}
                      </td>
                      <td className="px-5 py-3 text-center text-gray-500 text-xs">
                        {b.period === 'MONTHLY' ? `giorno ${b.day_of_month}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {FREQ_LABEL[b.period]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {b.period === 'MONTHLY' ? (
                          generated ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-medium">
                              <CheckCircle2 size={11} /> Generata
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-medium">
                              <Clock size={11} /> In attesa
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => handleDelete(b.id)} className="p-1 text-gray-300 hover:text-rose-500">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Calendario scadenze */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={() => setCalMonth((m) => m === 0 ? 11 : m - 1)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">←</button>
            <h2 className="text-sm font-semibold text-gray-700">{MONTH_NAMES_FULL[calMonth]} {calYear}</h2>
            <button onClick={() => setCalMonth((m) => m === 11 ? 0 : m + 1)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">→</button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-xs text-center">
            {['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do'].map((d, i) => (
              <div key={i} className="text-gray-400 font-semibold py-1 text-[10px]">{d}</div>
            ))}
            {/* firstDay da domenica (0) a lunedì (0) */}
            {Array((firstDay === 0 ? 6 : firstDay - 1)).fill(null).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dayBills = billsByDay[day] ?? []
              const hasBills = dayBills.length > 0
              const isToday = calMonth === now.getMonth() && calYear === now.getFullYear() && day === now.getDate()
              const isPast = new Date(calYear, calMonth, day) < new Date(calYear, now.getMonth(), now.getDate())
              return (
                <div
                  key={day}
                  title={hasBills ? dayBills.map(b => `${getSubscriptionEmoji(b.name)} ${b.name} — ${formatCurrency(b.amount_due, currency)}`).join('\n') : undefined}
                  className={`min-h-8 rounded-lg p-0.5 cursor-default transition-colors ${
                    isToday ? 'bg-indigo-600 ring-2 ring-indigo-300' :
                    hasBills ? (isPast ? 'bg-rose-100' : 'bg-rose-50 hover:bg-rose-100') :
                    'hover:bg-gray-50'
                  }`}
                >
                  <span className={`block text-center text-xs font-medium ${
                    isToday ? 'text-white' :
                    hasBills ? 'text-rose-700' :
                    'text-gray-500'
                  }`}>{day}</span>
                  {dayBills.slice(0, 2).map((b, i) => (
                    <div key={i} className="text-[8px] leading-tight truncate px-0.5 text-rose-500 font-medium">
                      {getSubscriptionEmoji(b.name)}
                    </div>
                  ))}
                  {dayBills.length > 2 && (
                    <div className="text-[8px] text-rose-400 text-center">+{dayBills.length - 2}</div>
                  )}
                </div>
              )
            })}
          </div>

          {monthlyTotal > 0 && (
            <div className="pt-3 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
              <span>Totale mensile</span>
              <span className="font-semibold text-rose-500">{formatCurrency(monthlyTotal, currency)}</span>
            </div>
          )}

          {/* Prossime scadenze */}
          {monthlyBills.length > 0 && (
            <div className="pt-2 border-t border-gray-100 space-y-1.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Prossime scadenze</p>
              {monthlyBills
                .filter((b: RecurringBill) => b.day_of_month >= now.getDate() || calMonth !== now.getMonth())
                .sort((a: RecurringBill, b: RecurringBill) => a.day_of_month - b.day_of_month)
                .slice(0, 4)
                .map((b: RecurringBill) => (
                  <div key={b.id} className="flex items-center gap-2">
                    <span className="text-sm">{getSubscriptionEmoji(b.name)}</span>
                    <span className="text-xs text-gray-700 flex-1 truncate">{b.name}</span>
                    <span className="text-[10px] text-gray-400">giorno {b.day_of_month}</span>
                    <span className="text-xs font-semibold text-rose-500">{formatCurrency(b.amount_due, currency)}</span>
                  </div>
                ))
              }
              {monthlyBills.filter((b: RecurringBill) => b.day_of_month < now.getDate() && calMonth === now.getMonth()).length > 0 && (
                <p className="text-[10px] text-gray-400 pt-1">
                  {monthlyBills.filter((b: RecurringBill) => b.day_of_month < now.getDate()).length} già passate questo mese
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal nuovo abbonamento */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b bg-indigo-50">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Nuovo abbonamento</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Inseriscilo una volta, BudgetFlow lo registra ogni mese 🤖</p>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Preset rapidi */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Scegli rapido o crea custom
                </label>
                <div className="flex flex-wrap gap-2">
                  {SUBSCRIPTION_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                        form.name === p.name
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Nome abbonamento
                </label>
                <input
                  type="text"
                  placeholder="Es. Netflix, Spotify, Palestra…"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Importo */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Importo</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">€</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      value={form.amount_due}
                      onChange={(e) => setForm({ ...form, amount_due: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                    />
                  </div>
                </div>

                {/* Frequenza */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Frequenza</label>
                  <select
                    value={form.period}
                    onChange={(e) => setForm({ ...form, period: e.target.value as BillPeriod })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                  >
                    <option value="MONTHLY">Mensile</option>
                    <option value="WEEKLY">Settimanale</option>
                    <option value="ANNUAL">Annuale</option>
                  </select>
                </div>
              </div>

              {/* Giorno del mese (solo mensile) */}
              {form.period === 'MONTHLY' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Giorno di addebito
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[1, 5, 10, 15, 20, 25, 28].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setForm({ ...form, day_of_month: String(d) })}
                        className={`w-9 h-9 rounded-lg text-sm font-medium border transition-colors ${
                          form.day_of_month === String(d)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                    {/* Campo libero — etichettato esplicitamente */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">oppure</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={![1,5,10,15,20,25,28].includes(+form.day_of_month) ? form.day_of_month : ''}
                        onChange={(e) => setForm({ ...form, day_of_month: e.target.value || '1' })}
                        className={`w-16 border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                          ![1,5,10,15,20,25,28].includes(+form.day_of_month)
                            ? 'border-indigo-400 bg-indigo-50 font-semibold text-indigo-700'
                            : 'border-gray-200 bg-white text-gray-500'
                        }`}
                        placeholder="1–31"
                      />
                    </div>
                  </div>
                  {/* Hint dinamico */}
                  <p className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-1.5">
                    📅 La transazione verrà creata il giorno <strong>{form.day_of_month}</strong> di ogni mese
                    {+form.day_of_month > 28 && (
                      <span className="text-indigo-500"> (nei mesi più brevi verrà usato l'ultimo giorno disponibile)</span>
                    )}
                  </p>
                </div>
              )}

              {/* Categoria */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Categoria <span className="font-normal text-gray-400 normal-case">(opzionale)</span>
                </label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                >
                  <option value="">— Nessuna categoria —</option>
                  {(categories as Category[]).filter((c) => c.type === 'EXPENSES').map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>

              {/* Auto-genera */}
              <label className="flex items-start gap-3 cursor-pointer group p-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-200 transition-colors">
                <input
                  type="checkbox"
                  checked={form.auto_generate}
                  onChange={(e) => setForm({ ...form, auto_generate: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded accent-indigo-600"
                />
                <div>
                  <span className="text-sm font-semibold text-gray-700">🤖 Inserisci automaticamente ogni mese</span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    BudgetFlow inserirà questa spesa come transazione all'inizio di ogni mese, senza che tu debba fare nulla.
                  </p>
                </div>
              </label>

              {saveError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <span className="text-rose-500 text-sm shrink-0">⚠</span>
                  <p className="text-xs text-rose-700">{saveError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => { setShowModal(false); setSaveError(null) }} className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-xl hover:bg-gray-50 text-sm">
                  {t('cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.name || !form.amount_due}
                  className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 text-sm"
                >
                  Salva abbonamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
