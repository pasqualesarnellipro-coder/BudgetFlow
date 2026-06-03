import { useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import {
  parseFile, applyColumnMap, suggestCategory, parseAmount,
  type ImportPreviewResult, type ColumnMap, type ParsedRow,
} from '@/lib/importParser'
import { formatCurrency } from '@/lib/formatters'
import type { Category, CategoryType } from '@/lib/database.types'
import {
  Upload, FileText, Table, CheckCircle2, AlertTriangle,
  X, ChevronRight, ChevronLeft, FileSpreadsheet, FileScan,
  TrendingUp, TrendingDown, RefreshCw, Info, Sparkles, Plus,
} from 'lucide-react'

type Step = 'upload' | 'map' | 'preview' | 'done'

interface Props {
  onClose: () => void
  categories: Category[]
}

// ─── Mini-form creazione categoria inline ─────────────────────────────────────

const QUICK_ICONS = ['🏷️','🛒','🍕','🚗','💊','🏠','✈️','💻','🎮','👗','💰','📦','🎁','⚡','📱']

function QuickAddCategory({
  defaultType,
  onCreated,
  onCancel,
}: {
  defaultType: CategoryType
  onCreated: (cat: Category) => void
  onCancel: () => void
}) {
  const { profile } = useAppStore()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🏷️')
  const [type, setType] = useState<CategoryType>(defaultType)
  const [saving, setSaving] = useState(false)

  const TYPE_OPTS: { value: CategoryType; label: string }[] = [
    { value: 'EXPENSES',          label: 'Spesa' },
    { value: 'INCOME',            label: 'Entrata' },
    { value: 'SAVINGS',           label: 'Risparmio' },
    { value: 'DEBTS',             label: 'Debito' },
    { value: 'BUSINESS_EXPENSES', label: 'Spesa business' },
    { value: 'BUSINESS_INCOME',   label: 'Entrata business' },
  ]

  const handleSave = async () => {
    if (!profile || !name.trim()) return
    setSaving(true)
    const { data } = await supabase.from('categories').insert({
      user_id: profile.id,
      name: name.trim(),
      icon,
      type,
      active: true,
    }).select().single()
    setSaving(false)
    if (data) onCreated(data as Category)
  }

  return (
    <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2.5 shadow-lg">
      <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Nuova categoria</p>

      {/* Icon picker */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_ICONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setIcon(e)}
            className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center border transition-all ${
              icon === e ? 'border-indigo-500 bg-white ring-1 ring-indigo-300' : 'border-transparent hover:bg-white'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Nome */}
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        placeholder="Es. Palestra, Netflix, Benzina…"
        className="w-full border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
      />

      {/* Tipo */}
      <select
        value={type}
        onChange={(e) => setType(e.target.value as CategoryType)}
        className="w-full border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
      >
        {TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 text-xs border border-gray-200 rounded-lg py-1.5 text-gray-500 hover:bg-white"
        >
          Annulla
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="flex-1 text-xs bg-indigo-600 text-white rounded-lg py-1.5 font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {saving ? <RefreshCw size={10} className="animate-spin" /> : <Plus size={10} />}
          Crea
        </button>
      </div>
    </div>
  )
}

export function ImportModal({ onClose, categories: initialCategories }: Props) {
  const { profile } = useAppStore()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: accounts = [] } = useQuery({
    queryKey: ['bank_accounts', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('bank_accounts')
        .select('id, name, icon, color, is_default, bank_name')
        .eq('user_id', profile!.id)
      return (data ?? []) as { id: string; name: string; icon: string; color: string; is_default: boolean; bank_name: string }[]
    },
    enabled: !!profile,
  })

  const [step, setStep] = useState<Step>('upload')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportPreviewResult | null>(null)
  const [colMap, setColMap] = useState<ColumnMap | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [catMap, setCatMap] = useState<Record<number, string>>({})   // rowIndex → category_id
  const [sortKey, setSortKey] = useState<'date' | 'amount' | 'description' | 'category' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [localCats, setLocalCats] = useState<Category[]>(initialCategories)
  const [addCatForRow, setAddCatForRow] = useState<number | null>(null)
  const [importedCount, setImportedCount] = useState(0)
  const [selectedAccountId, setSelectedAccountId] = useState('')

  // ─── Step 1: Upload ─────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setLoading(true)
    try {
      const r = await parseFile(file)
      setResult(r)
      setColMap(r.suggested)
      const parsed = r.parsed
      setRows(parsed)
      // Seleziona tutto di default
      setSelected(new Set(parsed.map((_, i) => i)))
      // Auto-categorizza con matching intelligente
      const auto: Record<number, string> = {}
      parsed.forEach((row, i) => {
        const hint = suggestCategory(row.description)
        if (!hint) return

        // 1. Match esatto sul nome categoria
        let cat = localCats.find(
          (c) => c.type === hint.type && c.active &&
          c.name.toLowerCase() === hint.hint.toLowerCase()
        )
        // 2. Match parziale — ogni parola del hint nel nome categoria
        if (!cat) {
          const words = hint.hint.toLowerCase().split(/\s+/)
          cat = localCats.find(
            (c) => c.type === hint.type && c.active &&
            words.every((w) => c.name.toLowerCase().includes(w))
          )
        }
        // 3. Match parziale — almeno una parola
        if (!cat) {
          const words = hint.hint.toLowerCase().split(/\s+/)
          cat = localCats.find(
            (c) => c.type === hint.type && c.active &&
            words.some((w) => w.length > 3 && c.name.toLowerCase().includes(w))
          )
        }
        // 4. Fallback: prima categoria attiva del tipo corretto
        if (!cat) {
          cat = localCats.find((c) => c.type === hint.type && c.active)
        }

        if (cat) auto[i] = cat.id
      })
      setCatMap(auto)
      setStep(r.headers.length > 0 ? 'map' : 'preview')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore durante il parsing del file.')
    } finally {
      setLoading(false)
    }
  }, [localCats])

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  // ─── Step 2: Ricalcola dopo cambio mappa ────────────────────────────────────

  const applyMap = () => {
    if (!result || !colMap) return
    const parsed = applyColumnMap(result.rows, colMap)
    setRows(parsed)
    setSelected(new Set(parsed.map((_, i) => i)))
    setStep('preview')
  }

  // ─── Step 3: Import ──────────────────────────────────────────────────────────

  /** Verifica che una stringa sia una data ISO valida (YYYY-MM-DD) con giorno/mese reali */
  const sanitizeDate = (raw: string): string => {
    const today = new Date().toISOString().slice(0, 10)
    if (!raw) return today
    // Accetta solo YYYY-MM-DD con valori sensati
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return today
    const [, y, mo, d] = m.map(Number)
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return today
    // Verifica ulteriore con Date
    const dt = new Date(`${m[1]}-${m[2]}-${m[3]}`)
    return isNaN(dt.getTime()) ? today : raw
  }

  const handleImport = async () => {
    if (!profile) return
    setLoading(true)
    setError(null)

    // Mappa l'indice originale della riga — rows[i]._i se presente (tabella sortata),
    // altrimenti l'indice nell'array originale
    const toInsert = rows
      .map((row, i) => ({ row, origIdx: (row as typeof row & { _i?: number })._i ?? i }))
      .filter(({ origIdx }) => selected.has(origIdx))
      .map(({ row, origIdx }) => {
        const catId = catMap[origIdx]
        const type = row.amount >= 0 ? 'INCOME' : 'EXPENSES'
        const cat = catId
          ? localCats.find((c) => c.id === catId)
          : localCats.find((c) => c.type === type && c.active)

        return {
          user_id: profile.id,
          date: sanitizeDate(row.date),
          type: cat?.type ?? type,
          category_id: cat?.id ?? localCats.find((c) => c.type === type && c.active)?.id ?? '',
          description: row.description || 'Importato',
          amount: Math.abs(row.amount),
          is_business: false,
          activity_name: null,
          account_id: selectedAccountId || null,
        }
      })
      .filter((r) => r.category_id)  // scarta righe senza categoria

    if (toInsert.length === 0) {
      setError('Nessuna transazione valida da importare. Assegna almeno una categoria.')
      setLoading(false)
      return
    }

    // ── Deduplicazione: confronta con transazioni già esistenti ──────────────
    // controllo duplicati
    const dateMin = toInsert.reduce((m, r) => r.date < m ? r.date : m, toInsert[0].date)
    const dateMax = toInsert.reduce((m, r) => r.date > m ? r.date : m, toInsert[0].date)
    const { data: existing } = await supabase
      .from('transactions')
      .select('date, description, amount')
      .eq('user_id', profile.id)
      .gte('date', dateMin)
      .lte('date', dateMax)

    const existingKeys = new Set(
      (existing ?? []).map((t) => `${t.date}|${t.description}|${t.amount}`)
    )

    const newOnly = toInsert.filter(
      (r) => !existingKeys.has(`${r.date}|${r.description}|${Math.abs(r.amount)}`)
    )

    if (newOnly.length === 0) {
      setImportedCount(0)
      setLoading(false)
      setStep('done')
      return
    }

    // Insert a chunk con gestione errori esplicita
    const CHUNK = 25
    let saved = 0
    const insertErrors: string[] = []

    for (let i = 0; i < newOnly.length; i += CHUNK) {
      const chunk = newOnly.slice(i, i + CHUNK)
      const { error: insErr } = await supabase.from('transactions').insert(chunk)
      if (insErr) {
        // Retry riga per riga per salvare il massimo
        for (const record of chunk) {
          const { error: singleErr } = await supabase.from('transactions').insert([record])
          if (singleErr) {
            insertErrors.push(`${record.date} ${record.description.slice(0, 30)}: ${singleErr.message}`)
          } else {
            saved++
          }
        }
      } else {
        saved += chunk.length
      }
    }

    await qc.invalidateQueries({ queryKey: ['transactions'] })
    setImportedCount(saved)
    setLoading(false)

    if (insertErrors.length > 0 && saved === 0) {
      setError(`Errore import: ${insertErrors[0]}`)
      return
    }
    if (insertErrors.length > 0) {
      // Alcune salvate, alcune no → vai a done con warning
      setStep('done')
      return
    }
    setStep('done')
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const toggleRow = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const currency = profile?.currency ?? 'EUR'
  const incomeRows  = rows.filter((r) => r.amount > 0)
  const expenseRows = rows.filter((r) => r.amount < 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Importa transazioni</h2>
            <p className="text-xs text-gray-400 mt-0.5">CSV, Excel (.xlsx) o PDF bancario</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Step indicator */}
            <div className="hidden sm:flex items-center gap-1">
              {(['upload','map','preview','done'] as Step[]).map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step === s ? 'bg-indigo-600 text-white' :
                    (['upload','map','preview','done'].indexOf(step) > i) ? 'bg-indigo-100 text-indigo-600' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {(['upload','map','preview','done'].indexOf(step) > i) ? '✓' : i + 1}
                  </div>
                  {i < 3 && <div className="w-4 h-px bg-gray-200" />}
                </div>
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── STEP 1: Upload ───────────────────────────────────────────────── */}
          {step === 'upload' && (
            <div className="p-6 space-y-5">

              {/* Selettore conto bancario */}
              {accounts.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                    A quale conto appartengono queste transazioni?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAccountId('')}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                        !selectedAccountId
                          ? 'border-gray-400 bg-gray-100 text-gray-700'
                          : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      Non specificato
                    </button>
                    {accounts.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setSelectedAccountId(acc.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all ${
                          selectedAccountId === acc.id
                            ? 'text-white shadow-sm'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                        style={selectedAccountId === acc.id
                          ? { backgroundColor: acc.color, borderColor: acc.color }
                          : {}
                        }
                      >
                        <span className="text-sm">{acc.icon}</span>
                        <span>{acc.name}</span>
                        {acc.bank_name && acc.bank_name !== acc.name && (
                          <span className={`${selectedAccountId === acc.id ? 'text-white/70' : 'text-gray-400'}`}>
                            · {acc.bank_name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  dragging
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf"
                  className="hidden"
                  onChange={onFileInput}
                />
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw size={32} className="text-indigo-400 animate-spin" />
                    <p className="text-sm text-gray-500">Analisi del file in corso…</p>
                  </div>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                      <Upload size={26} className="text-indigo-400" strokeWidth={1.5} />
                    </div>
                    <p className="font-semibold text-gray-700 mb-1">Trascina il file qui o clicca per selezionarlo</p>
                    <p className="text-xs text-gray-400">CSV, Excel (.xlsx / .xls), PDF — Max 10MB</p>
                  </>
                )}
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3">
                  <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}

              {/* Formati supportati */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { Icon: Table, label: 'CSV', desc: 'Il formato più compatibile. Esportabile da quasi tutte le banche.', color: '#10b981' },
                  { Icon: FileSpreadsheet, label: 'Excel (.xlsx)', desc: 'Fogli di calcolo. Supporta più colonne e formati numerici.', color: '#0ea5e9' },
                  { Icon: FileScan, label: 'PDF', desc: 'Sperimentale. Funziona meglio con estratti conto semplici.', color: '#f59e0b' },
                ].map(({ Icon, label, desc, color }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <Icon size={20} className="mx-auto mb-2" style={{ color }} />
                    <p className="text-xs font-bold text-gray-700">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>

              {/* Guida per banca */}
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer list-none text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                  <Info size={14} />
                  Come esportare il file dalla mia banca?
                </summary>
                <div className="mt-3 bg-indigo-50 rounded-xl p-4 space-y-2 text-xs text-indigo-800">
                  {[
                    ['Intesa Sanpaolo', 'Area personale → Movimenti → Esporta → CSV'],
                    ['UniCredit', 'MyUniCredit → Conto → Movimenti → Scarica → Excel'],
                    ['BancoBPM', 'MyBanca → Movimenti → Esporta Excel'],
                    ['Fineco', 'Conto → Movimenti → Scarica → CSV'],
                    ['ING', 'App/Sito → Il mio conto → Movimenti → Scarica lista movimenti → CSV'],
                    ['N26', 'Conto → Estratto conto → Esporta CSV'],
                    ['Revolut', 'Conto → Estratti conto → CSV o Excel'],
                    ['PayPal', 'Attività → Estratto conto → CSV'],
                  ].map(([bank, path]) => (
                    <div key={bank} className="flex gap-2">
                      <span className="font-semibold w-28 shrink-0">{bank}</span>
                      <span className="text-indigo-600">{path}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* ── STEP 2: Mappa colonne ─────────────────────────────────────────── */}
          {step === 'map' && result && colMap && (
            <div className="p-6 space-y-5">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex gap-2">
                <Info size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-700">
                  BudgetFlow ha rilevato automaticamente le colonne. Verifica che siano corrette prima di continuare.
                  File: <strong>{result.fileName}</strong> — {result.totalRows} righe trovate.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Colonna Data */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                    Colonna Data
                  </label>
                  <select
                    value={colMap.date}
                    onChange={(e) => setColMap({ ...colMap, date: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {result.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1 font-mono">
                    Raw: <span className="text-gray-600">{result.rows[0]?.[colMap.date] ?? '—'}</span>
                  </p>
                </div>

                {/* Colonna Descrizione */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                    Colonna Descrizione
                  </label>
                  <select
                    value={colMap.description}
                    onChange={(e) => setColMap({ ...colMap, description: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {result.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1 truncate font-mono">
                    Raw: <span className="text-gray-600">{result.rows[0]?.[colMap.description] ?? '—'}</span>
                  </p>
                </div>

                {/* Importo — singola colonna o dare/avere */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                    Colonne Importo
                  </label>
                  <div className="flex gap-3 items-start flex-wrap">
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="radio"
                        checked={!colMap.amountIn}
                        onChange={() => setColMap({ ...colMap, amountIn: undefined, amountOut: undefined })}
                        className="accent-indigo-500"
                      />
                      Colonna singola (positivo = entrata, negativo = uscita)
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="radio"
                        checked={!!colMap.amountIn}
                        onChange={() => setColMap({ ...colMap, amountIn: result.headers[0], amountOut: result.headers[1] })}
                        className="accent-indigo-500"
                      />
                      Colonne separate (Dare / Avere)
                    </label>
                  </div>

                  {!colMap.amountIn ? (
                    <div className="mt-2">
                      <select
                        value={colMap.amount}
                        onChange={(e) => setColMap({ ...colMap, amount: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {result.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      {(() => {
                        const rawVal = result.rows[0]?.[colMap.amount] ?? ''
                        const parsed = parseAmount(rawVal)
                        const isZero = rawVal && parsed === 0
                        return (
                          <div className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-xs font-mono flex items-center gap-2 ${isZero ? 'bg-rose-50 border border-rose-200' : 'bg-gray-50'}`}>
                            <span className="text-gray-400">Raw:</span>
                            <span className="text-gray-700">{rawVal || '—'}</span>
                            <span className="text-gray-300">→</span>
                            <span className={`font-bold ${isZero ? 'text-rose-600' : parsed > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {parsed !== 0 ? `${parsed > 0 ? '+' : ''}${parsed}` : (rawVal ? '⚠️ 0 — seleziona la colonna giusta' : '—')}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Colonna Entrate (Avere)</label>
                        <select
                          value={colMap.amountIn}
                          onChange={(e) => setColMap({ ...colMap, amountIn: e.target.value })}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        >
                          {result.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Colonna Uscite (Dare)</label>
                        <select
                          value={colMap.amountOut}
                          onChange={(e) => setColMap({ ...colMap, amountOut: e.target.value })}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        >
                          {result.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Separatore decimale */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                    Formato numeri
                  </label>
                  <div className="flex gap-3">
                    {[
                      { sep: ',', label: 'Italiano  1.234,56' },
                      { sep: '.', label: 'Internazionale  1,234.56' },
                    ].map(({ sep, label }) => (
                      <label key={sep} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="radio"
                          checked={colMap.decimalSep === sep}
                          onChange={() => setColMap({ ...colMap, decimalSep: sep as ',' | '.' })}
                          className="accent-indigo-500"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {result.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    {result.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-700">{w}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Anteprima ────────────────────────────────────────────── */}
          {step === 'preview' && rows.length > 0 && (
            <div className="p-6 space-y-4">

              {/* Badge conto selezionato */}
              {selectedAccountId && (() => {
                const acc = accounts.find((a) => a.id === selectedAccountId)
                return acc ? (
                  <div className="flex items-center gap-2 text-xs text-white font-medium px-3 py-2 rounded-xl w-fit"
                    style={{ backgroundColor: acc.color }}>
                    <span>{acc.icon}</span>
                    <span>Conto: {acc.name}</span>
                    <button onClick={() => setSelectedAccountId('')} className="opacity-70 hover:opacity-100 ml-1">✕</button>
                  </div>
                ) : null
              })()}

              {/* Summary KPI */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Righe trovate</p>
                  <p className="text-xl font-bold text-gray-900">{rows.length}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-emerald-600 mb-0.5">Entrate</p>
                  <p className="text-xl font-bold text-emerald-700">
                    {formatCurrency(incomeRows.reduce((s, r) => s + r.amount, 0), currency)}
                  </p>
                </div>
                <div className="bg-rose-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-rose-600 mb-0.5">Uscite</p>
                  <p className="text-xl font-bold text-rose-700">
                    {formatCurrency(Math.abs(expenseRows.reduce((s, r) => s + r.amount, 0)), currency)}
                  </p>
                </div>
              </div>

              {/* Selezione rapida — sempre visibile su 2 righe */}
              <div className="space-y-2">
                {/* Riga 1: contatore */}
                <p className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{selected.size}</span> di {rows.length} transazioni selezionate
                  {selected.size > 0 && (
                    <span className="ml-2 text-gray-400">
                      · {rows.filter((r, i) => selected.has(i) && r.amount >= 0).length} entrate
                      · {rows.filter((r, i) => selected.has(i) && r.amount < 0).length} uscite
                    </span>
                  )}
                </p>
                {/* Riga 2: bottoni selezione */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400 mr-1">Seleziona:</span>
                  {[
                    { label: 'Tutto',        action: () => setSelected(new Set(rows.map((_, i) => i))),                                              cls: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200' },
                    { label: '↑ Entrate',    action: () => setSelected(new Set(rows.flatMap((r, i) => r.amount >= 0 ? [i] : []))),                  cls: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200' },
                    { label: '↓ Uscite',     action: () => setSelected(new Set(rows.flatMap((r, i) => r.amount < 0 ? [i] : []))),                   cls: 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200' },
                    { label: 'Nessuna',      action: () => setSelected(new Set()),                                                                    cls: 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200' },
                  ].map(({ label, action, cls }) => (
                    <button key={label} onClick={action}
                      className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors ${cls}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabella anteprima */}
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50 z-10">
                      <tr className="text-gray-500 uppercase tracking-wide text-xs">
                        <th className="px-3 py-2.5 w-8"></th>
                        {([
                          { key: 'date',        label: 'Data',        cls: 'text-left w-24' },
                          { key: 'description', label: 'Descrizione', cls: 'text-left'      },
                          { key: 'amount',      label: 'Importo',     cls: 'text-right w-28'},
                          { key: 'category',    label: 'Categoria',   cls: 'text-left w-44' },
                        ] as { key: typeof sortKey; label: string; cls: string }[]).map(({ key, label, cls }) => (
                          <th
                            key={key}
                            className={`px-3 py-2.5 ${cls} cursor-pointer select-none hover:text-gray-800 group`}
                            onClick={() => {
                              if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
                              else { setSortKey(key); setSortDir('asc') }
                            }}
                          >
                            <span className="flex items-center gap-1 justify-inherit">
                              {label}
                              <span className="text-gray-300 group-hover:text-gray-500">
                                {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                              </span>
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(sortKey
                        ? [...rows.map((r, i) => ({ ...r, _i: i }))].sort((a, b) => {
                            const dir = sortDir === 'asc' ? 1 : -1
                            if (sortKey === 'date')        return a.date.localeCompare(b.date) * dir
                            if (sortKey === 'amount')      return (a.amount - b.amount) * dir
                            if (sortKey === 'description') return a.description.localeCompare(b.description) * dir
                            if (sortKey === 'category') {
                              const catA = (localCats.find((c) => c.id === catMap[a._i])?.name ?? '')
                              const catB = (localCats.find((c) => c.id === catMap[b._i])?.name ?? '')
                              return catA.localeCompare(catB) * dir
                            }
                            return 0
                          })
                        : rows.map((r, i) => ({ ...r, _i: i }))
                      ).map((row) => {
                        const i = (row as typeof row & { _i: number })._i
                        const isSelected = selected.has(i)
                        const isIncome = row.amount >= 0
                        const catId = catMap[i]
                        const wasAutoSuggested = catId !== undefined
                        // Mostra tutte le categorie del tipo corretto, non solo INCOME/EXPENSES
                        const txType = isIncome ? 'INCOME' : 'EXPENSES'
                        const suggestedCats = localCats.filter((c) =>
                          (c.type === txType || c.type === 'SAVINGS' || c.type === 'DEBTS' ||
                           c.type === 'BUSINESS_INCOME' || c.type === 'BUSINESS_EXPENSES') && c.active
                        )

                        return (
                          <tr
                            key={i}
                            className={`border-t border-gray-50 transition-colors ${
                              isSelected ? 'bg-white' : 'bg-gray-50 opacity-50'
                            }`}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleRow(i)}
                                className="accent-indigo-500 w-3.5 h-3.5"
                              />
                            </td>
                            <td className="px-3 py-2 text-gray-500 font-mono whitespace-nowrap text-xs">{row.date}</td>
                            <td className="px-3 py-2 max-w-sm" title={row.description}>
                              <p className="text-xs text-gray-800 leading-snug line-clamp-2 cursor-default">
                                {row.description || <span className="text-gray-400 italic">—</span>}
                              </p>
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
                              <span className="flex items-center justify-end gap-1">
                                {isIncome
                                  ? <TrendingUp size={10} />
                                  : <TrendingDown size={10} />
                                }
                                {isIncome ? '+' : ''}{formatCurrency(row.amount, currency)}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  {wasAutoSuggested && (
                                    <span title="Categoria suggerita automaticamente">
                                      <Sparkles size={10} className="text-indigo-400 shrink-0" />
                                    </span>
                                  )}
                                  <select
                                    value={catId ?? ''}
                                    onChange={(e) => {
                                      if (e.target.value === '__new__') {
                                        setAddCatForRow(i)
                                      } else {
                                        setCatMap({ ...catMap, [i]: e.target.value })
                                        setAddCatForRow(null)
                                      }
                                    }}
                                    className={`text-xs rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 max-w-36 border ${
                                      wasAutoSuggested ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200'
                                    }`}
                                  >
                                    <option value="">— scegli —</option>
                                    {suggestedCats.map((c) => (
                                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                                    ))}
                                    <option disabled>──────────</option>
                                    <option value="__new__">+ Nuova categoria…</option>
                                  </select>
                                </div>

                                {/* Mini-form creazione categoria */}
                                {addCatForRow === i && (
                                  <QuickAddCategory
                                    defaultType={txType}
                                    onCreated={(newCat) => {
                                      setLocalCats((prev) => [...prev, newCat])
                                      setCatMap({ ...catMap, [i]: newCat.id })
                                      setAddCatForRow(null)
                                      qc.invalidateQueries({ queryKey: ['categories'] })
                                    }}
                                    onCancel={() => setAddCatForRow(null)}
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      </tbody>
                  </table>
                </div>
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2">
                  <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: Done ─────────────────────────────────────────────────── */}
          {step === 'done' && importedCount > 0 && (
            <div className="p-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">Importazione completata!</p>
                <p className="text-sm text-gray-500 mt-1">
                  <strong className="text-emerald-600">{importedCount}</strong> transazioni importate con successo.
                </p>
                {/* Avviso righe scartate per mancanza categoria */}
                {(() => {
                  const selectedCount = rows.filter((_, i) => selected.has(i)).length
                  const skipped = selectedCount - importedCount
                  return skipped > 0 ? (
                    <p className="text-xs text-amber-600 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      ⚠️ <strong>{skipped}</strong> già presenti o prive di categoria — saltate.
                    </p>
                  ) : null
                })()}
              </div>
              <button
                onClick={onClose}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700"
              >
                Chiudi
              </button>
            </div>
          )}

          {step === 'done' && importedCount === 0 && (
            <div className="p-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-amber-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">Nessuna novità</p>
                <p className="text-sm text-gray-500 mt-1">
                  Tutte le transazioni del file erano già presenti — nessun duplicato inserito.
                </p>
              </div>
              <button
                onClick={onClose}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700"
              >
                Chiudi
              </button>
            </div>
          )}
        </div>

        {/* Footer con navigazione */}
        {step !== 'done' && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0 bg-white">
            <button
              onClick={() => {
                if (step === 'map') setStep('upload')
                if (step === 'preview') setStep(result?.headers.length ? 'map' : 'upload')
              }}
              className={`flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 ${step === 'upload' ? 'invisible' : ''}`}
            >
              <ChevronLeft size={15} /> Indietro
            </button>

            <div className="flex items-center gap-3">
              {step === 'map' && (
                <button
                  onClick={applyMap}
                  className="flex items-center gap-1.5 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700"
                >
                  Anteprima <ChevronRight size={15} />
                </button>
              )}

              {step === 'preview' && (
                <button
                  onClick={handleImport}
                  disabled={selected.size === 0 || loading}
                  className="flex items-center gap-1.5 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading
                    ? <><RefreshCw size={14} className="animate-spin" /> Importo…</>
                    : <><FileText size={14} /> Importa {selected.size} transazioni</>
                  }
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
