import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { calcNetto } from '@/lib/nettometro'
import { formatCurrency, MONTH_NAMES_FULL } from '@/lib/formatters'
import { DonutProgressRing } from '@/components/ui/DonutProgressRing'
import {
  calcFiscale, buildScadenze, buildMonthlyRateChart,
  type FiscaleInput,
} from '@/lib/fiscalePlanning'
import type { Invoice, InvoiceStatus } from '@/lib/database.types'
import {
  Plus, Trash2, RefreshCw, TrendingUp, Euro, Wallet, ShieldCheck,
  CalendarClock, ChevronDown, ChevronUp, Info, BarChart2, Upload,
  ArrowUpDown, ArrowUp, ArrowDown, CheckSquare, Square,
} from 'lucide-react'
import { InvoiceImportModal } from '@/components/import/InvoiceImportModal'
import { HelpTooltip } from '@/components/ui/HelpTooltip'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts'

// ─── Tipo colori scadenze ────────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  IS:       '#6366f1',
  INPS_VAR: '#f43f5e',
  INPS_FIS: '#f59e0b',
}
const CAT_LABEL: Record<string, string> = {
  IS:       'Imp. Sostitutiva',
  INPS_VAR: 'INPS variabile',
  INPS_FIS: 'INPS fisso IVS',
}

export function FreelanceHub() {
  const { profile, selectedYear, setSelectedYear } = useAppStore()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [grossInput, setGrossInput] = useState('')
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showFiscale, setShowFiscale] = useState(true)
  const [showInvoiceImport, setShowInvoiceImport] = useState(false)
  const [sortCol, setSortCol] = useState<'date_issued' | 'client_name' | 'amount_gross' | 'due_date' | 'status'>('date_issued')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [invoiceForm, setInvoiceForm] = useState({
    date_issued: new Date().toISOString().slice(0, 10),
    client_name: '',
    amount_gross: '',
    due_date: '',
    status: 'PENDING' as InvoiceStatus,
    activity_name: '',
  })

  // Overrides per il pannello Pianificazione Fiscale
  const [prevYearInps, setPrevYearInps] = useState(0)
  const [accontiIS, setAccontiIS] = useState(0)
  const [accontiINPS, setAccontiINPS] = useState(0)
  const [giàAccantonato, setGiàAccantonato] = useState(0)

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices', profile?.id, selectedYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', profile!.id)
        .gte('date_issued', `${selectedYear}-01-01`)
        .lte('date_issued', `${selectedYear}-12-31`)
        .order('date_issued', { ascending: false })
      return data ?? []
    },
    enabled: !!profile,
  })

  if (!profile) return null
  const currency = profile.currency

  const fatturatoYTD = invoices.reduce((s: number, i: Invoice) => s + i.amount_gross, 0)
  const totalAccrued = invoices.reduce((s: number, i: Invoice) => s + i.tax_amount + i.inps_amount, 0)
  const netDisponibile = invoices.reduce((s: number, i: Invoice) => s + i.amount_net, 0)
  const sogliaPercent = (fatturatoYTD / profile.vat_threshold) * 100

  const monthsElapsed = new Date().getMonth() + 1
  const monthlyRate = fatturatoYTD / monthsElapsed
  const projectedAnnual = monthlyRate * 12
  const monthsToThreshold = projectedAnnual > 0 ? (profile.vat_threshold / monthlyRate) : null
  const projectionText = monthsToThreshold
    ? `Al ritmo attuale: ${MONTH_NAMES_FULL[Math.min(Math.floor(monthsToThreshold) - 1, 11)]} ${selectedYear}`
    : 'Nessuna proiezione disponibile'

  const netto = grossInput ? calcNetto(parseFloat(grossInput), profile.tax_regime, profile.ateco_coefficient, profile.inps_regime ?? 'GESTIONE_SEPARATA', profile.inps_reduction_pct ?? 0) : null

  // ─── Pianificazione Fiscale ────────────────────────────────────────────────
  const fiscaleInput: FiscaleInput = useMemo(() => ({
    fatturato: fatturatoYTD,
    taxRegime: profile.tax_regime,
    atecoCoefficient: profile.ateco_coefficient ?? 0.78,
    inpsRegime: profile.inps_regime ?? 'GESTIONE_SEPARATA',
    inpsReductionPct: profile.inps_reduction_pct ?? 0,
    prevYearInps,
    accontiISPagati: accontiIS,
    accontiINPSPagati: accontiINPS,
    giàAccantonato,
    year: selectedYear,
    currentMonth: new Date().getMonth() + 1,
    stipendioAnnuoLordo: profile.profile_type === 'BOTH' ? (profile.stipendio_annuo_lordo ?? 0) : 0,
  }), [fatturatoYTD, profile, prevYearInps, accontiIS, accontiINPS, giàAccantonato, selectedYear])

  const fiscale = useMemo(() => calcFiscale(fiscaleInput), [fiscaleInput])
  const scadenze = useMemo(
    () => buildScadenze(fiscaleInput, {
      impostaSostitutiva: fiscale.impostaSostitutiva,
      saldoIS: fiscale.saldoIS,
      primoAccontoIS: fiscale.primoAccontoIS,
      secondoAccontoIS: fiscale.secondoAccontoIS,
      inpsVariabile: fiscale.inpsVariabile,
      inpsFisso: fiscale.inpsFisso,
      saldoINPS: fiscale.saldoINPS,
      accontoINPS1: fiscale.accontoINPS1,
      accontoINPS2: fiscale.accontoINPS2,
    }),
    [fiscaleInput, fiscale],
  )
  const chartData = useMemo(
    () => buildMonthlyRateChart(scadenze, fiscale.totaleOneri, selectedYear),
    [scadenze, fiscale.totaleOneri, selectedYear],
  )

  const handleAddInvoice = async () => {
    if (!profile || !invoiceForm.amount_gross) return
    const gross = parseFloat(invoiceForm.amount_gross)
    const result = calcNetto(gross, profile.tax_regime, profile.ateco_coefficient, profile.inps_regime ?? 'GESTIONE_SEPARATA', profile.inps_reduction_pct ?? 0)
    await supabase.from('invoices').insert({
      user_id: profile.id,
      ...invoiceForm,
      amount_gross: gross,
      amount_net: result.netAmount,
      tax_amount: result.taxes,
      inps_amount: result.inps,
    })
    qc.invalidateQueries({ queryKey: ['invoices'] })
    setShowInvoiceModal(false)
    setInvoiceForm({ date_issued: new Date().toISOString().slice(0, 10), client_name: '', amount_gross: '', due_date: '', status: 'PENDING', activity_name: '' })
  }

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm('Eliminare questa fattura?')) return
    await supabase.from('invoices').delete().eq('id', id)
    setSelectedInvoices((prev) => { const next = new Set(prev); next.delete(id); return next })
    qc.invalidateQueries({ queryKey: ['invoices'] })
  }

  const handleDeleteSelected = async () => {
    if (selectedInvoices.size === 0) return
    if (!confirm(`Eliminare ${selectedInvoices.size} fatture selezionate?`)) return
    await supabase.from('invoices').delete().in('id', [...selectedInvoices])
    setSelectedInvoices(new Set())
    qc.invalidateQueries({ queryKey: ['invoices'] })
  }

  const handleUpdateStatus = async (id: string, status: InvoiceStatus) => {
    await supabase.from('invoices').update({ status }).eq('id', id)
    setEditingStatusId(null)
    qc.invalidateQueries({ queryKey: ['invoices'] })
  }

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sortedInvoices = useMemo(() => {
    return [...invoices].sort((a: Invoice, b: Invoice) => {
      let va: string | number = a[sortCol] ?? ''
      let vb: string | number = b[sortCol] ?? ''
      if (sortCol === 'amount_gross') { va = Number(va); vb = Number(vb) }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [invoices, sortCol, sortDir])

  const allSelected = sortedInvoices.length > 0 && sortedInvoices.every((inv: Invoice) => selectedInvoices.has(inv.id))
  const toggleAll = () => {
    if (allSelected) setSelectedInvoices(new Set())
    else setSelectedInvoices(new Set(sortedInvoices.map((inv: Invoice) => inv.id)))
  }

  const sogliaColor = sogliaPercent < 60 ? '#10b981' : sogliaPercent < 85 ? '#f59e0b' : '#f43f5e'
  const STATUS_COLORS: Record<InvoiceStatus, string> = {
    PAID: 'text-emerald-600 bg-emerald-50',
    PENDING: 'text-amber-600 bg-amber-50',
    OVERDUE: 'text-rose-600 bg-rose-50',
  }
  const STATUS_LABELS: Record<InvoiceStatus, string> = {
    PAID: 'Pagata',
    PENDING: 'In attesa',
    OVERDUE: 'Scaduta',
  }

  const today = new Date().toISOString().slice(0, 10)
  const prossimeScadenze = scadenze.filter((s) => s.date >= today).slice(0, 3)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Freelance Hub</h1>
        <div className="flex items-center gap-2">
          {/* Selettore anno */}
          <div className="flex items-center gap-1 border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setSelectedYear(selectedYear - 1)}
              className="px-2.5 py-1.5 text-gray-500 hover:bg-gray-100 transition-colors text-sm font-medium"
              aria-label="Anno precedente"
            >
              ←
            </button>
            <span className="px-3 py-1.5 text-sm font-bold text-gray-800 border-x border-gray-200 min-w-[56px] text-center">
              {selectedYear}
            </span>
            <button
              onClick={() => setSelectedYear(selectedYear + 1)}
              disabled={selectedYear >= new Date().getFullYear()}
              className="px-2.5 py-1.5 text-gray-500 hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Anno successivo"
            >
              →
            </button>
          </div>
          <button
            onClick={() => qc.refetchQueries({ queryKey: ['invoices'] })}
            disabled={invoicesLoading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={invoicesLoading ? 'animate-spin' : ''} />
            Aggiorna
          </button>
        </div>
      </div>

      {/* Soglia Forfettaria */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Soglia Forfettaria {selectedYear}</h2>
          <span className="text-sm font-medium" style={{ color: sogliaColor }}>{Math.round(sogliaPercent)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(sogliaPercent, 100)}%`, backgroundColor: sogliaColor }}
          />
        </div>
        <div className="flex justify-between text-sm text-gray-500">
          <span>{formatCurrency(fatturatoYTD, currency)} fatturati</span>
          <span>Soglia: {formatCurrency(profile.vat_threshold, currency)}</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">{projectionText}</p>
        <div className="flex gap-2 mt-3">
          {[60, 75, 85, 95].map((t) => (
            <span key={t} className={`text-xs px-2 py-0.5 rounded-full ${sogliaPercent >= t ? 'bg-rose-100 text-rose-600' : 'bg-gray-100 text-gray-400'}`}>
              {t}%
            </span>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Fatturato Lordo', value: fatturatoYTD, color: '#6366f1', Icon: TrendingUp, pct: sogliaPercent },
          { label: 'Totale Accantonato', value: totalAccrued, color: '#f43f5e', Icon: ShieldCheck, pct: (totalAccrued / (fatturatoYTD || 1)) * 100 },
          { label: 'Netto Disponibile', value: netDisponibile, color: '#10b981', Icon: Wallet, pct: (netDisponibile / (fatturatoYTD || 1)) * 100 },
          { label: 'RataPilota / mese', value: fiscale.rataPilota, color: '#f59e0b', Icon: Euro, pct: fiscale.pressureFiscale },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3" style={{ borderTop: `4px solid ${kpi.color}` }}>
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{kpi.label}</p>
              {invoicesLoading ? (
                <div className="h-7 w-20 bg-gray-100 rounded-lg animate-pulse mt-1" />
              ) : (
                <p className="text-lg font-bold text-gray-900">{formatCurrency(kpi.value, currency)}</p>
              )}
            </div>
            {invoicesLoading
              ? <div className="w-[52px] h-[52px] rounded-full bg-gray-100 animate-pulse shrink-0" />
              : <DonutProgressRing percentage={kpi.pct} color={kpi.color} size={52} strokeWidth={6} />
            }
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PIANIFICAZIONE FISCALE — RataPilota
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* Header collapsibile */}
        <button
          onClick={() => setShowFiscale((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <CalendarClock size={16} className="text-indigo-600" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900 text-sm">Pianificazione Fiscale — RataPilota</p>
              <p className="text-xs text-gray-400">Calcolo acconti, saldi e rata mensile da accantonare</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {fatturatoYTD > 0 && (
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                {formatCurrency(fiscale.rataPilota, currency)}/mese
              </span>
            )}
            {showFiscale ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </div>
        </button>

        {showFiscale && (
          <div className="border-t border-gray-100">
            {fatturatoYTD === 0 ? (
              <div className="px-5 py-10 text-center">
                <BarChart2 size={32} className="text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Registra le prime fatture per attivare la pianificazione fiscale.</p>
              </div>
            ) : (
              <div className="p-5 space-y-6">

                {/* SmartRate hero */}
                <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-5 text-white">
                  <p className="text-white/70 text-xs uppercase tracking-widest mb-1">RataPilota mensile</p>
                  <p className="text-4xl font-bold mb-1">{formatCurrency(fiscale.rataPilota, currency)}</p>
                  <p className="text-white/70 text-sm">
                    da accantonare ogni mese per i prossimi <strong className="text-white">{fiscale.mesiRimanenti} mesi</strong>
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-white/60 text-xs mb-1">Imp. Sostitutiva</p>
                      <p className="font-bold text-sm">{formatCurrency(fiscale.impostaSostitutiva, currency)}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-white/60 text-xs mb-1">INPS totale</p>
                      <p className="font-bold text-sm">{formatCurrency(fiscale.inpsTotale, currency)}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-white/60 text-xs mb-1">Pressione fiscale</p>
                      <p className="font-bold text-sm">{fiscale.pressureFiscale.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>

                {/* Dettaglio calcolo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* IS */}
                  <div className="bg-indigo-50 rounded-2xl p-4 space-y-2.5">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-3">Imposta Sostitutiva</p>
                    <Row label="Imponibile lordo" value={formatCurrency(fiscale.imponibileLordo, currency)} />
                    <Row label="Imponibile netto (- INPS prev.)" value={formatCurrency(fiscale.imponibileNetto, currency)} />
                    <Row label={`IS (aliquota ${profile.tax_regime === 'FORFETTARIO_5' ? '5' : profile.tax_regime === 'FORFETTARIO_15' ? '15' : '27'}%)`} value={formatCurrency(fiscale.impostaSostitutiva, currency)} accent />
                    <div className="border-t border-indigo-200 pt-2.5 space-y-1.5">
                      <Row label="Saldo IS da pagare" value={formatCurrency(fiscale.saldoIS, currency)} />
                      <Row label="1° Acconto IS (40%) — giu" value={formatCurrency(fiscale.primoAccontoIS, currency)} muted />
                      <Row label="2° Acconto IS (50%) — nov" value={formatCurrency(fiscale.secondoAccontoIS, currency)} muted />
                    </div>
                  </div>

                  {/* INPS */}
                  <div className="bg-rose-50 rounded-2xl p-4 space-y-2.5">
                    <p className="text-xs font-bold text-rose-700 uppercase tracking-wide mb-1">INPS</p>
                    <p className="text-[11px] text-rose-500 mb-3">{fiscale.inpsRegimeLabel}</p>
                    <Row label="INPS variabile" value={formatCurrency(fiscale.inpsVariabile, currency)} accent />
                    {fiscale.inpsFisso > 0 && <Row label="INPS fisso (IVS)" value={formatCurrency(fiscale.inpsFisso, currency)} accent />}
                    <Row label="INPS totale" value={formatCurrency(fiscale.inpsTotale, currency)} bold />
                    <div className="border-t border-rose-200 pt-2.5 space-y-1.5">
                      <Row label="Saldo INPS da pagare" value={formatCurrency(fiscale.saldoINPS, currency)} />
                      <Row label="1° Acconto INPS (40%) — giu" value={formatCurrency(fiscale.accontoINPS1, currency)} muted />
                      <Row label="2° Acconto INPS (40%) — nov" value={formatCurrency(fiscale.accontoINPS2, currency)} muted />
                    </div>
                  </div>
                </div>

                {/* Parametri avanzati */}
                <details className="group">
                  <summary className="flex items-center gap-2 cursor-pointer list-none text-sm text-gray-500 hover:text-gray-700">
                    <Info size={14} />
                    <span className="group-open:hidden">Mostra parametri avanzati (acconti già versati, INPS anno precedente…)</span>
                    <span className="hidden group-open:block">Nascondi parametri avanzati</span>
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">INPS versato anno precedente (€)</label>
                      <input type="number" value={prevYearInps} onChange={(e) => setPrevYearInps(+e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Acconti IS già versati (€)</label>
                      <input type="number" value={accontiIS} onChange={(e) => setAccontiIS(+e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Acconti INPS già versati (€)</label>
                      <input type="number" value={accontiINPS} onChange={(e) => setAccontiINPS(+e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Già accantonato (€)</label>
                      <input type="number" value={giàAccantonato} onChange={(e) => setGiàAccantonato(+e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                  </div>
                </details>

                {/* Grafico Smart Rate vs Senza piano */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm font-semibold text-gray-700">RataPilota vs. senza pianificazione</p>
                    <div className="flex items-center gap-3 ml-auto">
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" /> Rata flat
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <span className="w-3 h-3 rounded-sm bg-orange-400 inline-block" /> Picchi reali
                      </span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} barCategoryGap="20%" barGap={2}>
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip
                        formatter={(v, name) => [
                          formatCurrency(Number(v), currency),
                          name === 'rataPilota' ? 'RataPilota' : 'Senza piano',
                        ]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />
                      <ReferenceLine y={fiscale.rataPilota} stroke="#6366f1" strokeDasharray="4 2" strokeWidth={1.5} />
                      <Bar dataKey="senzaPiano" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.senzaPiano > fiscale.rataPilota * 1.5 ? '#fb923c' : '#e5e7eb'}
                          />
                        ))}
                      </Bar>
                      <Bar dataKey="rataPilota" fill="#6366f1" radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 text-center mt-1">
                    Accantonando {formatCurrency(fiscale.rataPilota, currency)}/mese con RataPilota eviti i picchi nei mesi di scadenza.
                  </p>
                </div>

                {/* Calendario Scadenze */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Calendario Scadenze {selectedYear}</p>
                  {prossimeScadenze.length > 0 && (
                    <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                      {prossimeScadenze.map((s, i) => (
                        <div key={i} className="shrink-0 border rounded-xl p-3 min-w-36" style={{ borderColor: CAT_COLOR[s.category] + '60', backgroundColor: CAT_COLOR[s.category] + '08' }}>
                          <p className="text-xs text-gray-400">{s.date}</p>
                          <p className="font-bold text-sm mt-0.5" style={{ color: CAT_COLOR[s.category] }}>{formatCurrency(s.amount, currency)}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-tight">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                          <th className="text-left px-4 py-2.5">Data</th>
                          <th className="text-left px-4 py-2.5">Scadenza</th>
                          <th className="text-left px-4 py-2.5">Tipo</th>
                          <th className="text-right px-4 py-2.5">Importo</th>
                          <th className="text-right px-4 py-2.5">Progressivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scadenze.map((s, i) => {
                          const isPast = s.date < today
                          return (
                            <tr key={i} className={`border-t border-gray-50 ${isPast ? 'opacity-40' : ''}`}>
                              <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{s.date}</td>
                              <td className="px-4 py-2.5 text-gray-800 text-xs">{s.label}</td>
                              <td className="px-4 py-2.5">
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={{ backgroundColor: CAT_COLOR[s.category] + '18', color: CAT_COLOR[s.category] }}>
                                  {CAT_LABEL[s.category]}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right font-semibold text-gray-900 text-xs">
                                {formatCurrency(s.amount, currency)}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-400 text-xs">
                                {formatCurrency(s.cumulative, currency)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t border-gray-200">
                          <td colSpan={3} className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Totale oneri fiscali</td>
                          <td colSpan={2} className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(fiscale.totaleOneri, currency)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Utile netto stimato */}
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Utile netto stimato P.IVA {selectedYear}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Fatturato lordo − INPS totale − Imposta Sostitutiva</p>
                  </div>
                  <p className="text-2xl font-bold text-emerald-700">{formatCurrency(fiscale.utileNetto, currency)}</p>
                </div>

                {/* Caso ibrido */}
                {fiscale.isIbrido && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-amber-200 flex items-center justify-center">
                        <Info size={13} className="text-amber-700" />
                      </div>
                      <p className="text-sm font-bold text-amber-800">Riepilogo caso ibrido (dipendente + P.IVA)</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-amber-700">Stipendio netto stimato</span>
                        <span className="font-semibold text-amber-900">{formatCurrency(fiscale.stipendioNettoStimato, currency)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-amber-700">Utile netto P.IVA</span>
                        <span className="font-semibold text-amber-900">{formatCurrency(fiscale.utileNetto, currency)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold border-t border-amber-200 pt-2">
                        <span className="text-amber-800">Reddito netto totale stimato</span>
                        <span className="text-amber-900 text-base">{formatCurrency(fiscale.redditoTotale, currency)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-amber-600 leading-relaxed">
                      Il reddito da lavoro dipendente è già tassato con IRPEF e INPS alla fonte dal tuo datore di lavoro — non rientra nel calcolo forfettario P.IVA. Il netto stimato usa aliquote IRPEF medie indicative (senza detrazioni personali).
                    </p>
                    <button
                      onClick={() => navigate('/settings')}
                      className="text-xs text-amber-700 underline hover:text-amber-900"
                    >
                      Modifica stipendio nelle Impostazioni →
                    </button>
                  </div>
                )}

              </div>
            )}
          </div>
        )}
      </div>

      {/* Nettometro */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Il Nettometro</h2>
        <div className="flex gap-3 items-start flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-600 mb-1">Importo fattura lordo (€)</label>
            <input
              type="number"
              value={grossInput}
              onChange={(e) => setGrossInput(e.target.value)}
              placeholder="Es. 1000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          {netto && (
            <div className="flex-1 bg-gray-50 rounded-xl p-4 space-y-2 text-sm min-w-64">
              <div className="flex justify-between"><span className="text-gray-500">Reddito imponibile</span><span>{formatCurrency(netto.imponibile, currency)}</span></div>
              <div className="flex justify-between text-rose-600"><span>Tasse da accantonare</span><span>-{formatCurrency(netto.taxes, currency)}</span></div>
              <div className="flex justify-between text-rose-600"><span>INPS da accantonare</span><span>-{formatCurrency(netto.inps, currency)}</span></div>
              <div className="flex justify-between font-semibold text-gray-700 border-t pt-2"><span>Tot. accantonamento</span><span>-{formatCurrency(netto.totalAccrual, currency)}</span></div>
              <div className="flex justify-between font-bold text-emerald-600 text-base"><span>Netto reale</span><span>{formatCurrency(netto.netAmount, currency)}</span></div>
              <button
                onClick={() => { setShowInvoiceModal(true); setInvoiceForm((f) => ({ ...f, amount_gross: grossInput })) }}
                className="w-full mt-2 text-xs bg-indigo-500 text-white py-1.5 rounded-lg hover:bg-indigo-600"
              >
                Registra come fattura
              </button>
            </div>
          )}
        </div>
      </div>


      {/* Fatture Emesse */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 flex-wrap">
          <h2 className="font-semibold text-gray-900 mr-auto">
            Fatture Emesse
            {invoices.length > 0 && <span className="ml-2 text-xs text-gray-400 font-normal">{invoices.length} totali</span>}
          </h2>
          {selectedInvoices.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 border border-rose-200 text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-rose-100 transition-colors"
            >
              <Trash2 size={12} /> Elimina selezionate ({selectedInvoices.size})
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowInvoiceImport(true)}
              className="flex items-center gap-1.5 border border-indigo-200 text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors"
            >
              <Upload size={12} /> Importa AI
            </button>
            <HelpTooltip
              title="Importa fatture con AI"
              content="Carica una fattura in PDF, foto o Excel. Claude AI legge automaticamente i dati (cliente, data, importo) e li pre-compila nel form. Funziona anche con foto di fatture cartacee. Richiede la configurazione della Supabase Edge Function — vedi SETUP.md."
              position="bottom"
              size="lg"
            />
          </div>
          <button onClick={() => setShowInvoiceModal(true)} className="flex items-center gap-1.5 bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-600">
            <Plus size={13} /> Aggiungi
          </button>
        </div>

        {/* Tabella */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                {/* Checkbox seleziona tutto */}
                <th className="px-4 py-3 w-8">
                  <button onClick={toggleAll} className="text-gray-400 hover:text-indigo-600 transition-colors">
                    {allSelected ? <CheckSquare size={15} className="text-indigo-500" /> : <Square size={15} />}
                  </button>
                </th>
                {([
                  { col: 'date_issued',   label: 'Data',      align: 'left'  },
                  { col: 'client_name',   label: 'Cliente',   align: 'left'  },
                  { col: 'amount_gross',  label: 'Lordo',     align: 'right' },
                  { col: null,            label: 'Netto',     align: 'right' },
                  { col: null,            label: 'Tasse+INPS',align: 'right' },
                  { col: 'due_date',      label: 'Scadenza',  align: 'left'  },
                  { col: 'status',        label: 'Stato',     align: 'left'  },
                ] as { col: typeof sortCol | null; label: string; align: string }[]).map(({ col, label, align }) => (
                  <th
                    key={label}
                    className={`px-4 py-3 text-${align} ${col ? 'cursor-pointer select-none hover:text-indigo-600' : ''} whitespace-nowrap`}
                    onClick={() => col && handleSort(col)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {col && (
                        sortCol === col
                          ? sortDir === 'asc' ? <ArrowUp size={11} className="text-indigo-500" /> : <ArrowDown size={11} className="text-indigo-500" />
                          : <ArrowUpDown size={11} className="text-gray-300" />
                      )}
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {sortedInvoices.map((inv: Invoice) => {
                const isSelected = selectedInvoices.has(inv.id)
                const isEditingStatus = editingStatusId === inv.id
                return (
                  <tr
                    key={inv.id}
                    className={`border-t border-gray-50 transition-colors ${isSelected ? 'bg-indigo-50/40' : 'hover:bg-gray-50'}`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setSelectedInvoices((prev) => {
                          const next = new Set(prev)
                          next.has(inv.id) ? next.delete(inv.id) : next.add(inv.id)
                          return next
                        })}
                        className="text-gray-300 hover:text-indigo-500 transition-colors"
                      >
                        {isSelected ? <CheckSquare size={15} className="text-indigo-500" /> : <Square size={15} />}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs font-mono whitespace-nowrap">{inv.date_issued}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900 max-w-[180px] truncate" title={inv.client_name}>{inv.client_name}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900 whitespace-nowrap">{formatCurrency(inv.amount_gross, currency)}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600 font-medium whitespace-nowrap">{formatCurrency(inv.amount_net, currency)}</td>
                    <td className="px-4 py-2.5 text-right text-rose-500 whitespace-nowrap">{formatCurrency(inv.tax_amount + inv.inps_amount, currency)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{inv.due_date || '—'}</td>
                    {/* Stato — click per modificare */}
                    <td className="px-4 py-2.5">
                      {isEditingStatus ? (
                        <select
                          autoFocus
                          defaultValue={inv.status}
                          onChange={(e) => handleUpdateStatus(inv.id, e.target.value as InvoiceStatus)}
                          onBlur={() => setEditingStatusId(null)}
                          className="border border-indigo-300 rounded-lg px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        >
                          <option value="PENDING">In attesa</option>
                          <option value="PAID">Pagata</option>
                          <option value="OVERDUE">Scaduta</option>
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingStatusId(inv.id)}
                          title="Clicca per cambiare stato"
                          className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity ${STATUS_COLORS[inv.status]}`}
                        >
                          {STATUS_LABELS[inv.status]}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => handleDeleteInvoice(inv.id)} className="p-1 text-gray-300 hover:text-rose-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-gray-400 text-sm">
                    Nessuna fattura registrata
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal nuova fattura */}
      {showInvoiceImport && (
        <InvoiceImportModal onClose={() => { setShowInvoiceImport(false); qc.invalidateQueries({ queryKey: ['invoices'] }) }} />
      )}

      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Nuova Fattura</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Data emissione</label>
                <input type="date" value={invoiceForm.date_issued}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, date_issued: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Scadenza</label>
                <input type="date" value={invoiceForm.due_date}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
              <input type="text" value={invoiceForm.client_name}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, client_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Importo lordo (€)</label>
              <input type="number" value={invoiceForm.amount_gross}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, amount_gross: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stato</label>
              <select value={invoiceForm.status}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, status: e.target.value as InvoiceStatus })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="PENDING">In attesa</option>
                <option value="PAID">Pagata</option>
                <option value="OVERDUE">Scaduta</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowInvoiceModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50">
                Annulla
              </button>
              <button onClick={handleAddInvoice}
                disabled={!invoiceForm.client_name || !invoiceForm.amount_gross}
                className="flex-1 bg-indigo-500 text-white font-medium py-2.5 rounded-lg hover:bg-indigo-600 disabled:opacity-50">
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helper UI ───────────────────────────────────────────────────────────────

function Row({
  label, value, accent, bold, muted,
}: {
  label: string
  value: string
  accent?: boolean
  bold?: boolean
  muted?: boolean
}) {
  const valCls = bold
    ? 'font-bold text-gray-900'
    : accent
    ? 'font-semibold text-gray-800'
    : muted
    ? 'font-medium text-gray-400'
    : 'font-medium text-gray-700'
  return (
    <div className="flex justify-between items-center">
      <span className={`text-xs ${muted ? 'text-gray-400' : 'text-gray-600'}`}>{label}</span>
      <span className={`text-xs ${valCls}`}>{value}</span>
    </div>
  )
}
