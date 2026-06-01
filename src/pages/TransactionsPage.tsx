import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { formatCurrency } from '@/lib/formatters'
import { Plus, Trash2, Pencil, TrendingUp, TrendingDown, PiggyBank, CreditCard, Upload, Download, SlidersHorizontal, ChevronUp, ChevronDown, X, Wallet } from 'lucide-react'
import { ImportModal } from '@/components/import/ImportModal'
import { HelpTooltip } from '@/components/ui/HelpTooltip'
import type { Transaction, TransactionType, Category } from '@/lib/database.types'
import type { LucideIcon } from 'lucide-react'

const TYPES: TransactionType[] = ['INCOME', 'EXPENSES', 'SAVINGS', 'DEBTS']

const TYPE_UI: Record<TransactionType, {
  label: string; Icon: LucideIcon; color: string; colorHex: string;
  ring: string; bg: string; activeBg: string; hint: string
}> = {
  INCOME:   { label: 'Entrata',   Icon: TrendingUp,   color: 'text-emerald-700', colorHex: '#059669', ring: 'ring-emerald-400', bg: 'bg-white',      activeBg: 'bg-emerald-50 border-emerald-300', hint: 'Stipendio, bonifico ricevuto, rimborso…' },
  EXPENSES: { label: 'Spesa',     Icon: TrendingDown, color: 'text-rose-700',    colorHex: '#e11d48', ring: 'ring-rose-400',    bg: 'bg-white',      activeBg: 'bg-rose-50 border-rose-300',       hint: 'Acquisto, bolletta, abbonamento…' },
  SAVINGS:  { label: 'Risparmio', Icon: PiggyBank,    color: 'text-amber-700',   colorHex: '#d97706', ring: 'ring-amber-400',   bg: 'bg-white',      activeBg: 'bg-amber-50 border-amber-300',     hint: 'Accantonamento su conto dedicato…' },
  DEBTS:    { label: 'Debito',    Icon: CreditCard,   color: 'text-violet-700',  colorHex: '#7c3aed', ring: 'ring-violet-400',  bg: 'bg-white',      activeBg: 'bg-violet-50 border-violet-300',   hint: 'Rata mutuo, finanziamento, rimborso…' },
}

interface FormState {
  date: string
  type: TransactionType
  category_id: string
  description: string
  amount: string
  is_business: boolean
  activity_name: string
  account_id: string
}

/** Ricorda l'ultimo tipo usato — così l'utente non deve selezionarlo ogni volta */
const getLastTxType = (): TransactionType =>
  (localStorage.getItem('bf_last_tx_type') as TransactionType) ?? 'EXPENSES'

const emptyForm = (): FormState => ({
  date: new Date().toISOString().slice(0, 10),
  type: getLastTxType(),
  category_id: '',
  description: '',
  amount: '',
  is_business: false,
  activity_name: '',
  account_id: '',
})

export function TransactionsPage() {
  const navigate = useNavigate()
  const { profile, selectedYear } = useAppStore()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [editing, setEditing] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<TransactionType | 'ALL'>('ALL')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [filterMonth, setFilterMonth] = useState(0)
  const [search, setSearch] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [sortField, setSortField] = useState<'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', profile?.id, selectedYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', profile!.id)
        .gte('date', `${selectedYear}-01-01`)
        .lte('date', `${selectedYear}-12-31`)
        .order('date', { ascending: false })
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

  const { data: accounts = [] } = useQuery({
    queryKey: ['bank_accounts', profile?.id],
    queryFn: async () => {
      const { data } = await supabase.from('bank_accounts').select('id, name, icon, color, is_default').eq('user_id', profile!.id)
      return (data ?? []) as { id: string; name: string; icon: string; color: string; is_default: boolean }[]
    },
    enabled: !!profile,
  })

  const filtered = transactions
    .filter((t: Transaction) => {
      if (filterType !== 'ALL' && t.type !== filterType) return false
      if (filterCategory && t.category_id !== filterCategory) return false
      if (filterAccount && t.account_id !== filterAccount) return false
      if (filterMonth && new Date(t.date).getMonth() + 1 !== filterMonth) return false
      if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a: Transaction, b: Transaction) => {
      const mult = sortDir === 'asc' ? 1 : -1
      if (sortField === 'amount') return (a.amount - b.amount) * mult
      return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * mult
    })

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const activeFilterCount = [filterCategory, filterAccount, filterMonth ? '1' : ''].filter(Boolean).length

  const resetAdvanced = () => { setFilterCategory(''); setFilterAccount(''); setFilterMonth(0); setPage(0) }

  const exportCSV = () => {
    const header = ['Data', 'Tipo', 'Categoria', 'Descrizione', 'Importo', 'Conto']
    const rows = filtered.map((t: Transaction) => [
      t.date,
      TYPE_UI[t.type as TransactionType].label,
      `${getCatIcon(t.category_id)} ${getCatName(t.category_id)}`,
      t.description,
      t.amount,
      accounts.find((a) => a.id === t.account_id)?.name ?? '',
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transazioni-${selectedYear}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleSort = (field: 'date' | 'amount') => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('desc') }
    setPage(0)
  }

  const SortIcon = ({ field }: { field: 'date' | 'amount' }) => {
    if (sortField !== field) return <ChevronDown size={12} className="text-gray-300 ml-0.5" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-indigo-500 ml-0.5" />
      : <ChevronDown size={12} className="text-indigo-500 ml-0.5" />
  }
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const catsByType = categories.filter((c: Category) => c.type === form.type)

  const openNew = () => {
    const defaultAccount = accounts.find((a) => a.is_default)
    setForm({ ...emptyForm(), account_id: defaultAccount?.id ?? '' })
    setEditing(null)
    setShowModal(true)
  }
  const openEdit = (t: Transaction) => {
    setForm({ date: t.date, type: t.type, category_id: t.category_id, description: t.description, amount: String(t.amount), is_business: t.is_business, activity_name: t.activity_name ?? '', account_id: t.account_id ?? '' })
    setEditing(t.id)
    setShowModal(true)
  }

  // ─── Selezione multipla ──────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCatId, setBulkCatId] = useState('')
  const [allFilteredSelected, setAllFilteredSelected] = useState(false)

  const toggleSelect = (id: string) => {
    setAllFilteredSelected(false)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setAllFilteredSelected(false)
    if (selectedIds.size === paginated.length && paginated.every((t: Transaction) => selectedIds.has(t.id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginated.map((t: Transaction) => t.id)))
    }
  }

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map((t: Transaction) => t.id)))
    setAllFilteredSelected(true)
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Eliminare ${selectedIds.size} transazioni? L'operazione non è reversibile.`)) return
    for (const id of selectedIds) {
      await supabase.from('transactions').delete().eq('id', id)
    }
    qc.invalidateQueries({ queryKey: ['transactions'] })
    setSelectedIds(new Set())
    setAllFilteredSelected(false)
  }

  const handleBulkCategorize = async (catId: string) => {
    if (!catId) return
    const cat = categories.find((c: Category) => c.id === catId)
    for (const id of selectedIds) {
      await supabase.from('transactions').update({ category_id: catId, type: cat?.type ?? 'EXPENSES' }).eq('id', id)
    }
    qc.invalidateQueries({ queryKey: ['transactions'] })
    setSelectedIds(new Set())
    setAllFilteredSelected(false)
    setBulkCatId('')
  }

  const clearSelection = () => { setSelectedIds(new Set()); setAllFilteredSelected(false) }

  const handleSave = async () => {
    if (!profile) return
    const payload = { ...form, amount: parseFloat(form.amount), user_id: profile.id }
    if (editing) {
      await supabase.from('transactions').update(payload).eq('id', editing)
    } else {
      await supabase.from('transactions').insert(payload)
    }
    qc.invalidateQueries({ queryKey: ['transactions'] })
    setShowModal(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questa transazione?')) return
    await supabase.from('transactions').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['transactions'] })
  }

  const currency = profile?.currency ?? 'EUR'
  const getCatName = (id: string) => categories.find((c: Category) => c.id === id)?.name ?? '—'
  const getCatIcon = (id: string) => categories.find((c: Category) => c.id === id)?.icon ?? ''

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Transazioni</h1>
        <div className="flex items-center gap-2">
          <HelpTooltip
            title="Transazioni"
            content="Registra ogni movimento di denaro: entrate (stipendio, rimborsi), spese (acquisti, bollette), risparmi (accantonamenti) e debiti (rate, finanziamenti). Ogni transazione viene conteggiata nella dashboard mensile e annuale."
            position="bottom"
            size="lg"
          />
          <button
            onClick={exportCSV}
            title="Esporta CSV"
            className="flex items-center gap-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Upload size={14} /> Importa
          </button>
          <button onClick={openNew} className="flex items-center gap-2 bg-income text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">
            <Plus size={16} /> Aggiungi
          </button>
        </div>
      </div>

      {/* Filtri */}
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap items-center">
          <input
            type="text"
            placeholder="Cerca descrizione..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-income/50 w-48"
          />
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value as TransactionType | 'ALL'); setFilterCategory(''); setPage(0) }}
            className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-income/50"
          >
            <option value="ALL">Tutti i tipi</option>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_UI[t].label}</option>)}
          </select>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
              showAdvanced || activeFilterCount > 0
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <SlidersHorizontal size={14} />
            Filtri
            {activeFilterCount > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={resetAdvanced} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <X size={12} /> Reset
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">{filtered.length} risultati</span>
        </div>

        {showAdvanced && (
          <div className="flex gap-2 flex-wrap items-center bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3">
            <select
              value={filterMonth}
              onChange={(e) => { setFilterMonth(+e.target.value); setPage(0) }}
              className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-700 dark:text-gray-100"
            >
              <option value={0}>Tutti i mesi</option>
              {['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setPage(0) }}
              className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Tutte le categorie</option>
              {(filterType === 'ALL'
                ? categories
                : categories.filter((c: Category) => c.type === filterType)
              ).map((c: Category) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
            {accounts.length > 0 && (
              <select
                value={filterAccount}
                onChange={(e) => { setFilterAccount(e.target.value); setPage(0) }}
                className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">Tutti i conti</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* ── Barra azioni bulk ────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="bg-indigo-600 text-white rounded-xl px-4 py-3 flex flex-col gap-2 shadow-lg">
          <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-sm">
            {selectedIds.size} {selectedIds.size === 1 ? 'transazione selezionata' : 'transazioni selezionate'}
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {/* Ricategorizza */}
            <select
              value={bulkCatId}
              onChange={(e) => handleBulkCategorize(e.target.value)}
              className="text-xs bg-white/15 border border-white/30 text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/50 min-w-36"
            >
              <option value="">Cambia categoria…</option>
              {categories.map((c: Category) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
            {/* Elimina */}
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-rose-500 border border-white/30 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <Trash2 size={12} /> Elimina {selectedIds.size}
            </button>
            {/* Chiudi */}
            <button
              onClick={clearSelection}
              className="text-xs text-white/70 hover:text-white px-2 py-1.5"
            >
              ✕ Annulla
            </button>
          </div>
          </div>{/* fine flex items-center gap-3 */}

          {/* Banner "seleziona tutti i risultati filtrati" */}
          {!allFilteredSelected && selectedIds.size === paginated.length && filtered.length > PAGE_SIZE && (
            <div className="bg-indigo-700 rounded-lg px-3 py-2 text-xs flex items-center gap-2">
              <span className="text-white/80">
                Hai selezionato solo le {paginated.length} transazioni di questa pagina.
              </span>
              <button
                onClick={selectAllFiltered}
                className="font-semibold text-white underline hover:no-underline"
              >
                Seleziona tutte le {filtered.length} transazioni filtrate →
              </button>
            </div>
          )}

          {allFilteredSelected && (
            <div className="bg-indigo-700 rounded-lg px-3 py-2 text-xs flex items-center gap-2">
              <span className="text-white/80">✓ Tutte le</span>
              <span className="font-semibold text-white">{filtered.length} transazioni filtrate</span>
              <span className="text-white/80">sono selezionate.</span>
              <button onClick={clearSelection} className="text-white/60 hover:text-white underline ml-1">
                Annulla selezione
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-700/50">
              {/* Checkbox seleziona tutto */}
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={paginated.length > 0 && selectedIds.size === paginated.length}
                  ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < paginated.length }}
                  onChange={toggleAll}
                  className="accent-indigo-600 w-4 h-4 cursor-pointer"
                />
              </th>
              <th className="text-left px-4 py-3">
                <button onClick={() => toggleSort('date')} className="flex items-center gap-0.5 hover:text-gray-700 transition-colors">
                  Data <SortIcon field="date" />
                </button>
              </th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Categoria</th>
              <th className="text-left px-4 py-3">Descrizione</th>
              <th className="text-right px-4 py-3">
                <button onClick={() => toggleSort('amount')} className="flex items-center gap-0.5 ml-auto hover:text-gray-700 transition-colors">
                  Importo <SortIcon field="amount" />
                </button>
              </th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((t: Transaction) => {
              const isSelected = selectedIds.has(t.id)
              return (
                <tr
                  key={t.id}
                  onClick={() => toggleSelect(t.id)}
                  className={`border-b border-gray-50 dark:border-gray-700/50 cursor-pointer transition-colors ${
                    isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                  }`}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(t.id)}
                      className="accent-indigo-600 w-4 h-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{t.date}</td>
                  <td className="px-4 py-3"><TypeBadge type={t.type} /></td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span>{getCatIcon(t.category_id)}</span>
                      <span className="text-gray-700 dark:text-gray-300">{getCatName(t.category_id)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-xs truncate" title={t.description}>{t.description}</td>
                  <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-gray-900 dark:text-gray-100'}`}>
                    {t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount, currency)}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(t)} className="p-1 text-gray-300 hover:text-gray-700"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(t.id)} className="p-1 text-gray-300 hover:text-rose-500"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {paginated.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Nessuna transazione trovata</td></tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-end px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-40">←</button>
              <span>{page + 1} / {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-40">→</button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">

            {/* Header colorato in base al tipo */}
            <div className={`px-6 pt-5 pb-4 border-b dark:border-gray-700 dark:bg-gray-700 ${TYPE_UI[form.type].bg}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {editing ? 'Modifica transazione' : 'Nuova transazione'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl leading-none">×</button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Compila i campi qui sotto per registrare l'operazione</p>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* Step 1 — Tipo */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  1 · Che tipo di operazione è?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map((t) => {
                    const ui = TYPE_UI[t]
                    const active = form.type === t
                    const { Icon } = ui
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setForm({ ...form, type: t, category_id: '' })
                          localStorage.setItem('bf_last_tx_type', t)
                        }}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                          active
                            ? `${ui.activeBg} ${ui.color} ring-2 ${ui.ring}`
                            : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        <Icon
                          size={15}
                          strokeWidth={2}
                          style={{ color: active ? ui.colorHex : '#9ca3af' }}
                        />
                        <span>{ui.label}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1.5 ml-0.5 flex items-center gap-1">
                  <span className="text-gray-300">›</span> {TYPE_UI[form.type].hint}
                </p>
              </div>

              {/* Step 2 — Categoria */}
              <div>
                <label htmlFor="tx-category" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  2 · Categoria
                </label>
                {catsByType.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    Nessuna categoria trovata per questo tipo. Aggiungila in <strong>Categorie</strong>.
                  </p>
                ) : (
                  <select
                    id="tx-category"
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="">— Scegli una categoria —</option>
                    {catsByType.map((c: Category) => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Step 3 — Importo + Data */}
              <div>
                <p className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  3 · Importo e data
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="tx-amount" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Importo</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">€</span>
                      <input
                        id="tx-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        className="w-full border border-gray-200 dark:border-gray-600 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="tx-date" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Data <span className="text-gray-300 dark:text-gray-600 font-normal">(gg/mm/aaaa)</span>
                    </label>
                    <input
                      id="tx-date"
                      type="date"
                      lang="it-IT"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>

              {/* Step 4 — Descrizione (opzionale) */}
              <div>
                <label htmlFor="tx-description" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  4 · Descrizione <span className="normal-case font-normal text-gray-400 dark:text-gray-500">(opzionale)</span>
                </label>
                <input
                  id="tx-description"
                  type="text"
                  placeholder="Es. Supermercato Esselunga, rata mutuo maggio…"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>

              {/* Conto bancario */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Conto <span className="normal-case font-normal text-gray-400 dark:text-gray-500">(opzionale)</span>
                </label>
                {accounts.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); navigate('/accounts') }}
                    className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 border border-dashed border-indigo-300 dark:border-indigo-700 rounded-xl px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                  >
                    <Wallet size={13} />
                    Nessun conto configurato — clicca per aggiungerne uno
                  </button>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, account_id: '' })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                        !form.account_id
                          ? 'border-gray-400 bg-gray-100 dark:bg-gray-600 dark:border-gray-500 text-gray-700 dark:text-gray-200'
                          : 'border-gray-200 dark:border-gray-600 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      Nessuno
                    </button>
                    {accounts.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setForm({ ...form, account_id: acc.id })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                          form.account_id === acc.id
                            ? 'ring-2 text-white'
                            : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                        style={form.account_id === acc.id
                          ? { backgroundColor: acc.color, borderColor: acc.color }
                          : {}
                        }
                      >
                        <span>{acc.icon}</span> {acc.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Business (solo freelance) */}
              {(profile?.profile_type === 'FREELANCE' || profile?.profile_type === 'BOTH') && (
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form.is_business}
                    onChange={(e) => setForm({ ...form, is_business: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded accent-indigo-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">Spesa business / deducibile</span>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Spunta se è un costo legato alla tua attività freelance</p>
                  </div>
                </label>
              )}

              {/* CTA */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-medium py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.amount || !form.category_id}
                  className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 text-sm transition-colors"
                >
                  {editing ? 'Salva modifiche' : `Registra ${TYPE_UI[form.type].label.toLowerCase()}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          categories={categories}
        />
      )}
    </div>
  )
}
